import type { Preview } from '@storybook/react-vite';

import '../src/styles.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    options: {
      storySort: {
        order: [
          'Foundations',
          'Primitives',
          'Cards',
          'Feedback',
          'Subscriptions',
          'Creator',
          'Layout',
          'Boundary',
          'Interactions',
          'Dev',
          'Legacy',
        ],
      },
    },
    controls: {
      expanded: true,
    },
  },
};

export default preview;
