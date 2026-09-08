import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES,
  buildBlindReviewReceiptFromRawEvidence,
  hashBlindEvaluationArtifact,
} from "../edge_repos/firefly_reference_lab/tools/blind-pair-evaluation-contract.mjs";
import { importBlindReviewEvidence, prepareBlindReviewPair as prepareBlindReviewPairWithRuntime } from "../scripts/blind-review-bridge-lib.mjs";

import { measureHermesExactInputTranscript, planHermesStructuredContextBudget } from "../edge_repos/firefly_reference_lab/tools/genre-soul-hermes-run-lib.mjs";

// Contract tests use a fixed runtime context; live Hermes attestation is tested separately.
const prepareBlindReviewPair = (args) => prepareBlindReviewPairWithRuntime(args, {
  contextPreflight: async ({ prompt, inputBuffers, outputReserveTokens }) => {
    const measurement = measureHermesExactInputTranscript(inputBuffers);
    const budget = planHermesStructuredContextBudget({ profilePromptContextBytes: 1024, projectPromptContextBytes: 0, pluginContextBytes: 1024, prompt, readTranscriptProxyBytes: measurement.readTranscriptProxyBytes, outputReserveTokens, contextLimit: 400_000 });
    if (!budget.fits) throw new Error(`Hermes structured preflight context boundary failed: ${budget.preflightBudgetTokens} >= ${budget.contextLimit}`);
    return { ...budget, runtimeIdentitySha256: digest("synthetic-runtime") };
  },
});

const sha = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const sourcePair = "bridge-fixture-001";
const pairId = "bp-0123456789abcdef01234567";
const runId = "br-111111111111111111111111";
const sessionId = "br-222222222222222222222222";
const now = "2026-09-02T12:00:00.000Z";
const configDigest = "4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46";
const soulDigest = "5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b";
const digest = (label) => sha(`fixture:${label}`);

