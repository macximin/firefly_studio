import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FIREFLY_REVIEW_PACKET_V2_MAX_BYTES,
  importReviewPacketV2,
  validateReviewPacketV2,
} from "../scripts/import-review-packet-v2.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const at = "2026-09-02T12:00:00.000Z";

function candidate(id, body, marker) {
  const isolation = {
    receiptSha256: "5".repeat(64),
    receiptSelfHash: "6".repeat(64),
    isolationScopeSha256: "7".repeat(64),
    commonSnapshotSha256: "8".repeat(64),
  };
  const commercialEvaluation = Object.fromEntries([
    "openingPressure", "protagonistAgency", "resistanceQuality", "visiblePayoff",
    "endingPropulsion", "referenceEngineRetention", "transformationIntegrity", "styleFidelity",
  ].map((key) => [key, 80]));
  return {
    id,
    kind: "blind-pair-candidate",
    evaluationBindingSha256: marker.repeat(64),
    canaryIsolation: isolation,
    status: "unreviewed",
    body,
    sha256: sha(body),
    preparedAt: at,
    commercialScore: 80,
    commercialEvaluation,
    commercialEvaluationReceiptSha256: "e".repeat(64),
    review: {
      status: "unreviewed",
      retained: [],
      variedSurface: [],
      linkedConsequences: [],
      emotionalCoherence: {
        score: 80,
        evidence: [{ coordinateKind: "utf8-byte", startByte: 0, endByte: Buffer.byteLength(body), sliceSha256: sha(body) }],
      },
      contentNeutrality: { passed: true, violations: [] },
      canonContradictions: [],
      surfaceComparison: {
        schemaVersion: "soul_corpus_comparison/v2",
        soulId: "male-modern-fantasy-ko",
        soulVersion: "v1",
        surfaceIndexSha256: "a".repeat(64),
        surfaceMatches: [],
        similarityPenaltyApplied: false,
        automaticRewriteApplied: false,
        automaticRejectApplied: false,
        humanDecision: "pending",
      },
    },
  };
}

function packet(overrides = {}) {
  const isolation = {
    receiptSha256: "5".repeat(64),
    receiptSelfHash: "6".repeat(64),
    isolationScopeSha256: "7".repeat(64),
    commonSnapshotSha256: "8".repeat(64),
  };
  const currentContent = "";
  const candidates = [candidate("candidate-A", "후보 A", "1"), candidate("candidate-B", "후보 B", "2")];
  const body = {
    generatedAt: at,
    purpose: "promotion-evaluation",
    source: { system: "inkos", bookId: "fixture-book", sourceRevision: at },
    work: { id: "fixture-book", title: "픽스처", genre: "modern-fantasy-ko", status: "active", targetChapters: 100 },
    artifact: {
      id: "chapter-0001", kind: "chapter", chapterNumber: 1, title: "", status: "not-written",
      currentContent, currentContentSha256: sha(currentContent),
    },
    comparison: {
      reviewKind: "independent-blind-comparison",
      pairId: "bp-0123456789abcdef01234567",
      round: 1,
      blindRunId: "br-111111111111111111111111",
      blindSessionId: "br-222222222222222222222222",
      commonInputReceiptSha256: "b".repeat(64),
      pairedGenerationReceiptSha256: "c".repeat(64),
      labelAssignmentReceiptSha256: "d".repeat(64),
      runtimeReceiptSha256: "e".repeat(64),
      canaryIsolation: isolation,
      candidateLabelsShuffled: true,
      generatorMetadataExcluded: true,
      runtime: { kernel: "enforce", piWorker: "off", retrieval: "legacy", fts: "off", model: "gpt-5.6-sol", reasoning: "high" },
    },
    candidates,
    sealedGenerationEvidence: {
      candidateEvidenceReceiptSha256s: ["1".repeat(64), "2".repeat(64)],
      contentNeutralReceiptSha256s: candidates.map((item) => canonicalSha({
        schemaVersion: "firefly-content-neutral-evaluation/v1",
        candidateId: item.id,
        candidateSha256: item.sha256,
        contentNeutrality: item.review.contentNeutrality,
      })).sort(),
    },
    recommendation: null,
    actions: ["select", "tie", "invalid"],
    authority: {
      canon: "inkos",
      decisionSurface: "storyyard",
      decisionEffect: "advisory",
      manuscriptApply: false,
      reverseSync: false,
    },
    ...overrides,
  };
  const packetSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return {
    schemaVersion: "firefly_review_packet/v2",
    packetId: `frp-${packetSha256.slice(0, 24)}`,
    packetSha256,
    ...body,
  };
}

