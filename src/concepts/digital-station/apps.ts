/** Secondary applications: Terminal, Notebook, Projects, Atlas, Mail, About. */
import { person, research, projects, publications, about, sections } from '../../shared/content';
import type { Ctx, AppInstance } from './wm';
import { logo } from './icons';
import { LAND } from './worldmap';

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const isPh = (s: string) => s.startsWith('[Placeholder');
const ph = (s: string) => (isPh(s) ? `<span class="ph">${esc(s)}</span>` : esc(s));
const stripPh = (s: string) => s.replace(/^\[Placeholder\]\s*/, '');
const ghHandle = person.github.replace(/^https?:\/\//, '');

// ---------------------------------------------------------------- Terminal
export const APP_IDS = ['sparklab', 'terminal', 'notebook', 'projects', 'atlas', 'mail', 'about'];

export function mountTerminal(body: HTMLElement, ctx: Ctx): AppInstance & { exec(cmd: string): void } {
  body.classList.add('term');
  body.innerHTML = `<div class="term-out" role="log" aria-live="polite" aria-label="Terminal output"></div>
    <form class="term-line" autocomplete="off"><label for="term-in" class="term-ps">gabriel@spark:~$</label>
    <input id="term-in" spellcheck="false" autocapitalize="off" aria-label="Terminal command. Type help for commands." /></form>`;
  const out = body.querySelector('.term-out') as HTMLElement;
  const input = body.querySelector('input') as HTMLInputElement;
  const hist: string[] = [];
  let hi = 0;

  const files: Record<string, string> = {
    'research.md': research.map((r) => `## ${r.title}\n${r.body}`).join('\n\n'),
    'about.md': `# ${person.name}\n${person.role}\n${person.affiliation}\n\n` + about.map((a) => `## ${a.title}\n${a.body}`).join('\n\n'),
    'projects.md': projects.map((p) => `- ${p.title}\n  ${p.body}`).join('\n'),
    'publications.bib': publications.map((p) => `% ${p.title}\n% ${p.body}`).join('\n'),
    'contact.vcf': `BEGIN:VCARD\nFN:${person.name}\nTITLE:${person.role}\nORG:${person.affiliation}\nURL:${person.github}\nEMAIL:${person.email}\nEND:VCARD`,
  };
  const commands = ['help', 'whoami', 'ls', 'cat', 'open', 'projects', 'contact', 'clear', 'date', 'spark', 'run', 'sudo', 'uname'];

  const print = (html: string, cls = '') => {
    const p = document.createElement('pre');
    if (cls) p.className = cls;
    p.innerHTML = html;
    out.append(p);
    body.scrollTop = body.scrollHeight;
    out.scrollTop = out.scrollHeight;
  };
  const txt = (s: string) => esc(s).replace(/\[Placeholder[^\]]*\]/g, (m) => `<span class="ph">${m}</span>`);

  const run: Record<string, (args: string[]) => void> = {
    help: () => print(`<b>available commands</b>
  whoami            who runs this station
  ls                list files in ~
  cat &lt;file&gt;        print a file   (try: cat research.md)
  open &lt;app&gt;        sparklab · notebook · projects · atlas · mail · about
  projects          list projects
  contact           how to reach Gabriel
  spark             open SparkLab and run detection
  clear             clear the screen
<span class="dim">  …and a couple of undocumented ones.</span>`),
    whoami: () => print(`<b>${esc(person.name)}</b>\n${esc(person.role)}\n${esc(person.affiliation)}\n\n<span class="dim">“${esc(person.tagline)}”</span>`),
    ls: () => print(Object.keys(files).map((f) => `<span class="${f.endsWith('.md') ? 'f-md' : 'f-x'}">${f}</span>`).join('   ') + '   <span class="f-app">sparklab.app</span>'),
    cat: ([f]) => {
      if (!f) return print('usage: cat &lt;file&gt;', 'err');
      if (f.replace('~/', '') in files) return print(txt(files[f.replace('~/', '')]));
      print(`cat: ${esc(f)}: no such file`, 'err');
    },
    open: ([a]) => {
      const id = (a ?? '').toLowerCase().replace(/\.app$/, '');
      if (!APP_IDS.includes(id)) return print(`open: unknown app “${esc(a ?? '')}”. Apps: ${APP_IDS.join(', ')}`, 'err');
      print(`launching ${id}…`, 'dim');
      ctx.open(id);
    },
    projects: () => print(projects.map((p, i) => `${String(i + 1).padStart(2, '0')}  ${txt(p.title)}`).join('\n') + `\n\n<span class="dim">more at</span> <a href="${person.github}" target="_blank" rel="noopener">${esc(ghHandle)}</a>`),
    contact: () => print(`github  <a href="${person.github}" target="_blank" rel="noopener">${esc(person.github)}</a>\nemail   ${txt(person.email)}`),
    clear: () => { out.innerHTML = ''; },
    date: () => print(new Date().toString()),
    uname: () => print('SPARK/OS 4.2 “Ryanodine” · window server 0.9 · synthetic datasets only'),
    spark: () => { print('opening SparkLab, running detection on synthetic data…', 'dim'); ctx.open('sparklab'); window.dispatchEvent(new CustomEvent('ds:run-detection')); },
    sudo: () => print('gabriel is not in the sudoers file.\nThis incident will be reported to the PI.', 'err'),
    run: () => {
      const steps = ['lacing up ............. ok', 'warm-up ............... ok', 'intervals ............. ▮▮▮▮▮▮▮▮ 8/8', 'cool-down ............. ok'];
      const end = () => print(`pace: <span class="ph">[Placeholder — Gabriel hasn't shared his splits]</span>\n<span class="dim">note: endurance is just calcium handling with better playlists.</span>`);
      if (ctx.reduced) { print(steps.join('\n')); return end(); }
      steps.forEach((s, i) => setTimeout(() => { print(s); if (i === steps.length - 1) end(); }, 220 * (i + 1)));
    },
  };

  const exec = (line: string) => {
    print(`<span class="ps">gabriel@spark:~$</span> ${esc(line)}`, 'echo');
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) return;
    if (cmd === 'rm') return print('rm: refusing to delete research. Science is cumulative.', 'err');
    (run[cmd] ?? (() => print(`command not found: ${esc(cmd)} — try <b>help</b>`, 'err')))(args);
  };

  body.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    if (v.trim()) hist.push(v);
    hi = hist.length;
    input.value = '';
    exec(v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && hi > 0) { input.value = hist[--hi]; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] ?? ''; e.preventDefault(); }
    else if (e.key === 'Tab' && input.value && !input.value.includes(' ')) {
      const m = commands.filter((c) => c.startsWith(input.value));
      if (m.length === 1) { input.value = m[0] + ' '; e.preventDefault(); }
    }
  });
  body.addEventListener('click', (e) => { if (!(e.target as Element).closest('a') && !getSelection()?.toString()) input.focus(); });

  print(`<span class="dim">SPARK/OS terminal · type</span> <b>help</b> <span class="dim">to list commands</span>`);
  return { exec, focusTarget: () => input };
}