function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]));
  return value;
}
function transferHash(value) { return sha(JSON.stringify(sort(value))); }
function spans(body) {
  const result = [];
  for (const match of body.matchAll(/[^\r\n]+/gu)) {
    const raw = match[0];
    const leading = raw.match(/^\s*/u)?.[0].length ?? 0;
    const trailing = raw.match(/\s*$/u)?.[0].length ?? 0;
    const start = (match.index ?? 0) + leading;
    const end = (match.index ?? 0) + raw.length - trailing;
    if (end <= start) continue;
    const text = body.slice(start, end);
    const startByte = Buffer.byteLength(body.slice(0, start));
    result.push({ coordinateKind: "utf8-byte", startByte, endByte: startByte + Buffer.byteLength(text), sliceSha256: sha(text) });
  }
  return result;
}
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); const valueBytes = bytes(value); await writeFile(path, valueBytes); return valueBytes; }

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "firefly-blind-review-bridge-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inkos = join(root, "edge_repos", "inkos");
  const reflab = join(root, "edge_repos", "firefly_reference_lab");
  const bookId = options.bookId ?? "bridge-book";
  await writeJson(join(root, "config", "hermes-blind-evaluator.json"), {
    schemaVersion: "hermes-blind-evaluator-profile/v1",
    profile: { profileId: "inkos_blind_evaluator", role: "blind-commercial-evaluator", authority: "evaluation-only", provider: "openai-codex", model: "gpt-5.6-sol", reasoning: "high", codingContext: false, openaiRuntime: "auto", cliToolsets: [], toolsCount: 0, skillsPolicy: "none", configSha256: configDigest, soulSha256: soulDigest, ...options.evaluatorProfile },
  });
  await Promise.all([mkdir(inkos, { recursive: true }), mkdir(reflab, { recursive: true })]);
  const manifest = { repos: [{ name: "inkos", path: "edge_repos/inkos" }, { name: "firefly_reference_lab", path: "edge_repos/firefly_reference_lab" }] };
  const bodies = options.bodies ?? ["후보 A는 계약을 뒤집고 회사를 샀다.\n다음 전쟁을 선언했다.", "후보 B는 자산을 꿰뚫고 적의 판을 빼앗았다.\n다음 거래를 개시했다."];
  const canaryIsolation = { receiptSha256: digest("iso-receipt"), receiptSelfHash: digest("iso-self"), isolationScopeSha256: digest("iso-scope"), commonSnapshotSha256: digest("iso-snapshot") };
  const book = {
    id: bookId,
    title: "브리지 테스트 작품",
    platform: "other",
    genre: options.bookGenre ?? "modern-fantasy-ko",
    status: "outlining",
    targetChapters: 200,
    chapterWordCount: 5000,
    language: "ko",
    createdAt: now,
    updatedAt: now,
  };
  await mkdir(join(inkos, "books", bookId), { recursive: true });
  await writeFile(
    join(inkos, "books", bookId, "book.json"),
    `${JSON.stringify(book, null, 2)}${options.legacyBookFinalLf ? "\n" : ""}`,
  );
  const terminals = {};
  const mappingRows = [
    ["neutral", "candidate-A", "producer-neutral", "neutral-profile", "wo-neutral"],
    ["soul", "candidate-B", "producer-soul", "soul-profile", "wo-soul"],
  ].map(([lane, candidateId, sessionId, profileId, workOrderId], index) => {
    const terminalUnsigned = { schemaVersion: "inkos-agent-operation-terminal/v2", status: "succeeded", executionMode: "promotion-canary", bookId, workOrderId, sessionId };
    const terminal = { ...terminalUnsigned, receiptSelfHash: transferHash(terminalUnsigned) };
    terminals[lane] = terminal;
    const terminalBytes = bytes(terminal);
    const body = bodies[index];
    return {
      candidateId, lane, profileId, sessionId, workOrderId,
      laneProjectRoot: `.inkos/canaries/${sourcePair}/${lane}`,
      expectedSoulBinding: lane === "neutral" ? null : { soulId: "male-modern-fantasy-ko", soulVersion: "v1", bindingSha256: digest("soul-binding") },
      terminal: { path: "story/runtime/hermes-control/terminal.json", sha256: sha(terminalBytes), byteLength: terminalBytes.byteLength, receiptSelfHash: terminal.receiptSelfHash },
      chapterCommit: { path: "story/runtime/chapter-commit.json", sha256: digest(`chapter-commit:${lane}`), byteLength: 100, receiptSelfHash: digest(`chapter-commit-self:${lane}`) },
      chapterArtifact: { path: "chapters/0001.md", sha256: sha(body), byteLength: Buffer.byteLength(body) },
      body,
    };
  });
  for (const row of mappingRows) {
    await writeJson(join(inkos, ".inkos", "canaries", sourcePair, row.lane, "books", bookId, row.terminal.path), terminals[row.lane]);
  }
  const common = "두 후보에 같은 캐논과 현재 Arc/Rail이 적용된다.";
  const commonContext = { text: common, sha256: sha(common), byteLength: Buffer.byteLength(common) };
  const commonInputReceiptSha256 = transferHash({ schemaVersion: "inkos-blind-common-context/v1", commonContext });
  const pairedGenerationReceiptSha256 = transferHash({
    schemaVersion: "inkos-blind-pair-generation-binding/v1",
    bookId,
    chapterNumber: 1,
    canaryIsolation,
    terminals: mappingRows.map((row) => ({
      terminalSha256: row.terminal.sha256,
      terminalSelfHash: row.terminal.receiptSelfHash,
      chapterCommitSha256: row.chapterCommit.sha256,
      chapterArtifactSha256: row.chapterArtifact.sha256,
    })).sort((left, right) => left.terminalSha256.localeCompare(right.terminalSha256)),
  });
  const mappingUnsigned = {
    schemaVersion: "inkos-blind-pair-private-mapping/v1",
    sourcePairId: sourcePair,
    opaquePairId: pairId,
    blindRunId: runId,
    blindSessionId: sessionId,
    bookId,
    chapterNumber: 1,
    round: 1,
    commonContext,
    commonInputReceiptSha256,
    pairedGenerationReceiptSha256,
    canaryIsolation,
    entropyCommitmentSha256: digest("entropy"),
    mappingRandomized: true,
    mappings: mappingRows,
    createdAt: now,
  };
  options.mutateMapping?.(mappingUnsigned);
  const mapping = { ...mappingUnsigned, receiptSelfHash: transferHash(mappingUnsigned) };
  const mappingBytes = await writeJson(join(inkos, ".inkos", "canaries", sourcePair, "review", "private", "label-assignment.json"), mapping);
  const transferUnsigned = {
    schemaVersion: "inkos-blind-pair-evaluation-transfer/v1", pairId, round: 1, blindRunId: runId, blindSessionId: sessionId, bookId, chapterNumber: 1,
    commonContext: mapping.commonContext, commonInputReceiptSha256: mapping.commonInputReceiptSha256, pairedGenerationReceiptSha256: mapping.pairedGenerationReceiptSha256,
    labelAssignmentReceiptSha256: sha(mappingBytes), canaryIsolation,
    candidates: bodies.map((body, index) => ({ id: index === 0 ? "candidate-A" : "candidate-B", body, sha256: sha(body), byteLength: Buffer.byteLength(body) })),
    generatedAt: now, authority: { scope: "evaluation-input", mayWriteInkOSCanon: false, mayRevealGeneratorIdentity: false, ownerDecisionRequired: true },
  };
  const transfer = { ...transferUnsigned, transferSelfHash: transferHash(transferUnsigned) };
  const transferBytes = await writeJson(join(inkos, ".inkos", "canaries", sourcePair, "review", "public", "evaluation-transfer.json"), transfer);
  return { root, inkos, reflab, manifest, transfer, transferBytes, bodies };
}

