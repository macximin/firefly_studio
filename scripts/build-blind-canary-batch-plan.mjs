import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBlindCanaryBatchBundle,
  loadBlindCanaryBatchAuthority,
} from "./blind-canary-batch-plan-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const options = { dryRun: false, outDir: null, approvedAt: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--out") options.outDir = argv[++index];
    else if (arg === "--approved-at") options.approvedAt = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.dryRun && !options.outDir) throw new Error("--out is required unless --dry-run is used");
  if (!options.approvedAt) throw new Error("--approved-at with the explicit owner-approval timestamp is required");
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeNoClobber(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function safeOutputRoot(value) {
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || normalize(rel) !== rel) {
    throw new Error("output directory must be a dedicated path inside the HQ root");
  }
  // `resolve` only gives a lexical containment check.  Refuse an existing
  // symlink in the destination chain, otherwise mkdir/open can escape the HQ
  // through a user-controlled ancestor such as .firefly -> /tmp.
  const resolvedRoot = await realpath(root);
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error("output directory path must not contain symlinks");
      if (!info.isDirectory()) throw new Error("output directory path component must be a directory");
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  const resolvedParent = await realpath(dirname(absolute)).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (resolvedParent && resolvedParent !== resolvedRoot && !resolvedParent.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("output directory escaped the HQ root after filesystem resolution");
  }
  return absolute;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [manifest, config, profileRegistry, neutralRegistry, evaluatorRegistry] = await Promise.all([
    readJson(join(root, "config", "edge-repos.json")),
    readJson(join(root, "config", "blind-canary-batch.json")),
    readJson(join(root, "config", "hermes-production-profiles.json")),
    readJson(join(root, "config", "hermes-neutral-production-profile.json")),
    readJson(join(root, "config", "hermes-blind-evaluator.json")),
  ]);
  const authority = await loadBlindCanaryBatchAuthority({ root, manifest, config, profileRegistry, neutralRegistry, evaluatorRegistry });
  const bundle = buildBlindCanaryBatchBundle({ config, authority, approvedAt: options.approvedAt });
  if (!options.dryRun) {
    const outputRoot = await safeOutputRoot(options.outDir);
    try {
      await realpath(outputRoot);
      throw new Error("output directory already exists; refusing to overwrite canary inputs");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await writeNoClobber(join(outputRoot, "owner-approval.json"), Buffer.from(`${JSON.stringify(bundle.approval, null, 2)}\n`, "utf8"));
    for (const decision of bundle.decisions) await writeNoClobber(join(outputRoot, decision.path), decision.bytes);
    await writeNoClobber(join(outputRoot, "plan.json"), Buffer.from(`${JSON.stringify(bundle.plan, null, 2)}\n`, "utf8"));
  }
  process.stdout.write(`${JSON.stringify({
    status: "validated",
    dryRun: options.dryRun,
    batchId: bundle.plan.batchId,
    pairCount: bundle.plan.pairCount,
    planSha256: bundle.plan.planSha256,
    evaluator: bundle.plan.authorities.evaluator,
    output: options.dryRun ? null : options.outDir,
  })}\n`);
}

main().catch((error) => {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
