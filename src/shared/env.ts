/** Environment capability helpers shared by all concepts. */

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isTouch = (): boolean => window.matchMedia('(pointer: coarse)').matches;

/** Seeded PRNG (mulberry32) so synthetic data is reproducible between visits. */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resolve a site-root-relative path so the build works under any URL prefix
 * (local preview, static host sub-folder, artifact preview). Built chunks live in
 * `<root>/assets/`, so the site root is one level above this module.
 */
export const ROOT = import.meta.env.DEV ? '/' : new URL('../', import.meta.url).href;
export const url = (p: string) => ROOT + p.replace(/^\//, '');
