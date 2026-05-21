import { browser } from '$app/environment';

export type Mode = 'light' | 'dark';
export type ThemeKey = 'dark' | 'light' | 'dark-hc' | 'light-hc';

// NOTE: The mode-resolution and localStorage keys below are mirrored by the
// inline anti-flash IIFE in src/app.html (which cannot import this module).
// Keep the two in sync: 'theme-mode' / 'theme-contrast' keys and the
// resolveTheme() formula must match app.html.
function initialMode(): Mode {
  if (!browser) return 'dark';
  const stored = localStorage.getItem('theme-mode');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialContrast(): boolean {
  if (!browser) return false;
  return localStorage.getItem('theme-contrast') === 'true';
}

/** Reactive theme state. Mutate `.mode` / `.highContrast` to change the theme. */
export const theme = $state({
  mode: initialMode(),
  highContrast: initialContrast()
});

/** Pure: combine the two axes into a single data-theme key. */
export function resolveTheme(mode: Mode, highContrast: boolean): ThemeKey {
  return (highContrast ? `${mode}-hc` : mode) as ThemeKey;
}

/** Sync the <html data-theme> attribute to current state. Does NOT persist. */
export function applyTheme(): void {
  if (!browser) return;
  document.documentElement.dataset.theme = resolveTheme(theme.mode, theme.highContrast);
}

/** Write the user's explicit choice to localStorage. */
function persist(): void {
  if (!browser) return;
  localStorage.setItem('theme-mode', theme.mode);
  localStorage.setItem('theme-contrast', String(theme.highContrast));
}

export function toggleMode(): void {
  theme.mode = theme.mode === 'dark' ? 'light' : 'dark';
  applyTheme();
  persist();
}

export function toggleContrast(): void {
  theme.highContrast = !theme.highContrast;
  applyTheme();
  persist();
}

export interface MapColors {
  land: string;
  landBorder: string;
  backdrop: string;
  backdropBorder: string;
  sea: string;
  lake: string;
  hover: string;
  hoverBorder: string;
  subdivBorder: string;
  hit: string;
  miss: string;
  claimed: string;
  claimedHover: string;
  cursor: string;
}

/** Dark-theme map colors — used as the pre-hydration / SSR fallback. */
export const DEFAULT_MAP_COLORS: MapColors = {
  land: '#8b94a5',
  landBorder: '#cbd2de',
  backdrop: '#2a3344',
  backdropBorder: '#4a5568',
  sea: '#0b0f1a',
  lake: '#0b0f1a',
  hover: '#dde2ea',
  hoverBorder: '#ffffff',
  subdivBorder: '#aab4c4',
  hit: '#22c55e',
  miss: '#ef4444',
  claimed: '#4ade80',
  claimedHover: '#86efac',
  cursor: '#3b82f6'
};

/** Read the current theme's --map-* custom properties off <html>.
    Call only on the client (inside an effect / onMount). */
export function getMapColors(): MapColors {
  if (!browser) return DEFAULT_MAP_COLORS;
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    land: v('--map-land'),
    landBorder: v('--map-land-border'),
    backdrop: v('--map-backdrop'),
    backdropBorder: v('--map-backdrop-border'),
    sea: v('--map-sea'),
    lake: v('--map-lake'),
    hover: v('--map-hover'),
    hoverBorder: v('--map-hover-border'),
    subdivBorder: v('--map-subdiv-border'),
    hit: v('--map-hit'),
    miss: v('--map-miss'),
    claimed: v('--map-claimed'),
    claimedHover: v('--map-claimed-hover'),
    cursor: v('--map-cursor')
  };
}
