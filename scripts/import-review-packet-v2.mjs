import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const forbiddenKeys = new Set(["rawText", "sourceContent", "sourceBody", "sourceExcerpt", "sourceQuote"]);
const genreSoulIds = Object.freeze({
  "modern-fantasy-ko": "male-modern-fantasy-ko",
  "fantasy-ko": "male-fantasy-ko",
  "murim-ko": "male-murim-ko",
});
const schema = JSON.parse(await readFile(new URL("../contracts/firefly-review-packet-v2.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);
export const FIREFLY_REVIEW_PACKET_V2_MAX_BYTES = 64 * 1024 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value) {
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sort(child)]));
    }
    return item;
  };
  return sha256(JSON.stringify(sort(value)));
}

function assertUtf8Span(span, body, label, { candidateSha256 = null } = {}) {
  const bodyBytes = Buffer.from(body, "utf8");
  const start = span.startByte;
  const end = span.endByte;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > bodyBytes.byteLength) {
    throw new Error(`${label} byte range is invalid.`);
  }
  const slice = bodyBytes.subarray(start, end);
  let decoded;
  try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(slice); }
  catch { throw new Error(`${label} does not align to UTF-8 boundaries.`); }
  if (!Buffer.from(decoded, "utf8").equals(slice)) throw new Error(`${label} does not align to UTF-8 boundaries.`);
  if (candidateSha256 !== null) {
    if (span.candidateContentSha256 !== candidateSha256 || sha256(slice) !== span.candidateSliceSha256) {
      throw new Error(`${label} candidate binding is invalid.`);
    }
  } else if (sha256(slice) !== span.sliceSha256) {
    throw new Error(`${label} slice SHA-256 mismatch.`);
  }
}

function assertReviewPacketSemantics(packet) {
  if (packet.source.bookId !== packet.work.id) {
    throw new Error("Review packet source Book ID differs from its work ID.");
  }
  if (packet.comparison.blindRunId === packet.comparison.blindSessionId) {
    throw new Error("Blind comparison run and session IDs must be distinct.");
  }
  if (sha256(packet.artifact.currentContent) !== packet.artifact.currentContentSha256) {
    throw new Error("Current manuscript SHA-256 mismatch.");
  }
  const comparisonIsolation = JSON.stringify(packet.comparison.canaryIsolation);
  const expectedSoulId = genreSoulIds[packet.work.genre];
  if (!expectedSoulId) throw new Error("Review packet genre is outside the locked male genre-Soul set.");
  const seenMatchIds = new Set();
  let surfaceCorpus = null;
  for (const candidate of packet.candidates) {
    if (sha256(candidate.body) !== candidate.sha256) throw new Error(`${candidate.id} body SHA-256 mismatch.`);
    if (candidate.commercialEvaluationReceiptSha256 !== packet.comparison.runtimeReceiptSha256) {
      throw new Error(`${candidate.id} commercial evaluation receipt differs from the comparison runtime receipt.`);
    }
    if (JSON.stringify(candidate.canaryIsolation) !== comparisonIsolation) {
      throw new Error(`${candidate.id} canary isolation differs from the comparison.`);
    }
    const evaluation = candidate.commercialEvaluation;
    const front = (evaluation.openingPressure + evaluation.protagonistAgency + evaluation.resistanceQuality
      + evaluation.visiblePayoff + evaluation.endingPropulsion) / 5;
    const reference = (evaluation.referenceEngineRetention + evaluation.transformationIntegrity + evaluation.styleFidelity) / 3;
    const expectedScore = Math.round(((front * 0.7) + (reference * 0.3)) * 10) / 10;
    if (candidate.commercialScore !== expectedScore) {
      throw new Error(`${candidate.id} commercial score does not match dopamine70-reference30-v1.`);
    }
    if (candidate.review.emotionalCoherence.evidence.length < 1) {
      throw new Error(`${candidate.id} emotional evidence must not be empty.`);
    }
    for (const span of candidate.review.emotionalCoherence.evidence) {
      assertUtf8Span(span, candidate.body, `${candidate.id} emotional evidence`);
    }
    for (const violation of candidate.review.contentNeutrality.violations) {
      if (violation.evidence.length < 1) throw new Error(`${candidate.id} content-neutral evidence must not be empty.`);
      for (const span of violation.evidence) assertUtf8Span(span, candidate.body, `${candidate.id} content-neutral evidence`);
    }
    if (candidate.review.contentNeutrality.passed !== (candidate.review.contentNeutrality.violations.length === 0)) {
      throw new Error(`${candidate.id} content-neutrality flag contradicts its violations.`);
    }
    for (const contradiction of candidate.review.canonContradictions) {
      if (contradiction.evidence.length < 1) throw new Error(`${candidate.id} canon evidence must not be empty.`);
      for (const span of contradiction.evidence) assertUtf8Span(span, candidate.body, `${candidate.id} canon evidence`);
    }
    for (const match of candidate.review.surfaceComparison.surfaceMatches) {
      if (seenMatchIds.has(match.matchId)) throw new Error("Surface match IDs must be unique in a packet.");
      seenMatchIds.add(match.matchId);
      assertUtf8Span(match.candidate, candidate.body, `${candidate.id} surface selector`, { candidateSha256: candidate.sha256 });
      if (match.source.endByte <= match.source.startByte || match.source.endByte - match.source.startByte > 32_768) {
        throw new Error(`${candidate.id} surface source range is invalid.`);
      }
      const selectorBody = {
        provenanceBridgeReceiptSha256: match.provenanceBridgeReceiptSha256,
        matchMethod: match.matchMethod,
        candidate: match.candidate,
        source: match.source,
      };
      const selectorSha256 = sha256(JSON.stringify(selectorBody));
      if (match.selectorSha256 !== selectorSha256 || match.matchId !== `fsm-${selectorSha256.slice(0, 24)}`) {
        throw new Error(`${candidate.id} surface selector identity is invalid.`);
      }
    }
    if (candidate.review.surfaceComparison.soulId !== expectedSoulId
      || candidate.review.surfaceComparison.soulVersion !== "v1") {
      throw new Error(`${candidate.id} public surface Soul does not match the work genre.`);
    }
    const candidateCorpus = JSON.stringify({
      soulId: candidate.review.surfaceComparison.soulId,
      soulVersion: candidate.review.surfaceComparison.soulVersion,
      surfaceIndexSha256: candidate.review.surfaceComparison.surfaceIndexSha256,
    });
    if (surfaceCorpus !== null && surfaceCorpus !== candidateCorpus) {
      throw new Error("Blind candidates must use the same public surface corpus.");
    }
    surfaceCorpus = candidateCorpus;
  }
  if (packet.candidates[0].sha256 === packet.candidates[1].sha256) {
    throw new Error("Blind comparison candidates must contain distinct manuscripts.");
  }
  const expectedNeutralEvidence = packet.candidates.map((candidate) => canonicalSha256({
    schemaVersion: "firefly-content-neutral-evaluation/v1",
    candidateId: candidate.id,
    candidateSha256: candidate.sha256,
    contentNeutrality: candidate.review.contentNeutrality,
  })).sort();
  if (JSON.stringify(packet.sealedGenerationEvidence.contentNeutralReceiptSha256s) !== JSON.stringify(expectedNeutralEvidence)) {
    throw new Error("Sealed content-neutral evidence does not match the public candidate evaluations.");
  }
  for (const [key, values] of Object.entries(packet.sealedGenerationEvidence)) {
    if (values[0] >= values[1]) throw new Error(`${key} must contain two unique sorted SHA-256 values.`);
  }
}

