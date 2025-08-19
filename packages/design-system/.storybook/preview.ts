import type { Preview } from '@storybook/react-vite'
import '../src/styles/globals.css';
import '../../../node_modules/@silk-hq/components/dist/main-unlayered.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
    layout: 'centered',
  },
};

export default preview;