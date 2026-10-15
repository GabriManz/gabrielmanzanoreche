/** /concepts — the exhibition index for comparing the prototypes. */
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono';
import './style.css';
import { person } from '../../shared/content';

const CONCEPTS = [
  {
    slug: 'signal-room', letter: 'A', name: 'The Signal Room',
    line: 'A Barcelona attic at night. Every object on the desk is a door into the work.',
    tags: ['Blender · Cycles bake', 'Real-time 3D', 'Hotspots'],
    interaction: 'Fly to objects; look through the microscope.',
  },
  {
    slug: 'research-archive', letter: 'B', name: 'The Research Archive',
    line: 'A hazy retro-futurist archive of index cards, film reels and CRTs.',
    tags: ['Blender · Cycles volumetrics', 'Pre-rendered 2.5D', 'CRT terminal'],
    interaction: 'Walk between plates; query the Archivist; flip index cards.',
  },
  {
    slug: 'inside-the-cell', letter: 'C', name: 'Inside the Cell',
    line: 'A cinematic dive from heart tissue to a single ryanodine receptor cluster.',
    tags: ['Three.js shaders', 'Scale journey', 'Toy CICR model'],
    interaction: 'Change scale; fire calcium sparks; push the cell into a wave.',
  },
  {
    slug: 'wildcard', letter: 'D', name: 'Excitable City',
    line: "Barcelona's Eixample as living cardiac tissue. Time a stimulus badly and the city fibrillates.",
    tags: ['Wildcard', 'Excitable-media sim', 'Pseudo-ECG'],
    interaction: 'Stimulate, create re-entry, defibrillate.',
  },
  {
    slug: 'digital-station', letter: 'E', name: 'Digital Research Station',
    line: 'SPARK/OS — a fictional scientific workstation with working analysis apps.',
    tags: ['2D OS', 'SparkLab detector', 'Terminal'],
    interaction: 'Open apps; run spark detection on synthetic data.',
  },
];

document.body.innerHTML = `
<header class="hub-head">
  <p class="hub-eyebrow">Phase one · creative exploration</p>
  <h1>Five worlds for<br><em>${person.name}</em></h1>
  <p class="hub-lede">Five radically different prototypes for an interactive personal universe. Each is a working
  sketch — real interactions, placeholder content where facts are still missing. Enter one, then come back and compare.</p>
</header>
<main class="hub-grid">
  ${CONCEPTS.map((c) => `
  <a class="hub-card" href="/concepts/${c.slug}/">
    <figure><img src="/assets/thumbs/${c.slug}.jpg" alt="Screenshot of ${c.name}" loading="lazy" /></figure>
    <div class="hub-meta">
      <span class="hub-letter">${c.letter}</span>
      <h2>${c.name}</h2>
      <p>${c.line}</p>
      <p class="hub-int">${c.interaction}</p>
      <ul>${c.tags.map((t) => `<li>${t}</li>`).join('')}</ul>
      <span class="hub-enter">Enter →</span>
    </div>
  </a>`).join('')}
</main>
<footer class="hub-foot">
  <p>Prototypes, not the final site. Scientific visuals are illustrative and use synthetic data.
  Comparison and recommendation: <code>docs/COMPARISON.md</code>.</p>
</footer>`;
window.__conceptReady = true;