function resultFor(input, contexts) {
  const evaluation = (candidate, score) => ({
    candidateSha256: candidate.sha256,
    commercialEvaluation: Object.fromEntries(["openingPressure", "protagonistAgency", "resistanceQuality", "visiblePayoff", "endingPropulsion", "referenceEngineRetention", "transformationIntegrity", "styleFidelity"].map((key) => [key, score])),
    commercialScore: score, emotionalCoherence: { score, evidence: [candidate.evidenceSpans[0]] }, contentNeutrality: { passed: true, violations: [] }, canonContradictions: [], canonLeaks: [],
    genreIdentity: { worldConstraintEvidence: [candidate.evidenceSpans[0]], repeatableVerbEvidence: [candidate.evidenceSpans[0]], oppositionFormEvidence: [candidate.evidenceSpans[0]], rewardStatusCurrencyEvidence: [candidate.evidenceSpans[0]], nextEpisodeActionEvidence: [candidate.evidenceSpans[0]], pass: true },
  });
  return { schemaVersion: "firefly-blind-pair-evaluator-result/v2", pairId: input.pairId, round: input.round, blindRunId: input.blindRunId, pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256, winner: "candidate-B", rankingReason: "후보 B가 다음 회차 행동과 보상이 더 선명하다.", evaluations: { "candidate-A": evaluation(contexts[0], 80), "candidate-B": evaluation(contexts[1], 90) }, humanDecision: "pending", authority: input.authority };
}
function scanFor(candidate) {
  const unsigned = { schemaVersion: "firefly-blind-pair-surface-scan/v1", candidateId: candidate.id, candidateSha256: candidate.sha256, candidateByteLength: candidate.byteLength, scanner: { version: "genre-soul-surface-scanner/v1", exactTokenCount: 12, exactByteLength: 120 }, corpus: { privateRegistrySha256: digest(`registry:${candidate.id}`), availableSourceCount: 1, observedSourceSetSha256: digest(`observed:${candidate.id}`), surfaceIndexSha256: digest(`index:${candidate.id}`) }, upstreamScanSha256: digest(`upstream:${candidate.id}`), status: "completed-no-match", matchCount: 0, matches: [], truncated: false, automaticRewriteApplied: false, automaticRejectApplied: false, humanDecision: "pending" };
  return { ...unsigned, receiptSelfHash: hashBlindEvaluationArtifact(unsigned) };
}