function rehash(value) {
  const { schemaVersion: _schemaVersion, packetId: _packetId, packetSha256: _packetSha256, ...body } = value;
  const packetSha256 = sha(JSON.stringify(body));
  return { schemaVersion: "firefly_review_packet/v2", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, ...body };
}

function canonicalSha(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort)
    : item && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sort(child)]))
      : item;
  return sha(JSON.stringify(sort(value)));
}

function refreshNeutralReceipts(value) {
  value.sealedGenerationEvidence.contentNeutralReceiptSha256s = value.candidates.map((item) => canonicalSha({
    schemaVersion: "firefly-content-neutral-evaluation/v1",
    candidateId: item.id,
    candidateSha256: item.sha256,
    contentNeutrality: item.review.contentNeutrality,
  })).sort();
}

test("accepts the current advisory Storyyard v2 authority and hashes generatedAt", () => {
  const value = packet();
  assert.equal(validateReviewPacketV2(value), value);
});

test("rejects legacy apply authority and generatedAt tampering", () => {
  const legacy = packet({ authority: { canon: "inkos", decisionSurface: "storyyard", apply: "inkos", reverseSync: false } });
  assert.throws(() => validateReviewPacketV2(legacy), /strict Firefly v2 schema|one-way review boundary/u);
  const tampered = packet();
  tampered.generatedAt = "2026-09-02T12:00:01.000Z";
  assert.throws(() => validateReviewPacketV2(tampered), /identity or SHA-256/u);
  const malformed = packet();
  delete malformed.candidates;
  assert.throws(() => validateReviewPacketV2(malformed), /strict Firefly v2 schema/u);
  const offsetTimestamp = packet();
  offsetTimestamp.generatedAt = "2026-09-02T21:00:00+09:00";
  assert.throws(() => validateReviewPacketV2(rehash(offsetTimestamp)), /strict Firefly v2 schema/u);
});

test("rejects semantically forged candidate, isolation, score, and sealed evidence bindings", () => {
  const collapsedIds = packet();
  collapsedIds.comparison.blindSessionId = collapsedIds.comparison.blindRunId;
  assert.throws(() => validateReviewPacketV2(rehash(collapsedIds)), /run and session IDs must be distinct/u);

  const receiptForgery = packet();
  receiptForgery.candidates[0].commercialEvaluationReceiptSha256 = "9".repeat(64);
  assert.throws(() => validateReviewPacketV2(rehash(receiptForgery)), /commercial evaluation receipt differs/u);

  const bodyForgery = packet();
  bodyForgery.candidates[0].body = "위조된 후보 A";
  assert.throws(() => validateReviewPacketV2(rehash(bodyForgery)), /body SHA-256 mismatch/u);

  const isolationForgery = packet();
  isolationForgery.candidates[1].canaryIsolation.commonSnapshotSha256 = "f".repeat(64);
  assert.throws(() => validateReviewPacketV2(rehash(isolationForgery)), /canary isolation differs/u);

  const scoreForgery = packet();
  scoreForgery.candidates[0].commercialScore = 81;
  assert.throws(() => validateReviewPacketV2(rehash(scoreForgery)), /commercial score/u);

  const reversed = packet();
  reversed.sealedGenerationEvidence.candidateEvidenceReceiptSha256s.reverse();
  assert.throws(() => validateReviewPacketV2(rehash(reversed)), /unique sorted SHA-256/u);

  const neutralReceiptForgery = packet();
  neutralReceiptForgery.sealedGenerationEvidence.contentNeutralReceiptSha256s = ["0".repeat(64), "f".repeat(64)];
  assert.throws(() => validateReviewPacketV2(rehash(neutralReceiptForgery)), /content-neutral evidence does not match/u);

  const corpusDrift = packet();
  corpusDrift.candidates[1].review.surfaceComparison.surfaceIndexSha256 = "f".repeat(64);
  assert.throws(() => validateReviewPacketV2(rehash(corpusDrift)), /same public surface corpus/u);

  const wrongSoul = packet();
  for (const candidate of wrongSoul.candidates) candidate.review.surfaceComparison.soulId = "male-fantasy-ko";
  assert.throws(() => validateReviewPacketV2(rehash(wrongSoul)), /public surface Soul does not match/u);

  const duplicate = packet();
  duplicate.candidates[1].body = duplicate.candidates[0].body;
  duplicate.candidates[1].sha256 = duplicate.candidates[0].sha256;
  duplicate.candidates[1].review.emotionalCoherence.evidence = structuredClone(duplicate.candidates[0].review.emotionalCoherence.evidence);
  refreshNeutralReceipts(duplicate);
  assert.throws(() => validateReviewPacketV2(rehash(duplicate)), /distinct manuscripts/u);
});

