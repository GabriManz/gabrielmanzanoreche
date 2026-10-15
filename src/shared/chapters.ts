/**
 * The thesis path: the room (home) leads to three chapters. A small shared
 * navigation pill lets visitors move between them or go back to the room.
 */
import { url } from './env';
import { leave } from './transition';

export const ROOM = { slug: 'signal-room', title: 'The room' };
export const CHAPTERS = [
  { slug: 'inside-the-cell', title: 'What is a spark', color: '#05040c' },
  { slug: 'digital-station', title: 'How I measure it', color: '#0b1018' },
  { slug: 'wildcard', title: 'From sparks to arrhythmia', color: '#03060c' },
] as const;

export const pageUrl = (slug: string) => url(`concepts/${slug}/index.html`);

/** placement: 'top' sits under the site nav; 'menubar' sits inside an OS-style top bar. */
export function mountChapterNav(slug: string, placement: 'top' | 'menubar' = 'top') {
  const i = CHAPTERS.findIndex((c) => c.slug === slug);
  if (i < 0) return;
  const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
  const nav = document.createElement('nav');
  nav.className = `gx-chapters is-${placement}`;
  nav.setAttribute('aria-label', 'Thesis chapters');
  nav.innerHTML = `
    <a href="${pageUrl(ROOM.slug)}" data-go="${ROOM.slug}" data-color="#050407">← Room</a>
    ${prev ? `<a href="${pageUrl(prev.slug)}" data-go="${prev.slug}" data-color="${prev.color}" aria-label="Previous chapter: ${prev.title}">‹</a>` : ''}
    <span><b>Chapter ${i + 1}/${CHAPTERS.length}</b><i>${CHAPTERS[i].title}</i></span>
    ${next ? `<a href="${pageUrl(next.slug)}" data-go="${next.slug}" data-color="${next.color}" class="is-next">Next<span class="gx-ch-title">: ${next.title}</span> →</a>` : ''}`;
  nav.querySelectorAll<HTMLAnchorElement>('a[data-go]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const r = a.getBoundingClientRect();
      leave(a.href, { x: r.left + r.width / 2, y: r.top + r.height / 2, color: a.dataset.color });
    }));
  document.body.append(nav);
}