function hostReceiptFor({ input, evaluatorInputBytes, evaluatorInputPath, resultBytes }) {
  return {
    schemaVersion: "private-hermes-structured-run-receipt/v1",
    role: "blind-pair-commercial-evaluator",
    runId: "host-run-001",
    profileId: "inkos_blind_evaluator",
    profileConfigSha256: input.reviewer.configSha256,
    soulSha256: input.reviewer.soulSha256,
    model: input.reviewer.model,
    provider: "openai-codex",
    readCapabilityTool: "firefly_read_source",
    readCapabilityToolset: "firefly-source-read",
    reasoningEffort: "high",
    runtimeAttestation: "current-attested",
    contentNeutralContractId: input.contentContract.id,
    contentNeutralContractSha256: input.contentContract.sha256,
    contentNeutralSoulSectionSha256: digest("content-neutral-soul-section"),
    compaction: false,
    compression: false,
    truncation: false,
    completed: true,
    completedAt: now,
    promptSha256: digest("prompt"),
    inputDigest: hashBlindEvaluationArtifact(input),
    inputSha256: sha(bytes([{ path: evaluatorInputPath, sha256: sha(evaluatorInputBytes) }])),
    effectiveSystemPromptSha256: digest("system-prompt"),
    contextLimitEntrySha256: digest("context-limit-entry"),
    hermesExecutableSha256: digest("hermes-executable"),
    hermesDelegatedExecutableSha256: digest("hermes-delegated-executable"),
    hermesVersionSha256: digest("hermes-version"),
    hermesImplementationSha256: digest("hermes-implementation"),
    hermesDependencySha256: digest("hermes-dependency"),
    hermesProfileContextSha256: digest("hermes-profile-context"),
    hermesProjectContextSha256: digest("hermes-project-context"),
    hermesRuntimeIdentitySha256: digest("hermes-runtime-identity"),
    readCapabilitySha256: digest("read-capability"),
    readExecutionEnvironmentSha256: digest("read-execution-environment"),
    readExecutionRuntimeIdentitySha256: digest("read-execution-runtime"),
    readManifestSha256: digest("read-manifest"),
    candidateOutputSha256: digest("candidate-output"),
    resultSha256: sha(resultBytes),
    usageSha256: digest("usage"),
    traceSha256: digest("trace"),
    contextBudgetUpperBoundTokens: 12_388,
    contextInputProxyTokens: 100,
    contextLimit: 400_000,
    contextOutputReserveTokens: 12_288,
    cumulativeCacheReadTokens: 0,
    expectedReadCount: 1,
    exactReadCount: 1,
    exactReadSha256s: [sha(evaluatorInputBytes)],
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: 10,
    totalTokens: 120,
    apiCalls: 1,
    cacheWriteTokens: 0,
  };
}

