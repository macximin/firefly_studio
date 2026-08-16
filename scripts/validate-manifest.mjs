import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, validateManifest } from "./edge-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = await readJson(join(root, "config", "edge-repos.json"));
const errors = validateManifest(manifest);
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log(`PASS Firefly Studio manifest: ${manifest.repos.length} edge repositories`);
}
