import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { isAbsolute, normalize, sep } from "node:path";

const MANAGEMENT_STATES = new Set(["active", "parked"]);
const ADOPTION_STATES = new Set(["ready", "pending-clean-closeout", "legacy-preserved"]);

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
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
  }

  const route = manifest?.policy?.sourceFlow;
  if (!Array.isArray(route) || route.length === 0) {
    errors.push("policy.sourceFlow must be a non-empty array");
  } else {
    for (const name of route) {
      if (!names.has(name)) errors.push(`policy.sourceFlow references unknown repo: ${name}`);
    }
  }
  if (!names.has(manifest?.policy?.defaultProductionEngine)) {
    errors.push("policy.defaultProductionEngine must reference a registered repo");
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
    ahead,
    behind,
    upstream,
  };
}