test("prepares bodyless RefLab input from manifest-defined sibling evidence with no lane-to-candidate mapping", async (t) => {
  const value = await fixture(t);
  const result = await prepareBlindReviewPair({ root: value.root, manifest: value.manifest, sourcePair, genre: "modern-fantasy-ko", reviewerActorId: "blind-reviewer", intensityDirectiveSha256: digest("intensity") });
  const input = JSON.parse(await readFile(join(value.reflab, result.input.path), "utf8"));
  assert.equal(result.runnerInvocation.cwd, await realpath(value.reflab));
  assert.equal(result.runnerInvocation.command, "node");
  assert.deepEqual(result.runnerInvocation.args, ["tools/blind-pair-evaluation-runner.mjs", "--input", result.input.path]);
  assert.match(result.runnerCommand, /Run with cwd=.+: node tools\/blind-pair-evaluation-runner\.mjs/u);
  assert.equal(result.evaluatorInputPreflight.maximumByteLength, BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES);
  assert.equal(result.evaluatorInputPreflight.byteLength <= BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES, true);
  assert.equal(input.schemaVersion, "firefly-blind-pair-evaluation-input/v2");
  assert.equal(input.reviewPacket.sha256, sha(value.transferBytes));
  assert.deepEqual(input.producerActors.map((actor) => actor.lane), ["neutral", "soul"]);
  assert.equal(JSON.stringify(input).includes("candidate-A\"\:\"neutral"), false);
  assert.equal(JSON.stringify(input).includes("workOrderId"), false);
  assert.equal(JSON.stringify(input).includes(value.bodies[0]), false);
  const replay = await prepareBlindReviewPair({ root: value.root, manifest: value.manifest, sourcePair, genre: "modern-fantasy-ko", reviewerActorId: "blind-reviewer", intensityDirectiveSha256: digest("intensity") });
  assert.equal(replay.input.publication, "reused");
});

test("accepts current canonical Korean InkOS Book metadata without a final LF", async (t) => {
  const bookId = "회귀한-막내가-그룹의-부실을-독식한다";
  const value = await fixture(t, { bookId });
  const result = await prepareBlindReviewPair({
    root: value.root,
    manifest: value.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  });
  assert.equal(result.input.publication, "written");
  assert.equal(JSON.parse(await readFile(join(value.inkos, "books", bookId, "book.json"), "utf8")).id, bookId);
});

test("accepts legacy canonical InkOS Book metadata with one final LF", async (t) => {
  const value = await fixture(t, { legacyBookFinalLf: true });
  const result = await prepareBlindReviewPair({
    root: value.root,
    manifest: value.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  });
  assert.equal(result.input.publication, "written");
});

test("rejects noncanonical InkOS Book metadata formatting and trailing bytes", async (t) => {
  const rewrites = [
    (book) => JSON.stringify(book),
    (book) => `${JSON.stringify(book, null, 2)} `,
    (book) => `${JSON.stringify(book, null, 2)}\n\n`,
    (book) => `${JSON.stringify(book, null, 2)}\r\n`,
    (book) => `${JSON.stringify(book, null, 2)}\n{}`,
  ];
  for (const rewrite of rewrites) {
    const value = await fixture(t);
    const path = join(value.inkos, "books", "bridge-book", "book.json");
    const book = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, rewrite(book));
    await assert.rejects(() => prepareBlindReviewPair({
      root: value.root,
      manifest: value.manifest,
      sourcePair,
      genre: "modern-fantasy-ko",
      reviewerActorId: "blind-reviewer",
      intensityDirectiveSha256: digest("intensity"),
    }), /canonical InkOS Book JSON bytes|not valid UTF-8 JSON/u);
  }
});

