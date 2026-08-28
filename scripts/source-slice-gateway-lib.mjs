import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, validateManifest } from "./edge-lib.mjs";

const SHA = /^[0-9a-f]{64}$/u;
const PACKET_ID = /^frp-[0-9a-f]{24}$/u;
const MATCH_ID = /^fsm-[0-9a-f]{24}$/u;
const MAX_RAW_BYTES = 32_768;
const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

export function assertLoopbackGatewayHost(host) {
  if (host !== "127.0.0.1" && host !== "::1") {
    throw gatewayError(500, "GATEWAY_HOST_NOT_LOOPBACK", "Source gateway must bind to an explicit loopback address behind TLS.");
  }
  return host;
}

export function verifyStoryyardGrant(token, options) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) throw gatewayError(401, "SIGNED_GRANT_INVALID", "Signed source grant is invalid.");
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw gatewayError(401, "SIGNED_GRANT_INVALID", "Signed source grant is invalid.");
  }
  if (!isObject(header) || Object.keys(header).sort().join(",") !== "alg,kid,typ"
    || header.alg !== "EdDSA" || header.typ !== "JWT" || header.kid !== options.keyId) {
    throw gatewayError(401, "SIGNED_GRANT_HEADER_INVALID", "Signed source grant header is invalid.");
  }
  let publicJwk;
  try { publicJwk = typeof options.publicJwk === "string" ? JSON.parse(options.publicJwk) : options.publicJwk; }
  catch { throw gatewayError(500, "GATEWAY_KEY_INVALID", "Gateway verification key is invalid."); }
  if (!isObject(publicJwk) || publicJwk.kty !== "OKP" || publicJwk.crv !== "Ed25519" || typeof publicJwk.x !== "string" || "d" in publicJwk) {
    throw gatewayError(500, "GATEWAY_KEY_INVALID", "Gateway verification key is invalid.");
  }
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifySignature(null, Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: publicJwk, format: "jwk" }), signature)) {
    throw gatewayError(401, "SIGNED_GRANT_SIGNATURE_INVALID", "Signed source grant signature is invalid.");
  }
  const expectedKeys = ["iss", "aud", "sub", "authenticatedRole", "ownerScope", "iat", "exp", "jti", "requestId", "packetId", "packetSha256", "matchId", "selectorSha256", "coordinateKind", "sourceId", "sourceSha256", "startByte", "endByte", "expectedSliceSha256", "maxBytes"];
  if (!isObject(claims) || Object.keys(claims).sort().join("\0") !== expectedKeys.sort().join("\0")) {
    throw gatewayError(401, "SIGNED_GRANT_CLAIMS_INVALID", "Signed source grant claims are invalid.");
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== "storyyard" || claims.aud !== "firefly-hq-source-slice" || claims.authenticatedRole !== "admin"
    || claims.ownerScope !== options.ownerScope || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)
    || claims.iat > now + 5 || claims.exp < now || claims.exp > claims.iat + 60) {
    throw gatewayError(403, "SIGNED_GRANT_AUTHORITY_INVALID", "Signed source grant authority or expiry is invalid.");
  }
  for (const key of ["sub", "ownerScope", "jti", "requestId", "sourceId"]) if (typeof claims[key] !== "string" || !claims[key]) throw gatewayError(401, "SIGNED_GRANT_CLAIMS_INVALID", `Signed source grant ${key} is invalid.`);
  if (!PACKET_ID.test(claims.packetId) || !MATCH_ID.test(claims.matchId)) throw gatewayError(401, "SIGNED_GRANT_CLAIMS_INVALID", "Signed source grant identities are invalid.");
  for (const key of ["packetSha256", "selectorSha256", "sourceSha256", "expectedSliceSha256"]) if (!SHA.test(String(claims[key]))) throw gatewayError(401, "SIGNED_GRANT_CLAIMS_INVALID", `Signed source grant ${key} is invalid.`);
  if (claims.coordinateKind !== "utf8-byte" || !Number.isInteger(claims.startByte) || claims.startByte < 0
    || !Number.isInteger(claims.endByte) || claims.endByte <= claims.startByte
    || !Number.isInteger(claims.maxBytes) || claims.maxBytes < 1 || claims.maxBytes > MAX_RAW_BYTES
    || claims.endByte - claims.startByte > claims.maxBytes) {
    throw gatewayError(401, "SIGNED_GRANT_RANGE_INVALID", "Signed source grant byte range is invalid.");
  }
  return { claims, verifiedGrantSha256: sha256(token) };
}

