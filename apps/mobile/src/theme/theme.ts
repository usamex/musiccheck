/**
 * MusicCheck visual theme — a single dark theme modelled on the Gemini app's dark palette
 * (Material 3 surface/on-surface tokens as rendered by gemini.google.com in dark mode, read from
 * its `--gem-sys-color--*` CSS variables on 2026-10-18). Colours only: no Google logos, marks or
 * fonts are used.
 *
 * The app is dark-only (`userInterfaceStyle: "dark"` in app.json).
 */

export interface Palette {
  /** Screen background (`surface`). */
  background: string;
  /** Cards, input-like containers (`surface-container`). */
  surface: string;
  /** Raised elements, pressed rows, tonal buttons (`surface-container-high`). */
  surfaceHigh: string;
  /** Highest emphasis surfaces, e.g. artwork placeholder (`surface-container-highest`). */
  surfaceHighest: string;
  /** Primary text (`on-surface`). */
  text: string;
  /** Secondary text (`on-surface-variant`). */
  textMuted: string;
  /** Tertiary / hint text (`on-surface-low`). */
  textSubtle: string;
  /** Hairlines and dividers (`outline-variant`). */
  border: string;
  /** Accent for links, icons and filled buttons (`primary`). */
  primary: string;
  /** Text/icons on `primary` (`on-primary`). */
  primaryText: string;
  /** Chips and tonal highlights (`primary-container`). */
  primaryContainer: string;
  onPrimaryContainer: string;
  /** Error text/icons (`error`). */
  danger: string;
  dangerContainer: string;
  onDangerContainer: string;
  /** Recording indicator (Gemini red). */
  recording: string;
  /** Signature gradient: blue → purple → pink (Gemini mic gradient). */
  gradient: readonly [string, string, string];
  /** Translucent glow behind the identify button. */
  glow: string;
}

export const palette: Palette = {
  background: '#131314',
  surface: '#1E1F20',
  surfaceHigh: '#282A2C',
  surfaceHighest: '#333537',
  text: '#E3E3E3',
  textMuted: '#C4C7C5',
  textSubtle: '#9A9B9C',
  border: '#444746',
  primary: '#A8C7FA',
  primaryText: '#062E6F',
  primaryContainer: '#1F3760',
  onPrimaryContainer: '#D3E3FD',
  danger: '#F2B8B5',
  dangerContainer: '#601410',
  onDangerContainer: '#F9DEDC',
  recording: '#F55E57',
  gradient: ['#4E8FF8', '#AD72FF', '#FFAEE4'],
  glow: 'rgba(120, 130, 255, 0.07)',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 16, lg: 24, xl: 28, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '400' as const, letterSpacing: -0.2 },
  title: { fontSize: 24, fontWeight: '500' as const },
  headline: { fontSize: 20, fontWeight: '500' as const },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '500' as const, letterSpacing: 0.1 },
  caption: { fontSize: 12, fontWeight: '400' as const },
};

export function useAppTheme(): { dark: true; colors: Palette } {
  return { dark: true, colors: palette };
}
