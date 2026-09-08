import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildBlindCanaryBatchBundle,
  canonicalStringify,
  readCommittedArtifact,
  sha256Bytes,
  validateBlindCanaryBatchConfig,
  validateBlindCanaryBatchPlan,
  verifyReachableRepository,
} from "../scripts/blind-canary-batch-plan-lib.mjs";
import { materializeBlindCanaryWorkOrders } from "../scripts/blind-canary-work-order-materializer-lib.mjs";

const SHA = "a".repeat(64);
const COMMIT = "1".repeat(40);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const artifact = (path) => ({ path, sha256: SHA, sizeBytes: 12 });
const rehashPlan = (plan) => {
  const { planSha256: _old, ...unsigned } = plan;
  plan.planSha256 = sha256Bytes(Buffer.from(canonicalStringify(unsigned), "utf8"));
  return plan;
};

function config() {
  return {
    schemaVersion: "firefly-blind-canary-batch-config/v1",
    batchId: "batch-v1",
    idNamespaceSha256: "b".repeat(64),
    roundsPerGenre: 3,
    chapterCount: 1,
    timeoutMs: 3_600_000,
    targetLength: { count: 5000, unit: "ko-chars" },
    instruction: "exact shared task",
    sourceAuthority: { repo: "firefly_reference_lab", receiptPath: "evidence/source.json" },
    genres: [
      ["modern-fantasy-ko", "modern-book", "inkos_male_modern_fantasy", "male-modern-fantasy-ko"],
      ["fantasy-ko", "fantasy-book", "inkos_male_fantasy", "male-fantasy-ko"],
      ["murim-ko", "murim-book", "inkos_male_murim", "male-murim-ko"],
    ].map(([genreId, bookId, profileId, soulId]) => ({
      genreId, bookId, profileId, soulId, soulVersion: "v1",
      analysisProfilePath: `analysis/${soulId}.json`,
      managerQaPath: `manager/${soulId}.json`,
      routingCatalogPath: `routing/${soulId}.json`,
    })),
  };
}

function authority(value = config()) {
  const profiles = new Map(value.genres.map((item, index) => [item.genreId, {
    profileId: item.profileId,
    model: "gpt-5.6-sol", reasoning: "high",
    soulId: item.soulId,
    soulVersion: item.soulVersion,
    configSha256: `${index + 1}`.repeat(64),
    soulSha256: `${index + 4}`.repeat(64),
  }]));
  return {
    repositories: {
      hq: { commit: COMMIT },
      inkos: { commit: "2".repeat(40) },
      referenceLab: { commit: "3".repeat(40) },
    },
    artifacts: {
      manifest: artifact("config/edge-repos.json"),
      batchConfig: artifact("config/blind-canary-batch.json"),
      profileRegistry: artifact("config/hermes-production-profiles.json"),
      neutralRegistry: artifact("config/hermes-neutral-production-profile.json"),
      evaluatorRegistry: artifact("config/hermes-blind-evaluator.json"),
      sourceRegistry: artifact("evidence/source.json"),
    },
    profiles: {
      neutral: { profileId: "inkos_neutral_baseline", model: "gpt-5.6-sol", reasoning: "high", configSha256: "9".repeat(64), soulSha256: "0".repeat(64) },
      evaluator: {
        profileId: "inkos_blind_evaluator",
        model: "gpt-5.6-sol", reasoning: "high",
        configSha256: "4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46",
        soulSha256: "5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b",
      },
    },
    genres: value.genres.map((item) => ({
      ...item,
      profile: profiles.get(item.genreId),
      sourceBook: artifact(`books/${item.bookId}/book.json`),
      referenceLab: {
        analysisProfile: artifact(item.analysisProfilePath),
        managerQa: artifact(item.managerQaPath),
        routingCatalog: artifact(item.routingCatalogPath),
      },
      writerGenreProfile: {
        schemaVersion: "genre-profile-read-receipt/v1",
        requestedGenre: item.genreId,
        resolvedProfileId: item.genreId,
        source: "builtin",
        profilePath: `builtin-genres/${item.genreId}.md`,
        profileSha256: SHA,
        profileSizeBytes: 12,
        language: "ko",
      },
      writerSoulPackage: {
        packageManifest: artifact(`souls/${item.soulId}/manifest.json`),
        files: [artifact(`souls/${item.soulId}/SOUL.md`)],
        packageSha256: "6".repeat(64),
      },
    })),
  };
}

