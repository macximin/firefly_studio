#!/usr/bin/env node
/** Characterize real-pack retrieval on authored problems, without generation or quality ratings. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hq = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha = (value) => createHash('sha256').update(value).digest('hex');

export async function probeAuthorCraftRetrieval() {
  const registry = JSON.parse(await readFile(resolve(hq, 'config/edge-repos.json'), 'utf8'));
  const engine = registry.repos.find((entry) => entry.name === 'inkos');
  const reference = registry.repos.find((entry) => entry.name === 'firefly_reference_lab');
  if (!engine || !reference) throw new Error('Required child repositories are not registered');
  const corePath = resolve(hq, engine.path, 'packages/core/dist/reference/author-craft.js');
  const core = await import(pathToFileURL(corePath).href);
  const config = JSON.parse(await readFile(resolve(hq, 'config/daily-planning.json'), 'utf8')).authorCraft;
  const loaded = await core.readAuthorCraftPackFile(resolve(hq, config.packPath));
  const probePath = resolve(dirname(resolve(hq, config.packPath)), 'retrieval-probes.json');
  const probeBytes = await readFile(probePath);
  const probes = JSON.parse(probeBytes);
  if (probes.schemaVersion !== 'author-craft-retrieval-probes/v1' || probes.packSha256 !== loaded.sha256
    || loaded.sha256 !== config.packSha256 || !Array.isArray(probes.probes)) throw new Error('Retrieval probes do not bind the configured pack');
  const known = new Set(loaded.pack.cases.map((entry) => entry.id));
  const ids = new Set();
  const results = probes.probes.map((probe) => {
    if (typeof probe.id !== 'string' || ids.has(probe.id) || typeof probe.query !== 'string' || typeof probe.group !== 'string'
      || !Array.isArray(probe.expectedAnyCaseIds) || probe.expectedAnyCaseIds.some((id) => !known.has(id))) throw new Error('Invalid or duplicate retrieval probe');
    ids.add(probe.id);
    const selection = core.selectAuthorCraftContext({ pack: loaded.pack,
      config: { packSha256: loaded.sha256, maxCases: 3, maxCharacters: 6000 }, stage: probe.stage, query: probe.query });
    const selected = selection.receipt.selectedCaseIds;
    const matched = probe.expectedAnyCaseIds.length === 0 ? selected.length === 0 : probe.expectedAnyCaseIds.some((id) => selected.includes(id));
    return { ...probe, matched, selectedCaseIds: selected, selectionReasons: selection.receipt.selectionReasons,
      explicitFallbackCaseIds: matched ? [] : probe.expectedAnyCaseIds, renderedSha256: selection.receipt.renderedSha256 };
  });
  const groups = [...new Set(results.map((result) => result.group))].map((group) => ({ group,
    total: results.filter((result) => result.group === group).length,
    matched: results.filter((result) => result.group === group && result.matched).length }));
  return { schemaVersion: 'firefly-author-craft-retrieval-probe/v1', checkedAt: new Date().toISOString(),
    packSha256: loaded.sha256, probesSha256: sha(probeBytes), selectorSha256: sha(await readFile(corePath)),
    total: results.length, matched: results.filter((result) => result.matched).length, groups, results,
    humanBlindComparisonPerformed: false, literaryQualityClaimed: false, modelCalls: 0, humanReviewRequired: false,
    interpretation: 'Authored problem-to-reference retrieval checks. Paraphrase gaps are reported, not hidden or interpreted as a literary quality score.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const outputIndex = args.indexOf('--output');
    const output = outputIndex < 0 ? undefined : args[outputIndex + 1];
    if (outputIndex >= 0 && !output) throw new Error('--output requires a path');
    const result = await probeAuthorCraftRetrieval();
    if (output) await writeFile(resolve(output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ total: result.total, matched: result.matched, groups: result.groups,
      gaps: result.results.filter((entry) => !entry.matched).map(({ id, selectedCaseIds, explicitFallbackCaseIds }) => ({ id, selectedCaseIds, explicitFallbackCaseIds })),
      output: output ?? null, modelCalls: 0 }, null, 2));
    if (args.includes('--require-matches') && result.matched !== result.total) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
