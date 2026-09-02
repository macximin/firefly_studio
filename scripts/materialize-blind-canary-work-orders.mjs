import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBlindCanaryBatchAuthority, readCommittedArtifact } from "./blind-canary-batch-plan-lib.mjs";
import { loadVerifiedCanaryCommonSnapshot, verifyPromotionCanaryIsolation } from "./canary-isolation-lib.mjs";
import { materializeBlindCanaryWorkOrders } from "./blind-canary-work-order-materializer-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const options = { planDir: null, outDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan-dir") options.planDir = argv[++index] ?? null;
    else if (arg === "--out") options.outDir = argv[++index] ?? null;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.planDir || !options.outDir) throw new Error("--plan-dir and --out are required");
  return options;
}

function containedPath(value, label) {
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || normalize(rel) !== rel) {
    throw new Error(`${label} must be a dedicated path inside the HQ root`);
  }
  return { absolute, rel };
}

async function assertNoSymlinkPath(relativePath, label, allowMissingTail = false) {
  let cursor = root;
  for (const [index, part] of relativePath.split(sep).entries()) {
    cursor = join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error(`${label} must not contain a symlink`);
      if (index < relativePath.split(sep).length - 1 && !info.isDirectory()) throw new Error(`${label} has a non-directory parent`);
    } catch (error) {
      if (allowMissingTail && error?.code === "ENOENT") return;
      throw error;
    }
  }
}

async function readContainedJson(base, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\\") || isAbsolute(relativePath)
    || normalize(relativePath) !== relativePath || relativePath === "." || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`${label} path is invalid`);
  }
  let cursor = base;
  for (const [index, part] of relativePath.split("/").entries()) {
    cursor = join(cursor, part);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error(`${label} contains a symlink`);
    if (index < relativePath.split("/").length - 1 && !info.isDirectory()) throw new Error(`${label} has a non-directory parent`);
  }
  let handle;
  try {
    handle = await open(cursor, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`${label} must be a regular file`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || BigInt(bytes.byteLength) !== before.size) {
      throw new Error(`${label} changed during readback`);
    }
    if (bytes.includes(0)) throw new Error(`${label} contains NUL bytes`);
    return { bytes, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid UTF-8 JSON`);
    throw error;
  } finally {
    await handle?.close();
  }
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const planDir = containedPath(options.planDir, "plan directory");
  const outDir = containedPath(options.outDir, "output directory");
  await assertNoSymlinkPath(planDir.rel, "plan directory");
  await assertNoSymlinkPath(outDir.rel, "output directory", true);
  const [planFile, approvalFile] = await Promise.all([
    readContainedJson(planDir.absolute, "plan.json", "batch plan"),
    readContainedJson(planDir.absolute, "owner-approval.json", "batch owner approval"),
  ]);
  const [manifestFile, configFile, profileRegistryFile, neutralRegistryFile, evaluatorRegistryFile] = await Promise.all([
    readContainedJson(root, "config/edge-repos.json", "HQ edge repository manifest"),
    readContainedJson(root, "config/blind-canary-batch.json", "HQ batch config"),
    readContainedJson(root, "config/hermes-production-profiles.json", "HQ profile registry"),
    readContainedJson(root, "config/hermes-neutral-production-profile.json", "HQ neutral registry"),
    readContainedJson(root, "config/hermes-blind-evaluator.json", "HQ blind evaluator registry"),
  ]);
  const authority = await loadBlindCanaryBatchAuthority({
    root,
    manifest: manifestFile.value,
    config: configFile.value,
    profileRegistry: profileRegistryFile.value,
    neutralRegistry: neutralRegistryFile.value,
    evaluatorRegistry: evaluatorRegistryFile.value,
  });
  if (planFile.value.authorities?.hqCommit !== authority.repositories.hq.commit
    || planFile.value.authorities?.inkosCommit !== authority.repositories.inkos.commit
    || planFile.value.authorities?.referenceLabCommit !== authority.repositories.referenceLab.commit) {
    throw new Error("plan repository authority is stale; rebuild the plan from current exact remote tips");
  }
  const [approvalRef, adoptionRegistry] = await Promise.all([
    Promise.resolve({
      path: "owner-approval.json",
      sha256: createHash("sha256").update(approvalFile.bytes).digest("hex"),
      sizeBytes: approvalFile.bytes.byteLength,
    }),
    readCommittedArtifact(authority.repositories.hq, "config/genre-soul-adoptions.json", "HQ genre Soul adoption registry"),
  ]);
  const expectedApproval = planFile.value.ownerApproval;
  if (!expectedApproval || approvalRef.sha256 !== expectedApproval.sha256 || approvalRef.sizeBytes !== expectedApproval.sizeBytes) {
    throw new Error("batch owner approval bytes do not match the sealed plan");
  }
  const decisionPaths = [...new Set(planFile.value.pairs?.map((pair) => pair.candidateDecision?.path) ?? [])];
  const decisionEntries = await Promise.all(decisionPaths.map(async (path) => {
    const file = await readContainedJson(planDir.absolute, path, "candidate Soul binding decision");
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    return [path, { value: file.value, sha256, sizeBytes: file.bytes.byteLength }];
  }));
  const isolationEntries = await Promise.all(planFile.value.pairs.map(async (pair) => [
    pair.pairId,
    await loadVerifiedCanaryCommonSnapshot({
      codeRepoPath: authority.repositories.inkos.root,
      pairId: pair.pairId,
      bookId: pair.bookId,
    }),
  ]));
  const workOrders = materializeBlindCanaryWorkOrders({
    plan: planFile.value,
    config: configFile.value,
    approval: approvalFile.value,
    authority: { ...authority, profileRegistry: profileRegistryFile.value, neutralRegistry: neutralRegistryFile.value },
    manifest: manifestFile.value,
    adoptionRegistry: adoptionRegistry.value,
    adoptionRegistryBytes: adoptionRegistry.bytes,
    decisionsByPath: new Map(decisionEntries),
    isolationByPair: new Map(isolationEntries),
  });
  // The full lane verification happens only after construction, so no partial
  // file is emitted if a terminal/source/lane has drifted.
  for (const item of workOrders) {
    await verifyPromotionCanaryIsolation({
      codeRepoPath: authority.repositories.inkos.root,
      workOrder: item.workOrder,
      requireLaneSnapshot: true,
    });
  }
  try {
    await lstat(outDir.absolute);
    throw new Error("output directory already exists; refusing to overwrite WorkOrders");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(outDir.absolute, { recursive: false, mode: 0o700 });
  const resolvedRoot = await realpath(root);
  const resolvedOut = await realpath(outDir.absolute);
  if (!resolvedOut.startsWith(`${resolvedRoot}${sep}`)) throw new Error("output directory escaped the HQ root after creation");
  for (const { pairId, lane, workOrder } of workOrders) {
    await writeNoClobber(join(outDir.absolute, pairId, `${lane}.json`), Buffer.from(`${JSON.stringify(workOrder, null, 2)}\n`, "utf8"));
  }
  process.stdout.write(`${JSON.stringify({
    status: "materialized-not-executed",
    planSha256: planFile.value.planSha256,
    workOrderCount: workOrders.length,
    output: options.outDir,
  })}\n`);
}

main().catch((error) => {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