test("builds exactly three genres by three opaque pairs without an A/B mapping", () => {
  const value = config();
  assert.deepEqual(validateBlindCanaryBatchConfig(value), []);
  const bundle = buildBlindCanaryBatchBundle({ config: value, authority: authority(value), approvedAt: "2026-09-02T06:00:00.000Z" });
  assert.equal(bundle.plan.pairCount, 9);
  assert.equal(new Set(bundle.plan.pairs.map((pair) => pair.pairId)).size, 9);
  assert.equal(new Set(bundle.plan.pairs.map((pair) => pair.blindRunId)).size, 9);
  assert.ok(bundle.plan.pairs.every((pair) => /^bp-[0-9a-f]{24}$/u.test(pair.pairId)));
  assert.ok(bundle.plan.pairs.every((pair) => /^br-[0-9a-f]{24}$/u.test(pair.blindRunId)));
  assert.equal(JSON.stringify(bundle.plan).includes("candidateA"), false);
  assert.equal(JSON.stringify(bundle.plan).includes("candidateB"), false);
  assert.equal(bundle.plan.blindMappingPresent, false);
  assert.equal(bundle.plan.timeoutMs, 3_600_000);
  assert.ok(bundle.plan.pairs.every((pair) => (
    pair.workOrderDrafts.neutral.timeoutMs === 3_600_000
    && pair.workOrderDrafts.genreSoul.timeoutMs === 3_600_000
  )));
  assert.deepEqual(validateBlindCanaryBatchPlan(bundle.plan), []);
  assert.equal(bundle.decisions.length, 3);
  assert.ok(bundle.decisions.every((decision) => decision.value.status === "candidate" && decision.value.adoptionEvidence.hqAdoption === null));
  assert.equal(bundle.approval.promotionAuthorized, false);
  assert.equal(bundle.approval.scope, "candidate-soul-binding-and-nine-pair-preparation-generation-and-independent-evaluation-only");
  const tampered = structuredClone(bundle.plan);
  tampered.pairs[0].sourceBook.sha256 = "f".repeat(64);
  assert.match(validateBlindCanaryBatchPlan(tampered)[0], /self hash mismatch/);
});

test("rejects semantic IDs, duplicate pairs, and duplicate blind runs", () => {
  const value = config();
  const plan = structuredClone(buildBlindCanaryBatchBundle({ config: value, authority: authority(value), approvedAt: "2026-09-02T06:00:00.000Z" }).plan);
  plan.pairs[0].pairId = "bp-modern-fantasy-round-1";
  rehashPlan(plan);
  assert.match(validateBlindCanaryBatchPlan(plan)[0], /not opaque/);
  const duplicatePair = structuredClone(buildBlindCanaryBatchBundle({ config: value, authority: authority(value), approvedAt: "2026-09-02T06:00:00.000Z" }).plan);
  duplicatePair.pairs[1].pairId = duplicatePair.pairs[0].pairId;
  rehashPlan(duplicatePair);
  assert.match(validateBlindCanaryBatchPlan(duplicatePair)[0], /duplicate pairId/);
  const duplicateRun = structuredClone(buildBlindCanaryBatchBundle({ config: value, authority: authority(value), approvedAt: "2026-09-02T06:00:00.000Z" }).plan);
  duplicateRun.pairs[1].blindRunId = duplicateRun.pairs[0].blindRunId;
  rehashPlan(duplicateRun);
  assert.match(validateBlindCanaryBatchPlan(duplicateRun)[0], /duplicate blindRunId/);
});

