# Comparison of the shortlisted prototypes

Scores 1–5 (5 = best; for *complexity* and *performance cost*, 5 = hardest / heaviest).
Judged from the running prototypes and their screenshots in `docs/screenshots/`.

| | A Signal Room | B Research Archive | C Inside the Cell | D Excitable City | E Digital Station |
|---|---|---|---|---|---|
| Originality | 3 | 4 | 4 | **5** | 3 |
| Visual appeal | 4 | **5** | **5** | 4 | 4 |
| Relevance to Gabriel | 4 | 3 | **5** | **5** | **5** |
| Interaction quality | 4 | 3 | 4 | **5** | **5** |
| Storytelling | 4 | 4 | **5** | 4 | 3 |
| Navigation clarity | 4 | 4 | 4 | 4 | **5** |
| Performance cost | 2 (≈3.5 MB GLB+tex) | 2 (≈1.5 MB JPG plates) | 4 (shaders + bloom) | 4 (CPU sim + bloom) | 1 |
| Production complexity | 4 (modelling/baking) | 3 (more plates = more renders) | 4 (science art direction) | 3 | 2 |

## Individual verdicts

**A — The Signal Room.** The most "Felix-like" in craft: a believable, lived-in
night scene whose light was path-traced in Cycles and baked, so it looks like the
render while running in real time. Strong first impression of *a person*; the
objects-as-doors model is instantly understood. Weaknesses: the room-portfolio
genre is crowded, and props need much more modelling detail (cables, clutter,
fabric, real microscope fidelity) to reach award level. The microscope → eyepiece
moment is the best idea in it.

**B — The Research Archive.** The most cinematic still image of the set
(volumetric haze, moonlight, endless drawers). Pre-rendered plates are cheap to
serve and look photographic, but movement is limited to plate-to-plate jumps, and
the archive metaphor talks about *records* rather than about the heart. Its live
CRT terminal and typed index cards are excellent reusable pieces.

**C — Inside the Cell.** The most beautiful and most *scientifically personal*:
fluorescence aesthetics, microscopy-figure annotations, a line-scan inset that
shows real wave patterns, and a spark you can trigger yourself. It explains his
research better than any text could. Risks: the tissue scale reads as glass tubes,
GPU cost is the highest, and it says little about Gabriel the engineer/person.

**D — Excitable City (wildcard).** The idea nobody else has: Barcelona's Eixample as
excitable tissue, where the visitor can *cause an arrhythmia* and defibrillate it.
Personal (Barcelona, arrhythmia, running Easter egg), playful and memorable —
the most "shareable" concept. Visually striking at night, slightly abstract at
first glance; needs better onboarding to read as a city immediately.

**E — Digital Research Station (SPARK/OS).** The most functional and the clearest
showcase of Gabriel as a *software/AI engineer*: SparkLab actually detects sparks
on synthetic data and reports recall. Lowest technical risk, works perfectly on
mobile. Less immersive and less cinematic; OS-as-website is a known genre.

## Recommendation — a hybrid: "Signal Room → Inside the Cell", with E's apps inside
A layered universe where each layer is the strongest piece of a different prototype:

1. **Entry: The Signal Room (A)** — the cinematic, human anchor: a Barcelona
   night, a desk, a person's work. Baked Blender lighting keeps it photographic.
2. **The microscope is the portal to Inside the Cell (C)** — the camera dives
   through the eyepiece into the fluorescent cardiomyocyte, down to the RyR2
   cluster. This is the "microscope reveals a different world" moment, and the
   scientific heart of the site.
3. **The monitor runs SPARK/OS (E)** — click the screen and the workstation becomes
   usable: SparkLab, terminal, projects, notebook. This proves the engineering.
4. **The window looks out on Excitable City (D)** — the Barcelona skyline outside
   can "light up" as excitable tissue: an Easter egg / second act where the city
   itself beats, and the visitor can induce re-entry.
5. B's index-card catalogue and CRT terminal patterns can become the Publications /
   Records view.

Why: it combines the most personal opening (A), the most beautiful science (C),
the most credible engineering showcase (E) and the most memorable surprise (D),
while keeping one coherent physical world with conventional navigation on top.

Alternative if a single, leaner concept is preferred: **C + E** (cell journey as
the main experience, SPARK/OS as the "work" section) — less modelling effort,
strongest scientific identity.

## What would change in production
- Real content from Gabriel replaces placeholders (projects, publications, contact).
- Model detail pass in Blender (microscope, workstation, clutter), higher-res
  lightmaps with KTX2/Basis compression, Draco/meshopt geometry.
- One shared Three.js renderer and a scene router for seamless transitions.
- Sound design (room tone, city, CRT hum, calcium "crackle").
- Performance budget: ≤ 5 MB initial load, 60 fps on a mid-range laptop, 30 fps mobile.
