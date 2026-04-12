import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { CSSProperties } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type TypographyToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: CSSProperties['fontWeight'];
  letterSpacing?: number;
  textTransform?: CSSProperties['textTransform'];
};

export function typographyStyle(token: TypographyToken): CSSProperties {
  const style: CSSProperties = {
    fontSize: token.fontSize,
    lineHeight: `${token.lineHeight}px`,
    fontWeight: token.fontWeight,
  };

  if (typeof token.letterSpacing === 'number') {
    style.letterSpacing = `${token.letterSpacing}px`;
  }

  if (token.textTransform) {
    style.textTransform = token.textTransform;
  }

  return style;
}