test("rejects cross-genre profile drift and duplicate pair configuration", () => {
  const wrongProfile = config();
  wrongProfile.genres[0].profileId = "inkos_male_murim";
  assert.ok(validateBlindCanaryBatchConfig(wrongProfile).some((error) => error.includes("genre/profile/Soul binding mismatch")));
  const duplicateGenre = config();
  duplicateGenre.genres[1] = structuredClone(duplicateGenre.genres[0]);
  assert.ok(validateBlindCanaryBatchConfig(duplicateGenre).some((error) => error.includes("duplicate genreId")));
  const valid = config();
  const wrongAuthority = authority(valid);
  wrongAuthority.genres[0].profile.profileId = "inkos_male_murim";
  assert.throws(
    () => buildBlindCanaryBatchBundle({ config: valid, authority: wrongAuthority, approvedAt: "2026-09-02T06:00:00.000Z" }),
    /cross-genre\/profile mismatch/,
  );
});

test("owner approval timestamp is explicit and canonical", () => {
  const value = config();
  assert.throws(() => buildBlindCanaryBatchBundle({ config: value, authority: authority(value), approvedAt: "2026-09-02" }), /canonical ISO/);
});

test("requires a bounded integer batch timeout and rejects sealed lane timeout drift", () => {
  for (const invalid of [undefined, 999, 3_600_001, 1_234.5]) {
    const value = config();
    if (invalid === undefined) delete value.timeoutMs;
    else value.timeoutMs = invalid;
    assert.ok(validateBlindCanaryBatchConfig(value).some((error) => error.includes("timeoutMs")));
  }

  const value = config();
  const plan = structuredClone(buildBlindCanaryBatchBundle({
    config: value,
    authority: authority(value),
    approvedAt: "2026-09-02T06:00:00.000Z",
  }).plan);
  plan.pairs[0].workOrderDrafts.neutral.timeoutMs = 3_599_999;
  rehashPlan(plan);
  assert.match(validateBlindCanaryBatchPlan(plan)[0], /does not share exact task inputs/);
});

