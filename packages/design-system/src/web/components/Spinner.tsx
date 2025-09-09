import React from 'react';
import { Spinner as HeroUISpinner } from '@heroui/react';
import type { SpinnerProps } from '../../core/types/components';

export const Spinner: React.FC<SpinnerProps> = (props) => (
  <HeroUISpinner {...props} />
);