import assert from "node:assert/strict";
import test from "node:test";
import { validateManifest } from "../scripts/edge-lib.mjs";

function validManifest() {
  return {
    schemaVersion: 1,
    family: "firefly-studio",
    policy: {
      sourceFlow: ["writer"],
      defaultProductionEngine: "writer",
    },
    repos: [{
      name: "writer",
      path: "edge_repos/writer",
      remoteUrl: "git@example.invalid:owner/writer.git",
      branch: "main",
      managementState: "active",
      adoptionState: "ready",
      pullAllowed: true,
      writeAllowed: true,
      role: "writer",
    }],
  };
}

test("accepts a bounded active edge repository", () => {
  assert.deepEqual(validateManifest(validManifest()), []);
});

test("rejects duplicate names and paths outside edge_repos", () => {
  const manifest = validManifest();
  manifest.repos.push({ ...manifest.repos[0], path: "../writer" });
  const errors = validateManifest(manifest);
  assert.ok(errors.some((error) => error.includes("duplicate repo name")));
  assert.ok(errors.some((error) => error.includes("must stay inside")));
  assert.ok(errors.some((error) => error.includes("must be below edge_repos")));
});

test("rejects writes to parked or non-ready repositories", () => {
  const manifest = validManifest();
  manifest.repos[0].managementState = "parked";
  manifest.repos[0].adoptionState = "legacy-preserved";
  const errors = validateManifest(manifest);
  assert.ok(errors.some((error) => error.includes("parked repos cannot allow")));
  assert.ok(errors.some((error) => error.includes("non-ready repos cannot allow write")));
});
