import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  validateHermesNeutralProfileRegistry,
  validateHermesProfileRegistry,
  verifyHermesNeutralProfileRegistry,
  verifyHermesProfileRegistry,
} from "../scripts/hermes-profile-lib.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
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
      ...overrides,
    }],
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "firefly-hermes-registry-"));
  const profileRoot = join(root, "profiles", "inkos_male_fantasy");
  await mkdir(join(profileRoot, "skills"), { recursive: true });
  const configBytes = Buffer.from("model:\n  provider: openai-codex\n  default: gpt-5.6-sol\n  openai_runtime: auto\nagent:\n  reasoning_effort: high\n  coding_context: off\nplatform_toolsets:\n  cli: []\n");
  const soulBytes = Buffer.from([
    "# fantasy candidate",
    "",
    "- Profile ID: `inkos_male_fantasy`",
    "- Soul ID: `male-fantasy-ko`",
    "- Soul version: `v1`",
    "- Lifecycle: `candidate-only`",
    "",
    "이 프로필은 InkOS 캐논을 직접 쓰지 않는다. 장르 분석과 실행 의도만 구성한다.",
    "Book, Arc, Rail, Chapter, review와 revision의 실행 주체는 InkOS다.",
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
      getConfigValue: configReadback,
      getPromptSize: promptSizeReadback,
    });
    assert.equal(receipts[0].productionEnabled, false);
    assert.equal(receipts[0].configSha256, sha256(f.configBytes));
    assert.equal(receipts[0].soulSha256, sha256(f.soulBytes));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("takes lifecycle authority from the registry instead of mutable Soul prose", async () => {
  const f = await fixture();
  const promotedSoulBytes = Buffer.from(f.soulBytes.toString("utf8").replace(
    "Lifecycle: `candidate-only`",
    "Lifecycle: `registry-owned`",
  ));
  await writeFile(join(f.profileRoot, "SOUL.md"), promotedSoulBytes);
  try {
    const receipts = await verifyHermesProfileRegistry(registry(f.configBytes, promotedSoulBytes, {
      lifecycle: "promoted",
      productionEnabled: true,
      promotionDecisionSha256: sha256("owner-promotion-decision"),
    }), {
      hermesRoot: f.root,
      getConfigValue: configReadback,
      getPromptSize: promptSizeReadback,
    });
    assert.equal(receipts[0].lifecycle, "promoted");
    assert.equal(receipts[0].productionEnabled, true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("fails closed when immutable InkOS authority is absent from a hash-bound Soul", async () => {
  const f = await fixture();
  const unauthorizedSoulBytes = Buffer.from(f.soulBytes.toString("utf8").replace(
    "이 프로필은 InkOS 캐논을 직접 쓰지 않는다. 장르 분석과 실행 의도만 구성한다.\n",
    "",
  ));
  await writeFile(join(f.profileRoot, "SOUL.md"), unauthorizedSoulBytes);
  try {
    await assert.rejects(verifyHermesProfileRegistry(registry(f.configBytes, unauthorizedSoulBytes), {
      hermesRoot: f.root,
      getConfigValue: configReadback,
      getPromptSize: promptSizeReadback,
    }), /immutable identity\/authority mismatch/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("fails closed on byte drift, installed skills, and symlinked Soul files", async () => {
  const f = await fixture();
  const value = registry(f.configBytes, f.soulBytes);
  const options = {
    hermesRoot: f.root,
    getConfigValue: configReadback,
    getPromptSize: promptSizeReadback,
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

test("validates and readbacks the separate disabled neutral baseline profile", async () => {
  const f = await fixture();
  const neutralSoulBytes = Buffer.from(f.soulBytes.toString("utf8")
    .replaceAll("inkos_male_fantasy", "inkos_neutral_baseline")
    .replaceAll("male-fantasy-ko", "neutral-baseline-ko"));
  const neutralRoot = join(f.root, "profiles", "inkos_neutral_baseline");
  await mkdir(join(neutralRoot, "skills"), { recursive: true });
  await writeFile(join(neutralRoot, "config.yaml"), f.configBytes);
  await writeFile(join(neutralRoot, "SOUL.md"), neutralSoulBytes);
  await writeFile(join(neutralRoot, ".no-bundled-skills"), "no skills\n");
  const neutral = {
    schemaVersion: "hermes-neutral-production-profile/v1",
    profile: {
      ...registry(f.configBytes, neutralSoulBytes).profiles[0],
      profileId: "inkos_neutral_baseline",
      soulId: "neutral-baseline-ko",
      lifecycle: "baseline",
    },
  };
  try {
    assert.deepEqual(validateHermesNeutralProfileRegistry(neutral), []);
    const receipt = await verifyHermesNeutralProfileRegistry(neutral, {
      hermesRoot: f.root,
      getConfigValue: configReadback,
      getPromptSize: promptSizeReadback,
    });
    assert.equal(receipt.lifecycle, "baseline");
    assert.equal(receipt.toolsCount, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
