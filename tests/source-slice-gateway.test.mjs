import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertLoopbackGatewayHost, handleSourceSliceRequest, invokeReferenceResolver, verifyStoryyardGrant } from "../scripts/source-slice-gateway-lib.mjs";
import { readJson } from "../scripts/edge-lib.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const base64url = (value) => Buffer.from(value).toString("base64url");

function fixturePacket(rawSource) {
  const candidateBody = "후보의 압박 장면이 시작된다.";
  const candidateText = "압박 장면";
  const charStart = candidateBody.indexOf(candidateText);
  const candidateStart = Buffer.byteLength(candidateBody.slice(0, charStart));
  const candidateEnd = candidateStart + Buffer.byteLength(candidateText);
  const candidateSha = hash(candidateBody);
  const source = {
    coordinateKind: "utf8-byte", sourceId: "gdrive-source-one", sourceSha256: hash(`whole-${rawSource}`),
    startByte: 120, endByte: 120 + Buffer.byteLength(rawSource), sliceSha256: hash(rawSource),
  };
  const selectorBody = {
    provenanceBridgeReceiptSha256: hash("bridge"), matchMethod: "exact-byte-120",
    candidate: {
      coordinateKind: "utf8-byte", candidateContentSha256: candidateSha,
      startByte: candidateStart, endByte: candidateEnd, candidateSliceSha256: hash(candidateText),
    },
    source,
  };
  const selectorSha256 = hash(JSON.stringify(selectorBody));
  const match = { matchId: `fsm-${selectorSha256.slice(0, 24)}`, selectorSha256, ...selectorBody, classification: "pending" };
  const body = {
    source: { system: "inkos", bookId: "book-one", sourceRevision: "rev-one" },
    work: { id: "book-one", title: "작품", genre: "현대판타지", status: "active", targetChapters: 200 },
    artifact: { id: "chapter-0001", kind: "chapter", chapterNumber: 1, title: "첫 화", status: "ready-for-review", currentContent: "현재 원고", currentContentSha256: hash("현재 원고") },
    comparison: {},
    candidates: [{ id: "candidate-A", body: candidateBody, sha256: candidateSha, review: { surfaceComparison: { surfaceMatches: [match] } } }],
    sealedGenerationEvidence: {}, recommendation: null, actions: ["approve", "polish", "hold", "reject"],
    authority: { canon: "inkos", decisionSurface: "storyyard", apply: "inkos", reverseSync: false },
  };
  const generatedAt = "2026-08-28T06:00:00.000Z";
  const packetSha256 = hash(JSON.stringify({ generatedAt, ...body }));
  return {
    packet: { schemaVersion: "firefly_review_packet/v2", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, generatedAt, ...body },
    match,
  };
}

function signedGrant(privateKey, keyId, claims) {
  const header = base64url(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: keyId }));
  const payload = base64url(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
}

