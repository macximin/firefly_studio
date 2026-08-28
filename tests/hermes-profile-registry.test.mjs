import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  validateHermesProfileRegistry,
  verifyHermesProfileRegistry,
} from "../scripts/hermes-profile-lib.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function registry(configBytes, soulBytes) {
  return {
    schemaVersion: "hermes-production-profile-registry/v1",
    profiles: [{
      profileId: "inkos_male_fantasy",
      soulId: "male-fantasy-ko",
      soulVersion: "v1",
      lifecycle: "candidate",
      productionEnabled: false,
      promotionDecisionSha256: null,
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      reasoning: "high",
      skillsPolicy: "none",
      configSha256: sha256(configBytes),
      soulSha256: sha256(soulBytes),
    }],
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "firefly-hermes-registry-"));
  const profileRoot = join(root, "profiles", "inkos_male_fantasy");
  await mkdir(join(profileRoot, "skills"), { recursive: true });
  const configBytes = Buffer.from("model:\n  provider: openai-codex\n  default: gpt-5.6-sol\nagent:\n  reasoning_effort: high\n");
  const soulBytes = Buffer.from([
    "# fantasy candidate",
    "",
    "- Profile ID: `inkos_male_fantasy`",
    "- Soul ID: `male-fantasy-ko`",
    "- Soul version: `v1`",
    "- Lifecycle: `candidate-only`",
    "",
  ].join("\n"));
  await writeFile(join(profileRoot, "config.yaml"), configBytes);
  await writeFile(join(profileRoot, "SOUL.md"), soulBytes);
  await writeFile(join(profileRoot, ".no-bundled-skills"), "no skills\n");
  return { root, profileRoot, configBytes, soulBytes };
}

test("accepts a disabled candidate registry and rejects a fake promoted state", () => {
  const value = registry(Buffer.from("config"), Buffer.from("soul"));
  assert.deepEqual(validateHermesProfileRegistry(value), []);
  value.profiles[0].productionEnabled = true;
  assert.ok(validateHermesProfileRegistry(value).some((error) => error.includes("candidate profiles must remain disabled")));
});

test("readbacks exact local Soul/config bytes and effective sol/high settings", async () => {
  const f = await fixture();
  try {
    const receipts = await verifyHermesProfileRegistry(registry(f.configBytes, f.soulBytes), {
      hermesRoot: f.root,
      getConfigValue: async (_profileId, key) => ({
        "model.provider": "openai-codex",
        "model.default": "gpt-5.6-sol",
        "agent.reasoning_effort": "high",
      })[key],
    });
    assert.equal(receipts[0].productionEnabled, false);
    assert.equal(receipts[0].configSha256, sha256(f.configBytes));
    assert.equal(receipts[0].soulSha256, sha256(f.soulBytes));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("fails closed on byte drift, installed skills, and symlinked Soul files", async () => {
  const f = await fixture();
  const value = registry(f.configBytes, f.soulBytes);
  const options = {
    hermesRoot: f.root,
    getConfigValue: async (_profileId, key) => ({
      "model.provider": "openai-codex",
      "model.default": "gpt-5.6-sol",
      "agent.reasoning_effort": "high",
    })[key],
  };
  try {
    await writeFile(join(f.profileRoot, "SOUL.md"), "drift\n");
    await assert.rejects(verifyHermesProfileRegistry(value, options), /soulSha256/);
    await writeFile(join(f.profileRoot, "SOUL.md"), f.soulBytes);
    await writeFile(join(f.profileRoot, "skills", "unexpected"), "x");
    await assert.rejects(verifyHermesProfileRegistry(value, options), /installed skills/);
    await rm(join(f.profileRoot, "skills", "unexpected"));
    const target = join(f.root, "external-soul.md");
    await writeFile(target, f.soulBytes);
    await rm(join(f.profileRoot, "SOUL.md"));
    await symlink(target, join(f.profileRoot, "SOUL.md"));
    await assert.rejects(verifyHermesProfileRegistry(value, options), /real regular file/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
