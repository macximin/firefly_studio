import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectGitRepo, readJson, validateManifest } from "./edge-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = await readJson(join(root, "config", "edge-repos.json"));
const errors = validateManifest(manifest);
if (errors.length > 0) throw new Error(errors.join("\n"));

const rows = [];
let missing = false;
for (const repo of manifest.repos) {
  const repoPath = join(root, repo.path);
  try {
    const git = inspectGitRepo(repoPath, {
      upstreamRef: repo.upstreamUrl ? `upstream/${repo.branch}` : undefined,
    });
    const contractMatches = git.branch === repo.branch && git.origin === repo.remoteUrl;
    rows.push({
      name: repo.name,
      state: `${repo.managementState}/${repo.adoptionState}`,
      branch: git.branch,
      sync: git.tracking ? `behind ${git.behind} / ahead ${git.ahead}` : "no tracking",
      upstream: git.upstream ? `behind ${git.upstream.behind} / ahead ${git.upstream.ahead}` : "-",
      worktree: git.dirty ? `dirty (${git.changeCount})` : "clean",
      contract: contractMatches ? "match" : "MISMATCH",
      head: git.head.slice(0, 8),
      remote: git.origin ?? "none",
    });
  } catch (error) {
    missing = true;
    rows.push({
      name: repo.name,
      state: `${repo.managementState}/${repo.adoptionState}`,
      branch: "missing",
      sync: "unavailable",
      upstream: "unavailable",
      worktree: "unavailable",
      contract: "unavailable",
      head: "-",
      remote: error instanceof Error ? error.message : String(error),
    });
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ family: manifest.family, repos: rows }, null, 2));
} else {
  console.table(rows);
}
if (missing || rows.some((row) => row.contract === "MISMATCH")) process.exitCode = 1;
