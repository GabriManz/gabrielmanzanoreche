/**
 * Load a model shipped as self-contained glTF JSON (see scripts/glb-to-json.mjs)
 * without any `data:` fetches: the base64 buffer is decoded here and repacked as
 * an in-memory GLB for GLTFLoader.parse(). Strict CSPs (e.g. artifact previews)
 * block fetch() of data: URLs, which GLTFLoader would otherwise use.
 */
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function toGLB(json: { buffers: { uri?: string; byteLength: number }[] }): ArrayBuffer {
  const uri = json.buffers[0].uri ?? '';
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const raw = atob(b64);
  const bin = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  delete json.buffers[0].uri;
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(enc.length / 4) * 4, binLen = Math.ceil(bin.length / 4) * 4;
  const out = new ArrayBuffer(12 + 8 + jsonLen + 8 + binLen);
  const dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.byteLength, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  u8.fill(0x20, 20, 20 + jsonLen); u8.set(enc, 20);
  const b = 20 + jsonLen;
  dv.setUint32(b, binLen, true); dv.setUint32(b + 4, 0x004e4942, true);
  u8.set(bin, b + 8);
  return out;
}

export async function loadGLTFJson(src: string, onProgress?: (p: number) => void): Promise<GLTF> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`model request failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let text: string;
  if (total && res.body && onProgress) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onProgress(got / total);
    }
    text = new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
  } else text = await res.text();
  const glb = toGLB(JSON.parse(text));
  return new Promise((resolve, reject) => {
    // GLTFLoader decodes embedded images with fetch(blob:) + createImageBitmap, which
    // strict CSPs refuse (connect-src). Without createImageBitmap it falls back to
    // <img> elements (img-src blob:, normally allowed). The parser picks its loader
    // synchronously in parse(), so hide the API only for that call.
    const w = window as unknown as { createImageBitmap?: unknown };
    const saved = w.createImageBitmap;
    w.createImageBitmap = undefined;
    try {
      new GLTFLoader().parse(glb, '', resolve, reject);
    } finally {
      w.createImageBitmap = saved;
    }
  });
}
