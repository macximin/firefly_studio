import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

async function schema(name) {
  return JSON.parse(await readFile(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
}

test("publishes additive strict Firefly review v2 packet and decision contracts", async () => {
  const [packet, decision, v1Packet, v1Decision] = await Promise.all([
    schema("firefly-review-packet-v2.schema.json"),
    schema("firefly-review-decision-v2.schema.json"),
    schema("firefly-review-packet-v1.schema.json"),
    schema("firefly-review-decision-v1.schema.json"),
  ]);
  assert.equal(v1Packet.properties.schemaVersion.const, "firefly_review_packet/v1");
  assert.equal(v1Decision.properties.schemaVersion.const, "firefly_review_decision/v1");
  assert.equal(packet.additionalProperties, false);
  assert.equal(packet.properties.schemaVersion.const, "firefly_review_packet/v2");
  assert.equal(packet.properties.comparison.properties.reviewKind.const, "independent-blind-comparison");
  assert.equal(packet.properties.comparison.properties.runtime.properties.kernel.const, "enforce");
  assert.equal(packet.properties.comparison.properties.runtime.properties.piWorker.const, "off");
  assert.equal(packet.properties.comparison.properties.runtime.properties.retrieval.const, "legacy");
  assert.equal(packet.properties.comparison.properties.runtime.properties.fts.const, "off");
  assert.equal(packet.properties.comparison.properties.runtime.properties.model.const, "gpt-5.6-sol");
  assert.equal(packet.properties.comparison.properties.runtime.properties.reasoning.const, "high");
  assert.equal(packet.properties.comparison.required.includes("canaryIsolation"), true);
  assert.equal(packet.properties.comparison.properties.canaryIsolation.$ref, "#/$defs/canaryIsolation");
  assert.equal(packet.properties.recommendation.type, "null");
  assert.deepEqual(packet.properties.actions.prefixItems.map((item) => item.const), ["select", "tie", "invalid"]);
  assert.deepEqual(packet.properties.authority.required,
    ["canon", "decisionSurface", "decisionEffect", "manuscriptApply", "reverseSync"]);
  assert.equal(packet.properties.authority.properties.decisionEffect.const, "advisory");
  assert.equal(packet.properties.authority.properties.manuscriptApply.const, false);
  assert.equal(packet.$defs.candidate.required.includes("applicationBindingSha256"), false);
  assert.equal(packet.$defs.candidate.required.includes("evaluationBindingSha256"), true);
  assert.equal(packet.$defs.candidate.required.includes("canaryIsolation"), true);
  assert.equal(packet.$defs.candidate.properties.kind.const, "blind-pair-candidate");
  assert.equal(packet.$defs.surfaceMatch.additionalProperties, false);
  assert.equal(packet.$defs.surfaceMatch.properties.classification.const, "pending");
  assert.equal(packet.$defs.candidate.properties.review.properties.surfaceComparison.properties.automaticRewriteApplied.const, false);
  assert.equal(packet.$defs.candidate.properties.review.properties.surfaceComparison.properties.automaticRejectApplied.const, false);
  assert.equal(decision.additionalProperties, false);
  assert.deepEqual(decision.properties.decision.enum, ["select", "tie", "invalid"]);
  assert.equal(decision.properties.purpose.const, "promotion-evaluation");
  assert.equal(decision.properties.decisionEffect.const, "advisory");
  assert.equal(decision.properties.manuscriptApply.const, false);
  assert.deepEqual(decision.properties.status.enum, ["pending", "acknowledged"]);
  assert.equal(decision.required.includes("purpose"), true);
  assert.equal(decision.required.includes("acknowledgedAt"), true);
  assert.deepEqual(decision.properties.surfaceClassifications.items.properties.classification.enum,
    ["engine", "genre-convention", "source-surface", "canon-leak"]);
  assert.equal(JSON.stringify(packet).includes("rawText"), false);
  assert.equal(JSON.stringify(packet).includes("sourceContent"), false);

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  assert.doesNotThrow(() => ajv.compile(packet));
  const validateDecision = ajv.compile(decision);
  const pending = {
    schemaVersion: "firefly_review_decision/v2",
    decisionId: "decision-001",
    packetId: "frp-0123456789abcdef01234567",
    packetSha256: "1".repeat(64),
    workId: "book-one",
    artifactId: "chapter-0001",
    candidateId: "candidate-A",
    candidateSha256: "2".repeat(64),
    decision: "select",
    comment: "A 선택",
    purpose: "promotion-evaluation",
    decisionEffect: "advisory",
    manuscriptApply: false,
    surfaceClassifications: [],
    status: "pending",
    createdAt: "2026-09-02T12:00:00.000Z",
    acknowledgedAt: null,
    ackReceiptPath: null,
  };
  assert.equal(validateDecision(pending), true, ajv.errorsText(validateDecision.errors));
  const tie = { ...pending, candidateId: null, candidateSha256: null, decision: "tie", comment: "동점" };
  assert.equal(validateDecision(tie), true, ajv.errorsText(validateDecision.errors));
  assert.equal(validateDecision({ ...tie, candidateId: "candidate-A" }), false);
  assert.equal(validateDecision({ ...tie, comment: " \n\t " }), false);
  const acknowledged = {
    ...pending,
    status: "acknowledged",
    acknowledgedAt: "2026-09-02T12:01:00.000Z",
    ackReceiptPath: ".inkos/canaries/pair/review/decisions/decision-001.json",
  };
  assert.equal(validateDecision(acknowledged), true, ajv.errorsText(validateDecision.errors));
});
