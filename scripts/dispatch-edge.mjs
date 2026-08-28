import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, validateManifest } from "./edge-lib.mjs";
import {
  buildDispatchPlan,
  executeWorkOrder,
  inspectDispatchTarget,
  publicDispatchPlan,
  verifyApprovedInputs,
  verifyPrivateInputs,
} from "./dispatch-lib.mjs";

function parseArgs(argv) {
  const options = { workOrder: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--work-order") {
      options.workOrder = argv[index + 1] ?? null;
      index += 1;
    } else if (value === "--dry-run") {
      options.dryRun = true;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: npm run dispatch -- --work-order <path> [--dry-run]",
    "",
    "The work order is validated as strict v1 or v2 against the manifest-declared child adapter.",
    "Instructions are sent through stdin; RunReceipt v2 stores only hashes and compact readback.",
  ].join("\n");
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!options.workOrder) throw new Error("--work-order is required");

  const manifest = await readJson(join(root, "config", "edge-repos.json"));
  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length > 0) throw new Error(manifestErrors.join("\n"));
  const workOrder = await readJson(resolve(options.workOrder));

  if (options.dryRun) {
    const plan = buildDispatchPlan({ root, manifest, workOrder });
    inspectDispatchTarget(plan);
    const inputVerification = verifyApprovedInputs({ root, manifest, workOrder });
    const privateInputVerification = await verifyPrivateInputs({ root, manifest, workOrder });
    console.log(JSON.stringify({
      ...publicDispatchPlan(plan, workOrder),
      inputVerification,
      privateInputVerification,
    }, null, 2));
  } else {
    const receipt = await executeWorkOrder({ root, manifest, workOrder });
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.status === "failed" || receipt.status === "needs-attention") process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    error: {
      code: "DISPATCH_FAILED",
      message: error instanceof Error ? error.message : String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
