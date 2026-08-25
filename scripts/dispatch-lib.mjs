import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import { inspectGitRepo, validateManifest } from "./edge-lib.mjs";

const WORK_ORDER_KEYS = new Set([
  "schemaVersion",
  "workOrderId",
  "idempotencyKey",
  "repo",
  "capability",
  "bookId",
  "sessionId",
  "instruction",
  "approvalMode",
  "approvedInputs",
  "requestedAt",
  "timeoutMs",
]);

const INPUT_KEYS = new Set(["repo", "commit", "path", "sha256", "role"]);
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRelativePath(value, label, errors) {
  if (!hasText(value)) {
    errors.push(`${label} is required`);
    return;
  }
  const normalized = normalize(value);
  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${sep}`) || value.split(/[\\/]+/).includes("..")) {
    errors.push(`${label} must stay inside its repository`);
  }
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function validateWorkOrder(workOrder, manifest) {
  const errors = [];
  if (!isPlainObject(workOrder)) return ["work order must be an object"];

  for (const key of Object.keys(workOrder)) {
    if (!WORK_ORDER_KEYS.has(key)) errors.push(`unknown work order field: ${key}`);
  }
  if (workOrder.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!hasText(workOrder.workOrderId) || workOrder.workOrderId.length > 160) {
    errors.push("workOrderId must be 1-160 characters");
  }
  if (!hasText(workOrder.idempotencyKey) || workOrder.idempotencyKey.length > 240) {
    errors.push("idempotencyKey must be 1-240 characters");
  }
  if (!hasText(workOrder.repo)) errors.push("repo is required");
  if (!hasText(workOrder.capability)) errors.push("capability is required");
  for (const field of ["bookId", "sessionId", "instruction"]) {
    if (workOrder[field] !== undefined && !hasText(workOrder[field])) {
      errors.push(`${field} must be a non-empty string when provided`);
    }
  }
  if (!Array.isArray(workOrder.approvedInputs)) errors.push("approvedInputs must be an array");
  if (!hasText(workOrder.requestedAt) || Number.isNaN(Date.parse(workOrder.requestedAt))) {
    errors.push("requestedAt must be an ISO date-time");
  }
  if (workOrder.timeoutMs !== undefined && (!Number.isInteger(workOrder.timeoutMs) || workOrder.timeoutMs < 1000 || workOrder.timeoutMs > 3600000)) {
    errors.push("timeoutMs must be an integer between 1000 and 3600000");
  }

  const repo = manifest?.repos?.find((candidate) => candidate.name === workOrder.repo);
  if (!repo) {
    errors.push(`repo is not registered: ${workOrder.repo}`);
    return errors;
  }
  if (repo.managementState !== "active" || repo.adoptionState !== "ready") {
    errors.push(`repo is not dispatchable: ${workOrder.repo}`);
  }
  if (repo.execution?.kind !== "worker") {
    errors.push(`repo is not a worker: ${workOrder.repo}`);
    return errors;
  }

  const capability = repo.execution.capabilities.find((candidate) => candidate.name === workOrder.capability);
  if (!capability) {
    errors.push(`capability is not registered for ${workOrder.repo}: ${workOrder.capability}`);
    return errors;
  }
  if (workOrder.approvalMode !== capability.approval) {
    errors.push(`approvalMode must be ${capability.approval} for ${workOrder.repo}/${workOrder.capability}`);
  }
  if (capability.mode === "mutating" && repo.writeAllowed !== true) {
    errors.push(`repo does not allow mutating dispatch: ${workOrder.repo}`);
  }

  if (workOrder.capability === "interact") {
    if (!hasText(workOrder.bookId)) errors.push("bookId is required for interact v1");
    if (!hasText(workOrder.instruction)) errors.push("instruction is required for interact v1");
  }
  if (workOrder.capability === "status" && workOrder.instruction !== undefined) {
    errors.push("status does not accept instruction");
  }

  if (Array.isArray(workOrder.approvedInputs)) {
    for (const [index, input] of workOrder.approvedInputs.entries()) {
      const label = `approvedInputs[${index}]`;
      if (!isPlainObject(input)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      for (const key of Object.keys(input)) {
        if (!INPUT_KEYS.has(key)) errors.push(`${label} has unknown field: ${key}`);
      }
      if (!manifest.repos.some((candidate) => candidate.name === input.repo)) {
        errors.push(`${label}.repo is not registered: ${input.repo}`);
      }
      if (!SHA1.test(input.commit ?? "")) errors.push(`${label}.commit must be a full Git SHA-1`);
      if (!SHA256.test(input.sha256 ?? "")) errors.push(`${label}.sha256 must be a SHA-256 digest`);
      validateRelativePath(input.path, `${label}.path`, errors);
      if (!hasText(input.role)) errors.push(`${label}.role is required`);
    }
  }

  return errors;
}

function buildInkosCliPlan({ repoPath, repo, capability, workOrder }) {
  const entrypoint = join(repoPath, repo.execution.entrypoint);
  const args = [entrypoint];
  let stdin = null;

  if (capability.name === "status") {
    args.push("status");
    if (workOrder.bookId) args.push(workOrder.bookId);
    args.push("--json");
  } else if (capability.name === "interact") {
    args.push("interact", "--json", "--book", workOrder.bookId);
    if (workOrder.sessionId) args.push("--session", workOrder.sessionId);
    stdin = `${workOrder.instruction.trim()}\n`;
  } else {
    throw new Error(`inkos-cli-v1 does not implement capability: ${capability.name}`);
  }

  return {
    executable: process.execPath,
    args,
    stdin,
    timeoutMs: workOrder.timeoutMs ?? (capability.mode === "mutating" ? 1800000 : 30000),
  };
}

export function buildDispatchPlan({ root, manifest, workOrder }) {
  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length > 0) throw new Error(manifestErrors.join("\n"));
  const workOrderErrors = validateWorkOrder(workOrder, manifest);
  if (workOrderErrors.length > 0) throw new Error(workOrderErrors.join("\n"));

  const repo = manifest.repos.find((candidate) => candidate.name === workOrder.repo);
  const capability = repo.execution.capabilities.find((candidate) => candidate.name === workOrder.capability);
  const repoPath = join(root, repo.path);
  let invocation;
  if (repo.execution.adapter === "inkos-cli-v1") {
    invocation = buildInkosCliPlan({ repoPath, repo, capability, workOrder });
  } else {
    throw new Error(`unsupported worker adapter: ${repo.execution.adapter}`);
  }

  return {
    repo,
    capability,
    repoPath,
    invocation,
    mutating: capability.mode === "mutating",
    approvalRequired: capability.approval === "human",
  };
}

export function inspectDispatchTarget(plan) {
  const git = inspectGitRepo(plan.repoPath);
  if (git.branch !== plan.repo.branch) {
    throw new Error(`child branch mismatch: expected ${plan.repo.branch}, found ${git.branch}`);
  }
  if (git.origin !== plan.repo.remoteUrl) {
    throw new Error(`child origin mismatch for ${plan.repo.name}`);
  }
  if (plan.mutating && git.dirty) {
    throw new Error(`refusing mutating dispatch to dirty child: ${plan.repo.name}`);
  }
  return git;
}

export function verifyApprovedInputs({ root, manifest, workOrder, spawn = spawnSync }) {
  return workOrder.approvedInputs.map((input) => {
    const sourceRepo = manifest.repos.find((candidate) => candidate.name === input.repo);
    const sourcePath = join(root, sourceRepo.path);
    const blob = spawn("git", ["-C", sourcePath, "show", `${input.commit}:${input.path}`], {
      encoding: null,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (blob.status !== 0 || !Buffer.isBuffer(blob.stdout)) {
      throw new Error(`approved input is unavailable: ${input.repo}@${input.commit}:${input.path}`);
    }
    const actualSha256 = createHash("sha256").update(blob.stdout).digest("hex");
    if (actualSha256 !== input.sha256) {
      throw new Error(`approved input hash mismatch: ${input.repo}@${input.commit}:${input.path}`);
    }
    return {
      ...input,
      status: "verified",
    };
  });
}

function receiptFileName(idempotencyKey) {
  return `${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}.json`;
}

function lockFileName(plan, workOrder) {
  const target = workOrder.bookId ?? "project";
  const safe = `${plan.repo.name}--${target}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${safe}.lock`;
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readExistingReceipt(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sameTrackedState(before, after) {
  return before.head === after.head
    && before.branch === after.branch
    && JSON.stringify(before.changes) === JSON.stringify(after.changes);
}

function parseChildJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return { value: null, error: "child returned empty stdout" };
  try {
    return { value: JSON.parse(trimmed), error: null };
  } catch {
    return { value: null, error: "child stdout was not valid JSON" };
  }
}

export function validateChildArtifacts(value, repoName) {
  if (value === undefined) return { artifacts: [], errors: [] };
  if (!Array.isArray(value)) return { artifacts: [], errors: ["child artifacts must be an array"] };
  const artifacts = [];
  const errors = [];
  for (const [index, artifact] of value.entries()) {
    const label = `child artifacts[${index}]`;
    if (!isPlainObject(artifact)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    const pathErrors = [];
    validateRelativePath(artifact.path, `${label}.path`, pathErrors);
    if (artifact.repo !== repoName) pathErrors.push(`${label}.repo must match ${repoName}`);
    if (!SHA256.test(artifact.sha256 ?? "")) pathErrors.push(`${label}.sha256 must be a SHA-256 digest`);
    if (!hasText(artifact.role)) pathErrors.push(`${label}.role is required`);
    if (pathErrors.length > 0) {
      errors.push(...pathErrors);
      continue;
    }
    artifacts.push({
      repo: artifact.repo,
      path: artifact.path,
      sha256: artifact.sha256,
      role: artifact.role,
    });
  }
  return { artifacts, errors };
}

async function verifyChildArtifacts(repoPath, report) {
  const artifacts = [];
  const errors = [...report.errors];
  for (const artifact of report.artifacts) {
    try {
      const bytes = await readFile(join(repoPath, artifact.path));
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== artifact.sha256) {
        errors.push(`child artifact hash mismatch: ${artifact.path}`);
        continue;
      }
      artifacts.push(artifact);
    } catch {
      errors.push(`child artifact is unavailable: ${artifact.path}`);
    }
  }
  return { artifacts, errors };
}

function changedPaths(changes) {
  return changes.flatMap((change) => {
    const path = change.slice(3);
    if (!path) return [];
    return path.includes(" -> ") ? path.split(" -> ") : [path];
  });
}

function writeScopeViolations(plan, before, after) {
  if (!plan.mutating) return [];
  const beforePaths = new Set(changedPaths(before.changes));
  const newPaths = changedPaths(after.changes).filter((path) => !beforePaths.has(path));
  return newPaths.filter((path) => !plan.repo.execution.writeScopes.some((scope) => {
    const normalizedScope = normalize(scope).replace(/[\\/]+$/, "");
    const normalizedPath = normalize(path);
    return normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}${sep}`);
  }));
}

