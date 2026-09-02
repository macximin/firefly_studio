import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./edge-lib.mjs";
import { verifyHermesNeutralProfileRegistry, verifyHermesProfileRegistry } from "./hermes-profile-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const registry = await readJson(join(root, "config", "hermes-production-profiles.json"));
const neutralRegistry = await readJson(join(root, "config", "hermes-neutral-production-profile.json"));
try {
  const receipts = await verifyHermesProfileRegistry(registry);
  const neutral = await verifyHermesNeutralProfileRegistry(neutralRegistry);
  console.log(`PASS Hermes production profiles: ${receipts.length} genre + 1 neutral immutable profile readback(s) (${neutral.profileId})`);
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