// ---------------------------------------------------------------- Notebook
const sketches = [
  // calcium transient / spark kinetics
  `<path d="M6 70 L40 70 C44 70 46 18 52 18 C62 18 74 58 120 66 L174 69" class="k1"/>
   <path d="M52 18v52M30 44h44" class="k2"/><text x="56" y="30">peak</text><text x="96" y="58">decay τ</text>`,
  // segmentation grid
  `<g class="k3">${Array.from({ length: 6 }, (_, i) => Array.from({ length: 10 }, (_, j) => `<rect x="${10 + j * 16}" y="${8 + i * 11}" width="14" height="9" ${((i * 7 + j * 3) % 5 === 0 || (i === 2 && j > 3 && j < 7)) ? 'class="on"' : ''}/>`).join('')).join('')}</g>
   <text x="10" y="84">image → mask → measurements</text>`,
  // phenotype ↔ genotype ↔ clinic
  `<circle cx="34" cy="40" r="20" class="k1"/><circle cx="90" cy="40" r="20" class="k1"/><circle cx="146" cy="40" r="20" class="k1"/>
   <path d="M54 40h16M110 40h16" class="k2"/><text x="20" y="44">cell</text><text x="74" y="44">gene</text><text x="128" y="44">clinic</text>
   <text x="44" y="82">? → severity → treatment</text>`,
  `<path d="M20 20h140M20 36h140M20 52h100" class="k2"/><text x="20" y="80">[ references to be added ]</text>`,
];

