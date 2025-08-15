export const colors = {
  // Brand colors
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  
  // Neutral colors
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
  },
  
  // Semantic colors
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  },
  
  warning: {
    50: '#fefce8',
    500: '#eab308',
    600: '#ca8a04',
    700: '#a16207',
  },
  
  error: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  
  // Platform colors
  platforms: {
    spotify: '#1DB954',
    youtube: '#FF0000',
    apple: '#FC3C44',
    google: '#4285F4',
    rss: '#FFA500',
    podcast: '#7C3AED',
  },
};

// Gradient system with from/to colors and CSS strings
export const gradients = {
  orange: {
    from: '#ff6b35',
    to: '#ff8f65',
    css: 'linear-gradient(135deg, #ff6b35 0%, #ff8f65 100%)',
    radial: 'radial-gradient(circle, #ff6b35 0%, #ff8f65 100%)',
  },
  pink: {
    from: '#ec4899',
    to: '#f472b6',
    css: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)',
    radial: 'radial-gradient(circle, #ec4899 0%, #f472b6 100%)',
  },
  blue: {
    from: '#3b82f6',
    to: '#60a5fa',
    css: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
    radial: 'radial-gradient(circle, #3b82f6 0%, #60a5fa 100%)',
  },
  green: {
    from: '#10b981',
    to: '#34d399',
    css: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    radial: 'radial-gradient(circle, #10b981 0%, #34d399 100%)',
  },
  purple: {
    from: '#8b5cf6',
    to: '#a78bfa',
    css: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
    radial: 'radial-gradient(circle, #8b5cf6 0%, #a78bfa 100%)',
  },
  // Platform gradients
  spotify: {
    from: '#1DB954',
    to: '#1ed760',
    css: 'linear-gradient(135deg, #1DB954 0%, #1ed760 100%)',
    radial: 'radial-gradient(circle, #1DB954 0%, #1ed760 100%)',
  },
  youtube: {
    from: '#FF0000',
    to: '#ff4444',
    css: 'linear-gradient(135deg, #FF0000 0%, #ff4444 100%)',
    radial: 'radial-gradient(circle, #FF0000 0%, #ff4444 100%)',
  },
} as const;

// Helper function to create custom gradients
export const createGradient = (from: string, to: string, angle = 135) => ({
  from,
  to,
  css: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`,
  radial: `radial-gradient(circle, ${from} 0%, ${to} 100%)`,
});