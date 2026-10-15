# Roadmap: after the phase-one review

## Gabriel's feedback (phase one)
- **A, The Signal Room**: liked a lot; becomes the **home / entrance**. Needs
  retouching. The window should show monuments of the cities he has lived in:
  **Baza, Granada, Barcelona, Madrid**.
- **B, The Research Archive**: liked least → **discarded** as a direction.
- **C, Inside the Cell**, **D, Excitable City**, **E, SPARK/OS**: kept as the
  places where the **thesis is explained**.
- **Correction:** Gabriel works with **frame scan (x-y-t)**, not line scan
  (x-t). The SparkLab demo (E) and the line-scan inset (C) must change.

## Proposed structure
```
HOME: The Signal Room (A), the hub of the universe
 ├─ Microscope ─▶ Chapter 1 · "What is a spark"       → Inside the Cell (C)
 ├─ Computer   ─▶ Chapter 2 · "How I measure it"      → SPARK/OS (E), frame-scan pipeline + projects/GitHub
 ├─ Window     ─▶ "Cities I've lived in" (About)      → Baza · Granada · Madrid · Barcelona
 │                 └─ Barcelona view ─▶ Chapter 3 · "From sparks to arrhythmia" → Excitable City (D)
 ├─ Notebook   ─▶ Publications
 ├─ Poster     ─▶ Talks & posters
 └─ Shoes / kettlebell / globe ─▶ Personal (running, CrossFit, travel)
Persistent nav: Research · Projects · About · Contact + text version
Thesis path: Chapter 1 → 2 → 3 (→ 4 "Towards personalised medicine", later)
```
The thesis reads as one story: the spark (cell) → measuring it (images and
software) → its consequence (rhythm and arrhythmia) → the goal (genetics and
clinical data).

## Work packages
| # | Package | Content |
|---|---|---|
| 1 | **Content from Gabriel** | City order and years, monuments, frame-scan acquisition details, real projects/publications, contact. Blocks the rest only partly. |
| 2 | **A: window of cities** | Model stylised monument silhouettes in Blender (procedural, no third-party assets); the window view changes city on click or over time; Cycles render per city. |
| 3 | **A: detail pass** | Microscope and workstation fidelity, desk clutter, higher-resolution lightmaps, fix the back-wall seam, mobile framing. |
| 4 | **E: frame-scan rework** | Synthetic x-y-t movie of a cell; 2D+t detection (cell mask → baseline F0 → ΔF/F0 → 3D connected components); outputs per spark: amplitude, FWHM, duration, frequency; movie player with detection overlay. |
| 5 | **C: frame-scan inset** | Replace the x-t line-scan inset with an x-y frame view plus an ROI ΔF/F0 trace. |
| 6 | **Chapter integration** | One design language for C/D/E chapters, transitions from A's objects (microscope dive into C, screen zoom into E), "next chapter" navigation. |
| 7 | **Production** | Sound, performance budget, accessibility audit, free hosting (e.g. GitHub Pages, with approval), domain later. |

## Open questions for Gabriel
1. Order and dates of the cities, and which monument per city (defaults proposed below).
2. Window behaviour: one view per city (click or slider) or a single imaginary skyline mixing all four.
3. Frame-scan details: frame rate, pixel size, indicator, cell type, and what he measures.
4. Whether to reuse anything from B (e.g. index cards for publications) or drop it entirely.

Default monument proposal (to confirm):
- **Baza**: Co-catedral de la Encarnación, Alcazaba, Sierra de Baza / Jabalcón on the horizon.
- **Granada**: Alhambra (Torre de la Vela) with Sierra Nevada.
- **Madrid**: Palacio Real / Almudena, or Cuatro Torres and the Edificio Metrópolis.
- **Barcelona**: Sagrada Família, Torre Glòries, Collserola tower on the ridge.

## Decisions received (round 2)
- Cities, in order shown: **Baza** (Co-catedral de la Encarnación on the Plaza Mayor,
  Dama de Baza, Cascamorras), **Granada** (Alhambra + Sierra Nevada), **Madrid**
  (Palacio Real + El Oso y el Madroño), **Barcelona** (Sagrada Família, Torre Glòries,
  Collserola). The window **cycles** between them.
- Frame-scan parameters (illustrative demos only, synthetic data): Fluo-4, human atrial
  cardiomyocytes, DX = 0.060184 µm/px, DT = 5.820 ms/frame.
- B's index cards are **reused** (notebook → records / publications drawer).
- Real content (projects, publications, contact) is **on hold**.

## Status
- [x] WP2 window of cities: `blender/city_views.py` → `public/assets/textures/window-*.jpg`,
      cross-fade + captions in `src/concepts/signal-room/cityWindow.ts`.
- [x] WP4 SparkLab rework to frame scan (`src/shared/framescan.ts`: generator + detector).
- [x] WP5 C inset → x–y frame view + ROI ΔF/F0 trace.
- [x] Index cards moved to `src/shared/catalogue.ts` and used by A's notebook.
- [ ] WP3 detail pass on A · [ ] WP6 chapter integration/transitions · [ ] WP7 production.
- Open: confirm the chronological order of the cities (currently Baza → Granada → Madrid → Barcelona).
