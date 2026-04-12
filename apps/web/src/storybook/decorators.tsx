import type { PropsWithChildren, ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { Spacing } from '@zine/design-system';

interface StoryCanvasProps extends PropsWithChildren {
  padding?: number;
  minHeight?: number;
}

export function StoryCanvas({ children, padding = Spacing.lg, minHeight = 420 }: StoryCanvasProps) {
  return (
    <div
      style={{
        minHeight,
        padding,
        background: 'var(--surface-canvas)',
      }}
    >
      {children}
    </div>
  );
}

type StoryRender = () => ReactElement;

export function createDarkCanvasDecorator(options: { padding?: number; minHeight?: number } = {}) {
  function DarkCanvasDecorator(Story: StoryRender) {
    return (
      <MemoryRouter>
        <StoryCanvas padding={options.padding} minHeight={options.minHeight}>
          <Story />
        </StoryCanvas>
      </MemoryRouter>
    );
  }

  DarkCanvasDecorator.displayName = 'DarkCanvasDecorator';

  return DarkCanvasDecorator;
}
