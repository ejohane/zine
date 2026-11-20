import tokens from '../tokens.json';

export type Mode = 'day' | 'night';
export type ColorRole = keyof typeof tokens.color;
export type TypeRole = keyof typeof tokens.type;

export { tokens };

export function color(role: ColorRole, mode: Mode): string {
  return tokens.color[role][mode];
}

/** camelCase role -> kebab-case, e.g. onRaisedMuted -> on-raised-muted */
export function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two #RRGGBB colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