test("verifies an exact one-time Storyyard grant and keeps raw source out of host receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-gateway-"));
  try {
    const packetDirectory = join(root, "packets");
    const jtiDirectory = join(root, "jti");
    const receiptDirectory = join(root, "receipts");
    await mkdir(packetDirectory, { recursive: true });
    const rawSource = "원문 표면 겹침";
    const { packet, match } = fixturePacket(rawSource);
    await writeFile(join(packetDirectory, `${packet.packetId}.json`), `${JSON.stringify(packet, null, 2)}\n`);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicJwk = publicKey.export({ format: "jwk" });
    const keyId = "storyyard-source-20260828";
    const now = 1_787_900_000;
    const claims = {
      iss: "storyyard", aud: "firefly-hq-source-slice", sub: "owner-one", authenticatedRole: "admin",
      ownerScope: "owner-scope", iat: now, exp: now + 60, jti: "jti-one",
      requestId: "11111111-1111-4111-8111-111111111111", packetId: packet.packetId,
      packetSha256: packet.packetSha256, matchId: match.matchId, selectorSha256: match.selectorSha256,
      coordinateKind: match.source.coordinateKind, sourceId: match.source.sourceId, sourceSha256: match.source.sourceSha256,
      startByte: match.source.startByte, endByte: match.source.endByte, expectedSliceSha256: match.source.sliceSha256,
      maxBytes: 32_768,
    };
    const token = signedGrant(privateKey, keyId, claims);
    const manifest = await readJson(new URL("../config/edge-repos.json", import.meta.url));
    const invokeResolver = async () => ({
      bytes: Buffer.from(rawSource), stdout: Buffer.from("{}"), stderr: Buffer.alloc(0),
      receipt: {
        schemaVersion: "source-access-receipt/v1", requestId: claims.requestId, actorId: claims.sub,
        actorRole: "admin", ownerScope: claims.ownerScope, verifiedGrantSha256: hash(token),
        packetId: claims.packetId, packetSha256: claims.packetSha256, matchId: claims.matchId,
        selectorSha256: claims.selectorSha256, sourceId: claims.sourceId, sourceSha256: claims.sourceSha256,
        startByte: claims.startByte, endByte: claims.endByte, returnedByteCount: Buffer.byteLength(rawSource),
        sliceSha256: claims.expectedSliceSha256, trackedRegistryReceiptSha256: hash("receipt"),
        actualPrivateRegistrySha256: hash("registry"), repositoryCommit: "1".repeat(40), result: "provided",
        resolvedAt: "2026-08-28T06:30:00.000Z", rawSourcePersisted: false,
      },
    });
    const options = {
      root, manifest, publicJwk, keyId, ownerScope: claims.ownerScope, nowSeconds: now,
      packetDirectory, jtiDirectory, receiptDirectory,
      buildWorkOrder: async () => ({}), invokeResolver,
    };
    const result = await handleSourceSliceRequest({ token, serviceHeader: "storyyard/v1" }, options);
    assert.equal(result.bytes.toString("utf8"), rawSource);
    const persisted = await readFile(join(receiptDirectory, `${claims.requestId}.json`), "utf8");
    assert.equal(persisted.includes(rawSource), false);
    assert.match(persisted, /source-access-receipt\/v1/u);
    await assert.rejects(() => handleSourceSliceRequest({ token, serviceHeader: "storyyard/v1" }, options), (error) => error.code === "SIGNED_GRANT_REPLAY");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a tampered grant and owner-scope drift", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const keyId = "key-one";
  const claims = {
    iss: "storyyard", aud: "firefly-hq-source-slice", sub: "owner", authenticatedRole: "admin", ownerScope: "scope",
    iat: 100, exp: 160, jti: "jti", requestId: "request", packetId: "frp-1234567890abcdef12345678",
    packetSha256: hash("packet"), matchId: "fsm-1234567890abcdef12345678", selectorSha256: hash("selector"),
    coordinateKind: "utf8-byte", sourceId: "source", sourceSha256: hash("source"), startByte: 0, endByte: 12,
    expectedSliceSha256: hash("slice"), maxBytes: 32_768,
  };
  const token = signedGrant(privateKey, keyId, claims);
  assert.equal(verifyStoryyardGrant(token, { publicJwk: publicKey.export({ format: "jwk" }), keyId, ownerScope: "scope", nowSeconds: 120 }).claims.jti, "jti");
  const parts = token.split(".");
  const changedSignature = Buffer.from(parts[2], "base64url");
  changedSignature[0] ^= 1;
  const tampered = `${parts[0]}.${parts[1]}.${changedSignature.toString("base64url")}`;
  assert.throws(() => verifyStoryyardGrant(tampered, { publicJwk: publicKey.export({ format: "jwk" }), keyId, ownerScope: "scope", nowSeconds: 120 }), /signature/u);
  assert.throws(() => verifyStoryyardGrant(token, { publicJwk: publicKey.export({ format: "jwk" }), keyId, ownerScope: "other", nowSeconds: 120 }), /authority/u);
});

test("terminates a resolver that exceeds its time or output boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-resolver-boundary-"));
  try {
    await writeFile(join(root, "hang.mjs"), "setInterval(() => {}, 1_000);\n");
    await writeFile(join(root, "oversize.mjs"), "process.stdout.write('x'.repeat(70 * 1024));\n");
    const plan = (entrypoint) => ({ repoRoot: root, repo: { execution: { entrypoint } }, workOrder: {} });
    await assert.rejects(
      () => invokeReferenceResolver(plan("hang.mjs"), { timeoutMs: 50 }),
      (error) => error.code === "REFERENCE_RESOLVER_TIMEOUT",
    );
    await assert.rejects(
      () => invokeReferenceResolver(plan("oversize.mjs"), { timeoutMs: 1_000 }),
      (error) => error.code === "REFERENCE_CHANNEL_OVERSIZE",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires the plaintext source gateway to stay on an explicit loopback address", () => {
  assert.equal(assertLoopbackGatewayHost("127.0.0.1"), "127.0.0.1");
  assert.equal(assertLoopbackGatewayHost("::1"), "::1");
  assert.throws(() => assertLoopbackGatewayHost("0.0.0.0"), (error) => error.code === "GATEWAY_HOST_NOT_LOOPBACK");
  assert.throws(() => assertLoopbackGatewayHost("localhost"), (error) => error.code === "GATEWAY_HOST_NOT_LOOPBACK");
});
