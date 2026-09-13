#!/usr/bin/env node
/** Read-only HQ adapter: InkOS owns validation, ranking, and rendering. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hq = resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function selectCraftInput(request) {
  const registry = JSON.parse(await readFile(resolve(hq, 'config/edge-repos.json'), 'utf8'));
  const engine = registry.repos.find((repo) => repo.name === 'inkos');
  if (!engine) throw new Error('InkOS is not registered in config/edge-repos.json');
  const modulePath = resolve(hq, engine.path, 'packages/core/dist/reference/author-craft.js');
  let core;
  try { core = await import(pathToFileURL(modulePath).href); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') throw new Error('Build the registered InkOS core first: pnpm --filter @actalk/inkos-core build');
    throw error;
  }
  if (typeof request.packPath !== 'string' || typeof request.query !== 'string') throw new Error('packPath and query are required text fields');
  const loaded = await core.readAuthorCraftPackFile(resolve(hq, request.packPath));
  if (request.packSha256 !== loaded.sha256) throw new Error('HQ author craft pack SHA-256 mismatch');
  if (loaded.pack.language !== (request.language ?? 'ko')) throw new Error('HQ author craft pack language mismatch');
  const selection = core.selectAuthorCraftContext({
    pack: loaded.pack,
    config: {
      packSha256: loaded.sha256,
      ...(request.caseIds === undefined ? {} : { caseIds: request.caseIds }),
      maxCases: request.maxCases ?? 3,
      maxCharacters: request.maxCharacters ?? 6000,
    },
    stage: request.stage ?? 'planning',
    query: request.query,
  });
  let sceneExamples;
  if (request.sceneExamples !== undefined) {
    const reference = registry.repos.find((repo) => repo.name === 'firefly_reference_lab');
    if (!reference) throw new Error('Reference Lab is not registered');
    const referenceRoot = resolve(hq, reference.path);
    const sceneModulePath = resolve(referenceRoot, 'tools/author-craft-scenes.mjs');
    const { selectAuthorScenes } = await import(pathToFileURL(sceneModulePath).href);
    const selectedScenes = await selectAuthorScenes({ root: referenceRoot,
      indexPath: request.sceneExamples.indexPath, indexSha256: request.sceneExamples.indexSha256,
      caseIds: selection.receipt.selectedCaseIds, workIds: request.workIds ?? [],
      query: request.query,
      maxScenes: request.sceneExamples.maxScenes ?? 1, maxCharacters: request.sceneExamples.maxCharacters ?? 7500 });
    sceneExamples = { ...selectedScenes, adapter: { schemaVersion: 'hq-author-scene-input/v1', engine: reference.name,
      selectorSha256: createHash('sha256').update(await readFile(sceneModulePath)).digest('hex') } };
  }
  return { ...selection, ...(sceneExamples ? { sceneExamples } : {}), adapter: {
    schemaVersion: 'hq-author-craft-input/v1',
    engine: engine.name,
    selectorSha256: createHash('sha256').update(await readFile(modulePath)).digest('hex'),
    modelCalls: 0,
    humanReviewRequired: false,
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 256 * 1024) throw new Error('Craft input request exceeds 256 KiB');
      chunks.push(chunk);
    }
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(`${JSON.stringify(await selectCraftInput(request))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
