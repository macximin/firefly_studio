import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./edge-lib.mjs";
import { verifyHermesProfileRegistry } from "./hermes-profile-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const registry = await readJson(join(root, "config", "hermes-production-profiles.json"));
try {
  const receipts = await verifyHermesProfileRegistry(registry);
  console.log(`PASS Hermes production profiles: ${receipts.length} immutable profile readback(s)`);
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
