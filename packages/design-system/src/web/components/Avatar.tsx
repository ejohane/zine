import React from 'react';
import { Avatar as HeroUIAvatar } from '@heroui/react';
import type { AvatarProps } from '../../core/types/components';

export const Avatar: React.FC<AvatarProps> = (props) => (
  <HeroUIAvatar {...props} />
);