export function validateReviewPacketV2(packet) {
  if (!validateSchema(packet)) {
    const detail = ajv.errorsText(validateSchema.errors, { separator: "; " });
    throw new Error(`Refusing a packet that fails the strict Firefly v2 schema: ${detail}`);
  }
  if (packet?.schemaVersion !== "firefly_review_packet/v2" || !/^frp-[0-9a-f]{24}$/u.test(packet.packetId)
    || !/^[0-9a-f]{64}$/u.test(packet.packetSha256) || packet.authority?.canon !== "inkos"
    || packet.authority?.decisionSurface !== "storyyard" || packet.authority?.decisionEffect !== "advisory"
    || packet.authority?.manuscriptApply !== false || packet.authority?.reverseSync !== false
    || packet.purpose !== "promotion-evaluation"
    || JSON.stringify(packet.actions) !== JSON.stringify(["select", "tie", "invalid"])) {
    throw new Error("Refusing a packet outside the Firefly v2 one-way review boundary.");
  }
  const { schemaVersion: _schemaVersion, packetId, packetSha256, ...body } = packet;
  const actual = sha256(JSON.stringify(body));
  if (actual !== packetSha256 || packetId !== `frp-${actual.slice(0, 24)}`) throw new Error("Review packet identity or SHA-256 mismatch.");
  assertReviewPacketSemantics(packet);
  walk(packet, (key) => { if (forbiddenKeys.has(key)) throw new Error(`Review packet contains forbidden raw source field: ${key}`); });
  return packet;
}

export async function importReviewPacketV2(sourcePath, { root = defaultRoot } = {}) {
  const absoluteSource = resolve(sourcePath);
  const pathBefore = await lstat(absoluteSource);
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()) throw new Error("Review packet source must be a regular non-symlink file.");
  let sourceHandle;
  try {
    sourceHandle = await open(absoluteSource, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = await sourceHandle.stat();
    if (!before.isFile() || before.size < 1 || before.size > FIREFLY_REVIEW_PACKET_V2_MAX_BYTES) {
      throw new Error(`Review packet source exceeds the ${FIREFLY_REVIEW_PACKET_V2_MAX_BYTES}-byte public packet limit.`);
    }
    const rawBytes = await sourceHandle.readFile();
    const [after, pathAfter] = await Promise.all([sourceHandle.stat(), lstat(absoluteSource)]);
    if (!after.isFile() || !pathAfter.isFile() || pathAfter.isSymbolicLink()
      || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || after.dev !== pathAfter.dev || after.ino !== pathAfter.ino || rawBytes.byteLength !== after.size) {
      throw new Error("Review packet source changed during stable readback.");
    }
    let raw;
    try { raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes); }
    catch { throw new Error("Review packet source must be valid UTF-8."); }
    const packet = validateReviewPacketV2(JSON.parse(raw));
    const normalized = `${JSON.stringify(packet, null, 2)}\n`;
    const target = join(root, ".firefly", "review-packets", `${packet.packetId}.json`);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    let handle;
    try { handle = await open(target, "wx", 0o600); }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (await readFile(target, "utf8") !== normalized) throw new Error("A different packet already occupies the immutable packet ID.");
      return target;
    }
    try { await handle.writeFile(normalized); } finally { await handle.close(); }
    return target;
  } finally {
    await sourceHandle?.close();
  }
}

function walk(value, visit) {
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { visit(key); walk(item, visit); }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: node scripts/import-review-packet-v2.mjs <InkOS packet.json>");
  process.stdout.write(`${await importReviewPacketV2(process.argv[2])}\n`);
}
