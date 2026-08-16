import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectGitRepo, readJson, validateManifest } from "./edge-lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = await readJson(join(root, "config", "edge-repos.json"));
const errors = validateManifest(manifest);
if (errors.length > 0) throw new Error(errors.join("\n"));
const localPaths = await readJson(join(root, "config", "local-edge-paths.json"));

for (const repo of manifest.repos) {
  const target = localPaths[repo.name];
  if (!target || typeof target !== "string") {
    throw new Error(`Missing local path for ${repo.name}`);
  }
  inspectGitRepo(target);
  const linkPath = join(root, repo.path);
  await mkdir(dirname(linkPath), { recursive: true });
  let existing;
  try {
    existing = await lstat(linkPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (existing) {
    if (!existing.isSymbolicLink()) {
      if (resolve(linkPath) !== resolve(target)) {
        throw new Error(`Refusing to overwrite non-link path: ${linkPath}`);
      }
      inspectGitRepo(linkPath);
      console.log(`OK   ${repo.name} checkout already present`);
      continue;
    }
    const current = resolve(dirname(linkPath), await readlink(linkPath));
    if (current !== resolve(target)) {
      throw new Error(`Refusing to replace mismatched link: ${linkPath}`);
    }
    console.log(`OK   ${repo.name} already linked`);
    continue;
  }
  await symlink(resolve(target), linkPath, "dir");
  console.log(`LINK ${repo.name} -> ${target}`);
}
