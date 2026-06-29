// Stream a URL to disk (avoids buffering huge files in memory).
// Usage: node scripts/download.mjs <url> <outpath>
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/download.mjs <url> <outpath>");
  process.exit(1);
}
const res = await fetch(url, { headers: { "User-Agent": "Span/0.1" } });
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}
const total = Number(res.headers.get("content-length") || 0);
await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
console.log(`downloaded ${out} (${(total / 1e6).toFixed(0)} MB)`);
