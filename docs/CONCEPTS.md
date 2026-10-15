# Concept directions

Nine directions were brainstormed; five were prototyped. Scores are 1–5
(originality · atmosphere · storytelling · feasibility · relevance to Gabriel).

| # | Direction | Orig | Atmo | Story | Feas | Rel | Status |
|---|---|---|---|---|---|---|---|
| A | The Signal Room | 3 | 5 | 4 | 4 | 4 | **Prototyped** |
| B | The Research Archive | 4 | 5 | 4 | 4 | 3 | **Prototyped** |
| C | Inside the Cell | 4 | 5 | 5 | 3 | 5 | **Prototyped** |
| D | Excitable City (wildcard) | 5 | 4 | 5 | 4 | 5 | **Prototyped** |
| E | Digital Research Station (SPARK/OS) | 3 | 3 | 4 | 5 | 5 | **Prototyped** |
| F | Line Scan | 5 | 3 | 4 | 4 | 5 | Absorbed into E (SparkLab app) |
| G | Bell-jar Lab Diorama | 2 | 4 | 3 | 4 | 3 | Rejected |
| H | The Long Run | 4 | 4 | 3 | 3 | 2 | Rejected → Easter egg in D |
| I | Signal Observatory | 4 | 4 | 3 | 3 | 3 | Parked |
| J | Atlas of a Heartbeat | 4 | 4 | 4 | 2 | 4 | Parked |

---

## A — The Signal Room
A Barcelona attic workspace at night: exposed beams, steel balcony window over a
procedurally generated city and the Collserola ridge, warm desk lamp, cream-enamel
microscope, monitor running Python, open lab notebook, conference poster,
bookshelf with LED, globe, kettlebell, running shoes.
**Interaction:** hover/Tab hotspots → camera flight → content. The microscope opens
an eyepiece view with a live synthetic fluorescence field (sparks).
**Tech:** 100 % procedural Blender scene → Cycles bake of global illumination into
two lightmap atlases (OIDN-denoised) → GLB → Three.js unlit materials. Live
CanvasTexture for the screen; Cycles-rendered city backdrop with twinkling windows.

## B — The Research Archive
A retro-futurist archive: two walls of index-card cabinets in volumetric haze,
hanging green enamel lamps, a library ladder, a film-reel trolley, and a console
of beige CRTs under a tall moonlit window.
**Interaction model (deliberately different from A):** pre-rendered "plates" like
a cinematic point-and-click — depth-plate parallax, film grain, dolly-crossfade
between plates. A card catalogue of typed index cards (research/projects) and a
CRT **ARCHIVIST** terminal, perspective-mapped onto the monitor, that queries the
records (local keyword index — honest about not being an AI service).
**Tech:** Blender + Cycles volumetrics, depth plate rendered with a material
override, 3D→2D projected JSON for hotspots and the screen homography.

## C — Inside the Cell
A cinematic dive across scales into an artistically interpreted cardiomyocyte:
tissue → cell (striations, T-tubules, beating Ca²⁺ transients) → dyad (RyR2 lattice
facing L-type channels). Click a cluster to fire a calcium spark; raise an
illustrative "SR Ca²⁺ load" until sparks recruit neighbours and a wave crosses the
cell — the cellular trigger of arrhythmia. Labelled as an illustrative toy model.
**Tech:** Three.js, instancing, custom shaders, fluorescence LUTs, bloom.

## D — Excitable City (wildcard)
Barcelona's Eixample — Cerdà's chamfered blocks — as a sheet of excitable cardiac
tissue at night. A sinus node by the sea paces orderly waves of light; tap in the
wrong moment and you create a spiral re-entry; defibrillate to reset. A pseudo-ECG
monitor reads the rhythm. Running Easter egg: a long-run loop whose pace follows
the heart rate. It connects Barcelona, arrhythmia mechanisms and play in one image.
**Tech:** Barkley excitable-media model, instanced extruded blocks, ECG from
virtual electrodes, bloom.

## E — Digital Research Station (SPARK/OS)
A fictional late-90s scientific-workstation OS rendered with modern crispness.
Apps: **SparkLab** (synthetic confocal line-scan + a real detection algorithm with
ΔF/F₀, FWHM, FDHM and recall vs injected ground truth), Terminal, Notebook,
Projects, Atlas, Mail. Mobile: phone launcher.
**Tech:** vanilla TypeScript DOM window manager + canvas.

## F — Line Scan (absorbed)
The whole site as one endless confocal line-scan (space × time) that scrolls like a
chart recorder; sections appear as "events" that a detector boxes and labels.
Strong and original but overlapped with C; it lives on as SparkLab inside E and
could return as a transition device.

## G — Bell-jar Lab Diorama (rejected)
An isometric miniature laboratory under a glass dome with tilt-shift. Pretty, but
isometric rooms are the most common pattern in 3D portfolios — low originality.

## H — The Long Run (rejected)
A night trail run through a generated Catalan landscape; kilometre markers are
milestones, heart rate drives the UI. Running is secondary to the scientific
identity; kept as an Easter egg in D.

## I — Signal Observatory (parked)
A radio-telescope dome "listening" to cardiac signals; visitors tune dials to
decode sections. Beautiful instrument UI potential, weaker link to the actual work.

## J — Atlas of a Heartbeat (parked)
An illustrated scientific atlas (engraving-style shaders, page turns) charting the
heart from organ to channel. Gorgeous, but heavy bespoke illustration work.
