import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page build: every concept is an independent entry so concepts can be
// developed, loaded and evaluated in isolation (no shared runtime state).
const pages = {
  main: 'index.html',
  concepts: 'concepts/index.html',
  signalRoom: 'concepts/signal-room/index.html',
  researchArchive: 'concepts/research-archive/index.html',
  insideTheCell: 'concepts/inside-the-cell/index.html',
  wildcard: 'concepts/wildcard/index.html',
  digitalStation: 'concepts/digital-station/index.html',
};

export default defineConfig({
  base: './', // relative URLs: the build runs under any path prefix
  build: {
    assetsInlineLimit: 0, // never inline assets as data: URIs (blocked by strict CSPs)
    rollupOptions: {
      input: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, resolve(__dirname, v)])),
    },
  },
});
