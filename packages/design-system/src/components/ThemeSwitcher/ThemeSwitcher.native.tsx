import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme, type Theme } from '../../providers/theme/ThemeProvider';

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
    <View className={`flex-row items-center gap-2 ${className || ''}`}>
      <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Theme:
      </Text>
      <View className="flex-row gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1">
        {themes.map(({ value, label, icon }) => (
          <TouchableOpacity
            key={value}
            onPress={() => setTheme(value)}
            className={`
              flex-row items-center gap-1.5 px-3 py-1.5 rounded-md
              ${theme === value 
                ? 'bg-white dark:bg-neutral-900 shadow-sm' 
                : ''
              }
            `}
            accessibilityLabel={`Switch to ${label} theme`}
            accessibilityState={{ selected: theme === value }}
          >
            <Text className="text-base">{icon}</Text>
            <Text 
              className={`
                text-sm font-medium
                ${theme === value 
                  ? 'text-primary-600 dark:text-primary-400' 
                  : 'text-neutral-600 dark:text-neutral-400'
                }
              `}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {theme === 'system' && (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          (Currently: {resolvedTheme})
        </Text>
      )}
    </View>
  );
}