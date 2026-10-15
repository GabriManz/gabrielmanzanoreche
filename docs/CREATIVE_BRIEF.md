# Creative brief — GABRIEL, an interactive personal universe

## Who
Gabriel Manzano Reche — PhD researcher in Biomedical Engineering (UPC), working at
IIBB-CSIC in Barcelona on cardiovascular research: cardiac electrophysiology and
arrhythmias, intracellular calcium signalling, RyR2, calcium sparks, confocal
microscopy and biomedical image analysis, computer vision / deep learning, Python.
Doctoral goal: connect cellular phenotypes, genetic variation and clinical data to
understand arrhythmia severity and support personalised treatment.
Off the bench: AI agents & open source, running / CrossFit / endurance, travel,
explaining science.

## Audience
Researchers and collaborators, academic groups, AI/tech companies, biomedical and
pharma companies, computational-biology people, and curious visitors who love
unusual interactive sites.

## Goal
Visitors should feel they enter a *world*, not a CV: immersive, cinematic,
technically impressive, personal, scientifically meaningful, playful but not
childish — and still easy to navigate (Research / Projects / About / Contact are
always one click away, with a text version for accessibility).

## Primary reference and what we take from it
**Felix Rieseberg — felixrieseberg.com / "Made by mechanical means".**
We adopt the *process*, not the look:
1. Explore many independent concepts before committing.
2. Generate 3D environments **programmatically** — Blender driven as a Python
   library (`bpy`), so scenes are code: reviewable, diffable, regenerable.
3. Render → look → iterate (renders and browser screenshots are inspected every round).
4. Pre-compute expensive light (Cycles bakes / pre-rendered plates) so the browser
   stays fast.
5. Modular architecture so concepts can be developed independently.
6. Automated browser testing and screenshots (Playwright).

What we deliberately do **not** take: VHS tapes, the 90s journalist room layout,
his visual identity or any of his assets.

> Environment note: the reference websites could not be fetched from this cloud
> environment (egress proxy blocks them). The analysis below is from prior
> knowledge of these sites plus one secondary source summarising Felix's article;
> verify details before quoting them.

## Secondary references — patterns worth borrowing
| Site | Pattern | Use here |
|---|---|---|
| rafaheras.dev | immersive environment with a usable in-world computer | live screens inside 3D (A, B) |
| rachelqrwei.ca | personal 3D room, objects = sections | object ↔ content mapping (A) |
| henryheffernan.com | retro computer you actually operate | OS-as-site (E), CRT terminal (B) |
| sandroid.dev isometric | AI-assisted Blender room workflow | procedural Blender pipeline (A, B) |
| bruno-simon.com | gamified, physical play | "poke the system" interactions (D) |
| jesse-zhou.com | strong art direction, non-literal worlds | scientific metaphors as worlds (C, D) |

Recurring lessons: one strong hero image matters more than many features; every
interactive object needs an affordance (hover glow, pulse, label); always ship a
conventional escape hatch; baked/pre-rendered light is what makes web 3D look
photographic.

## Hard rules
- No invented publications, awards, employers, results, photos or biography —
  use visible placeholders.
- Synthetic data only; illustrative science is labelled as illustrative.
- Website copy in English.
- No paid services, domains or deployments without approval.