export async function readBoundSurfaceSelector(packetDirectory, claims) {
  const directory = resolve(packetDirectory);
  const packetPath = resolve(directory, `${claims.packetId}.json`);
  if (!inside(directory, packetPath)) throw gatewayError(400, "PACKET_PATH_INVALID", "Review packet path is invalid.");
  let packet;
  try { packet = JSON.parse(await readFile(packetPath, "utf8")); }
  catch { throw gatewayError(404, "PACKET_NOT_FOUND", "Review packet is not registered in the HQ gateway."); }
  if (!isObject(packet) || packet.schemaVersion !== "firefly_review_packet/v2" || packet.packetId !== claims.packetId
    || packet.packetSha256 !== claims.packetSha256 || !Array.isArray(packet.candidates)) {
    throw gatewayError(409, "PACKET_IDENTITY_MISMATCH", "Review packet identity differs from the signed grant.");
  }
  const { schemaVersion: _schemaVersion, packetId, packetSha256, generatedAt: _generatedAt, ...body } = packet;
  const actualPacketSha = sha256(JSON.stringify(body));
  if (actualPacketSha !== packetSha256 || packetId !== `frp-${actualPacketSha.slice(0, 24)}`) {
    throw gatewayError(409, "PACKET_HASH_MISMATCH", "Review packet SHA-256 is invalid.");
  }
  const found = [];
  for (const candidate of packet.candidates) {
    if (!isObject(candidate) || typeof candidate.body !== "string" || !SHA.test(String(candidate.sha256)) || sha256(candidate.body) !== candidate.sha256) {
      throw gatewayError(409, "CANDIDATE_HASH_MISMATCH", "Review packet candidate SHA-256 is invalid.");
    }
    const matches = candidate.review?.surfaceComparison?.surfaceMatches;
    if (!Array.isArray(matches)) throw gatewayError(409, "SURFACE_SELECTOR_INVALID", "Review packet surface selectors are invalid.");
    for (const match of matches) if (match?.matchId === claims.matchId) found.push({ candidate, match });
  }
  if (found.length !== 1) throw gatewayError(409, "SURFACE_SELECTOR_AMBIGUOUS", "Signed surface match does not resolve exactly once.");
  const { candidate, match } = found[0];
  const selectorBody = {
    provenanceBridgeReceiptSha256: match.provenanceBridgeReceiptSha256,
    matchMethod: match.matchMethod,
    candidate: match.candidate,
    source: match.source,
  };
  const actualSelectorSha = sha256(JSON.stringify(selectorBody));
  if (match.classification !== "pending" || match.selectorSha256 !== actualSelectorSha
    || match.matchId !== `fsm-${actualSelectorSha.slice(0, 24)}`) {
    throw gatewayError(409, "SURFACE_SELECTOR_HASH_MISMATCH", "Surface selector SHA-256 is invalid.");
  }
  const candidateSelector = match.candidate;
  const candidateBytes = Buffer.from(candidate.body, "utf8");
  if (candidateSelector?.coordinateKind !== "utf8-byte" || candidateSelector.candidateContentSha256 !== candidate.sha256
    || !Number.isInteger(candidateSelector.startByte) || !Number.isInteger(candidateSelector.endByte)
    || candidateSelector.endByte <= candidateSelector.startByte || candidateSelector.endByte > candidateBytes.byteLength
    || sha256(candidateBytes.subarray(candidateSelector.startByte, candidateSelector.endByte)) !== candidateSelector.candidateSliceSha256) {
    throw gatewayError(409, "CANDIDATE_SELECTOR_MISMATCH", "Candidate selector does not match the candidate bytes.");
  }
  const source = match.source;
  const exact = [
    [claims.selectorSha256, match.selectorSha256], [claims.coordinateKind, source.coordinateKind],
    [claims.sourceId, source.sourceId], [claims.sourceSha256, source.sourceSha256],
    [claims.startByte, source.startByte], [claims.endByte, source.endByte],
    [claims.expectedSliceSha256, source.sliceSha256], [claims.maxBytes, MAX_RAW_BYTES],
  ];
  if (exact.some(([left, right]) => left !== right)) throw gatewayError(409, "GRANT_SELECTOR_MISMATCH", "Signed grant fields differ from the host packet selector.");
  return { packet, match, packetPath };
}

