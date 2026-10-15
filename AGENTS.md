# AGENTS.md — instructions for coding agents

Project: **GABRIEL — an interactive personal universe** for Gabriel Manzano Reche
(PhD researcher, Biomedical Engineering, UPC · IIBB-CSIC, Barcelona).
Current phase: **creative exploration** — several radically different concept
prototypes compared side by side. Nothing here is the final site yet.

## Golden rules
1. **Never invent facts.** No fake publications, awards, employers, results,
   photos or biography. All content comes from `src/shared/content.ts`; missing
   information is a visibly marked `[Placeholder …]`.
2. **Synthetic data only.** No patient data or unpublished lab data. Scientific
   visuals are *illustrative* unless explicitly validated — label them as such.
3. **Website copy is English.** Progress reports to Gabriel are in Spanish.
4. **No paid services**, domains or deployments without Gabriel's approval.
5. **Don't claim a tool ran unless it ran** (Blender, Playwright, agents…).

## Layout
```
concepts/<slug>/index.html     HTML entry per concept (Vite multi-page)
src/shared/                    chrome (nav, dialog, loader, WebGL fallback), content, env helpers
src/concepts/<slug>/           each concept's code + CSS — owned by ONE workstream
blender/                       Blender (bpy) Python scripts that regenerate 3D assets
public/assets/models|renders   exported GLB / small preview renders (keep < ~3 MB each)
docs/                          brief, concepts, decisions, comparison, screenshots
tests/screenshots.mjs          Playwright capture (desktop + mobile, SwiftShader WebGL)
```

## Concept contract
Each concept's `main.ts` must:
- call `mountChrome({ concept, status, needsWebGL })` from `src/shared/chrome.ts`
  (gives Research/Projects/About/Contact nav, accessible dialog, text version, WebGL fallback);
- use `openPanel(sectionKey | {title, html})` for content panels;
- set `window.__conceptReady = true` after the first meaningful frame (screenshots wait on it);
- respect `prefersReducedMotion()`; offer keyboard access to every interactive object;
- theme the chrome by overriding `--gx-*` CSS tokens; import fonts from `@fontsource*` packages
  (no runtime calls to external CDNs).
- Only touch `src/shared/*` if absolutely needed, and keep changes backward compatible.

## Commands
```
npm run dev            # http://localhost:5173/concepts/
npm run build          # typecheck + build
npm run preview        # serve dist on :4173
npm run shots -- http://localhost:4173 /concepts/<slug>/   # screenshots → docs/screenshots
/opt/bpyenv/bin/python blender/<script>.py                  # Blender 5.2 as Python module (bpy)
```
Environment notes: no GPU — WebGL runs on SwiftShader in headless Chromium (slow but
correct); Blender renders with Cycles on CPU (4 cores) → keep sample counts low for previews.
