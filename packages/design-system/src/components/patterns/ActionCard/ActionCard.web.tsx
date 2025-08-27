import * as React from 'react';
import { cn } from '../../../lib/utils';
import { Card } from '../../primitives/Card/Card.web';
import { Text } from '../../primitives/Text/Text.web';

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
    <Card
      variant="outlined"
      interactive={!disabled && !!onPress}
      onClick={disabled ? undefined : onPress}
      className={cn(
        'flex flex-1 flex-col items-center justify-center min-h-[130px] p-6',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="flex items-center justify-center mb-3">
        {icon}
      </div>
      <Text variant="body" weight="semibold">
        {label}
      </Text>
    </Card>
  );
};