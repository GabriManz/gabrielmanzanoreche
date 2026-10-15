/**
 * Tiny window manager: draggable, focusable, closable windows with z-order.
 * Windows are created lazily and kept in the DOM when closed (state survives).
 */
import { icons } from './icons';

export interface Ctx {
  open(id: string, opts?: { focus?: boolean }): void;
  close(id: string): void;
  reduced: boolean;
  mobile(): boolean;
}
export interface AppInstance { onOpen?(): void; focusTarget?(): HTMLElement | null }
export interface AppDef {
  id: string; title: string; file: string; blurb: string;
  w: number; h: number; x: number; y: number;
  mount(body: HTMLElement, ctx: Ctx): AppInstance | void;
}

interface Win { el: HTMLElement; inst: AppInstance | void; opener: Element | null; placed: boolean }

export class WM {
  private wins = new Map<string, Win>();
  private z = 10;
  private order: string[] = [];          // open windows, back → front
  readonly ctx: Ctx;

  constructor(private layer: HTMLElement, private apps: AppDef[], private onChange: () => void, reduced: boolean, private isMobile: () => boolean) {
    this.ctx = { open: (id, o) => this.open(id, o), close: (id) => this.close(id), reduced, mobile: isMobile };
  }

  get active() { return this.order[this.order.length - 1] ?? null; }
  isOpen(id: string) { return this.order.includes(id); }
  def(id: string) { return this.apps.find((a) => a.id === id); }

  open(id: string, { focus = true }: { focus?: boolean } = {}) {
    const def = this.def(id);
    if (!def) return;
    if (this.isMobile()) for (const o of [...this.order]) if (o !== id) this.close(o, false);
    let w = this.wins.get(id);
    if (!w) w = this.create(def);
    if (focus) w.opener = document.activeElement;
    if (!this.isOpen(id)) {
      w.el.hidden = false;
      if (!w.placed) this.place(def, w);
      w.el.classList.remove('is-closing');
      if (!this.ctx.reduced) { w.el.classList.add('is-opening'); setTimeout(() => w!.el.classList.remove('is-opening'), 260); }
      w.inst?.onOpen?.();
    }
    this.raise(id);
    if (focus) (w.inst?.focusTarget?.() ?? w.el).focus({ preventScroll: true });
  }

  close(id: string, restoreFocus = true) {
    const w = this.wins.get(id);
    if (!w || !this.isOpen(id)) return;
    w.el.hidden = true;
    this.order = this.order.filter((o) => o !== id);
    this.sync();
    if (!restoreFocus) return;
    const opener = w.opener as HTMLElement | null;
    const top = this.active;
    if (opener && opener.isConnected && opener.offsetParent !== null && !opener.closest('.win[hidden]')) opener.focus();
    else if (top) this.wins.get(top)!.el.focus();
  }

  raise(id: string) {
    const w = this.wins.get(id)!;
    this.order = this.order.filter((o) => o !== id).concat(id);
    w.el.style.zIndex = String(++this.z);
    this.sync();
  }

  cycle() {
    if (this.order.length < 2) return;
    this.open(this.order[0]);
  }

  private sync() {
    for (const [id, w] of this.wins) w.el.classList.toggle('is-active', id === this.active);
    this.onChange();
  }

  private place(def: AppDef, w: Win) {
    const L = this.layer.getBoundingClientRect();
    const ww = Math.min(def.w, L.width - 24), hh = Math.min(def.h, L.height - 16);
    const x = Math.max(12, Math.min(def.x, L.width - ww - 12));
    const y = Math.max(8, Math.min(def.y, L.height - hh - 8));
    Object.assign(w.el.style, { width: `${ww}px`, height: `${hh}px`, left: `${x}px`, top: `${y}px` });
    w.placed = true;
  }

  private create(def: AppDef): Win {
    const el = document.createElement('section');
    const idx = this.apps.indexOf(def) + 1;
    el.className = `win win-${def.id}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', `win-t-${def.id}`);
    el.tabIndex = -1;
    el.hidden = true;
    el.innerHTML = `
      <header class="win-bar">
        <button class="win-close" type="button" aria-label="Close ${def.title}">
          <span class="wc-x" aria-hidden="true"><svg viewBox="0 0 10 10" width="9" height="9"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
          <span class="wc-back" aria-hidden="true">‹ Apps</span>
        </button>
        <span class="win-ico" aria-hidden="true">${icons[def.id] ?? ''}</span>
        <h2 class="win-title" id="win-t-${def.id}">${def.title}</h2>
        <span class="win-grip" aria-hidden="true"></span>
        <span class="win-key" aria-hidden="true">⌥${idx}</span>
      </header>
      <div class="win-body"></div>`;
    this.layer.append(el);
    const w: Win = { el, inst: undefined, opener: null, placed: false };
    this.wins.set(def.id, w);
    el.querySelector('.win-close')!.addEventListener('click', () => this.close(def.id));
    el.addEventListener('pointerdown', () => { if (this.active !== def.id) this.raise(def.id); }, true);
    el.addEventListener('focusin', () => { if (this.active !== def.id && this.isOpen(def.id)) this.raise(def.id); });
    this.drag(el, el.querySelector('.win-bar') as HTMLElement);
    w.inst = def.mount(el.querySelector('.win-body') as HTMLElement, this.ctx);
    return w;
  }

  private drag(el: HTMLElement, bar: HTMLElement) {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    bar.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('button') || this.isMobile() || e.button !== 0) return;
      on = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
      bar.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    });
    bar.addEventListener('pointermove', (e) => {
      if (!on) return;
      const L = this.layer.getBoundingClientRect();
      const x = Math.max(80 - el.offsetWidth, Math.min(L.width - 80, ox + e.clientX - sx));
      const y = Math.max(0, Math.min(L.height - 30, oy + e.clientY - sy));
      el.style.left = `${x}px`; el.style.top = `${y}px`;
    });
    const end = () => { on = false; el.classList.remove('is-dragging'); };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }
}
