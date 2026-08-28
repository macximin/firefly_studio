import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  validateGenreSoulAdoptionRegistry,
  validateGenreSoulPromotionDecision,
  verifyGenreSoulAdoptions,
} from "../scripts/genre-soul-adoption-lib.mjs";

const digest = (seed) => createHash("sha256").update(seed).digest("hex");

function profile(overrides = {}) {
  return {
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
    configSha256: digest("config"),
    soulSha256: digest("soul"),
    ...overrides,
  };
}

function profiles(value = profile()) {
  return { schemaVersion: "hermes-production-profile-registry/v1", profiles: [value] };
}

function decision(overrides = {}) {
  return {
    schemaVersion: "genre_soul_promotion/v1",
    soulId: "male-fantasy-ko",
    soulVersion: "v1",
    candidateSoulSha256: digest("soul"),
    promptPackSha256: digest("prompt-pack"),
    referenceLabEligibility: {
      repo: "firefly_reference_lab",
      commit: "a".repeat(40),
      path: "analyses/genre_souls/male-fantasy-ko/v1/promotion-eligibility.json",
      sha256: digest("eligibility"),
    },
    inputReceiptSha256s: {
      sourceManifest: digest("source-manifest"),
      coverage: [digest("coverage")],
      managerQa: [digest("manager-qa")],
      pathCanary: digest("path-canary"),
      promotionCanary: digest("promotion-canary"),
      pairedGeneration: [digest("pair-1"), digest("pair-2"), digest("pair-3")],
      blindReviews: [digest("blind-1"), digest("blind-2"), digest("blind-3")],
      genreIdentity: [digest("identity-1"), digest("identity-2"), digest("identity-3")],
      reviewPacket: digest("review-packet"),
    },
    decisionId: "decision-fantasy-v1",
    decision: "promote",
    decidedByActorId: "owner-local",
    decidedByRole: "owner",
    approvalReceiptSha256: digest("approval"),
    decidedAt: "2026-08-28T00:00:00.000Z",
    ...overrides,
  };
}

test("accepts the current empty active registry while all Hermes Souls remain candidates", async () => {
  const registry = { schemaVersion: "genre-soul-adoption-registry/v1", active: [] };
  assert.deepEqual(validateGenreSoulAdoptionRegistry(registry, profiles()), []);
  const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-empty-"));
  try {
    assert.deepEqual(await verifyGenreSoulAdoptions({ root, registry, profileRegistry: profiles() }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects incomplete promotion evidence and unknown decision fields", () => {
  const value = decision({ unexpected: true });
  value.inputReceiptSha256s.pairedGeneration = [digest("pair-1")];
  const errors = validateGenreSoulPromotionDecision(value);
  assert.ok(errors.some((error) => error.includes("unknown field")));
  assert.ok(errors.some((error) => error.includes("at least 3")));
});

test("requires every promoted Hermes profile to have one hash-bound active adoption", () => {
  const promoted = profile({
    lifecycle: "promoted",
    productionEnabled: true,
    promotionDecisionSha256: digest("decision"),
  });
  const errors = validateGenreSoulAdoptionRegistry(
    { schemaVersion: "genre-soul-adoption-registry/v1", active: [] },
    profiles(promoted),
  );
  assert.ok(errors.some((error) => error.includes("absent from the active adoption registry")));
});

test("readbacks an exact promote decision and rejects byte drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-"));
  const decisionPath = "adoptions/genre-souls/male-fantasy-ko/v1/decision.json";
  try {
    await mkdir(join(root, "adoptions/genre-souls/male-fantasy-ko/v1"), { recursive: true });
    const decisionBytes = Buffer.from(`${JSON.stringify(decision(), null, 2)}\n`);
    await writeFile(join(root, decisionPath), decisionBytes);
    const decisionSha256 = createHash("sha256").update(decisionBytes).digest("hex");
    const promoted = profile({ lifecycle: "promoted", productionEnabled: true, promotionDecisionSha256: decisionSha256 });
    const registry = {
      schemaVersion: "genre-soul-adoption-registry/v1",
      active: [{
        soulId: promoted.soulId,
        soulVersion: promoted.soulVersion,
        soulSha256: promoted.soulSha256,
        profileId: promoted.profileId,
        profileConfigSha256: promoted.configSha256,
        decisionPath,
        decisionSha256,
      }],
    };
    const receipts = await verifyGenreSoulAdoptions({ root, registry, profileRegistry: profiles(promoted) });
    assert.equal(receipts[0].decision, "promote");
    await writeFile(join(root, decisionPath), `${decisionBytes.toString("utf8")} `);
    await assert.rejects(
      verifyGenreSoulAdoptions({ root, registry, profileRegistry: profiles(promoted) }),
      /hash mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an active hold decision even when all hashes are current", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-hold-"));
  const decisionPath = "adoptions/genre-souls/male-fantasy-ko/v1/decision.json";
  try {
    await mkdir(join(root, "adoptions/genre-souls/male-fantasy-ko/v1"), { recursive: true });
    const decisionBytes = Buffer.from(`${JSON.stringify(decision({ decision: "hold" }), null, 2)}\n`);
    await writeFile(join(root, decisionPath), decisionBytes);
    const decisionSha256 = createHash("sha256").update(decisionBytes).digest("hex");
    const promoted = profile({ lifecycle: "promoted", productionEnabled: true, promotionDecisionSha256: decisionSha256 });
    const registry = {
      schemaVersion: "genre-soul-adoption-registry/v1",
      active: [{
        soulId: promoted.soulId,
        soulVersion: promoted.soulVersion,
        soulSha256: promoted.soulSha256,
        profileId: promoted.profileId,
        profileConfigSha256: promoted.configSha256,
        decisionPath,
        decisionSha256,
      }],
    };
    await assert.rejects(
      verifyGenreSoulAdoptions({ root, registry, profileRegistry: profiles(promoted) }),
      /must be promote/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
