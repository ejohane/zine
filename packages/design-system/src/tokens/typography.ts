export const typography = {
  fonts: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'].join(', '),
    mono: ['JetBrains Mono', 'Consolas', 'monospace'].join(', '),
    display: ['Cal Sans', 'Inter', 'sans-serif'].join(', '),
  },
  
  sizes: {
    xs: ['0.75rem', { lineHeight: '1rem' }] as [string, { lineHeight: string }],      // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }] as [string, { lineHeight: string }],  // 14px
    base: ['1rem', { lineHeight: '1.5rem' }] as [string, { lineHeight: string }],     // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }] as [string, { lineHeight: string }],  // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }] as [string, { lineHeight: string }],   // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }] as [string, { lineHeight: string }],    // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }] as [string, { lineHeight: string }],// 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }] as [string, { lineHeight: string }],  // 36px
    '5xl': ['3rem', { lineHeight: '1' }] as [string, { lineHeight: string }],          // 48px
    '6xl': ['3.75rem', { lineHeight: '1' }] as [string, { lineHeight: string }],       // 60px
  },
  
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
  },
};