#!/usr/bin/env node
/** Historical feedback hydration, read-only. Never waits for a new decision. */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HQ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const SHA = /^[a-f0-9]{64}$/;

function reviewedText(candidate) {
  if (typeof candidate.projectPlan?.markdown === 'string') return { representation: 'project-plan-markdown', body: candidate.projectPlan.markdown };
  if (typeof candidate.markdown === 'string') return { representation: 'candidate-markdown', body: candidate.markdown };
  if (typeof candidate.body === 'string') return { representation: 'chapter-body', body: candidate.body };
  return { representation: 'structured-candidate-json', body: JSON.stringify(candidate, null, 2) };
}

export async function hydrateReviewedFeedback(targets, options = {}) {
  if (!Array.isArray(targets) || targets.length > 500) throw new Error('Historical feedback targets must be an array of at most 500 entries');
  const maxCandidates = options.maxCandidates ?? 3;
  const maxCharacters = options.maxCharacters ?? 20000;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 0 || maxCandidates > 20
    || !Number.isInteger(maxCharacters) || maxCharacters < 0 || maxCharacters > 120000) throw new Error('Invalid historical context budget');
  if (targets.length === 0) return { contexts: [], targets: [], characters: 0, humanReviewRequired: false };
  const root = options.root ?? HQ;
  const registry = JSON.parse(await readFile(resolve(root, 'config/edge-repos.json'), 'utf8'));
  const reviewRepo = registry.repos.find((entry) => entry.name === 'storyyard');
  if (!reviewRepo) throw new Error('Storyyard is not in the child registry');
  const reviewRoot = resolve(root, reviewRepo.path);
  // Import validation only; the child importer performs writes and is not used.
  const { validateFireflyReviewPacket } = await import(pathToFileURL(resolve(reviewRoot, 'app/firefly-review-contract.ts')).href);
  const directories = options.packetDirectories ?? [resolve(root, '.firefly/review-packets'), resolve(reviewRoot, 'data/firefly/review-packets/immutable')];
  let invalidated = new Set();
  try {
    const record = JSON.parse(await readFile(resolve(reviewRoot, 'data/firefly/review-packets/invalidations.json'), 'utf8'));
    if (!Array.isArray(record.invalidations)) throw new Error('Malformed local packet invalidations');
    invalidated = new Set(record.invalidations.map((entry) => entry.packetId));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const contexts = [];
  const results = [];
  const cache = new Map();
  let characters = 0;
  for (const target of targets) {
    const result = { decisionId: target.decisionId, packetId: target.packetId, candidateId: target.candidateId, status: 'reviewed-text-not-loaded' };
    results.push(result);
    const packetScope = target.candidateId === '' && target.candidateSha256 === '';
    if (!/^frp-[a-f0-9]{24}$/.test(target.packetId ?? '') || !SHA.test(target.packetSha256 ?? '')
      || (!packetScope && (typeof target.candidateId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(target.candidateId)
        || !SHA.test(target.candidateSha256 ?? '')))) { result.status = 'missing-or-invalid-binding'; continue; }
    if (invalidated.has(target.packetId)) { result.status = 'packet-invalidated'; continue; }
    const identity = `${target.packetId}:${packetScope ? '*' : target.candidateId}:${packetScope ? target.packetSha256 : target.candidateSha256}`;
    const loaded = contexts.find((context) => context.id === identity);
    // Even duplicate target rows must match the admitted packet hash.
    if (loaded && loaded.packetSha256 === target.packetSha256 && (!target.artifactId || loaded.artifactId === target.artifactId)) {
      result.status = 'reviewed-text-loaded'; result.contextId = identity; continue;
    }
    try {
      let cached = cache.get(target.packetId);
      if (!cached) {
        let found = false;
        let lastError;
        for (const directory of directories) {
          const path = resolve(directory, `${target.packetId}.json`);
          try {
            const info = await stat(path); found = true;
            if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('Packet file exceeds historical context limits');
            const bytes = await readFile(path);
            if (bytes.length > 16 * 1024 * 1024) throw new Error('Packet file exceeds historical context limits');
            const packet = validateFireflyReviewPacket(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
            if (packet.packetId !== target.packetId) throw new Error('Local packet filename and identity differ');
            cached = { packet, fileSha256: sha256(bytes) };
            cache.set(target.packetId, cached);
            break;
          } catch (error) {
            if (error.code !== 'ENOENT') { found = true; lastError = error; }
          }
        }
        if (!cached && !found) { result.status = 'packet-not-found'; continue; }
        if (!cached) throw lastError ?? new Error('No verified local packet copy');
      }
      const { packet, fileSha256 } = cached;
      if (packet.packetId !== target.packetId || packet.packetSha256 !== target.packetSha256
        || (target.artifactId && packet.artifact.id !== target.artifactId)) { result.status = 'packet-binding-mismatch'; continue; }
      const candidate = packetScope ? null : packet.candidates.find((entry) => entry.id === target.candidateId);
      if (!packetScope && (!candidate || candidate.sha256 !== target.candidateSha256)) { result.status = 'candidate-binding-mismatch'; continue; }
      const content = packetScope
        ? { representation: 'complete-packet-candidates', body: JSON.stringify({
          currentContent: packet.artifact.currentContent ?? null,
          candidates: packet.candidates.map((entry) => ({ id: entry.id, sha256: entry.sha256, ...reviewedText(entry) })),
        }, null, 2) }
        : reviewedText(candidate);
      if (contexts.length >= maxCandidates || characters + content.body.length > maxCharacters) { result.status = 'reviewed-text-omitted-budget'; continue; }
      contexts.push({ id: identity, packetId: packet.packetId, packetSha256: packet.packetSha256, candidateId: packetScope ? '' : candidate.id,
        candidateSha256: packetScope ? '' : candidate.sha256, feedbackScope: packetScope ? 'whole-reviewed-packet' : 'reviewed-candidate', artifactId: packet.artifact.id, schemaVersion: packet.schemaVersion,
        source: 'local-immutable-packet', fileSha256, ...content, contentSha256: sha256(content.body),
        readingScope: 'Complete selected representation; other UI panels and newer live decisions are not included.' });
      characters += content.body.length;
      result.status = 'reviewed-text-loaded'; result.contextId = identity;
    } catch (error) {
      result.status = 'packet-verification-failed';
      result.reason = error instanceof Error ? error.message.slice(0, 240) : 'Invalid packet';
    }
  }
  return { contexts, targets: results, characters, humanReviewRequired: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const chunks = [];
    let count = 0;
    for await (const chunk of process.stdin) {
      count += chunk.length;
      if (count > 512 * 1024) throw new Error('Historical feedback request exceeds 512 KiB');
      chunks.push(chunk);
    }
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(`${JSON.stringify(await hydrateReviewedFeedback(request.targets, { maxCandidates: request.maxCandidates, maxCharacters: request.maxCharacters }))}\n`);
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
