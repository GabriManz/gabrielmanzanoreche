// Convert a binary .glb into a self-contained glTF JSON (.gltf.json) with the
// binary chunk embedded as a base64 data URI. Some static hosts (e.g. artifact
// previews) refuse to serve .glb; GLTFLoader reads either form transparently.
// Usage: node scripts/glb-to-json.mjs public/assets/models/signal-room.glb
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
const buf = readFileSync(src);
if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a GLB');
let off = 12, json, bin;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const chunk = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
  if (type === 0x004e4942) bin = chunk;
  off += 8 + len;
}
json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
const out = src.replace(/\.glb$/, '.gltf.json');
writeFileSync(out, JSON.stringify(json));
console.log(`${out} (${(readFileSync(out).length / 1e6).toFixed(2)} MB)`);
