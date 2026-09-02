import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  validateHermesBlindEvaluatorRegistry,
  verifyHermesBlindEvaluatorRegistry,
} from "../scripts/hermes-blind-evaluator-lib.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const configReadback = (_profileId, key) => ({
  "model.provider": "openai-codex",
  "model.default": "gpt-5.6-sol",
  "agent.reasoning_effort": "high",
  "agent.coding_context": "false",
  "model.openai_runtime": "auto",
  "platform_toolsets.cli": "[]",
})[key];
const promptSizeReadback = () => ({ model: "gpt-5.6-sol", tools: { count: 0, json_bytes: 2 } });

function registry(configBytes, soulBytes, overrides = {}) {
  return {
    schemaVersion: "hermes-blind-evaluator-profile/v1",
    profile: {
      profileId: "inkos_blind_evaluator",
      role: "blind-commercial-evaluator",
      authority: "evaluation-only",
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      reasoning: "high",
      codingContext: false,
      openaiRuntime: "auto",
      cliToolsets: [],
      toolsCount: 0,
      skillsPolicy: "none",
      configSha256: sha256(configBytes),
      soulSha256: sha256(soulBytes),
      ...overrides,
    },
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "firefly-blind-evaluator-"));
  const profileRoot = join(root, "profiles", "inkos_blind_evaluator");
  await mkdir(join(profileRoot, "skills"), { recursive: true });
  const sourceRoot = "/Users/a2501/.hermes/profiles/inkos_blind_evaluator";
  const [configBytes, soulBytes] = await Promise.all([
    readFile(join(sourceRoot, "config.yaml")),
    readFile(join(sourceRoot, "SOUL.md")),
  ]);
  await writeFile(join(profileRoot, "config.yaml"), configBytes);
  await writeFile(join(profileRoot, "SOUL.md"), soulBytes);
  return { root, profileRoot, configBytes, soulBytes };
}

test("blind evaluator registry fixes the exact independent sol/high/tool-less authority", () => {
  const value = {
    schemaVersion: "hermes-blind-evaluator-profile/v1",
    profile: {
      profileId: "inkos_blind_evaluator",
      role: "blind-commercial-evaluator",
      authority: "evaluation-only",
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      reasoning: "high",
      codingContext: false,
      openaiRuntime: "auto",
      cliToolsets: [],
      toolsCount: 0,
      skillsPolicy: "none",
      configSha256: "4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46",
      soulSha256: "5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b",
    },
  };
  assert.deepEqual(validateHermesBlindEvaluatorRegistry(value), []);
  for (const overrides of [
    { profileId: "unknown_evaluator" },
    { model: "gpt-5.6-terra" },
    { reasoning: "medium" },
    { codingContext: true },
    { cliToolsets: ["developer"] },
    { toolsCount: 1 },
  ]) {
    const changed = structuredClone(value);
    Object.assign(changed.profile, overrides);
    assert.ok(validateHermesBlindEvaluatorRegistry(changed).length > 0);
  }
  const wrongDigest = structuredClone(value);
  wrongDigest.profile.soulSha256 = "0".repeat(64);
  assert.ok(validateHermesBlindEvaluatorRegistry(wrongDigest).some((error) => error.includes("fixed audited digest")));
});

test("blind evaluator readback binds exact local config/Soul hashes and zero tools", async () => {
  const f = await fixture();
  try {
    const receipt = await verifyHermesBlindEvaluatorRegistry(registry(f.configBytes, f.soulBytes), {
      hermesRoot: f.root,
      getConfigValue: configReadback,
      getPromptSize: promptSizeReadback,
    });
    assert.equal(receipt.profileId, "inkos_blind_evaluator");
    assert.equal(receipt.configSha256, sha256(f.configBytes));
    assert.equal(receipt.soulSha256, sha256(f.soulBytes));
    assert.equal(receipt.toolsCount, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("blind evaluator fails closed on digest drift, tool drift, installed skills, and symlinked Soul", async () => {
  const f = await fixture();
  const options = { hermesRoot: f.root, getConfigValue: configReadback, getPromptSize: promptSizeReadback };
  try {
    const value = registry(f.configBytes, f.soulBytes);
    await writeFile(join(f.profileRoot, "SOUL.md"), "tampered\n");
    await assert.rejects(verifyHermesBlindEvaluatorRegistry(value, options), /soulSha256/);
    await writeFile(join(f.profileRoot, "SOUL.md"), f.soulBytes);
    await assert.rejects(verifyHermesBlindEvaluatorRegistry(value, {
      ...options,
      getPromptSize: () => ({ model: "gpt-5.6-sol", tools: { count: 1 } }),
    }), /unauthorized model or tools/);
    await writeFile(join(f.profileRoot, "skills", "unexpected"), "x");
    await assert.rejects(verifyHermesBlindEvaluatorRegistry(value, options), /installed skills/);
    await rm(join(f.profileRoot, "skills", "unexpected"));
    const external = join(f.root, "external-soul.md");
    await writeFile(external, f.soulBytes);
    await rm(join(f.profileRoot, "SOUL.md"));
    await symlink(external, join(f.profileRoot, "SOUL.md"));
    await assert.rejects(verifyHermesBlindEvaluatorRegistry(value, options), /non-symlink regular file/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
