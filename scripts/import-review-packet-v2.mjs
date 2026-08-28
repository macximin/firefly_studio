import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: node scripts/import-review-packet-v2.mjs <InkOS packet.json>");
const raw = await readFile(sourcePath, "utf8");
const packet = JSON.parse(raw);
if (packet?.schemaVersion !== "firefly_review_packet/v2" || !/^frp-[0-9a-f]{24}$/u.test(packet.packetId)
  || !/^[0-9a-f]{64}$/u.test(packet.packetSha256) || packet.authority?.canon !== "inkos"
  || packet.authority?.decisionSurface !== "storyyard" || packet.authority?.apply !== "inkos"
  || packet.authority?.reverseSync !== false) {
  throw new Error("Refusing a packet outside the Firefly v2 one-way review boundary.");
}
const { schemaVersion: _schemaVersion, packetId, packetSha256, generatedAt: _generatedAt, ...body } = packet;
const actual = createHash("sha256").update(JSON.stringify(body)).digest("hex");
if (actual !== packetSha256 || packetId !== `frp-${actual.slice(0, 24)}`) throw new Error("Review packet identity or SHA-256 mismatch.");
const forbiddenKeys = new Set(["rawText", "sourceContent", "sourceBody", "sourceExcerpt", "sourceQuote"]);
walk(packet, (key) => { if (forbiddenKeys.has(key)) throw new Error(`Review packet contains forbidden raw source field: ${key}`); });
const normalized = `${JSON.stringify(packet, null, 2)}\n`;
const target = join(root, ".firefly", "review-packets", `${packet.packetId}.json`);
await mkdir(dirname(target), { recursive: true, mode: 0o700 });
let handle;
try { handle = await open(target, "wx", 0o600); }
catch (error) {
  if (error?.code !== "EEXIST") throw error;
  if (await readFile(target, "utf8") !== normalized) throw new Error("A different packet already occupies the immutable packet ID.");
  process.stdout.write(`${target}\n`);
  process.exit(0);
}
try { await handle.writeFile(normalized); } finally { await handle.close(); }
process.stdout.write(`${target}\n`);

function walk(value, visit) {
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { visit(key); walk(item, visit); }
}