export async function reserveJti(directory, claims, verifiedGrantSha256) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${sha256(claims.jti)}.json`);
  let handle;
  try { handle = await open(path, "wx", 0o600); }
  catch (error) {
    if (error?.code === "EEXIST") throw gatewayError(409, "SIGNED_GRANT_REPLAY", "Signed source grant was already consumed.");
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ requestId: claims.requestId, packetId: claims.packetId, matchId: claims.matchId, verifiedGrantSha256, consumedAt: new Date().toISOString() })}\n`);
  } finally { await handle.close(); }
  return path;
}

export async function buildSourceSliceWorkOrder({ root, manifest, claims, verifiedGrantSha256, selector }) {
  const repo = manifest.repos.find((item) => item.name === "firefly_reference_lab");
  if (!repo || repo.execution?.kind !== "tool" || repo.execution.adapter !== "reference-lab-read-v1"
    || repo.execution.entrypoint !== "tools/private-source-slice.mjs"
    || repo.execution.receiptContract !== "source-access-receipt/v1") {
    throw gatewayError(500, "REFERENCE_TOOL_NOT_CONFIGURED", "Reference Lab source resolver is not configured.");
  }
  const capability = repo.execution.capabilities?.find((item) => item.name === "private-source-slice");
  if (capability?.mode !== "read-only" || capability.approval !== "human") throw gatewayError(500, "REFERENCE_TOOL_AUTHORITY_INVALID", "Reference Lab source resolver authority is invalid.");
  const repoRoot = await realpath(resolve(root, repo.path));
  if (!inside(root, repoRoot)) throw gatewayError(500, "REFERENCE_TOOL_PATH_INVALID", "Reference Lab path escaped the HQ.");
  const receiptPath = "evidence/genre-souls/male-source-registry-receipt.v1.json";
  const receiptBytes = await readFile(join(repoRoot, receiptPath));
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  if (receipt.schemaVersion !== "source-registry-receipt/v1" || typeof receipt.privateRegistryPath !== "string" || !SHA.test(String(receipt.privateRegistrySha256))) {
    throw gatewayError(500, "SOURCE_REGISTRY_RECEIPT_INVALID", "Reference Lab source registry receipt is invalid.");
  }
  const { stdout } = await runProcess("git", ["rev-parse", "HEAD"], repoRoot, { stdoutLimit: 128, stderrLimit: 1024 });
  const commit = stdout.toString("utf8").trim();
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw gatewayError(500, "REFERENCE_COMMIT_INVALID", "Reference Lab commit readback is invalid.");
  return {
    repo,
    repoRoot,
    workOrder: {
      schemaVersion: 2,
      workOrderId: crypto.randomUUID(),
      repo: "firefly_reference_lab",
      capability: "private-source-slice",
      executionMode: "human-source-review",
      approvalMode: "human",
      adapterContract: "reference-source-slice/v1",
      sourceSlice: {
        requestId: claims.requestId, packetId: claims.packetId, packetSha256: claims.packetSha256,
        matchId: claims.matchId, selectorSha256: claims.selectorSha256,
        selector: {
          coordinateKind: selector.coordinateKind, sourceId: selector.sourceId, sourceSha256: selector.sourceSha256,
          startByte: selector.startByte, endByte: selector.endByte, expectedSliceSha256: selector.sliceSha256,
        },
        maxBytes: claims.maxBytes,
      },
      sourceRegistry: {
        receiptRepo: "firefly_reference_lab", receiptCommit: commit, receiptPath,
        receiptSha256: sha256(receiptBytes), privateRegistryPath: receipt.privateRegistryPath,
        declaredPrivateRegistrySha256: receipt.privateRegistrySha256,
      },
      grant: {
        issuer: claims.iss, audience: claims.aud, actorId: claims.sub, authenticatedRole: claims.authenticatedRole,
        ownerScope: claims.ownerScope, requestId: claims.requestId, packetId: claims.packetId,
        packetSha256: claims.packetSha256, matchId: claims.matchId, selectorSha256: claims.selectorSha256,
        coordinateKind: claims.coordinateKind, sourceId: claims.sourceId, sourceSha256: claims.sourceSha256,
        startByte: claims.startByte, endByte: claims.endByte, expectedSliceSha256: claims.expectedSliceSha256,
        maxBytes: claims.maxBytes, expiresAt: new Date(claims.exp * 1000).toISOString(), jti: claims.jti,
        verifiedGrantSha256,
      },
    },
  };
}

