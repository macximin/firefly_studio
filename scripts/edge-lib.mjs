import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { isAbsolute, normalize, sep } from "node:path";

const MANAGEMENT_STATES = new Set(["active", "parked"]);
const ADOPTION_STATES = new Set(["ready", "pending-clean-closeout", "legacy-preserved"]);
const EXECUTION_KINDS = new Set(["worker", "tool", "library"]);
const CAPABILITY_MODES = new Set(["read-only", "mutating"]);
const APPROVAL_MODES = new Set(["none", "human"]);
const READ_ONLY_TOOL_ADAPTERS = new Set(["reference-lab-read-v1"]);

function validateRelativePath(value, label, errors) {
  const normalized = typeof value === "string" ? normalize(value) : "";
  if (!normalized || isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${sep}`) || String(value).split(/[\\/]+/).includes("..")) {
    errors.push(`${label} must stay inside the child repository`);
  }
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  if (manifest?.family !== "firefly-studio") errors.push("family must be firefly-studio");
  if (!Array.isArray(manifest?.repos) || manifest.repos.length === 0) {
    errors.push("repos must be a non-empty array");
    return errors;
  }

  const names = new Set();
  const paths = new Set();
  for (const [index, repo] of manifest.repos.entries()) {
    const label = `repos[${index}]`;
    if (!repo?.name || typeof repo.name !== "string") errors.push(`${label}.name is required`);
    if (names.has(repo?.name)) errors.push(`duplicate repo name: ${repo.name}`);
    names.add(repo?.name);

    if (!repo?.path || typeof repo.path !== "string") {
      errors.push(`${label}.path is required`);
    } else {
      const normalized = normalize(repo.path);
      if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${sep}`)) {
        errors.push(`${label}.path must stay inside the HQ`);
      }
      if (!normalized.startsWith(`edge_repos${sep}`)) {
        errors.push(`${label}.path must be below edge_repos/`);
      }
      if (paths.has(normalized)) errors.push(`duplicate repo path: ${repo.path}`);
      paths.add(normalized);
    }

    if (!repo?.remoteUrl) errors.push(`${label}.remoteUrl is required`);
    if (!repo?.branch) errors.push(`${label}.branch is required`);
    if (!MANAGEMENT_STATES.has(repo?.managementState)) {
      errors.push(`${label}.managementState is invalid`);
    }
    if (!ADOPTION_STATES.has(repo?.adoptionState)) {
      errors.push(`${label}.adoptionState is invalid`);
    }
    if (typeof repo?.pullAllowed !== "boolean") errors.push(`${label}.pullAllowed must be boolean`);
    if (typeof repo?.writeAllowed !== "boolean") errors.push(`${label}.writeAllowed must be boolean`);
    if (!repo?.role) errors.push(`${label}.role is required`);
    if (repo?.managementState === "parked" && (repo.pullAllowed || repo.writeAllowed)) {
      errors.push(`${label} parked repos cannot allow pull or write`);
    }
    if (repo?.adoptionState !== "ready" && repo.writeAllowed) {
      errors.push(`${label} non-ready repos cannot allow write`);
    }

    const execution = repo?.execution;
    if (!execution || !EXECUTION_KINDS.has(execution.kind)) {
      errors.push(`${label}.execution.kind is invalid`);
      continue;
    }
    if (!Array.isArray(execution.capabilities)) {
      errors.push(`${label}.execution.capabilities must be an array`);
      continue;
    }

    const capabilityNames = new Set();
    for (const [capabilityIndex, capability] of execution.capabilities.entries()) {
      const capabilityLabel = `${label}.execution.capabilities[${capabilityIndex}]`;
      if (!capability?.name || typeof capability.name !== "string") {
        errors.push(`${capabilityLabel}.name is required`);
      } else if (capabilityNames.has(capability.name)) {
        errors.push(`${label}.execution has duplicate capability: ${capability.name}`);
      } else {
        capabilityNames.add(capability.name);
      }
      if (!CAPABILITY_MODES.has(capability?.mode)) {
        errors.push(`${capabilityLabel}.mode is invalid`);
      }
      if (!APPROVAL_MODES.has(capability?.approval)) {
        errors.push(`${capabilityLabel}.approval is invalid`);
      }
      if (capability?.mode === "mutating" && capability?.approval !== "human") {
        errors.push(`${capabilityLabel} mutating capabilities require human approval`);
      }
    }

    if (execution.kind === "worker") {
      if (!execution.adapter || typeof execution.adapter !== "string") {
        errors.push(`${label}.execution.adapter is required for workers`);
      }
      if (!execution.entrypoint || typeof execution.entrypoint !== "string") {
        errors.push(`${label}.execution.entrypoint is required for workers`);
      } else validateRelativePath(execution.entrypoint, `${label}.execution.entrypoint`, errors);
      if (!["run-receipt/v1", "run-receipt/dual"].includes(execution.receiptContract)) {
        errors.push(`${label}.execution.receiptContract must be run-receipt/v1 or run-receipt/dual`);
      }
      if (!Array.isArray(execution.writeScopes)) {
        errors.push(`${label}.execution.writeScopes must be an array`);
      } else {
        for (const [scopeIndex, scope] of execution.writeScopes.entries()) {
          validateRelativePath(scope, `${label}.execution.writeScopes[${scopeIndex}]`, errors);
        }
        if (execution.capabilities.some((capability) => capability.mode === "mutating") && execution.writeScopes.length === 0) {
          errors.push(`${label}.execution.writeScopes must not be empty for mutating workers`);
        }
      }
      if (!Array.isArray(execution.observationScopes)) {
        errors.push(`${label}.execution.observationScopes must be an array`);
      } else {
        for (const [scopeIndex, scope] of execution.observationScopes.entries()) {
          validateRelativePath(scope, `${label}.execution.observationScopes[${scopeIndex}]`, errors);
        }
        for (const writeScope of execution.writeScopes ?? []) {
          if (!execution.observationScopes.includes(writeScope)) {
            errors.push(`${label}.execution.observationScopes must include write scope: ${writeScope}`);
          }
        }
      }
      if (execution.capabilities.length === 0) {
        errors.push(`${label}.execution.capabilities must not be empty for workers`);
      }
    } else if (execution.kind === "tool") {
      const executable = execution.capabilities.length > 0 || execution.adapter || execution.entrypoint || execution.readScopes || execution.receiptContract;
      if (executable) {
        if (!READ_ONLY_TOOL_ADAPTERS.has(execution.adapter)) errors.push(`${label}.execution.adapter is not an approved read-only tool adapter`);
        if (!execution.entrypoint || typeof execution.entrypoint !== "string") errors.push(`${label}.execution.entrypoint is required for tools`);
        else validateRelativePath(execution.entrypoint, `${label}.execution.entrypoint`, errors);
        if (execution.receiptContract !== "source-access-receipt/v1") errors.push(`${label}.execution.receiptContract must be source-access-receipt/v1 for tools`);
        if (!Array.isArray(execution.readScopes) || execution.readScopes.length === 0) errors.push(`${label}.execution.readScopes must be a non-empty array for tools`);
        else for (const [scopeIndex, scope] of execution.readScopes.entries()) validateRelativePath(scope, `${label}.execution.readScopes[${scopeIndex}]`, errors);
        if (execution.writeScopes || execution.observationScopes) errors.push(`${label}.execution read-only tools cannot declare writeScopes or observationScopes`);
        if (execution.capabilities.length === 0) errors.push(`${label}.execution.capabilities must not be empty for executable tools`);
        for (const capability of execution.capabilities) {
          if (capability.mode !== "read-only" || capability.approval !== "human") errors.push(`${label}.execution tool capabilities must be read-only and human-approved`);
        }
      }
    } else if (execution.adapter || execution.entrypoint || execution.writeScopes || execution.observationScopes || execution.readScopes || execution.receiptContract) {
      errors.push(`${label}.execution ${execution.kind} repositories cannot declare a worker adapter`);
    }
  }

  const route = manifest?.policy?.routingInputs;
  if (!Array.isArray(route) || route.length === 0) {
    errors.push("policy.routingInputs must be a non-empty array");
  } else {
    for (const name of route) {
      if (!names.has(name)) errors.push(`policy.routingInputs references unknown repo: ${name}`);
    }
  }
  if (!names.has(manifest?.policy?.defaultProductionEngine)) {
    errors.push("policy.defaultProductionEngine must reference a registered repo");
  } else {
    const productionRepo = manifest.repos.find((repo) => repo.name === manifest.policy.defaultProductionEngine);
    if (productionRepo?.execution?.kind !== "worker") {
      errors.push("policy.defaultProductionEngine must reference a worker repository");
    }
  }
  return errors;
}

