import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { linkPreviewFixtures } from '@/components/storybook/fixtures';
import { LinkPreviewCard } from './link-preview-card';

const meta = {
  title: 'Cards/LinkPreview',
  component: LinkPreviewCard,
  decorators: [createDarkCanvasDecorator()],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof LinkPreviewCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <LinkPreviewCard isLoading={true} style={styles.card} />,
};

export const Video: Story = {
  render: () => <LinkPreviewCard preview={linkPreviewFixtures.video} style={styles.card} />,
};

export const Article: Story = {
  render: () => <LinkPreviewCard preview={linkPreviewFixtures.article} style={styles.card} />,
};

export const ConnectedSource: Story = {
  render: () => (
    <LinkPreviewCard
      preview={{
        ...linkPreviewFixtures.video,
        source: 'provider_api',
        title: 'Connected provider preview with synced metadata',
      }}
      style={styles.card}
    />
  ),
};

export const TextParsingStress: Story = {
  render: () => <LinkPreviewCard preview={linkPreviewFixtures.stress} style={styles.card} />,
};

const styles = StyleSheet.create({
  card: {
    width: 340,
  },
});