export async function invokeReferenceResolver(plan, options = {}) {
  const entrypoint = resolve(plan.repoRoot, plan.repo.execution.entrypoint);
  if (!inside(plan.repoRoot, entrypoint)) throw gatewayError(500, "REFERENCE_ENTRYPOINT_INVALID", "Reference Lab entrypoint escaped its repository.");
  const child = spawn(process.execPath, [entrypoint], {
    cwd: plan.repoRoot,
    stdio: ["pipe", "pipe", "pipe", "pipe"],
    env: { PATH: process.env.PATH, LANG: process.env.LANG ?? "en_US.UTF-8" },
  });
  const stdoutPromise = collectStream(child.stdout, MAX_STDOUT_BYTES, "resolver stdout");
  const stderrPromise = collectStream(child.stderr, MAX_STDERR_BYTES, "resolver stderr");
  const rawPromise = collectStream(child.stdio[3], MAX_RAW_BYTES, "resolver fd3");
  child.stdin.end(JSON.stringify(plan.workOrder));
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, options.timeoutMs ?? 5_000);
  const exitPromise = new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", resolvePromise);
  });
  let exitCode;
  let stdout;
  let stderr;
  let bytes;
  try {
    [exitCode, stdout, stderr, bytes] = await Promise.all([exitPromise, stdoutPromise, stderrPromise, rawPromise]);
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  if (timedOut) throw gatewayError(504, "REFERENCE_RESOLVER_TIMEOUT", "Reference Lab resolver exceeded its execution limit.");
  if (exitCode !== 0) {
    let message = "Reference Lab resolver rejected the request.";
    try { message = JSON.parse(stderr.toString("utf8")).error ?? message; } catch { /* sanitized fallback */ }
    throw gatewayError(409, "REFERENCE_RESOLVER_REJECTED", message);
  }
  let receipt;
  try { receipt = JSON.parse(stdout.toString("utf8")); }
  catch { throw gatewayError(500, "REFERENCE_RECEIPT_INVALID", "Reference Lab resolver receipt is invalid."); }
  return { bytes, receipt, stdout, stderr };
}

export async function handleSourceSliceRequest(input, options = {}) {
  if (input.serviceHeader !== "storyyard/v1") throw gatewayError(403, "STORYYARD_SERVICE_INVALID", "Storyyard service identity is invalid.");
  const root = resolve(options.root ?? dirname(dirname(fileURLToPath(import.meta.url))));
  const manifest = options.manifest ?? await readJson(join(root, "config", "edge-repos.json"));
  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length) throw gatewayError(500, "MANIFEST_INVALID", manifestErrors.join("; "));
  const { claims, verifiedGrantSha256 } = verifyStoryyardGrant(input.token, {
    publicJwk: options.publicJwk,
    keyId: options.keyId,
    ownerScope: options.ownerScope,
    nowSeconds: options.nowSeconds,
  });
  const packetDirectory = resolve(options.packetDirectory ?? join(root, ".firefly", "review-packets"));
  const { match } = await readBoundSurfaceSelector(packetDirectory, claims);
  await reserveJti(resolve(options.jtiDirectory ?? join(root, ".firefly", "source-slice-jti")), claims, verifiedGrantSha256);
  const plan = options.buildWorkOrder
    ? await options.buildWorkOrder({ root, manifest, claims, verifiedGrantSha256, selector: match.source })
    : await buildSourceSliceWorkOrder({ root, manifest, claims, verifiedGrantSha256, selector: match.source });
  const resolved = options.invokeResolver ? await options.invokeResolver(plan) : await invokeReferenceResolver(plan);
  if (!Buffer.isBuffer(resolved.bytes) || resolved.bytes.byteLength < 1 || resolved.bytes.byteLength > claims.maxBytes
    || sha256(resolved.bytes) !== claims.expectedSliceSha256) {
    throw gatewayError(409, "REFERENCE_SLICE_HASH_MISMATCH", "Reference Lab slice differs from the signed selector.");
  }
  try { new TextDecoder("utf-8", { fatal: true }).decode(resolved.bytes); }
  catch { throw gatewayError(409, "REFERENCE_SLICE_ENCODING_INVALID", "Reference Lab slice is not aligned UTF-8."); }
  const receiptText = JSON.stringify(resolved.receipt);
  if (resolved.bytes.byteLength >= 8 && (Buffer.from(receiptText).includes(resolved.bytes) || resolved.stdout?.includes(resolved.bytes) || resolved.stderr?.includes(resolved.bytes))) {
    throw gatewayError(500, "RAW_SOURCE_LEAK_DETECTED", "Private source bytes appeared outside the sensitive channel.");
  }
  validateAccessReceipt(resolved.receipt, claims, verifiedGrantSha256);
  const receiptDirectory = resolve(options.receiptDirectory ?? join(root, ".firefly", "source-access-receipts"));
  await mkdir(receiptDirectory, { recursive: true, mode: 0o700 });
  const receiptPath = join(receiptDirectory, `${claims.requestId}.json`);
  const handle = await open(receiptPath, "wx", 0o600).catch((error) => {
    if (error?.code === "EEXIST") throw gatewayError(409, "SOURCE_RECEIPT_EXISTS", "Source access receipt already exists.");
    throw error;
  });
  try { await handle.writeFile(`${JSON.stringify(resolved.receipt, null, 2)}\n`); } finally { await handle.close(); }
  return { bytes: resolved.bytes, receipt: resolved.receipt, receiptSha256: sha256(`${JSON.stringify(resolved.receipt, null, 2)}\n`) };
}

