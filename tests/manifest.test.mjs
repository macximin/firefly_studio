import assert from "node:assert/strict";
import test from "node:test";
import { validateManifest } from "../scripts/edge-lib.mjs";

function validManifest() {
  return {
    schemaVersion: 2,
    family: "firefly-studio",
    policy: {
      routingInputs: ["writer"],
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
      execution: {
        kind: "worker",
        adapter: "inkos-cli-v1",
        entrypoint: "packages/cli/dist/index.js",
        receiptContract: "run-receipt/v1",
        writeScopes: ["books/", ".inkos/"],
        observationScopes: ["books/", ".inkos/"],
        capabilities: [
          { name: "status", mode: "read-only", approval: "none" },
          { name: "interact", mode: "mutating", approval: "human" },
        ],
      },
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

test("requires an executable worker for the default production engine", () => {
  const manifest = validManifest();
  manifest.repos[0].execution = { kind: "library", capabilities: [] };
  const errors = validateManifest(manifest);
  assert.ok(errors.some((error) => error.includes("defaultProductionEngine must reference a worker")));
});

test("accepts only bounded human-approved read-only tools", () => {
  const manifest = validManifest();
  manifest.policy.routingInputs.push("reference");
  manifest.repos.push({
    name: "reference", path: "edge_repos/reference", remoteUrl: "git@example.invalid:owner/reference.git",
    branch: "main", managementState: "active", adoptionState: "ready", pullAllowed: true, writeAllowed: true,
    role: "private source resolver",
    execution: {
      kind: "tool", adapter: "reference-lab-read-v1", entrypoint: "tools/private-source-slice.mjs",
      receiptContract: "source-access-receipt/v1", readScopes: ["private_sources/", "exports/source-registry/"],
      capabilities: [{ name: "private-source-slice", mode: "read-only", approval: "human" }],
    },
  });
  assert.deepEqual(validateManifest(manifest), []);
  manifest.repos[1].execution.readScopes = ["../outside"];
  manifest.repos[1].execution.capabilities[0].mode = "mutating";
  const errors = validateManifest(manifest);
  assert.ok(errors.some((error) => error.includes("readScopes[0] must stay inside")));
  assert.ok(errors.some((error) => error.includes("tool capabilities must be read-only")));
});

test("rejects unsafe worker entrypoints and duplicate capabilities", () => {
  const manifest = validManifest();
  manifest.repos[0].execution.entrypoint = "../outside.js";
  manifest.repos[0].execution.capabilities.push({
    name: "status",
    mode: "read-only",
    approval: "none",
  });
  const errors = validateManifest(manifest);
  assert.ok(errors.some((error) => error.includes("entrypoint must stay inside")));
  assert.ok(errors.some((error) => error.includes("duplicate capability")));
});

test("requires human approval and bounded write scopes for mutating capabilities", () => {
  const manifest = validManifest();
  manifest.repos[0].execution.capabilities[1].approval = "none";
  manifest.repos[0].execution.writeScopes = ["../outside"];
  const errors = validateManifest(manifest);
  assert.ok(errors.some((error) => error.includes("mutating capabilities require human approval")));
  assert.ok(errors.some((error) => error.includes("writeScopes[0] must stay inside")));
});
