/**
 * Page-to-page "iris" transitions between the room and the thesis chapters.
 * leave(): an iris closes onto a point of the screen, then navigates.
 * arrive(): called by mountChrome on every page; if the previous page left
 * through an iris, the new page opens from the same colour once it is ready.
 * The hand-off travels in sessionStorage (optional: without it pages just load).
 */
import { prefersReducedMotion } from './env';

const KEY = 'gx-transition';
interface Hand { color: string; at: number }

function iris(color: string, x: number, y: number, size: string) {
  const el = document.createElement('div');
  el.className = 'gx-iris';
  el.style.setProperty('--iris-color', color);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = el.style.height = size;
  document.body.append(el);
  return el;
}

/** Close an iris onto (x, y) in the given colour, then go to href. */
export function leave(href: string, opts: { x?: number; y?: number; color?: string } = {}) {
  const color = opts.color ?? '#050506';
  try { sessionStorage.setItem(KEY, JSON.stringify({ color, at: Date.now() } satisfies Hand)); } catch { /* private mode */ }
  if (prefersReducedMotion()) { location.href = href; return; }
  const el = iris(color, opts.x ?? innerWidth / 2, opts.y ?? innerHeight / 2, '300vmax');
  el.getBoundingClientRect(); // commit the start size before animating
  el.classList.add('is-closing');
  el.style.width = el.style.height = '0px';
  setTimeout(() => { location.href = href; }, 900);
}

/** Open the page from the colour the previous page closed on (no-op on a normal load). */
export function arrive() {
  let hand: Hand | null = null;
  try {
    hand = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
  if (!hand || Date.now() - hand.at > 15000) return;
  const el = iris(hand.color, innerWidth / 2, innerHeight / 2, '0px');
  const t0 = performance.now();
  const open = () => {
    if (prefersReducedMotion()) { el.remove(); return; }
    el.classList.add('is-opening');
    el.style.width = el.style.height = '300vmax';
    setTimeout(() => el.remove(), 1300);
  };
  // wait for the concept's first meaningful frame (max 8 s), and at least a beat
  const wait = () => {
    const ready = window.__conceptReady === true && !document.querySelector('.gx-loader:not(.is-done)');
    if ((ready && performance.now() - t0 > 250) || performance.now() - t0 > 8000) open();
    else requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}
