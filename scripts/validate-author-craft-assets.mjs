#!/usr/bin/env node
/** Verify derived research bindings and executable selection without model calls. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hq = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha = (value) => createHash('sha256').update(value).digest('hex');

export async function validateAuthorCraftAssets({ includePrivateScenes = false } = {}) {
  const registry = JSON.parse(await readFile(resolve(hq, 'config/edge-repos.json'), 'utf8'));
  const engine = registry.repos.find((entry) => entry.name === 'inkos');
  const reference = registry.repos.find((entry) => entry.name === 'firefly_reference_lab');
  if (!engine || !reference) throw new Error('Required child repositories are not registered');
  const core = await import(pathToFileURL(resolve(hq, engine.path, 'packages/core/dist/reference/author-craft.js')).href);
  const config = JSON.parse(await readFile(resolve(hq, 'config/daily-planning.json'), 'utf8')).authorCraft;
  const loaded = await core.readAuthorCraftPackFile(resolve(hq, config.packPath));
  if (loaded.sha256 !== config.packSha256) throw new Error('Configured craft pack hash differs');
  const sources = [];
  for (const source of loaded.pack.sources) {
    const actual = sha(await readFile(resolve(hq, source.reference)));
    if (!source.sha256 || actual !== source.sha256) throw new Error(`Derived source hash mismatch: ${source.id}`);
    sources.push({ id: source.id, reference: source.reference, sha256: actual, readingScope: source.readingScope });
  }
  const cases = [];
  for (const entry of loaded.pack.cases) {
    for (const stage of entry.stages) {
      const selection = core.selectAuthorCraftContext({ pack: loaded.pack,
        config: { packSha256: loaded.sha256, caseIds: [entry.id], maxCases: 1, maxCharacters: 6000 }, stage, query: '' });
      if (selection.receipt.selectedCaseIds[0] !== entry.id) throw new Error(`Case exceeds normal input budget: ${entry.id}`);
      for (const limit of entry.counterexamples) if (!selection.rendered.includes(limit)) throw new Error(`Missing case limit: ${entry.id}`);
      cases.push({ caseId: entry.id, stage, characters: selection.receipt.characters, renderedSha256: selection.receipt.renderedSha256 });
    }
  }
  const sceneConfig = config.sceneExamples;
  const referenceRoot = resolve(hq, reference.path);
  const indexBytes = await readFile(resolve(referenceRoot, sceneConfig.indexPath));
  if (sha(indexBytes) !== sceneConfig.indexSha256) throw new Error('Configured scene index hash differs');
  const index = JSON.parse(indexBytes);
  const known = new Set(loaded.pack.cases.map((entry) => entry.id));
  for (const scene of index.scenes) if (scene.craftCaseIds.some((id) => !known.has(id))) throw new Error(`Unbound case in scene ${scene.id}`);
  const scenes = [];
  if (includePrivateScenes) {
    const { selectAuthorScenes } = await import(pathToFileURL(resolve(referenceRoot, 'tools/author-craft-scenes.mjs')).href);
    for (const scene of index.scenes) {
      const selection = await selectAuthorScenes({ root: referenceRoot, indexPath: sceneConfig.indexPath,
        indexSha256: sceneConfig.indexSha256, caseIds: scene.craftCaseIds, sceneIds: [scene.id], maxScenes: 1,
        maxCharacters: sceneConfig.maxCharacters });
      if (selection.receipt.selected.length !== 1) throw new Error(`Private scene unavailable or oversized: ${scene.id}`);
      scenes.push({ ...selection.receipt.selected[0], renderedSha256: selection.receipt.renderedSha256 });
    }
  }
  return { schemaVersion: 'firefly-author-craft-asset-validation/v1', checkedAt: new Date().toISOString(),
    packId: loaded.pack.id, packSha256: loaded.sha256, sourceCount: sources.length, caseCount: loaded.pack.cases.length,
    stageRenderCount: cases.length, sceneIndexSha256: sceneConfig.indexSha256, sceneCount: index.scenes.length,
    privateScenesVerified: includePrivateScenes, sources, cases, scenes,
    modelCalls: 0, humanReviewRequired: false, humanBlindComparisonPerformed: false, literaryQualityClaimed: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const outputIndex = args.indexOf('--output');
    const output = outputIndex < 0 ? undefined : args[outputIndex + 1];
    if (outputIndex >= 0 && !output) throw new Error('--output requires a file path');
    const result = await validateAuthorCraftAssets({ includePrivateScenes: args.includes('--include-private-scenes') });
    if (output) {
      const path = resolve(output); await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(JSON.stringify({ packId: result.packId, sourceCount: result.sourceCount, caseCount: result.caseCount,
      stageRenderCount: result.stageRenderCount, sceneCount: result.sceneCount, privateScenesVerified: result.privateScenesVerified,
      output: output ?? null, modelCalls: 0 }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