function runGit(repoPath, args, allowFailure = false) {
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed for ${repoPath}`);
  }
  return result.stdout.trim();
}

export function inspectGitRepo(repoPath, options = {}) {
  const branch = runGit(repoPath, ["branch", "--show-current"]);
  const head = runGit(repoPath, ["rev-parse", "HEAD"]);
  const origin = runGit(repoPath, ["remote", "get-url", "origin"], true);
  const tracking = runGit(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], true);
  const porcelain = runGit(repoPath, ["status", "--porcelain=v1"]);
  const changes = porcelain ? porcelain.split("\n").filter(Boolean) : [];
  let ahead = null;
  let behind = null;
  if (tracking) {
    const counts = runGit(repoPath, ["rev-list", "--left-right", "--count", `${tracking}...HEAD`], true);
    if (counts) {
      const [left, right] = counts.split(/\s+/).map(Number);
      behind = left;
      ahead = right;
    }
  }
  let upstream = null;
  if (options.upstreamRef) {
    const counts = runGit(repoPath, ["rev-list", "--left-right", "--count", `${options.upstreamRef}...HEAD`], true);
    if (counts) {
      const [left, right] = counts.split(/\s+/).map(Number);
      upstream = { ref: options.upstreamRef, behind: left, ahead: right };
    }
  }
  return {
    branch,
    head,
    origin,
    tracking,
    dirty: changes.length > 0,
    changeCount: changes.length,
    changes,
    ahead,
    behind,
    upstream,
  };
}