export function mountNotebook(body: HTMLElement): void {
  body.classList.add('nb');
  const pages = [
    ...research.map((r) => ({ title: r.title, body: r.body, placeholder: false })),
    ...publications.map((p) => ({ title: stripPh(p.title), body: p.body, placeholder: true })),
  ];
  body.innerHTML = `
    <nav class="nb-tabs" aria-label="Notebook pages">${pages.map((p, i) =>
      `<button type="button" data-p="${i}" aria-current="${i === 0}"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(p.title)}${p.placeholder ? ' <i class="ph-dot" title="Placeholder"></i>' : ''}</button>`).join('')}</nav>
    <article class="nb-page" tabindex="-1" aria-live="polite"></article>`;
  const page = body.querySelector('.nb-page') as HTMLElement;
  const show = (i: number) => {
    const p = pages[i];
    body.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-current', String(Number((b as HTMLElement).dataset.p) === i)));
    page.innerHTML = `
      <header class="nb-head mono"><span>LAB NOTEBOOK · ${esc(person.name.toUpperCase())}</span><span>p. ${String(i + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}</span></header>
      <h3 class="nb-title">${esc(p.title)}</h3>
      ${p.placeholder ? '<p class="ph-block">[Placeholder] Verified references only — none added yet.</p>' : ''}
      <p class="nb-body">${esc(p.body)}</p>
      <figure class="nb-sketch"><svg viewBox="0 0 180 90" aria-hidden="true">${sketches[Math.min(i, sketches.length - 1)]}</svg>
        <figcaption>fig. ${i + 1} — illustrative margin sketch, not data</figcaption></figure>
      <footer class="nb-foot">
        <button class="btn btn-sm" type="button" data-step="-1" ${i === 0 ? 'disabled' : ''}>‹ Prev</button>
        <span class="mono">${esc(sections.research.label.toLowerCase())} themes · ${i < research.length ? 'from the brief' : 'placeholder'}</span>
        <button class="btn btn-sm" type="button" data-step="1" ${i === pages.length - 1 ? 'disabled' : ''}>Next ›</button>
      </footer>`;
    cur = i;
  };
  let cur = 0;
  body.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.p) show(Number(b.dataset.p));
    if (b.dataset.step) { show(cur + Number(b.dataset.step)); page.focus(); }
  });
  show(0);
}

// ---------------------------------------------------------------- Projects
export function mountProjects(body: HTMLElement): void {
  body.classList.add('fb');
  body.innerHTML = `
    <aside class="fb-side" aria-label="Places">
      <p class="fb-h">Places</p>
      <button type="button" class="fb-place" aria-current="true"><span aria-hidden="true">▸</span> ~/projects</button>
      <a class="fb-place" href="${person.github}" target="_blank" rel="noopener"><span aria-hidden="true">↗</span> GitHub</a>
      <p class="fb-h">Tags</p>
      <span class="fb-tag">python</span><span class="fb-tag">computer vision</span><span class="fb-tag">ai agents</span>
    </aside>
    <div class="fb-main">
      <div class="fb-path mono" aria-hidden="true">/home/gabriel/projects</div>
      <table class="fb-list">
        <caption class="vh">Projects</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Status</th></tr></thead>
        <tbody>${projects.map((p, i) => `<tr><td><button type="button" class="fb-row" data-i="${i}" aria-pressed="${i === 0}">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="#e2dccf" stroke="#47443d"/></svg>
          ${esc(stripPh(p.title))}</button></td><td>folder</td><td>${p.placeholder ? '<span class="ph-tag">placeholder</span>' : 'ready'}</td></tr>`).join('')}</tbody>
      </table>
      <section class="fb-preview well" aria-live="polite"></section>
      <div class="fb-status mono"><span>${projects.length} items · ${projects.filter((p) => p.placeholder).length} placeholders</span>
        <a class="btn btn-sm" href="${person.github}" target="_blank" rel="noopener">Open ${esc(ghHandle)} ↗</a></div>
    </div>`;
  const prev = body.querySelector('.fb-preview') as HTMLElement;
  const show = (i: number) => {
    const p = projects[i];
    body.querySelectorAll('.fb-row').forEach((b) => b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.i) === i)));
    prev.innerHTML = `<h3>${ph(p.title)}</h3><p>${esc(p.body)}</p>`;
  };
  body.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('.fb-row') as HTMLElement | null;
    if (b) show(Number(b.dataset.i));
  });
  show(0);
}

