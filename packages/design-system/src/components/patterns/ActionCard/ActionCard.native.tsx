import * as React from 'react';
import { View, Pressable } from 'react-native';
import { cn } from '../../../lib/utils';
import { Text } from '../../primitives/Text/Text.native';

export interface ActionCardProps {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  icon,
  label,
  onPress,
  disabled = false,
  className,
}) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}
    >
      {({ pressed }) => (
        <View
          {...{ className: cn(
            pressed ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-white dark:bg-neutral-900',
            'rounded-2xl p-6 items-center justify-center min-h-[130px] shadow-sm border border-neutral-200 dark:border-neutral-800',
            className
          )} as any}
          style={{
            transform: [{ scale: pressed ? 0.97 : 1 }]
          }}
        >
          <View {...{ className: 'items-center justify-center mb-3' } as any}>
            {icon}
          </View>
          <Text variant="body" weight="semibold">
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};