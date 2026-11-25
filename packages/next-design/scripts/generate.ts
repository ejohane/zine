import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kebab, tokens, type ColorRole, type TypeRole } from '../src/index';

const HEADER =
  'Generated from packages/next-design/tokens.json by `bun run generate`. Do not edit.';

export function renderCss(): string {
  const lines: string[] = [`/* ${HEADER} */`, ':root {', '  color-scheme: light dark;'];
  for (const role of Object.keys(tokens.color) as ColorRole[]) {
    const { day, night } = tokens.color[role];
    lines.push(`  --zn-color-${kebab(role)}: light-dark(${day}, ${night});`);
  }
  lines.push(`  --zn-font: '${tokens.font.family}', ${tokens.font.fallback};`);
  for (const role of Object.keys(tokens.type) as TypeRole[]) {
    const t = tokens.type[role];
    lines.push(
      `  --zn-type-${kebab(role)}: ${t.weight} ${t.size}px/${t.lineHeight} var(--zn-font);`,
      `  --zn-tracking-${kebab(role)}: ${t.tracking}em;`
    );
  }
  for (const group of ['radius', 'size', 'space'] as const) {
    for (const [name, value] of Object.entries(tokens[group])) {
      lines.push(`  --zn-${group}-${kebab(name)}: ${value}px;`);
    }
  }
  lines.push(
    '}',
    ":root[data-theme='light'] {",
    '  color-scheme: light;',
    '}',
    ":root[data-theme='dark'] {",
    '  color-scheme: dark;',
    '}',
    ''
  );
  return lines.join('\n');
}

export function renderSwift(): string {
  const hex = (value: string) => `0x${value.slice(1)}`;
  const lines: string[] = [
    `// ${HEADER}`,
    'import SwiftUI',
    'import UIKit',
    '',
    'enum ZineNextTokens {',
    '    enum Colors {',
  ];
  for (const role of Object.keys(tokens.color) as ColorRole[]) {
    const { day, night } = tokens.color[role];
    lines.push(`        static let ${role} = adaptive(${hex(day)}, ${hex(night)})`);
  }
  lines.push(
    '',
    '        private static func adaptive(_ day: UInt32, _ night: UInt32) -> Color {',
    '            Color(uiColor: UIColor { traits in',
    '                let rgb = traits.userInterfaceStyle == .dark ? night : day',
    '                return UIColor(red: CGFloat((rgb >> 16) & 255) / 255,',
    '                               green: CGFloat((rgb >> 8) & 255) / 255,',
    '                               blue: CGFloat(rgb & 255) / 255, alpha: 1)',
    '            })',
    '        }',
    '    }',
    '',
    `    static let fontFamily = "${tokens.font.family}"`,
    '',
    '    struct TypeStyle {',
    '        let size: CGFloat',
    '        let lineHeight: CGFloat',
    '        let weight: Font.Weight',
    '        /// Tracking in points (size multiplied by the em value).',
    '        let tracking: CGFloat',
    '    }',
    '',
    '    enum TypeScale {'
  );
  const weights: Record<number, string> = { 400: '.regular', 500: '.medium', 700: '.bold' };
  for (const role of Object.keys(tokens.type) as TypeRole[]) {
    const t = tokens.type[role];
    const tracking = Math.round(t.size * t.tracking * 100) / 100;
    lines.push(
      `        static let ${role} = TypeStyle(size: ${t.size}, lineHeight: ${t.lineHeight}, weight: ${weights[t.weight]}, tracking: ${tracking})`
    );
  }
  lines.push('    }');
  for (const group of ['radius', 'size', 'space'] as const) {
    const name = group[0].toUpperCase() + group.slice(1);
    lines.push('', `    enum ${name} {`);
    for (const [key, value] of Object.entries(tokens[group])) {
      lines.push(`        static let ${key}: CGFloat = ${value}`);
    }
    lines.push('    }');
  }
  lines.push('}', '');
  return lines.join('\n');
}

export const outputs = {
  'generated/tokens.css': renderCss,
  'generated/ZineNextTokens.swift': renderSwift,
} as const;

if (import.meta.main) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const [path, render] of Object.entries(outputs)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, render());
    console.log(`wrote ${path}`);
  }
}
