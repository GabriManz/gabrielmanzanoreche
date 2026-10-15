# GABRIEL — an interactive personal universe

Personal website project for **Gabriel Manzano Reche** (PhD researcher, Biomedical
Engineering — UPC · IIBB-CSIC, Barcelona).

**Current phase: creative exploration.** Five concept prototypes live side by side
and are compared before one direction (or a hybrid) goes into production.

| Route | Concept | Tech |
|---|---|---|
| `/concepts/` | Index of all prototypes | HTML/CSS |
| `/concepts/signal-room/` | A — The Signal Room | Blender → Cycles lightmap bake → GLB → Three.js |
| `/concepts/research-archive/` | B — The Research Archive | Blender → Cycles plates + depth → 2.5D WebGL |
| `/concepts/inside-the-cell/` | C — Inside the Cell | Three.js shaders, toy Ca²⁺ model |
| `/concepts/wildcard/` | D — Excitable City | Three.js + Barkley excitable-media sim |
| `/concepts/digital-station/` | E — Digital Research Station | TypeScript DOM "OS" + canvas |

## Run
```bash
npm install
npm run dev          # http://localhost:5173/concepts/
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ on http://localhost:4173
npm run shots -- http://localhost:4173            # Playwright screenshots → docs/screenshots/
```

## Regenerate the 3D assets (Blender as a Python module)
Blender 5.2 is used through the `bpy` wheel — no GUI needed.
```bash
python3 -m venv /opt/bpyenv && /opt/bpyenv/bin/pip install bpy==5.2.2
# Cycles bakes/denoise need EGL for the compositor: apt-get install libegl1 libgl1
/opt/bpyenv/bin/python blender/signal_room.py render bake export   # ~25 min on 4 CPU cores
/opt/bpyenv/bin/python blender/signal_room.py render --fast         # quick look-dev preview
/opt/bpyenv/bin/python blender/research_archive.py                  # plates + depth + JSON
```
Outputs: `public/assets/models/*.glb`, `public/assets/renders/*`, `public/assets/textures/*`.
Scratch files go to `blender/out/` (gitignored).

## Layout
```
blender/            procedural scene scripts (lib.py helpers, bake.py pipeline)
concepts/<slug>/    HTML entries (Vite multi-page)
src/shared/         chrome (nav, dialog, text version, WebGL fallback, loader), content, env
src/concepts/<slug> one folder per concept
public/assets/      generated models, renders, textures (kept small: < ~3 MB each)
docs/               brief, concepts, decisions, comparison, screenshots
tests/              Playwright screenshot script
```
See `AGENTS.md` for contributor/agent rules and `docs/` for the design record.

## Content policy
All copy comes from `src/shared/content.ts`. Unknown facts are visible
`[Placeholder]` entries — no invented publications, results or biography.
Scientific visuals use synthetic data and are labelled illustrative.
