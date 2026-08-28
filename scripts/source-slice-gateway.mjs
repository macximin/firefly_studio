#!/usr/bin/env node
import { createServer } from "node:http";
import { assertLoopbackGatewayHost, handleSourceSliceRequest } from "./source-slice-gateway-lib.mjs";

const host = assertLoopbackGatewayHost(process.env.FIREFLY_SOURCE_GATEWAY_HOST?.trim() || "127.0.0.1");
const port = Number(process.env.FIREFLY_SOURCE_GATEWAY_PORT ?? 8789);
const publicJwk = process.env.FIREFLY_SOURCE_GRANT_PUBLIC_JWK?.trim() ?? "";
const keyId = process.env.FIREFLY_SOURCE_GRANT_KEY_ID?.trim() ?? "";
const ownerScope = process.env.FIREFLY_OWNER_SCOPE?.trim() ?? "";
if (!Number.isInteger(port) || port < 1 || port > 65535 || !publicJwk || !keyId || !ownerScope) {
  throw new Error("Source gateway requires a valid port, public JWK, key ID, and owner scope.");
}

const noStore = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache" };
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/private-source-slice") {
    response.writeHead(404, { ...noStore, "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
    return;
  }
  const authorization = request.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  try {
    const result = await handleSourceSliceRequest({
      token,
      serviceHeader: request.headers["x-firefly-storyyard-service"],
    }, { publicJwk, keyId, ownerScope });
    response.writeHead(200, {
      ...noStore,
      "content-type": "text/plain; charset=utf-8",
      "content-length": String(result.bytes.byteLength),
      "x-firefly-slice-sha256": result.receipt.sliceSha256,
      "x-firefly-access-receipt-sha256": result.receiptSha256,
    });
    response.end(result.bytes);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    response.writeHead(status, { ...noStore, "content-type": "application/json" });
    response.end(JSON.stringify({ error: error?.code ?? "SOURCE_GATEWAY_FAILED" }));
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Firefly source-slice gateway listening on http://${host}:${port}\n`);
});
