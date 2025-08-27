
import { useTheme, type Theme } from '../../providers/theme/ThemeProvider';
import { cn } from '../../lib/cn';

export interface ThemeSwitcherProps {
  className?: string;
}

export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const themes: { value: Theme; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'system', label: 'System', icon: '💻' },
  ];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Theme:
      </span>
      <div className="flex gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1">
        {themes.map(({ value, label, icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              'hover:bg-neutral-200 dark:hover:bg-neutral-700',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              'dark:focus:ring-offset-neutral-900',
              theme === value && [
                'bg-white dark:bg-neutral-900',
                'text-primary-600 dark:text-primary-400',
                'shadow-sm',
              ],
              theme !== value && [
                'text-neutral-600 dark:text-neutral-400',
              ]
            )}
            aria-label={`Switch to ${label} theme`}
            aria-pressed={theme === value}
          >
            <span className="text-base" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {theme === 'system' && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          (Currently: {resolvedTheme})
        </span>
      )}
    </div>
  );
}