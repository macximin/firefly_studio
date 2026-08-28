import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.equal(packet.properties.recommendation.type, "null");
  assert.equal(packet.$defs.surfaceMatch.additionalProperties, false);
  assert.equal(packet.$defs.surfaceMatch.properties.classification.const, "pending");
  assert.equal(packet.$defs.candidate.properties.review.properties.surfaceComparison.properties.automaticRewriteApplied.const, false);
  assert.equal(packet.$defs.candidate.properties.review.properties.surfaceComparison.properties.automaticRejectApplied.const, false);
  assert.equal(decision.additionalProperties, false);
  assert.deepEqual(decision.properties.surfaceClassifications.items.properties.classification.enum,
    ["engine", "genre-convention", "source-surface", "canon-leak"]);
  assert.equal(JSON.stringify(packet).includes("rawText"), false);
  assert.equal(JSON.stringify(packet).includes("sourceContent"), false);
});
