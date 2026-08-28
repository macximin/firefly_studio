import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./edge-lib.mjs";
import { verifyGenreSoulAdoptions } from "./genre-soul-adoption-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const registry = await readJson(join(root, "config", "genre-soul-adoptions.json"));
const profileRegistry = await readJson(join(root, "config", "hermes-production-profiles.json"));

try {
  const receipts = await verifyGenreSoulAdoptions({ root, registry, profileRegistry });
  console.log(`PASS genre Soul adoption registry: ${receipts.length} active promotion(s)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