function validateAccessReceipt(receipt, claims, verifiedGrantSha256) {
  if (!isObject(receipt) || receipt.schemaVersion !== "source-access-receipt/v1" || receipt.result !== "provided"
    || receipt.rawSourcePersisted !== false || receipt.requestId !== claims.requestId || receipt.actorId !== claims.sub
    || receipt.actorRole !== "admin" || receipt.ownerScope !== claims.ownerScope
    || receipt.verifiedGrantSha256 !== verifiedGrantSha256 || receipt.packetId !== claims.packetId
    || receipt.packetSha256 !== claims.packetSha256 || receipt.matchId !== claims.matchId
    || receipt.selectorSha256 !== claims.selectorSha256 || receipt.sourceId !== claims.sourceId
    || receipt.sourceSha256 !== claims.sourceSha256 || receipt.startByte !== claims.startByte
    || receipt.endByte !== claims.endByte || receipt.returnedByteCount !== claims.endByte - claims.startByte
    || receipt.sliceSha256 !== claims.expectedSliceSha256) {
    throw gatewayError(409, "REFERENCE_RECEIPT_MISMATCH", "Reference Lab receipt differs from the signed request.");
  }
  for (const key of ["trackedRegistryReceiptSha256", "actualPrivateRegistrySha256"]) if (!SHA.test(String(receipt[key]))) throw gatewayError(409, "REFERENCE_RECEIPT_INVALID", `Reference Lab receipt ${key} is invalid.`);
  if (!/^[0-9a-f]{40}$/u.test(String(receipt.repositoryCommit)) || !Number.isFinite(Date.parse(receipt.resolvedAt))) throw gatewayError(409, "REFERENCE_RECEIPT_INVALID", "Reference Lab receipt provenance is invalid.");
}

async function collectStream(stream, limit, label) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw gatewayError(500, "REFERENCE_CHANNEL_OVERSIZE", `${label} exceeded its byte limit.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function runProcess(command, args, cwd, limits) {
  const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const stdoutPromise = collectStream(child.stdout, limits.stdoutLimit, `${command} stdout`);
  const stderrPromise = collectStream(child.stderr, limits.stderrLimit, `${command} stderr`);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, limits.timeoutMs ?? 5_000);
  const exitPromise = new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", resolvePromise);
  });
  let exitCode;
  let stdout;
  let stderr;
  try {
    [exitCode, stdout, stderr] = await Promise.all([exitPromise, stdoutPromise, stderrPromise]);
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  if (timedOut) throw gatewayError(504, "HOST_READBACK_TIMEOUT", `${command} exceeded its execution limit.`);
  if (exitCode !== 0) throw gatewayError(500, "HOST_READBACK_FAILED", stderr.toString("utf8").trim() || `${command} failed.`);
  return { stdout, stderr };
}

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function gatewayError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