export async function executeWorkOrder({ root, manifest, workOrder, spawn = spawnSync }) {
  const plan = buildDispatchPlan({ root, manifest, workOrder });
  const inputVerification = verifyApprovedInputs({ root, manifest, workOrder });
  const workOrderSha256 = sha256Json(workOrder);
  const runtimeRoot = join(root, ".firefly");
  const runsDir = join(runtimeRoot, "runs");
  const locksDir = join(runtimeRoot, "locks");
  await mkdir(runsDir, { recursive: true });
  await mkdir(locksDir, { recursive: true });

  const receiptName = receiptFileName(workOrder.idempotencyKey);
  const idempotencyLockPath = join(locksDir, `idempotency-${receiptName.replace(/\.json$/, ".lock")}`);
  let idempotencyLockHandle;
  try {
    idempotencyLockHandle = await open(idempotencyLockPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("an execution with this idempotencyKey is already in progress");
    throw error;
  }

  try {
    const receiptPath = join(runsDir, receiptName);
    const existing = await readExistingReceipt(receiptPath);
    if (existing) {
      if (existing.workOrderSha256 !== workOrderSha256) {
        throw new Error("idempotencyKey is already bound to a different work order");
      }
      if (existing.status === "running") {
        throw new Error("an execution with this idempotencyKey is still marked running");
      }
      return { ...existing, replayed: true };
    }

    const before = inspectDispatchTarget(plan);
    const startedAt = new Date().toISOString();
    const receiptId = `rr-${createHash("sha256").update(`${workOrder.idempotencyKey}:${workOrderSha256}`).digest("hex").slice(0, 24)}`;
    const runningReceipt = {
      schemaVersion: 1,
      receiptId,
      workOrderId: workOrder.workOrderId,
      workOrderSha256,
      idempotencyKey: workOrder.idempotencyKey,
      repo: workOrder.repo,
      capability: workOrder.capability,
      status: "running",
      mutating: plan.mutating,
      startedAt,
      approval: {
        required: plan.approvalRequired,
        status: plan.approvalRequired ? "pending" : "not-required",
      },
      inputVerification,
      artifacts: [],
    };
    await writeJsonAtomic(receiptPath, runningReceipt);

    const lockPath = join(locksDir, lockFileName(plan, workOrder));
    let lockHandle = null;
    try {
      if (plan.mutating) {
        try {
          lockHandle = await open(lockPath, "wx");
        } catch (error) {
          if (error?.code === "EEXIST") throw new Error(`mutating target is locked: ${workOrder.repo}/${workOrder.bookId}`);
          throw error;
        }
        await lockHandle.writeFile(`${JSON.stringify({ receiptId, workOrderId: workOrder.workOrderId, startedAt })}\n`, "utf8");
      }

      const child = spawn(plan.invocation.executable, plan.invocation.args, {
        cwd: plan.repoPath,
        input: plan.invocation.stdin ?? undefined,
        encoding: "utf8",
        env: process.env,
        maxBuffer: 16 * 1024 * 1024,
        timeout: plan.invocation.timeoutMs,
      });
      const after = inspectGitRepo(plan.repoPath);
      const parsed = parseChildJson(child.stdout ?? "");
      const trackedWorktreeUnchanged = sameTrackedState(before, after);
      const childArtifactReport = await verifyChildArtifacts(
        plan.repoPath,
        validateChildArtifacts(parsed.value?.artifacts, workOrder.repo),
      );
      const scopeViolations = writeScopeViolations(plan, before, after);
      const succeeded = child.status === 0 && parsed.error === null;
      const boundariesPassed = trackedWorktreeUnchanged
        && childArtifactReport.errors.length === 0
        && scopeViolations.length === 0;
      const status = !succeeded ? "failed" : boundariesPassed ? "succeeded" : "needs-attention";
      const childArtifacts = childArtifactReport.artifacts;
      const finishedAt = new Date().toISOString();
      const finalReceipt = {
        ...runningReceipt,
        status,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        child: {
          path: relative(root, plan.repoPath),
          branchBefore: before.branch,
          branchAfter: after.branch,
          headBefore: before.head,
          headAfter: after.head,
        },
        execution: {
          adapter: plan.repo.execution.adapter,
          executable: plan.invocation.executable,
          args: plan.invocation.args,
          cwd: relative(root, plan.repoPath),
          instructionTransport: plan.invocation.stdin === null ? "none" : "stdin",
          exitCode: child.status,
          signal: child.signal ?? null,
        },
        boundaryChecks: {
          trackedWorktreeUnchanged,
          artifactReportsValid: childArtifactReport.errors.length === 0,
          writesWithinDeclaredScopes: scopeViolations.length === 0,
          instructionExcludedFromArgs: plan.invocation.stdin === null
            || !plan.invocation.args.includes(workOrder.instruction),
        },
        writeScopeViolations: scopeViolations,
        approval: {
          required: plan.approvalRequired,
          status: status === "failed"
            ? "blocked"
            : plan.approvalRequired ? "pending" : "not-required",
        },
        artifacts: childArtifacts,
        artifactEvidence: childArtifactReport.errors.length > 0
          ? "invalid-child-report"
          : childArtifacts.length > 0 ? "child-reported" : "not-reported-by-child",
        artifactErrors: childArtifactReport.errors,
        childResult: parsed.value,
        error: status === "failed"
          ? {
              message: child.error?.message ?? parsed.error ?? `child exited with code ${child.status}`,
              stderr: (child.stderr ?? "").trim().slice(0, 20000),
            }
          : null,
        replayed: false,
      };
      await writeJsonAtomic(receiptPath, finalReceipt);
      return finalReceipt;
    } catch (error) {
      const failedReceipt = {
        ...runningReceipt,
        status: "failed",
        finishedAt: new Date().toISOString(),
        approval: {
          required: plan.approvalRequired,
          status: "blocked",
        },
        error: { message: error instanceof Error ? error.message : String(error) },
        replayed: false,
      };
      await writeJsonAtomic(receiptPath, failedReceipt);
      return failedReceipt;
    } finally {
      if (lockHandle) {
        await lockHandle.close();
        await rm(lockPath, { force: true });
      }
    }
  } finally {
    await idempotencyLockHandle.close();
    await rm(idempotencyLockPath, { force: true });
  }
}

export function publicDispatchPlan(plan, workOrder) {
  return {
    schemaVersion: 1,
    type: "dispatch-plan",
    repo: plan.repo.name,
    capability: plan.capability.name,
    mutating: plan.mutating,
    approvalRequired: plan.approvalRequired,
    approvedInputCount: workOrder.approvedInputs.length,
    childPath: plan.repo.path,
    adapter: plan.repo.execution.adapter,
    command: [plan.invocation.executable, ...plan.invocation.args],
    instructionTransport: plan.invocation.stdin === null ? "none" : "stdin",
    instructionExcludedFromArgs: plan.invocation.stdin === null
      || !plan.invocation.args.includes(workOrder.instruction),
    timeoutMs: plan.invocation.timeoutMs,
  };
}