test("keeps blind evidence on the strict final-LF canonical JSON contract", async (t) => {
  const value = await fixture(t);
  const path = join(value.inkos, ".inkos", "canaries", sourcePair, "review", "public", "evaluation-transfer.json");
  const transferBytes = await readFile(path);
  assert.equal(transferBytes.at(-1), 0x0a);
  await writeFile(path, transferBytes.subarray(0, -1));
  await assert.rejects(() => prepareBlindReviewPair({
    root: value.root,
    manifest: value.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /public evaluation transfer must use canonical JSON bytes/u);
});

test("rejects unsafe InkOS Book path segments before reading canonical metadata", async (t) => {
  for (const unsafeBookId of [
    ".", "..", "../escape", "nested/book", "nested\\book", " book", "book ", "book..part", "book:part", "book\npart", "a".repeat(121),
  ]) {
    const value = await fixture(t, { mutateMapping: (mapping) => { mapping.bookId = unsafeBookId; } });
    await assert.rejects(() => prepareBlindReviewPair({
      root: value.root,
      manifest: value.manifest,
      sourcePair,
      genre: "modern-fantasy-ko",
      reviewerActorId: "blind-reviewer",
      intensityDirectiveSha256: digest("intensity"),
    }), /Book ID must be one safe path segment/u, JSON.stringify(unsafeBookId));
  }
});

test("rejects a wrong requested genre before publishing evaluator input", async (t) => {
  const value = await fixture(t);
  await assert.rejects(() => prepareBlindReviewPair({
    root: value.root,
    manifest: value.manifest,
    sourcePair,
    genre: "fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /does not match the canonical InkOS Book genre/u);
  await assert.rejects(() => readFile(join(value.reflab, "exports", "inkos-blind-pairs", sourcePair, "input.json")),
    (error) => error?.code === "ENOENT");
});

test("rejects a rehashed private mapping with an expanded shape or wrong genre Soul", async (t) => {
  const expanded = await fixture(t, { mutateMapping: (mapping) => { mapping.unexpected = "forged"; } });
  await assert.rejects(() => prepareBlindReviewPair({
    root: expanded.root,
    manifest: expanded.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /private mapping fields are invalid/u);

  const crossGenre = await fixture(t, { mutateMapping: (mapping) => { mapping.mappings[1].expectedSoulBinding.soulId = "male-fantasy-ko"; } });
  await assert.rejects(() => prepareBlindReviewPair({
    root: crossGenre.root,
    manifest: crossGenre.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /Soul binding does not match the requested genre/u);
});

test("mirrors InkOS WorkOrder and artifact size limits in the private mapping gate", async (t) => {
  const longWorkOrder = await fixture(t, { mutateMapping: (mapping) => { mapping.mappings[0].workOrderId = `w${"o".repeat(160)}`; } });
  await assert.rejects(() => prepareBlindReviewPair({
    root: longWorkOrder.root,
    manifest: longWorkOrder.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /160-character limit/u);

  const oversizedArtifact = await fixture(t, { mutateMapping: (mapping) => { mapping.mappings[0].chapterArtifact.byteLength = (10 * 1024 * 1024) + 1; } });
  await assert.rejects(() => prepareBlindReviewPair({
    root: oversizedArtifact.root,
    manifest: oversizedArtifact.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /byteLength is invalid/u);
});

test("rejects evaluator inputs above the exact-read byte cap before publishing either RefLab artifact", async (t) => {
  const manyLinesA = Array.from({ length: 18_000 }, (_, index) => `가${index}`).join("\n");
  const manyLinesB = Array.from({ length: 18_000 }, (_, index) => `나${index}`).join("\n");
  const value = await fixture(t, { bodies: [manyLinesA, manyLinesB] });
  await assert.rejects(() => prepareBlindReviewPair({
    root: value.root,
    manifest: value.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /exact-read input exceeds/u);
  await assert.rejects(() => readFile(join(value.reflab, "exports", "inkos-blind-pairs", sourcePair, "evaluation-transfer.json")),
    (error) => error?.code === "ENOENT");
  await assert.rejects(() => readFile(join(value.reflab, "exports", "inkos-blind-pairs", sourcePair, "input.json")),
    (error) => error?.code === "ENOENT");
});

test("rejects an under-source-cap evaluator input that exceeds the exact Hermes context budget before publication", async (t) => {
  const value = await fixture(t, { bodies: [`A${"a".repeat(499_999)}`, `B${"b".repeat(499_999)}`] });
  await assert.rejects(() => prepareBlindReviewPair({
    root: value.root,
    manifest: value.manifest,
    sourcePair,
    genre: "modern-fantasy-ko",
    reviewerActorId: "blind-reviewer",
    intensityDirectiveSha256: digest("intensity"),
  }), /preflight context boundary failed/u);
  await assert.rejects(() => readFile(join(value.reflab, "exports", "inkos-blind-pairs", sourcePair, "evaluation-transfer.json")),
    (error) => error?.code === "ENOENT");
  await assert.rejects(() => readFile(join(value.reflab, "exports", "inkos-blind-pairs", sourcePair, "input.json")),
    (error) => error?.code === "ENOENT");
});

for (const evaluatorProfile of [undefined, {
  model: "gpt-6-astra",
  configSha256: "e75d85c0085769a347820ba9f040e4098112f7ae84aa5c22f82a0b33f6476c27",
  soulSha256: "abd78aa24facfaa885128aa3a995af5e7116d8f1038c856813fec000682bd2d1",
}]) {
test(`imports completed ${evaluatorProfile?.model ?? "legacy Sol"} RefLab evidence with an exact reviewer runtime`, async (t) => {
  const value = await fixture(t, { evaluatorProfile });
  const prepared = await prepareBlindReviewPair({ root: value.root, manifest: value.manifest, sourcePair, genre: "modern-fantasy-ko", reviewerActorId: "blind-reviewer", intensityDirectiveSha256: digest("intensity") });
  const inputBytes = await readFile(join(value.reflab, prepared.input.path));
  const input = JSON.parse(inputBytes.toString("utf8"));
  const contexts = value.transfer.candidates.map((candidate) => ({ ...candidate, evidenceSpans: spans(candidate.body) }));
  const evaluatorInput = { schemaVersion: "private-firefly-blind-pair-evaluator-input/v2", genre: input.genre, pairId: input.pairId, round: input.round, blindRunId: input.blindRunId, pairedGenerationReceiptSha256: input.pairedGenerationReceiptSha256, reviewerRuntime: { configSha256: input.reviewer.configSha256, soulSha256: input.reviewer.soulSha256 }, commonContext: input.commonContext, contentContract: input.contentContract, candidates: contexts, authority: input.authority };
  const evaluatorInputBytes = bytes(evaluatorInput);
  const result = resultFor(input, contexts);
  const resultBytes = bytes(result);
  const scanA = scanFor(contexts[0]);
  const scanB = scanFor(contexts[1]);
  const base = join(value.reflab, "exports", "genre-souls", "male-modern-fantasy-ko", "v1", "blind-reviews", pairId);
  await mkdir(base, { recursive: true });
  const evaluatorInputPath = join(await realpath(base), "evaluator-input.json");
  const host = hostReceiptFor({ input, evaluatorInputBytes, evaluatorInputPath, resultBytes });
  const hostBytes = bytes(host);
  const rebuilt = buildBlindReviewReceiptFromRawEvidence({ input, result, candidateContexts: contexts, evaluatorInputBytes, evaluatorResultBytes: resultBytes, hostReceiptBytes: hostBytes, surfaceScans: [{ receipt: scanA, upstreamScanSha256: scanA.upstreamScanSha256 }, { receipt: scanB, upstreamScanSha256: scanB.upstreamScanSha256 }] });
  await writeFile(evaluatorInputPath, evaluatorInputBytes, { flag: "wx" });
  await writeFile(join(base, "result.json"), resultBytes, { flag: "wx" });
  await writeJson(join(base, "surface-scan-candidate-A.json"), scanA);
  await writeJson(join(base, "surface-scan-candidate-B.json"), scanB);
  await writeJson(join(value.reflab, "analyses", "genre_souls", "male-modern-fantasy-ko", "v1", "blind-reviews", `${pairId}.json`), rebuilt);
  const attempt = "attempt-bridge-evidence";
  await mkdir(join(base, "hermes-run", "attempts", attempt), { recursive: true });
  await writeFile(join(base, "hermes-run", "attempts", attempt, "host-receipt.json"), hostBytes, { flag: "wx" });
  const attemptCompletionBytes = await writeJson(join(base, "hermes-run", "attempts", attempt, "completed.json"), {
    schemaVersion: "private-hermes-structured-attempt-completion/v1",
    role: "blind-pair-commercial-evaluator",
    attemptId: attempt,
    runId: host.runId,
    hostReceiptSha256: sha(hostBytes),
    completed: true,
  });
  await writeJson(join(base, "hermes-run", "completed.json"), { schemaVersion: "private-hermes-structured-completed-pointer/v1", role: "blind-pair-commercial-evaluator", attempt: `attempts/${attempt}`, attemptCompletionSha256: sha(attemptCompletionBytes), hostReceiptSha256: sha(hostBytes) });
  const imported = await importBlindReviewEvidence({ root: value.root, manifest: value.manifest, sourcePair, genre: "modern-fantasy-ko" });
  assert.equal(imported.materializeInvocation.cwd, await realpath(value.inkos));
  assert.equal(imported.materializeInvocation.command, "node");
  assert.deepEqual(imported.materializeInvocation.args.slice(0, 3), ["packages/cli/dist/index.js", "review", "materialize-blind-pair"]);
  assert.deepEqual(imported.materializeInvocation.args.slice(3), [
    "--pair", sourcePair,
    "--review-input", imported.downstream.reviewInput,
    "--evaluator-input", imported.downstream.evaluatorInput,
    "--evaluation-result", imported.downstream.evaluationResult,
    "--evaluator-host-receipt", imported.downstream.evaluatorHostReceipt,
    "--review-receipt", imported.downstream.reviewReceipt,
    "--surface-a", imported.downstream.surfaceA,
    "--surface-b", imported.downstream.surfaceB,
  ]);
  assert.match(imported.materializeCommand, /Run with cwd=.+: node packages\/cli\/dist\/index\.js review materialize-blind-pair/u);
  assert.equal(await readFile(join(value.inkos, imported.downstream.reviewInput), "utf8"), inputBytes.toString("utf8"));
  assert.equal(await readFile(join(value.inkos, imported.downstream.evaluatorInput), "utf8"), evaluatorInputBytes.toString("utf8"));
  assert.equal(await readFile(join(value.inkos, ".inkos", "canaries", sourcePair, "review", "reflab", "attempt-completed.json"), "utf8"), attemptCompletionBytes.toString("utf8"));
  assert.equal(JSON.parse(await readFile(join(value.inkos, ".inkos", "canaries", sourcePair, "review", "reflab", "bridge-receipt.json"), "utf8")).authority.mayWriteInkOSCanon, false);
  // Even a fully resealed host receipt cannot replace the input-bound model.
  const wrongHostBytes = bytes({ ...host, model: host.model === "gpt-6-astra" ? "gpt-5.6-sol" : "gpt-6-astra" });
  await writeFile(join(base, "hermes-run", "attempts", attempt, "host-receipt.json"), wrongHostBytes);
  const wrongCompletionBytes = await writeJson(join(base, "hermes-run", "attempts", attempt, "completed.json"), { schemaVersion: "private-hermes-structured-attempt-completion/v1", role: "blind-pair-commercial-evaluator", attemptId: attempt, runId: host.runId, hostReceiptSha256: sha(wrongHostBytes), completed: true });
  await writeJson(join(base, "hermes-run", "completed.json"), { schemaVersion: "private-hermes-structured-completed-pointer/v1", role: "blind-pair-commercial-evaluator", attempt: `attempts/${attempt}`, attemptCompletionSha256: sha(wrongCompletionBytes), hostReceiptSha256: sha(wrongHostBytes) });
  await assert.rejects(importBlindReviewEvidence({ root: value.root, manifest: value.manifest, sourcePair, genre: "modern-fantasy-ko" }), /bound reviewer/);
});
}

test("refuses a symbolic-link source artifact", async (t) => {
  const value = await fixture(t);
  const transferPath = join(value.inkos, ".inkos", "canaries", sourcePair, "review", "public", "evaluation-transfer.json");
  const linked = `${transferPath}.linked`;
  await symlink(transferPath, linked);
  await rm(transferPath);
  await symlink(linked, transferPath);
  await assert.rejects(() => prepareBlindReviewPair({ root: value.root, manifest: value.manifest, sourcePair, genre: "modern-fantasy-ko", reviewerActorId: "blind-reviewer", intensityDirectiveSha256: digest("intensity") }), /symbolic-link/u);
});
