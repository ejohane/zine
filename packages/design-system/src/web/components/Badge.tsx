import React from 'react';
import { Badge as HeroUIBadge } from '@heroui/react';
import type { BadgeProps } from '../../core/types/components';

export const Badge: React.FC<BadgeProps> = ({ children, ...props }) => (
  <HeroUIBadge {...props}>
    {children}
  </HeroUIBadge>
);