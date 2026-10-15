# Design & technical decisions

## Stack
- **Vite multi-page + vanilla TypeScript + Three.js r170.** Each concept is an
  isolated entry: no shared runtime state, so workstreams could be built in
  parallel without conflicts and each page only loads what it needs. React/R3F was
  not needed for prototypes; it remains an option for production if the chosen
  direction has lots of UI state.
- **Fonts self-hosted via `@fontsource`** — no runtime calls to external CDNs.
- **Shared chrome** (`src/shared/chrome.ts`): every concept gets the same
  Research / Projects / About / Contact navigation, an accessible `<dialog>`, a
  hidden-but-reachable text version, a loader and a WebGL fallback. Concepts theme it
  through `--gx-*` CSS tokens (`:root:root` in concept CSS to win over the shared defaults).
- **Single content source** (`src/shared/content.ts`) with explicit placeholders.

## Blender pipeline (A, B)
- Blender **5.2 LTS as a Python module** (`pip install bpy`) — headless, scriptable,
  no GUI. This is what "Blender driven by Python" means in this repo; every scene is
  regenerated from source.
- No GPU in the environment → **Cycles on CPU**. Look-dev uses `--fast`
  (low res / low spp, ~40 s); finals take minutes, so they are run deliberately.
- **A (real-time 3D): lightmap baking.** Objects are split into two groups (room
  shell, props), each smart-UV-unwrapped into one shared atlas, Cycles-baked
  (COMBINED; glossy only for props), denoised with OpenImageDenoise through the
  compositor, scaled by ÷2 into LDR and saved as sRGB PNG → WebP inside the GLB.
  The browser draws `MeshBasicMaterial × 2` with AgX tone mapping. Result: global
  illumination and soft shadows at the cost of a textured mesh.
  - Trade-off: view-dependent reflections are frozen; the monitor and bulb stay
    dynamic (canvas texture / emissive).
  - Gotcha fixed: the compositor needs EGL (`libegl1`) even headless.
- **B (pre-rendered plates):** volumetric haze and moonbeams are too expensive in
  real time, so the archive is rendered as stills plus a depth plate (material
  override → camera distance) for per-pixel parallax. Hotspots and the CRT screen
  quad are projected from 3D to image space and saved to JSON, so the HTML layer
  aligns exactly; the terminal is mapped with a CSS `matrix3d` homography.
- Procedural materials only (noise/wave woods, plaster, city windows from a
  hashed grid) — no third-party assets, so no licensing obligations.

## Testing
- Playwright with the pre-installed Chromium and **SwiftShader** WebGL (software).
  Frame rates in screenshots are therefore not representative; correctness and
  composition are. Each concept sets `window.__conceptReady` when its first
  meaningful frame is drawn.

## Process notes
- Workstreams: lead (A, B, pipeline, hub, docs) + three parallel sub-agents
  (C, D, E), each owning one folder and never committing; the lead integrated.
- Reference sites were unreachable from the sandbox (egress policy); noted in the brief.
- Iteration log for A: first render revealed a flat frontal composition, blown-out
  screen, a weak lamp and a broken city shader (heights read from the wrong axis,
  and `transform_apply` silently baking rotation/location). Fixed → 3/4 camera,
  articulated lamp, code-pattern screen, procedural skyline with the Collserola ridge.
