// Semantic tokens from DESIGN.md §2. Screens use these only — never raw hex values.
// Same token names in both themes; read the active palette with `useTheme()` (theme/theme.tsx).
import type { TextStyle } from 'react-native';

export type Scheme = 'light' | 'dark';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `hex` at `a` alpha, as an rgba() string. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** `a` mixed `w` (0–1) with `b`. */
export function mix(a: string, b: string, w: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v * w + y[i]! * (1 - w)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const base = {
  light: {
    brand: { primary: '#101C2C', accent: '#18A6A6', accentStrong: '#118787', highlight: '#F4C542' },
    surface: {
      base: '#FFFFFF',
      page: '#F5F7FA',
      elevated: '#FFFFFF',
      accent: '#EAF7F7',
    },
    text: { primary: '#17202B', secondary: '#626D78', disabled: '#A5ADB6' },
    border: { subtle: '#DCE3EA' },
    status: { present: '#159A63', away: '#2388D9', missing: '#D64545', warning: '#D98A16' },
    onAccent: '#0B1A24',
    accentInk: '#0F6E6E',
    highlightInk: '#8A6A00',
    heroBg: '#101C2C',
    cmd: { tint: '#FFF4D6', ink: '#7A5A00' },
    scrim: 'rgba(16, 28, 44, 0.44)',
    toast: { bg: '#17202B', fg: '#F4F7FA' },
  },
  dark: {
    brand: { primary: '#0B1420', accent: '#35C2C2', accentStrong: '#27A9A9', highlight: '#F4C542' },
    surface: {
      base: '#151F2B',
      page: '#0B1118',
      elevated: '#1C2835',
      accent: '#123638',
    },
    text: { primary: '#F4F7FA', secondary: '#AAB5C0', disabled: '#65717D' },
    border: { subtle: '#2A3744' },
    status: { present: '#35C98A', away: '#54A9EA', missing: '#F06A6A', warning: '#F0A83A' },
    onAccent: '#0B1420',
    accentInk: '#35C2C2',
    highlightInk: '#F4C542',
    heroBg: '#152A36',
    cmd: { tint: '#3A3113', ink: '#F4C542' },
    scrim: 'rgba(3, 7, 12, 0.66)',
    toast: { bg: '#F4F7FA', fg: '#17202B' },
  },
} as const;

type Base = (typeof base)['light'];

/** A color role that gets a tinted bg + readable fg (DESIGN.md §2.1 tint rule). */
export type Role = 'present' | 'away' | 'missing' | 'warning' | 'accent' | 'accentStrong' | 'highlight' | 'neutral';

function build(scheme: Scheme) {
  const b: Base = base[scheme] as unknown as Base;
  const heroText = '#F4F7FA';
  const roleColor: Record<Role, string> = {
    present: b.status.present,
    away: b.status.away,
    missing: b.status.missing,
    warning: b.status.warning,
    accent: b.brand.accent,
    accentStrong: b.brand.accentStrong,
    highlight: b.highlightInk,
    neutral: b.text.secondary,
  };
  const bgAlpha = scheme === 'dark' ? 0.18 : 0.14;
  const tint = Object.fromEntries(
    (Object.keys(roleColor) as Role[]).map((r) => [
      r,
      {
        base: roleColor[r],
        bg: alpha(roleColor[r], bgAlpha),
        fg: scheme === 'dark' ? roleColor[r] : mix(roleColor[r], b.text.primary, 0.68),
      },
    ]),
  ) as Record<Role, { base: string; bg: string; fg: string }>;
  return {
    ...b,
    scheme,
    hero: {
      bg: b.heroBg,
      text: heroText,
      textMuted: alpha(heroText, 0.72),
      tile: alpha(heroText, 0.09),
      accent: '#35C2C2',
    },
    tint,
    /** Soft focus ring for inputs (teal 4px @16%). */
    focusRing: alpha(b.brand.accent, 0.16),
  };
}

export const palettes = { light: build('light'), dark: build('dark') } as const;
export type Palette = ReturnType<typeof build>;

export const font = {
  regular: 'IBMPlexSansHebrew_400Regular',
  medium: 'IBMPlexSansHebrew_500Medium',
  semibold: 'IBMPlexSansHebrew_600SemiBold',
  bold: 'IBMPlexSansHebrew_700Bold',
} as const;

export const type = {
  display: { fontFamily: font.bold, fontSize: 26, lineHeight: 34 },
  title: { fontFamily: font.bold, fontSize: 20, lineHeight: 28 },
  heading: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 24 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

/** Tabular numerals for times, dates and counts. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, screen: 16 } as const;

export const radius = { pill: 999, card: 24, hero: 28, sheet: 28, tile: 14, cell: 14 } as const;

export const motion = { fast: 150, base: 250, slow: 350 } as const;

/** Navy-tinted shadows. In dark mode cards use a 1px border instead (see `cardSurface`). */
export function shadows(c: Palette) {
  const s = (opacity: number, radiusPx: number, y: number, elevation: number) =>
    c.scheme === 'dark'
      ? {}
      : {
          shadowColor: c.brand.primary,
          shadowOpacity: opacity,
          shadowRadius: radiusPx,
          shadowOffset: { width: 0, height: y },
          elevation,
        };
  return { sm: s(0.06, 6, 2, 1), md: s(0.08, 16, 6, 3), lg: s(0.16, 28, 12, 8) };
}

/** Card look: white + shadow in light; surface + 1px border in dark. */
export function cardSurface(c: Palette) {
  return {
    backgroundColor: c.surface.base,
    borderRadius: radius.card,
    ...(c.scheme === 'dark' ? { borderWidth: 1, borderColor: c.border.subtle } : shadows(c).md),
  };
}
