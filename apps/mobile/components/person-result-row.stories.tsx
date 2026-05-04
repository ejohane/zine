import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Spacing } from '@/constants/theme';

import { PersonResultRow } from './person-result-row';

const meta = {
  title: 'People/PersonResultRow',
  component: PersonResultRow,
  decorators: [createDarkCanvasDecorator({ height: 260, padding: Spacing.md })],
  args: {
    person: {
      id: 'person-joe-rogan',
      displayName: 'Joe Rogan',
      itemCount: 12,
      latestItemTitle: 'The economics of long-form interviews',
    },
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof PersonResultRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const List: Story = {
  render: () => (
    <View>
      <PersonResultRow
        person={{
          id: 'person-joe-rogan',
          displayName: 'Joe Rogan',
          itemCount: 12,
          latestItemTitle: 'The economics of long-form interviews',
        }}
      />
      <PersonResultRow
        person={{
          id: 'person-mary-meeker',
          displayName: 'Mary Meeker',
          itemCount: 4,
          latestItemTitle: null,
        }}
      />
    </View>
  ),
};