test("materializes exactly eighteen non-executed WorkOrders from cross-bound sealed pairs", async () => {
  const [manifest, profiles, neutral, adoptions] = await Promise.all([
    readFile(new URL("../config/edge-repos.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../config/hermes-production-profiles.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../config/hermes-neutral-production-profile.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../config/genre-soul-adoptions.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const value = config();
  const authorityForMaterialization = authority(value);
  authorityForMaterialization.profileRegistry = profiles;
  authorityForMaterialization.neutralRegistry = neutral;
  authorityForMaterialization.profiles.neutral = neutral.profile;
  authorityForMaterialization.genres = authorityForMaterialization.genres.map((item) => ({
    ...item,
    profile: profiles.profiles.find((profile) => profile.profileId === item.profileId),
  }));
  const bundle = buildBlindCanaryBatchBundle({
    config: value,
    authority: authorityForMaterialization,
    approvedAt: "2026-09-02T06:00:00.000Z",
  });
  const decisionsByPath = new Map(bundle.decisions.map((decision) => [decision.path, {
    value: decision.value,
    sha256: decision.sha256,
    sizeBytes: decision.sizeBytes,
  }]));
  const isolationByPair = new Map(bundle.plan.pairs.map((pair) => {
    const binding = {
      soulId: pair.soulId,
      soulVersion: pair.soulVersion,
      bindingSha256: "e".repeat(64),
    };
    return [pair.pairId, {
      receipt: {
        pairId: pair.pairId,
        bookId: pair.bookId,
        soulBindingInputs: {
          soulId: pair.soulId,
          soulVersion: pair.soulVersion,
          artifacts: [
            { role: "soul-binding-decision", sha256: pair.candidateDecision.sha256 },
            { role: "source-registry-receipt", sha256: pair.sourceRegistryReceipt.sha256 },
            { role: "soul-package-manifest", sha256: authorityForMaterialization.genres.find((item) => item.genreId === pair.genreId).writerSoulPackage.packageManifest.sha256 },
          ],
        },
        lanes: {
          neutral: { expectedSoulBinding: null },
          genreSoul: { expectedSoulBinding: binding },
        },
      },
      reference: {
        pairId: pair.pairId,
        path: `.inkos/canaries/${pair.pairId}/common-snapshot.json`,
        sha256: "f".repeat(64),
        byteLength: 1,
        receiptSelfHash: "d".repeat(64),
        isolationScopeSha256: "c".repeat(64),
        commonSnapshotSha256: "b".repeat(64),
      },
    }];
  }));
  const workOrders = materializeBlindCanaryWorkOrders({
    plan: bundle.plan,
    config: value,
    approval: bundle.approval,
    authority: authorityForMaterialization,
    manifest,
    adoptionRegistry: adoptions,
    adoptionRegistryBytes: Buffer.from(`${JSON.stringify(adoptions, null, 2)}\n`, "utf8"),
    decisionsByPath,
    isolationByPair,
  });
  assert.equal(workOrders.length, 18);
  assert.ok(workOrders.every((entry) => entry.workOrder.timeoutMs === 3_600_000));
  assert.equal(workOrders.filter((entry) => entry.lane === "neutral").every((entry) => entry.workOrder.expectedSoulBinding === null), true);
  assert.equal(workOrders.filter((entry) => entry.lane === "soul").every((entry) => entry.workOrder.expectedSoulBinding?.soulId), true);
  const tampered = new Map([...isolationByPair].map(([pairId, isolation]) => [pairId, structuredClone(isolation)]));
  const first = bundle.plan.pairs[0];
  tampered.get(first.pairId).receipt.soulBindingInputs.artifacts[0].sha256 = "0".repeat(64);
  assert.throws(() => materializeBlindCanaryWorkOrders({
    plan: bundle.plan,
    config: value,
    approval: bundle.approval,
    authority: authorityForMaterialization,
    manifest,
    adoptionRegistry: adoptions,
    adoptionRegistryBytes: Buffer.from(`${JSON.stringify(adoptions, null, 2)}\n`, "utf8"),
    decisionsByPath,
    isolationByPair: tampered,
  }), /binding inputs/);

  const timeoutDriftPlan = structuredClone(bundle.plan);
  timeoutDriftPlan.timeoutMs = 3_599_999;
  for (const pair of timeoutDriftPlan.pairs) {
    pair.workOrderDrafts.neutral.timeoutMs = 3_599_999;
    pair.workOrderDrafts.genreSoul.timeoutMs = 3_599_999;
  }
  rehashPlan(timeoutDriftPlan);
  assert.deepEqual(validateBlindCanaryBatchPlan(timeoutDriftPlan), []);
  assert.throws(() => materializeBlindCanaryWorkOrders({
    plan: timeoutDriftPlan,
    config: value,
    approval: bundle.approval,
    authority: authorityForMaterialization,
    manifest,
    adoptionRegistry: adoptions,
    adoptionRegistryBytes: Buffer.from(`${JSON.stringify(adoptions, null, 2)}\n`, "utf8"),
    decisionsByPath,
    isolationByPair,
  }), /plan timeoutMs does not match/);
});

test("committed artifact readback and reachable-origin checks fail closed on stale bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-canary-git-"));
  const remote = await mkdtemp(join(tmpdir(), "firefly-canary-remote-"));
  const peer = await mkdtemp(join(tmpdir(), "firefly-canary-peer-"));
  const peerCheckout = join(peer, "checkout");
  try {
    execFileSync("git", ["init", "--bare", "-q", remote]);
    execFileSync("git", ["init", "-q", "-b", "main", root]);
    execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
    execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
    await writeFile(join(root, "evidence.json"), "{\"ok\":true}\n");
    execFileSync("git", ["-C", root, "add", "evidence.json"]);
    execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
    execFileSync("git", ["-C", root, "remote", "add", "origin", remote]);
    execFileSync("git", ["-C", root, "push", "-q", "-u", "origin", "main"]);
    const repo = await verifyReachableRepository(root, { name: "fixture", branch: "main", remoteUrl: remote });
    const first = await readCommittedArtifact(repo, "evidence.json", "fixture evidence");
    assert.equal(first.ref.sha256, sha256(first.bytes));
    // An older, still-reachable local tip must not be accepted after origin has
    // advanced: it could predate an authority revocation.
    execFileSync("git", ["clone", "-q", remote, peerCheckout]);
    execFileSync("git", ["-C", peerCheckout, "config", "user.email", "test@example.invalid"]);
    execFileSync("git", ["-C", peerCheckout, "config", "user.name", "Test"]);
    await writeFile(join(peerCheckout, "remote-only.json"), "{\"current\":true}\n");
    execFileSync("git", ["-C", peerCheckout, "add", "remote-only.json"]);
    execFileSync("git", ["-C", peerCheckout, "commit", "-qm", "advance origin"]);
    execFileSync("git", ["-C", peerCheckout, "push", "-q", "origin", "main"]);
    execFileSync("git", ["-C", root, "fetch", "-q", "origin", "main"]);
    await assert.rejects(
      verifyReachableRepository(root, { name: "fixture", branch: "main", remoteUrl: remote }),
      /exactly match origin\/main/,
    );
    execFileSync("git", ["-C", root, "merge", "--ff-only", "origin/main"]);
    await writeFile(join(root, "evidence.json"), "{\"ok\":false}\n");
    await assert.rejects(readCommittedArtifact(repo, "evidence.json", "fixture evidence"), /stale or uncommitted byte drift/);
    await writeFile(join(root, "evidence.json"), "{\"ok\":true}\n");
    await writeFile(join(root, "unreachable.json"), "{}\n");
    execFileSync("git", ["-C", root, "add", "unreachable.json"]);
    execFileSync("git", ["-C", root, "commit", "-qm", "unpushed"]);
    await assert.rejects(verifyReachableRepository(root, { name: "fixture", branch: "main", remoteUrl: remote }), /exactly match origin\/main/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(remote, { recursive: true, force: true });
    await rm(peer, { recursive: true, force: true });
  }
});


test("Astra batch uses the sealed profile runtime and rejects a mixed-model pair", () => {
  const value = config();
  const bound = authority(value);
  for (const profile of [bound.profiles.neutral, bound.profiles.evaluator, ...bound.genres.map((item) => item.profile)]) {
    profile.model = "gpt-6-astra";
    profile.configSha256 = "a".repeat(64);
  }
  const plan = buildBlindCanaryBatchBundle({ config: value, authority: bound, approvedAt: "2026-09-05T00:00:00.000Z" }).plan;
  assert.deepEqual(validateBlindCanaryBatchPlan(plan), []);
  assert.ok(plan.pairs.every((pair) => pair.workOrderDrafts.neutral.runtime.model === "gpt-6-astra" && pair.workOrderDrafts.genreSoul.runtime.model === "gpt-6-astra"));
  const mixed = structuredClone(plan);
  mixed.pairs[0].workOrderDrafts.neutral.runtime = { model: "gpt-5.6-sol", reasoning: "high" };
  assert.match(validateBlindCanaryBatchPlan(rehashPlan(mixed))[0], /exact task inputs/);
  bound.profiles.neutral.model = "gpt-5.6-sol";
  assert.throws(() => buildBlindCanaryBatchBundle({ config: value, authority: bound, approvedAt: "2026-09-05T00:00:00.000Z" }), /runtime must match exactly/);
});
