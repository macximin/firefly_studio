import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
const digestBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const referenceLabRemote = "git@github.com:fixture/firefly_reference_lab.git";
const managerQaMechanismFields = [
  "activeChoice", "payoff", "pressure", "protagonistRepeatedVerb", "recognition", "resistance",
];
const phaseFields = {
  early: ["pressure", "protagonistRepeatedVerb"],
  middle: ["activeChoice", "protagonistRepeatedVerb", "resistance"],
  late: ["payoff", "recognition"],
};

function git(repoPath, ...args) {
  return execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" }).trim();
}

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

async function referenceLabFixture(root, overrides = {}) {
  const repoPath = join(root, "edge_repos/firefly_reference_lab");
  const basePath = "analyses/genre_souls/male-fantasy-ko/v1";
  const profilePath = `${basePath}/genre-profile.json`;
  const managerQaPath = `${basePath}/manager-qa.json`;
  const eligibilityPath = `${basePath}/promotion-eligibility.json`;
  await mkdir(join(repoPath, basePath), { recursive: true });

  const profileBytes = jsonBytes({
    schemaVersion: "genre-soul-analysis-profile/v1",
    state: "candidate",
    genre: "fantasy-ko",
    soulId: "male-fantasy-ko",
    version: "v1",
    generatedAt: "2026-08-31T00:00:00.000Z",
    evidenceSet: {},
    primaryCommercialEngines: [],
    patterns: [],
    dimensions: {},
    contentNeutrality: {},
    synthesis: {
      contentContract: {},
      privateInput: {},
      run: {
        runId: "synthesis-run",
        model: "gpt-5.6-sol",
        provider: "openai-codex",
        reasoningEffort: "high",
        configSha256: overrides.synthesisConfigSha256 ?? digest("config"),
        traceReceiptSha256: digest("synthesis-trace"),
      },
      truncation: {},
    },
    authority: {
      scope: "analysis-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
      ownerDecisionRequired: true,
    },
  });
  const profileSha256 = digestBytes(profileBytes);
  const managerQaSchemaVersion = overrides.managerQaSchemaVersion ?? "genre-soul-manager-qa/v3";
  const phaseAware = managerQaSchemaVersion === "genre-soul-manager-qa/v3";
  const sourceIds = ["gdrive-a", "gdrive-b", "gdrive-c"];
  const sources = sourceIds.map((sourceId, sourceIndex) => {
    const samples = ["early", "middle", "late"].map((span, spanIndex) => ({
      span,
      observationId: `observation-${sourceIndex}-${span}`,
      kind: "commercial-engine",
      selector: {
        type: "utf8-byte",
        startByte: spanIndex * 100,
        endByte: (spanIndex + 1) * 100,
      },
      sliceSha256: digest(`slice-${sourceIndex}-${span}`),
      ...(phaseAware ? {
        sampleId: `sample-${sourceIndex}-${span}`,
        phaseContribution: "supports-phase",
        supportedMechanismFields: phaseFields[span],
      } : {}),
    }));
    return {
      sourceId,
      sourceSizeBytes: 1_000,
      engineId: `engine-${sourceIndex}`,
      engineSignatureSha256: digest(`engine-${sourceIndex}`),
      mechanismSignatureSha256: digest(`mechanism-${sourceIndex}`),
      samples,
      ...(phaseAware ? {
        collectiveAssessment: {
          phaseSampleIds: Object.fromEntries(samples.map((sample) => [sample.span, sample.sampleId])),
          supportedMechanismFields: managerQaMechanismFields,
          collectiveVerdict: "supported",
          rationale: `collective rationale ${sourceIndex}`,
          commercialConsequence: `commercial consequence ${sourceIndex}`,
        },
      } : {}),
    };
  });
  const engineComparisons = [];
  for (let leftIndex = 0; leftIndex < sourceIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sourceIds.length; rightIndex += 1) {
      const pair = `${sourceIds[leftIndex]}::${sourceIds[rightIndex]}`;
      engineComparisons.push({
        comparisonId: `comparison-${digest(pair).slice(0, 24)}`,
        leftSourceId: sourceIds[leftIndex],
        rightSourceId: sourceIds[rightIndex],
        leftEngineId: `engine-${leftIndex}`,
        rightEngineId: `engine-${rightIndex}`,
        verdict: phaseAware ? "distinct-variant" : "different",
        semanticDifference: `semantic difference ${leftIndex}-${rightIndex}`,
        commercialConsequence: `commercial consequence ${leftIndex}-${rightIndex}`,
      });
    }
  }
  const privateRunKey = digest("manager-private-input");
  const managerInputDigest = digest("manager-input-digest");
  const managerRunRoot = `exports/genre-souls/male-fantasy-ko/v1/manager-qa-runs/${privateRunKey}`;
  const structuredRunRoot = `${managerRunRoot}/structured-runs/${managerInputDigest}`;
  const managerQa = {
    schemaVersion: managerQaSchemaVersion,
    state: "candidate-qa-passed",
    genre: "fantasy-ko",
    soulId: "male-fantasy-ko",
    version: "v1",
    result: overrides.managerQaResult ?? "pass",
    profile: {
      path: profilePath,
      sha256: overrides.managerProfileSha256 ?? profileSha256,
      sizeBytes: profileBytes.byteLength,
      synthesisRunId: "synthesis-run",
      leakScanReceipt: {
        path: `${basePath}/leak-scan-receipts/genre-profile.json`,
        sha256: digest("profile-leak-receipt"),
        sizeBytes: 100,
      },
    },
    privateInput: {
      schemaVersion: phaseAware
        ? "private-genre-soul-manager-qa-input/v3"
        : "private-genre-soul-manager-qa-input/v2",
      path: `${managerRunRoot}/input.json`,
      sha256: digest("private-manager-input"),
      sizeBytes: 1_000,
      sourceIds,
      rawSampleCount: 9,
    },
    manager: {
      actorId: overrides.managerActorId ?? "hermes:inkos_male_fantasy:manager-run",
      role: "manager",
      runId: "manager-run",
      inputDigest: managerInputDigest,
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      reasoningEffort: "high",
      configSha256: overrides.managerConfigSha256 ?? digest("config"),
      traceReceiptSha256: digest("manager-trace"),
      outputSha256: digest("manager-output"),
    },
    decidedAt: "2026-08-31T01:00:00.000Z",
    sources,
    engineComparisons,
    checks: Object.fromEntries((phaseAware ? [
      "profileEvidenceBinding", "exactSourceCoverage", "rawSampleReadback",
      "phaseAwareCollectiveEvidenceComplete", "engineRelationsEvidenceComplete",
      "profileSurfaceLeakScanPassed", "contentNeutrality",
    ] : [
      "profileEvidenceBinding", "exactSourceCoverage", "rawSampleReadback",
      "primaryEnginesPairwiseDifferent", "profileSurfaceLeakScanPassed", "contentNeutrality",
    ]).map((key) => [key, key === overrides.managerCheckFalse ? false : true])),
    contentNeutrality: {
      moralFitnessGate: false,
      automaticRewrite: false,
      userIntensityPreserved: true,
    },
    authority: {
      scope: "reference-lab-qa-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
      ownerDecisionRequired: true,
    },
  };
  const candidateBytes = jsonBytes({
    schemaVersion: phaseAware
      ? "genre-soul-manager-surface-candidate/v2"
      : "genre-soul-manager-surface-candidate/v1",
    genre: managerQa.genre,
    soulId: managerQa.soulId,
    profile: {
      sha256: managerQa.profile.sha256,
      synthesisRunId: managerQa.profile.synthesisRunId,
    },
    manager: {
      runId: managerQa.manager.runId,
      outputSha256: managerQa.manager.outputSha256,
    },
    ...(phaseAware ? {
      sourceEngineAssessments: sources.map((source) => ({
        sourceId: source.sourceId,
        collectiveAssessment: source.collectiveAssessment,
      })),
    } : {}),
    engineComparisons,
  });
  managerQa.surfaceReview = {
    schemaVersion: "genre-soul-manager-surface-review-proof/v3",
    gateVersion: "genre-soul-protected-surface-hil/v3",
    extractorVersion: "genre-soul-surface-candidate-extractor/v3",
    mode: "deterministic-clean",
    candidate: {
      path: `${structuredRunRoot}/surface-review/candidate.json`,
      sha256: digestBytes(candidateBytes),
      sizeBytes: candidateBytes.byteLength,
    },
    deterministic: {
      status: "pass",
      privateEvidence: {
        sourceSetSha256: digest("source-set"),
        sampleSetSha256: digest("sample-set"),
      },
      findingSetSha256: null,
      findingIds: [],
    },
    semantic: null,
    ownerDecision: null,
    authority: {
      scope: "reference-lab-analysis-surface-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
    },
  };
  overrides.mutateManagerQa?.(managerQa);
  const managerQaBytes = jsonBytes(overrides.incompleteManagerQa ? {
    schemaVersion: managerQa.schemaVersion,
    state: managerQa.state,
    genre: managerQa.genre,
    soulId: managerQa.soulId,
    version: managerQa.version,
    result: managerQa.result,
    checks: { profileEvidenceBinding: true },
    profile: { path: profilePath, sha256: profileSha256 },
    authority: managerQa.authority,
  } : managerQa);
  const managerQaSha256 = digestBytes(managerQaBytes);
  const eligibilityBytes = jsonBytes({
    schemaVersion: "genre-soul-promotion-eligibility/v1",
    genre: "fantasy-ko",
    status: "pass",
    deepReadSourceCount: 3,
    reviewPacketSchema: "firefly_review_packet/v2",
    blindPairCount: 3,
    independentBlindRunCount: 3,
    soulWins: 2,
    averageCommercialScore: 88,
    winningPairMinimumGain: 3,
    genreIdentityPassed: 3,
    contentNeutralViolationCount: 0,
    unauthorizedCanonWriteCount: 0,
    allSurfaceMatchesHumanClassified: true,
    canonLeakCount: 0,
    managerQaPassed: true,
    leakScanMatchCount: 0,
    ownerDecisionRequired: true,
    ownerDecisionId: null,
    deepReadReceiptSha256s: [digest("deep-1"), digest("deep-2"), digest("deep-3")].sort(),
    reviewPacketSha256s: [digest("review-1"), digest("review-2"), digest("review-3")].sort(),
    blindReviewReceiptSha256s: [digest("blind-1"), digest("blind-2"), digest("blind-3")].sort(),
    contentNeutralReceiptSha256s: [digest("neutral-1"), digest("neutral-2"), digest("neutral-3")].sort(),
    surfaceComparisonReceiptSha256s: [digest("surface-1"), digest("surface-2"), digest("surface-3")].sort(),
    managerQaReceiptSha256: overrides.eligibilityManagerQaSha256 ?? managerQaSha256,
    leakScanReceiptSha256: digest("leak-scan"),
    generationRunIds: ["generation-1", "generation-2", "generation-3", "generation-4", "generation-5", "generation-6"],
    blindRunIds: ["blind-1", "blind-2", "blind-3"],
    inputSha256s: [digest("input-1"), digest("input-2")].sort(),
    authority: {
      scope: "analysis-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
      ownerDecisionRequired: true,
    },
    ...(overrides.eligibilityOverrides ?? {}),
  });
  const eligibilitySha256 = digestBytes(eligibilityBytes);
  await writeFile(join(repoPath, profilePath), profileBytes);
  await writeFile(join(repoPath, managerQaPath), managerQaBytes);
  await writeFile(join(repoPath, eligibilityPath), eligibilityBytes);

  execFileSync("git", ["init", repoPath], { stdio: "ignore" });
  git(repoPath, "config", "user.name", "Fixture");
  git(repoPath, "config", "user.email", "fixture@example.invalid");
  git(repoPath, "remote", "add", "origin", referenceLabRemote);
  git(repoPath, "add", profilePath, managerQaPath, eligibilityPath);
  git(repoPath, "commit", "-m", "fixture: reference lab evidence");
  const commit = git(repoPath, "rev-parse", "HEAD");
  if (overrides.originState === "unrelated") {
    const tree = git(repoPath, "write-tree");
    const unrelatedCommit = git(repoPath, "commit-tree", tree, "-m", "fixture: unrelated origin");
    git(repoPath, "update-ref", "refs/remotes/origin/main", unrelatedCommit);
  } else if (overrides.originState !== "absent") {
    git(repoPath, "update-ref", "refs/remotes/origin/main", commit);
  }
  return {
    repoPath,
    manifest: {
      repos: [{
        name: "firefly_reference_lab",
        path: "edge_repos/firefly_reference_lab",
        remoteUrl: referenceLabRemote,
        branch: "main",
      }],
    },
    commit,
    profilePath,
    profileSha256,
    managerQaPath,
    managerQaSha256,
    eligibilityPath,
    eligibilitySha256,
  };
}