// ---------------------------------------------------------------- Atlas
function inPoly(x: number, y: number, poly: number[][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function mountAtlas(body: HTMLElement): void {
  body.classList.add('atlas');
  const step = 3, dots: string[] = [];
  const px = (lon: number) => lon + 180, py = (lat: number) => 84 - lat;
  for (let lat = 81; lat > -57; lat -= step) {
    for (let lon = -178.5; lon < 180; lon += step) {
      if (LAND.some((p) => inPoly(lon, lat, p))) dots.push(`<circle cx="${px(lon).toFixed(1)}" cy="${py(lat).toFixed(1)}" r="1.05"/>`);
    }
  }
  const grat = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((l) => `<line x1="${px(l)}" x2="${px(l)}" y1="0" y2="146"/>`).join('') +
    [60, 30, 0, -30].map((l) => `<line y1="${py(l)}" y2="${py(l)}" x1="0" x2="360"/>`).join('');
  const bx = px(2.17), by = py(41.39);
  body.innerHTML = `
    <div class="atlas-map well">
      <svg viewBox="0 0 360 146" role="img" aria-label="Stylised dot-matrix world map. Only Barcelona, Gabriel's research base, is marked; travel places are a placeholder.">
        <g class="grat">${grat}</g><g class="land">${dots.join('')}</g>
        <g class="pin"><circle cx="${bx}" cy="${by}" r="5" class="pulse"/><circle cx="${bx}" cy="${by}" r="2.2"/>
          <path d="M${bx} ${by}L${bx + 18} ${by - 16}h44"/><text x="${bx + 20}" y="${by - 19}">BARCELONA · base</text></g>
      </svg>
      <span class="atlas-coord mono" aria-hidden="true">41.39°N 2.17°E</span>
    </div>
    <div class="atlas-side">
      <h3>Travel log</h3>
      <p>Off the bench, ${esc(person.short)} likes travelling and discovering new cultures.</p>
      <p class="ph-block">[Placeholder] Places to be added by Gabriel.</p>
      <ul class="atlas-log mono" aria-label="Logged places"><li><span>01</span>Barcelona — research base (UPC · IIBB-CSIC)</li><li class="empty"><span>02</span>— empty slot —</li><li class="empty"><span>03</span>— empty slot —</li></ul>
    </div>`;
}

// ---------------------------------------------------------------- Mail / Contact
export function mountMail(body: HTMLElement): void {
  body.classList.add('mail');
  body.innerHTML = `
    <aside class="mail-side" aria-label="Mailboxes"><p class="fb-h">Mailboxes</p>
      <span class="fb-place" aria-current="true">Contact card</span><span class="fb-place is-dim">Outbox <small>(0)</small></span></aside>
    <div class="mail-main">
      <header class="mail-hdr">
        <div class="mail-row"><span>From</span><b>${esc(person.name)}</b></div>
        <div class="mail-row"><span>Subject</span><b>How to reach me</b></div>
      </header>
      <div class="mail-body">
        <p>Thanks for stopping by the station. The most reliable way to see what I'm building is GitHub.</p>
        <dl class="vcard">
          <div><dt>GitHub</dt><dd><a href="${person.github}" target="_blank" rel="noopener">${esc(ghHandle)}</a></dd></div>
          <div><dt>Email</dt><dd>${ph(person.email)}</dd></div>
          <div><dt>Affiliation</dt><dd>${esc(person.affiliation)}</dd></div>
        </dl>
        <div class="mail-actions"><a class="btn btn-primary" href="${person.github}" target="_blank" rel="noopener">Open GitHub profile ↗</a>
          <button class="btn" type="button" disabled aria-describedby="mail-note">Compose email</button></div>
        <p class="mail-note" id="mail-note">Compose is disabled until a real address replaces the placeholder.</p>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- About this station
export function mountAbout(body: HTMLElement): void {
  body.classList.add('about');
  body.innerHTML = `
    <div class="about-hero"><span class="about-logo">${logo}</span>
      <div><p class="mono about-os">SPARK/OS 4.2 · “Ryanodine”</p><h3>${esc(person.name)}</h3><p class="about-role">${esc(person.role)}</p></div></div>
    <p class="about-tag">${esc(person.tagline)}</p>
    <dl class="spec mono">
      <div><dt>Host</dt><dd>${esc(person.affiliation)}</dd></div>
      <div><dt>Runtime</dt><dd>Python (mostly)</dd></div>
      <div><dt>Modules</dt><dd>biology · AI · engineering · software</dd></div>
      <div><dt>Datasets</dt><dd>synthetic only on this station</dd></div>
    </dl>
    ${about.map((a) => `<section class="about-sec"><h4>${esc(a.title)}</h4><p>${esc(a.body)}</p></section>`).join('')}`;
}
