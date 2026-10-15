/** The card catalogue: research, projects and bibliography as typed index cards you flip through.
 *  Born in concept B (Research Archive); reused as the Signal Room notebook's drawer. */
import '@fontsource/special-elite';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import './catalogue.css';
import { research, projects, publications } from './content';

export function openCatalogue(start: 'RESEARCH' | 'PROJECTS' | 'BIBLIOGRAPHY' = 'RESEARCH') {
  const cards = [
    ...research.map((r, i) => ({ no: `R.${i + 1}`, drawer: 'RESEARCH', ...r })),
    ...projects.map((r, i) => ({ no: `P.${i + 1}`, drawer: 'PROJECTS', ...r })),
    ...publications.map((r, i) => ({ no: `B.${i + 1}`, drawer: 'BIBLIOGRAPHY', ...r })),
  ];
  let i = Math.max(0, cards.findIndex((c) => c.drawer === start));
  const wrap = document.createElement('div');
  wrap.className = 'ra-cat';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'Card catalogue');
  wrap.innerHTML = `<div class="ra-cat-stack"></div>
    <div class="ra-cat-nav"><button data-d="-1" aria-label="Previous card">‹</button>
    <span class="ra-cat-count"></span><button data-d="1" aria-label="Next card">›</button>
    <button class="ra-cat-close">Close drawer · Esc</button></div>`;
  document.body.append(wrap);
  const stack = wrap.querySelector('.ra-cat-stack')!;
  const render = () => {
    stack.innerHTML = cards.map((c, k) => `
      <article class="ra-card-i${c.placeholder ? ' is-ph' : ''}" style="--k:${k - i}" aria-hidden="${k !== i}">
        <header><span>${c.drawer}</span><span>No. ${c.no}</span></header>
        <h2>${c.title}</h2><p>${c.body}</p>
        ${c.placeholder ? '<footer>PLACEHOLDER — awaiting verified details</footer>' : '<footer>Filed under: G.M.R. / UPC · IIBB-CSIC</footer>'}
      </article>`).join('');
    wrap.querySelector('.ra-cat-count')!.textContent = `${i + 1} / ${cards.length}`;
  };
  const step = (d: number) => { i = (i + d + cards.length) % cards.length; render(); };
  const close = () => { wrap.remove(); removeEventListener('keydown', onKey); dispatchEvent(new Event('gx:catalogue-closed')); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
  };
  wrap.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.addEventListener('click', () => step(+b.dataset.d!)));
  wrap.querySelector('.ra-cat-close')!.addEventListener('click', close);
  stack.addEventListener('click', () => step(1));
  addEventListener('keydown', onKey);
  render();
  wrap.querySelector<HTMLButtonElement>('[data-d="1"]')!.focus();
}