function decisionForReference(reference) {
  const value = decision();
  value.referenceLabEligibility = {
    repo: "firefly_reference_lab",
    commit: reference.commit,
    path: reference.eligibilityPath,
    sha256: reference.eligibilitySha256,
  };
  value.inputReceiptSha256s.managerQa = [reference.managerQaSha256];
  return value;
}

async function writeActiveAdoption(root, decisionValue) {
  const decisionPath = "adoptions/genre-souls/male-fantasy-ko/v1/decision.json";
  await mkdir(join(root, "adoptions/genre-souls/male-fantasy-ko/v1"), { recursive: true });
  const decisionBytes = jsonBytes(decisionValue);
  await writeFile(join(root, decisionPath), decisionBytes);
  const decisionSha256 = digestBytes(decisionBytes);
  const promoted = profile({
    lifecycle: "promoted",
    productionEnabled: true,
    promotionDecisionSha256: decisionSha256,
  });
  return {
    decisionPath,
    decisionBytes,
    decisionSha256,
    promoted,
    registry: {
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
    },
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

test("readbacks exact committed Reference Lab evidence and distrusts its working tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-"));
  try {
    const reference = await referenceLabFixture(root);
    const active = await writeActiveAdoption(root, decisionForReference(reference));
    const args = {
      root,
      registry: active.registry,
      profileRegistry: profiles(active.promoted),
      manifest: reference.manifest,
    };
    const receipts = await verifyGenreSoulAdoptions(args);
    assert.equal(receipts[0].decision, "promote");
    assert.equal(receipts[0].referenceLab.managerQaSchemaVersion, "genre-soul-manager-qa/v3");
    assert.equal(receipts[0].referenceLab.profileSha256, reference.profileSha256);

    await writeFile(join(reference.repoPath, reference.profilePath), "untrusted profile working tree\n");
    await writeFile(join(reference.repoPath, reference.managerQaPath), "untrusted QA working tree\n");
    await writeFile(join(reference.repoPath, reference.eligibilityPath), "untrusted eligibility working tree\n");
    assert.equal((await verifyGenreSoulAdoptions(args))[0].referenceLab.profileSha256, reference.profileSha256);

    await writeFile(join(root, active.decisionPath), `${active.decisionBytes.toString("utf8")} `);
    await assert.rejects(
      verifyGenreSoulAdoptions(args),
      /hash mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires the exact Reference Lab commit to be reachable from the manifest origin branch", async (t) => {
  for (const originState of ["absent", "unrelated"]) {
    await t.test(originState, async () => {
      const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-origin-"));
      try {
        const reference = await referenceLabFixture(root, { originState });
        const active = await writeActiveAdoption(root, decisionForReference(reference));
        await assert.rejects(verifyGenreSoulAdoptions({
          root,
          registry: active.registry,
          profileRegistry: profiles(active.promoted),
          manifest: reference.manifest,
        }), originState === "absent" ? /origin branch/ : /origin ancestry/);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("reads exact commit objects without honoring local Git replace refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-replace-ref-"));
  try {
    const reference = await referenceLabFixture(root);
    const active = await writeActiveAdoption(root, decisionForReference(reference));
    await writeFile(join(reference.repoPath, reference.eligibilityPath), "replacement eligibility bytes\n");
    git(reference.repoPath, "add", reference.eligibilityPath);
    git(reference.repoPath, "commit", "-m", "fixture: replacement commit");
    const replacementCommit = git(reference.repoPath, "rev-parse", "HEAD");
    git(reference.repoPath, "replace", reference.commit, replacementCommit);
    const receipts = await verifyGenreSoulAdoptions({
      root,
      registry: active.registry,
      profileRegistry: profiles(active.promoted),
      manifest: reference.manifest,
    });
    assert.equal(receipts[0].referenceLab.commit, reference.commit);
    assert.equal(receipts[0].referenceLab.eligibilitySha256, reference.eligibilitySha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts both sealed Reference Lab Manager QA v2 and v3", async (t) => {
  for (const managerQaSchemaVersion of ["genre-soul-manager-qa/v2", "genre-soul-manager-qa/v3"]) {
    await t.test(managerQaSchemaVersion, async () => {
      const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-qa-schema-"));
      try {
        const reference = await referenceLabFixture(root, { managerQaSchemaVersion });
        const active = await writeActiveAdoption(root, decisionForReference(reference));
        const receipts = await verifyGenreSoulAdoptions({
          root,
          registry: active.registry,
          profileRegistry: profiles(active.promoted),
          manifest: reference.manifest,
        });
        assert.equal(receipts[0].referenceLab.managerQaSchemaVersion, managerQaSchemaVersion);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("accepts sealed semantic auto-pass and owner-approved surface terminals", async (t) => {
  const cases = [
    {
      name: "v2 semantic auto-pass",
      managerQaSchemaVersion: "genre-soul-manager-qa/v2",
      mutateManagerQa: (value) => {
        value.surfaceReview.mode = "semantic-auto-passed";
        value.surfaceReview.deterministic.status = "pending_semantic_review";
        value.surfaceReview.deterministic.findingSetSha256 = digest("v2-surface-findings");
        value.surfaceReview.deterministic.findingIds = [`surface-finding-${digest("v2-finding").slice(0, 24)}`];
        value.surfaceReview.semantic = { outcome: "auto-passed" };
        value.surfaceReview.ownerDecision = null;
      },
    },
    {
      name: "v3 semantic owner-approved",
      managerQaSchemaVersion: "genre-soul-manager-qa/v3",
      mutateManagerQa: (value) => {
        const surfaceRoot = value.surfaceReview.candidate.path.slice(0, -"/candidate.json".length);
        const requestSha256 = digest("v3-owner-request");
        value.surfaceReview.mode = "semantic-owner-approved";
        value.surfaceReview.deterministic.status = "pending_semantic_review";
        value.surfaceReview.deterministic.findingSetSha256 = digest("v3-surface-findings");
        value.surfaceReview.deterministic.findingIds = [`surface-finding-${digest("v3-finding").slice(0, 24)}`];
        value.surfaceReview.semantic = { outcome: "owner-approved" };
        value.surfaceReview.ownerDecision = {
          request: {
            path: `${surfaceRoot}/owner-hil/requests/${requestSha256}.json`,
            sha256: requestSha256,
            sizeBytes: 100,
          },
          decision: {
            path: `${surfaceRoot}/owner-hil/decisions/${requestSha256}.json`,
            sha256: digest("v3-owner-decision"),
            sizeBytes: 100,
            decisionId: `surface-decision-${digest("v3-decision-id").slice(0, 24)}`,
            outcome: "approved",
            decidedByRole: "owner",
          },
        };
      },
    },
  ];
  for (const surfaceCase of cases) {
    await t.test(surfaceCase.name, async () => {
      const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-surface-terminal-"));
      try {
        const reference = await referenceLabFixture(root, {
          managerQaSchemaVersion: surfaceCase.managerQaSchemaVersion,
          mutateManagerQa: surfaceCase.mutateManagerQa,
        });
        const active = await writeActiveAdoption(root, decisionForReference(reference));
        const receipts = await verifyGenreSoulAdoptions({
          root,
          registry: active.registry,
          profileRegistry: profiles(active.promoted),
          manifest: reference.manifest,
        });
        assert.equal(receipts[0].referenceLab.managerQaSchemaVersion, surfaceCase.managerQaSchemaVersion);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("fails closed on broken Reference Lab SHA, QA pass, and profile bindings", async (t) => {
  const cases = [
    {
      name: "eligibility bytes",
      fixture: {},
      mutateDecision: (value) => { value.referenceLabEligibility.sha256 = digest("wrong-eligibility"); },
      expected: /promotion eligibility hash mismatch/,
    },
    {
      name: "manager pass state",
      fixture: { managerQaResult: "fail" },
      mutateDecision: () => {},
      expected: /Manager QA.result/,
    },
    {
      name: "incomplete Manager QA envelope",
      fixture: { incompleteManagerQa: true },
      mutateDecision: () => {},
      expected: /Manager QA keys are invalid/,
    },
    {
      name: "Manager QA deterministic check matrix",
      fixture: { managerCheckFalse: "exactSourceCoverage" },
      mutateDecision: () => {},
      expected: /deterministic checks did not all pass/,
    },
    {
      name: "promotion eligibility thresholds",
      fixture: { eligibilityOverrides: { blindPairCount: 2 } },
      mutateDecision: () => {},
      expected: /promotion eligibility is not owner-ready/,
    },
    {
      name: "eligibility to manager bytes",
      fixture: { eligibilityManagerQaSha256: digest("wrong-manager") },
      mutateDecision: () => {},
      expected: /does not bind the Manager QA bytes/,
    },
    {
      name: "owner decision to manager bytes",
      fixture: {},
      mutateDecision: (value) => { value.inputReceiptSha256s.managerQa = [digest("wrong-manager")]; },
      expected: /HQ promotion decision does not bind/,
    },
    {
      name: "manager to profile bytes",
      fixture: { managerProfileSha256: digest("wrong-profile") },
      mutateDecision: () => {},
      expected: /analysis profile hash mismatch/,
    },
    {
      name: "active profile to manager actor",
      fixture: { managerActorId: "hermes:wrong-profile:manager-run" },
      mutateDecision: () => {},
      expected: /manager identity is invalid/,
    },
    {
      name: "active profile to manager config",
      fixture: { managerConfigSha256: digest("wrong-manager-config") },
      mutateDecision: () => {},
      expected: /manager identity is invalid/,
    },
    {
      name: "active profile to synthesis config",
      fixture: { synthesisConfigSha256: digest("wrong-synthesis-config") },
      mutateDecision: () => {},
      expected: /synthesis identity is invalid/,
    },
    {
      name: "source sample cardinality",
      fixture: {
        mutateManagerQa: (value) => { delete value.sources[0].samples; },
      },
      mutateDecision: () => {},
      expected: /source samples must bind exactly/,
    },
    {
      name: "distinct comparison pair set",
      fixture: {
        mutateManagerQa: (value) => { value.engineComparisons = Array(3).fill(value.engineComparisons[0]); },
      },
      mutateDecision: () => {},
      expected: /comparison pair set is incomplete or duplicated/,
    },
    {
      name: "surface terminal envelope",
      fixture: {
        mutateManagerQa: (value) => {
          value.surfaceReview.mode = "rejected";
          value.surfaceReview.deterministic = {};
          value.surfaceReview.semantic = "invalid";
          value.surfaceReview.ownerDecision = { outcome: "rejected" };
        },
      },
      mutateDecision: () => {},
      expected: /deterministic surface proof keys are invalid/,
    },
    {
      name: "semantic auto-pass outcome",
      fixture: {
        mutateManagerQa: (value) => {
          value.surfaceReview.mode = "semantic-auto-passed";
          value.surfaceReview.deterministic.status = "pending_semantic_review";
          value.surfaceReview.deterministic.findingSetSha256 = digest("surface-findings");
          value.surfaceReview.deterministic.findingIds = [`surface-finding-${digest("finding").slice(0, 24)}`];
          value.surfaceReview.semantic = { outcome: "owner-approved" };
          value.surfaceReview.ownerDecision = null;
        },
      },
      mutateDecision: () => {},
      expected: /semantic auto-pass envelope is invalid/,
    },
    {
      name: "semantic owner approval receipt",
      fixture: {
        mutateManagerQa: (value) => {
          const surfaceRoot = value.surfaceReview.candidate.path.slice(0, -"/candidate.json".length);
          const requestSha256 = digest("owner-request");
          value.surfaceReview.mode = "semantic-owner-approved";
          value.surfaceReview.deterministic.status = "pending_semantic_review";
          value.surfaceReview.deterministic.findingSetSha256 = digest("surface-findings");
          value.surfaceReview.deterministic.findingIds = [`surface-finding-${digest("finding").slice(0, 24)}`];
          value.surfaceReview.semantic = { outcome: "owner-approved" };
          value.surfaceReview.ownerDecision = {
            request: {
              path: `${surfaceRoot}/owner-hil/requests/${requestSha256}.json`,
              sha256: requestSha256,
              sizeBytes: 100,
            },
            decision: {
              path: `${surfaceRoot}/owner-hil/decisions/${requestSha256}.json`,
              sha256: digest("owner-decision"),
              sizeBytes: 100,
              decisionId: `surface-decision-${digest("decision-id").slice(0, 24)}`,
              outcome: "rejected",
              decidedByRole: "owner",
            },
          };
        },
      },
      mutateDecision: () => {},
      expected: /surface owner approval is invalid/,
    },
    {
      name: "Soul wins cannot exceed blind pairs",
      fixture: { eligibilityOverrides: { soulWins: 4 } },
      mutateDecision: () => {},
      expected: /promotion eligibility is not owner-ready/,
    },
    {
      name: "commercial score cannot exceed its scale",
      fixture: { eligibilityOverrides: { averageCommercialScore: 101 } },
      mutateDecision: () => {},
      expected: /promotion eligibility is not owner-ready/,
    },
    {
      name: "winning gain cannot exceed its scale",
      fixture: { eligibilityOverrides: { winningPairMinimumGain: 101 } },
      mutateDecision: () => {},
      expected: /promotion eligibility is not owner-ready/,
    },
  ];
  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      const root = await mkdtemp(join(tmpdir(), "firefly-soul-adoption-fail-close-"));
      try {
        const reference = await referenceLabFixture(root, fixtureCase.fixture);
        const decisionValue = decisionForReference(reference);
        fixtureCase.mutateDecision(decisionValue);
        const active = await writeActiveAdoption(root, decisionValue);
        await assert.rejects(verifyGenreSoulAdoptions({
          root,
          registry: active.registry,
          profileRegistry: profiles(active.promoted),
          manifest: reference.manifest,
        }), fixtureCase.expected);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
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
