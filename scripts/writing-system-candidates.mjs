#!/usr/bin/env node
/** Self-written boundary for importing AuthorAgent-shaped review candidates.
 * No third-party implementation or prompts are copied. No model, file write,
 * automatic speaker inference, quality approval, or canon promotion occurs.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ISSUES = new Set(['off-voice', 'anachronistic-knowledge', 'off-motivation']);
const AUTHOR_AGENT_COMMIT = '47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c';
const HASH = /^[a-f0-9]{64}$/;
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, field, limit = 20000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Invalid ${field}`);
  return value;
}

export function adaptWritingSystemCandidates(input) {
  if (!object(input) || input.schemaVersion !== 'writing-system-review-input/v1') throw new Error('Unsupported input schema');
  const manuscript = text(input.manuscript?.text, 'manuscript text', 500000);
  const chapterId = text(input.manuscript?.chapterId, 'chapter id', 200);
  const originalSha256 = sha(manuscript);
  if (!HASH.test(input.manuscript.sha256 ?? '') || input.manuscript.sha256 !== originalSha256) throw new Error('Manuscript SHA mismatch');
  const producer = input.producer;
  if (!object(producer) || producer.repository !== 'Ckokoski/AuthorAgent' || producer.commit !== AUTHOR_AGENT_COMMIT) throw new Error('Unrecognized producer pin');
  if (!['scripted-fixture', 'external-model-output'].includes(producer.mode)) throw new Error('Invalid producer mode');
  // An external report is untrusted data even when it names the expected commit.
  const report = input.report;
  if (!object(report) || !Array.isArray(report.byCharacter) || !Array.isArray(report.charactersReviewed) || report.byCharacter.length > 100) throw new Error('Invalid report');
  if (report.chapterId !== chapterId) throw new Error('Report chapter mismatch');
  const names = report.byCharacter.map(x => text(x?.character, 'report character', 200));
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify(report.charactersReviewed)) throw new Error('Report character accounting mismatch');
  const flagCount = report.byCharacter.reduce((sum, item) => {
    if (!Array.isArray(item.flags) || !Number.isSafeInteger(item.linesReviewed) || item.linesReviewed < 0) throw new Error('Invalid character review');
    return sum + item.flags.length;
  }, 0);
  if (flagCount > 200 || flagCount !== report.totalFlags) throw new Error('Report flag accounting mismatch');
  if (!Array.isArray(input.dialogueAttributions) || input.dialogueAttributions.length > 1000) throw new Error('Invalid dialogue attributions');
  const attributions = input.dialogueAttributions.map(item => {
    if (!object(item) || !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end) || item.start < 0 || item.end <= item.start || item.end > manuscript.length) throw new Error('Invalid attribution span');
    const character = text(item.character, 'attribution character', 200);
    const quote = text(item.quote, 'attribution quote');
    if (manuscript.slice(item.start, item.end) !== quote) throw new Error('Attribution quote/span mismatch');
    const provenance = text(item.provenance, 'attribution provenance', 2000);
    return { character, quote, start: item.start, end: item.end, provenance };
  });
  const byPosition = new Map();
  for (const item of attributions) {
    const key = `${item.start}:${item.end}`;
    if (byPosition.has(key)) throw new Error('Duplicate or conflicting attribution span');
    byPosition.set(key, item);
  }
  const sorted = [...attributions].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) throw new Error('Overlapping attribution spans');
  const candidates = [], rejected = [], seen = new Set();
  for (const block of report.byCharacter) {
    for (const [flagIndex, flag] of block.flags.entries()) {
      let reason;
      if (!object(flag) || !ISSUES.has(flag.issue)) reason = 'unsupported-issue';
      else if (![flag.line, flag.reason, flag.suggestion].every(x => typeof x === 'string' && x.trim() && x.length <= 20000)) reason = 'incomplete-candidate';
      const matches = reason ? [] : attributions.filter(x => x.character === block.character && x.quote === flag.line);
      if (!reason && matches.length !== 1) reason = matches.length ? 'ambiguous-quote' : 'unbound-quote-or-speaker';
      if (!reason && flag.suggestion === flag.line) reason = 'unchanged-suggestion';
      if (reason) { rejected.push({ character: block.character, flagIndex, reason }); continue; }
      const anchor = matches[0];
      const content = { chapterId, originalSha256, character: block.character, issue: flag.issue, start: anchor.start, end: anchor.end, quote: flag.line, diagnosis: flag.reason, suggestion: flag.suggestion };
      const candidateId = sha(JSON.stringify(content));
      if (seen.has(candidateId)) { rejected.push({ character: block.character, flagIndex, reason: 'duplicate-candidate' }); continue; }
      seen.add(candidateId);
      candidates.push({ candidateId, ...content, coordinateKind: 'utf16-code-units', attributionProvenance: anchor.provenance, authority: 'advisory', status: 'candidate' });
    }
  }
  return {
    schemaVersion: 'writing-system-candidates/v1', chapterId, originalSha256,
    producer: { repository: producer.repository, commit: producer.commit, mode: producer.mode, attestation: 'caller-provided-not-independently-verified' },
    inputSha256: sha(JSON.stringify(input)), validation: 'quote-span-and-caller-supplied-speaker-binding-only',
    qualityVerdict: 'not-assessed', canonApplied: false, candidates, rejected,
    reportState: names.length === 0 ? 'no-characters-reviewed' : flagCount === 0 ? 'no-flags-or-upstream-parse-failure' : 'candidates-validated',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw new Error('Input exceeds 2 MiB');
      chunks.push(chunk);
    }
    console.log(JSON.stringify(adaptWritingSystemCandidates(JSON.parse(Buffer.concat(chunks).toString('utf8'))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
