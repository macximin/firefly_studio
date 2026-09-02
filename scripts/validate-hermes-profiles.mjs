import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./edge-lib.mjs";
import { verifyHermesNeutralProfileRegistry, verifyHermesProfileRegistry } from "./hermes-profile-lib.mjs";
import { verifyHermesBlindEvaluatorRegistry } from "./hermes-blind-evaluator-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const registry = await readJson(join(root, "config", "hermes-production-profiles.json"));
const neutralRegistry = await readJson(join(root, "config", "hermes-neutral-production-profile.json"));
const evaluatorRegistry = await readJson(join(root, "config", "hermes-blind-evaluator.json"));
try {
  const receipts = await verifyHermesProfileRegistry(registry);
  const neutral = await verifyHermesNeutralProfileRegistry(neutralRegistry);
  const evaluator = await verifyHermesBlindEvaluatorRegistry(evaluatorRegistry);
  console.log(`PASS Hermes profiles: ${receipts.length} genre + 1 neutral + 1 blind evaluator immutable readback(s) (${neutral.profileId}, ${evaluator.profileId})`);
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