test("rejects semantically forged manuscript, span, neutrality, and surface selector bindings", () => {
  const bookForgery = packet();
  bookForgery.source.bookId = "another-book";
  assert.throws(() => validateReviewPacketV2(rehash(bookForgery)), /source Book ID differs/u);

  const manuscriptForgery = packet();
  manuscriptForgery.artifact.currentContent = "이미 존재하는 정본";
  assert.throws(() => validateReviewPacketV2(rehash(manuscriptForgery)), /Current manuscript SHA-256 mismatch/u);

  const spanForgery = packet();
  spanForgery.candidates[0].review.emotionalCoherence.evidence = [{
    coordinateKind: "utf8-byte", startByte: 0, endByte: 3, sliceSha256: "f".repeat(64),
  }];
  assert.throws(() => validateReviewPacketV2(rehash(spanForgery)), /slice SHA-256 mismatch/u);

  const emptyEvidence = packet();
  emptyEvidence.candidates[0].review.emotionalCoherence.evidence = [];
  assert.throws(() => validateReviewPacketV2(rehash(emptyEvidence)), /strict Firefly v2 schema|must not be empty/u);

  const neutralityForgery = packet();
  neutralityForgery.candidates[0].review.contentNeutrality.passed = false;
  assert.throws(() => validateReviewPacketV2(rehash(neutralityForgery)), /flag contradicts/u);

  const surfaceForgery = packet();
  const candidateBody = surfaceForgery.candidates[0].body;
  const candidateSlice = Buffer.from(candidateBody, "utf8").subarray(0, 3);
  surfaceForgery.candidates[0].review.surfaceComparison.surfaceMatches = [{
    matchId: `fsm-${"f".repeat(24)}`,
    selectorSha256: "f".repeat(64),
    provenanceBridgeReceiptSha256: "e".repeat(64),
    matchMethod: "exact-byte-120",
    classification: "pending",
    candidate: {
      coordinateKind: "utf8-byte", candidateContentSha256: surfaceForgery.candidates[0].sha256,
      startByte: 0, endByte: 3, candidateSliceSha256: sha(candidateSlice),
    },
    source: {
      coordinateKind: "utf8-byte", sourceId: "source-001", sourceSha256: "d".repeat(64),
      startByte: 0, endByte: 120, sliceSha256: "c".repeat(64),
    },
  }];
  assert.throws(() => validateReviewPacketV2(rehash(surfaceForgery)), /surface selector identity is invalid/u);
});

test("accepts the exact public packet byte cap and rejects cap plus one before target creation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "firefly-review-import-bounds-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const exactPath = join(root, "exact.json");
  const raw = Buffer.from(JSON.stringify(packet()), "utf8");
  assert.equal(raw.byteLength < FIREFLY_REVIEW_PACKET_V2_MAX_BYTES, true);
  await writeFile(exactPath, Buffer.concat([
    raw,
    Buffer.alloc(FIREFLY_REVIEW_PACKET_V2_MAX_BYTES - raw.byteLength, 0x20),
  ]));
  const outputRoot = join(root, "accepted");
  const imported = await importReviewPacketV2(exactPath, { root: outputRoot });
  assert.match(await readFile(imported, "utf8"), /"schemaVersion": "firefly_review_packet\/v2"/u);

  const oversizedPath = join(root, "oversized.json");
  await writeFile(oversizedPath, "{}");
  await truncate(oversizedPath, FIREFLY_REVIEW_PACKET_V2_MAX_BYTES + 1);
  const rejectedRoot = join(root, "rejected");
  await assert.rejects(() => importReviewPacketV2(oversizedPath, { root: rejectedRoot }), /public packet limit/u);
  await assert.rejects(() => readFile(join(rejectedRoot, ".firefly", "review-packets", "anything.json")),
    (error) => error?.code === "ENOENT");
});
