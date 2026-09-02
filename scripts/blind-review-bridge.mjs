#!/usr/bin/env node

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./edge-lib.mjs";
import { importBlindReviewEvidence, prepareBlindReviewPair } from "./blind-review-bridge-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const usage = "Usage: node scripts/blind-review-bridge.mjs <prepare|import> --pair <sourcePair> --genre <genre> [--reviewer-actor <id> --intensity-directive-sha256 <sha256>]";

function options(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const item = argv[index + 1];
    if (!key?.startsWith("--") || item === undefined || Object.hasOwn(value, key.slice(2))) throw new Error(usage);
    value[key.slice(2)] = item;
  }
  return value;
}

async function main(argv) {
  const [mode, ...rest] = argv;
  if (!['prepare', 'import'].includes(mode)) throw new Error(usage);
  const values = options(rest);
  const manifest = await readJson(join(root, "config", "edge-repos.json"));
  if (mode === "prepare") {
    if (Object.keys(values).sort().join(',') !== 'genre,intensity-directive-sha256,pair,reviewer-actor') throw new Error(usage);
    return prepareBlindReviewPair({ root, manifest, sourcePair: values.pair, genre: values.genre, reviewerActorId: values['reviewer-actor'], intensityDirectiveSha256: values['intensity-directive-sha256'] });
  }
  if (Object.keys(values).sort().join(',') !== 'genre,pair') throw new Error(usage);
  return importBlindReviewEvidence({ root, manifest, sourcePair: values.pair, genre: values.genre });
}

main(process.argv.slice(2)).then((value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
