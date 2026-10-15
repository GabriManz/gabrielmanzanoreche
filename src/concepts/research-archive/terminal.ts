/**
 * ARCHIVIST — a CRT terminal that queries the archive. Retrieval is a local
 * keyword index over src/shared/content.ts; no AI service is called.
 */
import { sections, person, type SectionKey } from '../../shared/content';

const records = (Object.keys(sections) as SectionKey[]).flatMap((k, si) =>
  sections[k].items.map((it, i) => ({ id: `REC-${si + 1}${String(i + 1).padStart(2, '0')}`, series: sections[k].label, ...it })));

export function mountTerminal() {
  const el = document.createElement('div');
  el.className = 'ra-term';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Archivist terminal');
  el.innerHTML = `<div class="ra-term-out" aria-live="polite"></div>
    <label class="ra-term-in">QUERY&gt; <input aria-label="Query the archive" autocomplete="off" spellcheck="false" /></label>`;
  el.style.display = 'none';
  document.body.append(el);
  const out = el.querySelector('.ra-term-out')!;
  const input = el.querySelector('input')!;
  const print = (s: string, cls = '') => {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = s;
    out.append(p);
    while (out.children.length > 14) out.firstChild!.remove();
  };
  print('ARCHIVIST v0.3 — index of the G.M.R. research collection');
  print(`${records.length} records · type a word (calcium, imaging, python…) or LIST`, 'dim');
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = input.value.trim().toLowerCase();
    input.value = '';
    if (!q) return;
    print(`QUERY> ${q}`, 'echo');
    if (q === 'list' || q === 'ls') return records.forEach((r) => print(`${r.id}  ${r.series.padEnd(9)} ${r.title}`));
    if (q === 'whoami' || q === 'owner') return print(`${person.name} — ${person.role}`);
    if (q === 'clear') { out.innerHTML = ''; return; }
    const words = q.split(/\s+/);
    const hits = records
      .map((r) => ({ r, s: words.reduce((a, w) => a + ((r.title + ' ' + r.body).toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (!hits.length) return print('NO MATCHING RECORDS. TRY: calcium · imaging · learning · running', 'dim');
    hits.slice(0, 3).forEach(({ r }) => {
      print(`${r.id} [${r.series}] ${r.title}`, 'hit');
      print(`  ${r.body.slice(0, 120)}${r.body.length > 120 ? '…' : ''}`, 'dim');
    });
  });
  return el;
}
