/**
 * "Chrome" = the conventional, accessible layer that sits on top of every
 * immersive concept: a nav bar (Research / Projects / About / Contact), an
 * accessible content dialog, a loader, a WebGL fallback and a prototype badge.
 * Each concept themes it through CSS custom properties (see chrome.css).
 */
import './chrome.css';
import { sections, person, type SectionKey } from './content';
import { hasWebGL, url } from './env';

export interface ChromeOptions {
  concept: string;          // human name, e.g. "The Signal Room"
  status?: string;          // short prototype status line
  needsWebGL?: boolean;
}

let dialog: HTMLDialogElement | null = null;

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function sectionHTML(key: SectionKey): string {
  const s = sections[key];
  return `<h2>${s.label}</h2>` + s.items
    .map((i) => `<article class="gx-item${i.placeholder ? ' is-placeholder' : ''}">
      <h3>${esc(i.title)}</h3>
      <p>${i.href ? `<a href="${i.href}" target="_blank" rel="noopener">${esc(i.body)}</a>` : esc(i.body)}</p>
    </article>`)
    .join('');
}

/** Open the accessible content dialog with a section, or arbitrary HTML. */
export function openPanel(content: SectionKey | { title: string; html: string }) {
  if (!dialog) return;
  const body = dialog.querySelector('.gx-dialog-body')!;
  body.innerHTML = typeof content === 'string'
    ? sectionHTML(content)
    : `<h2>${esc(content.title)}</h2>${content.html}`;
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector('.gx-close') as HTMLButtonElement).focus();
}

export function onPanelClose(cb: () => void) {
  dialog?.addEventListener('close', cb);
}

export function mountChrome(opts: ChromeOptions) {
  const nav = document.createElement('header');
  nav.className = 'gx-nav';
  nav.innerHTML = `
    <a class="gx-skip" href="#gx-text">Skip to text version</a>
    <a class="gx-home" href="${url('concepts/index.html')}" title="Back to concept index">
      <span class="gx-mark">G</span><span class="gx-name">${person.name}</span>
    </a>
    <nav aria-label="Primary">
      ${(Object.keys(sections) as SectionKey[])
        .map((k) => `<button data-section="${k}">${sections[k].label}</button>`).join('')}
    </nav>
    <span class="gx-badge" title="${esc(opts.status ?? 'Prototype')}">Prototype · ${esc(opts.concept)}</span>`;
  document.body.prepend(nav);
  nav.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((b) =>
    b.addEventListener('click', () => openPanel(b.dataset.section as SectionKey)));

  dialog = document.createElement('dialog');
  dialog.className = 'gx-dialog';
  dialog.innerHTML = `<button class="gx-close" aria-label="Close">×</button><div class="gx-dialog-body"></div>`;
  dialog.querySelector('.gx-close')!.addEventListener('click', () => dialog!.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog!.close(); });
  document.body.append(dialog);

  // Text version: always present for screen readers / no-JS-3D visitors.
  const text = document.createElement('section');
  text.id = 'gx-text';
  text.className = 'gx-text';
  text.setAttribute('aria-label', 'Text version');
  text.innerHTML = `<h1>${person.name}</h1><p>${person.role} — ${person.affiliation}</p>` +
    (Object.keys(sections) as SectionKey[]).map(sectionHTML).join('');
  document.body.append(text);

  if (opts.needsWebGL && !hasWebGL()) {
    document.body.classList.add('gx-no-webgl');
    const f = document.createElement('div');
    f.className = 'gx-fallback';
    f.innerHTML = `<p>This experience needs WebGL, which isn't available on this device.</p>
      <a href="#gx-text">Read the text version</a>`;
    document.body.append(f);
    return false;
  }
  return true;
}

/** Minimal loader: call `progress(0..1)` and `done()`. */
export function createLoader(label = 'Loading') {
  const el = document.createElement('div');
  el.className = 'gx-loader';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="gx-loader-label">${esc(label)}</span><span class="gx-loader-bar"><i></i></span>`;
  document.body.append(el);
  const bar = el.querySelector('i')!;
  return {
    progress(p: number) { bar.style.width = `${Math.round(Math.min(1, p) * 100)}%`; },
    done() { el.classList.add('is-done'); setTimeout(() => el.remove(), 900); },
  };
}
