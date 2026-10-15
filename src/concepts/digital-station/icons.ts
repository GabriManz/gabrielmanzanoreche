/** Hand-drawn 32×32 line icons. Ink strokes on putty tiles, one accent each. */
const svg = (body: string) =>
  `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons: Record<string, string> = {
  sparklab: svg(`
    <rect x="4" y="7" width="24" height="18" rx="1.5" fill="#0d120f" stroke="currentColor"/>
    <ellipse cx="13" cy="15" rx="2.6" ry="4.2" fill="#6bf5a2" stroke="none" opacity=".95"/>
    <ellipse cx="13" cy="15" rx="5" ry="6.5" fill="#16944f" stroke="none" opacity=".45"/>
    <path d="M20 12h4M20 15h6M20 18h3" stroke="#6bf5a2" stroke-width="1" opacity=".7"/>
    <rect x="8.5" y="8.5" width="9" height="13" stroke="var(--signal)" stroke-width="1.2" stroke-dasharray="2 1.4"/>`),
  terminal: svg(`
    <rect x="4" y="6" width="24" height="20" rx="2" fill="#0d120f"/>
    <path d="M9 13l4 3-4 3" stroke="#6bf5a2"/><path d="M15 20h6" stroke="#6bf5a2"/>
    <path d="M4 10h24" opacity=".5"/>`),
  notebook: svg(`
    <rect x="8" y="4.5" width="18" height="23" rx="1.5" fill="#f3efe4"/>
    <path d="M12 10h10M12 13.5h10M12 17h7" opacity=".55"/>
    <path d="M12 22c2-3 3 1 5-2s3 1 5-1" stroke="var(--signal)"/>
    <path d="M6 8h4M6 12h4M6 16h4M6 20h4M6 24h4"/>`),
  projects: svg(`
    <path d="M4 9.5a1.5 1.5 0 0 1 1.5-1.5h6.5l2.5 2.5h12a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-21A1.5 1.5 0 0 1 4 24.5z" fill="#e2dccf"/>
    <path d="M4 13.5h24"/><path d="M9 19h7" stroke="var(--signal)"/>`),
  atlas: svg(`
    <circle cx="16" cy="16" r="11" fill="#e2dccf"/>
    <ellipse cx="16" cy="16" rx="4.6" ry="11" opacity=".6"/>
    <path d="M5 16h22M7 10.5h18M7 21.5h18" opacity=".6"/>
    <circle cx="17.5" cy="11.5" r="1.8" fill="var(--signal)" stroke="none"/>`),
  mail: svg(`
    <rect x="4" y="8" width="24" height="16" rx="1.5" fill="#e2dccf"/>
    <path d="M4.5 9l11.5 9 11.5-9"/><path d="M21 21h4" stroke="var(--signal)"/>`),
  about: svg(`
    <rect x="5" y="5" width="22" height="15" rx="1.5" fill="#e2dccf"/>
    <rect x="8" y="8" width="16" height="9" rx=".5" fill="#0d120f"/>
    <path d="M10 14l2-3 2 2 3-4 3 5" stroke="#6bf5a2" stroke-width="1.1"/>
    <path d="M9 24h14M12 20v4M20 20v4"/><circle cx="23.5" cy="22" r="1" fill="var(--signal)" stroke="none"/>`),
};

export const logo = `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
  <rect x="1" y="1" width="38" height="38" rx="7" fill="#1c1b19"/>
  <path d="M6 27h7l2.2-6 3.4 13 3.6-24 2.6 17H34" fill="none" stroke="#ff5b1f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="21.2" cy="10" r="3.2" fill="#6bf5a2"/></svg>`;
