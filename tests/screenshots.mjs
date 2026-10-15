// Usage: node tests/screenshots.mjs [baseURL] [route ...]
// Captures desktop + mobile screenshots of each concept with software WebGL
// (SwiftShader — no GPU in CI/cloud), and reports console errors + timings.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173';
const routes = process.argv.slice(3).length ? process.argv.slice(3) : [
  '/concepts/', '/concepts/signal-room/', '/concepts/research-archive/',
  '/concepts/inside-the-cell/', '/concepts/wildcard/', '/concepts/digital-station/',
];
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
mkdirSync('docs/screenshots', { recursive: true });

import { existsSync } from 'node:fs';
// The cloud image ships a Chromium build that may not match this Playwright version.
const bundled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? (existsSync(bundled) ? bundled : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const route of routes) {
  const slug = route.replace(/^\/concepts\/?/, '').replace(/\/$/, '') || 'hub';
  for (const [vp, size] of Object.entries(viewports)) {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const t0 = Date.now();
    await page.goto(base + route, { waitUntil: 'load' });
    // Concepts set window.__conceptReady once their first meaningful frame is drawn.
    await page.waitForFunction(() => window.__conceptReady === true || !document.querySelector('canvas'), null, { timeout: 60000 }).catch(() => errors.push('ready-timeout'));
    await page.waitForTimeout(Number(process.env.SHOT_DELAY ?? 2500));
    const file = `docs/screenshots/${slug}-${vp}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
    console.log(`${file}  ${Date.now() - t0}ms  ${errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok'}`);
    await page.close();
  }
}
await browser.close();
