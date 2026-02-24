/* eslint-disable @typescript-eslint/ban-ts-comment */
import { withBackgrounds } from '@storybook/addon-ondevice-backgrounds';
import type { Preview } from '@storybook/react-native';
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // @ts-ignore Needed by the on-device actions addon on web.
  global.ProgressTransitionRegister = {};
  // @ts-ignore Needed by the on-device actions addon on web.
  global.UpdatePropsManager = {};
}

const STORY_CATEGORY_ORDER = [
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
] as const;

function getStoryTitle(entry: unknown): string {
  if (typeof entry === 'object' && entry !== null && 'title' in entry) {
    const value = (entry as { title?: unknown }).title;
    return typeof value === 'string' ? value : '';
  }

  if (Array.isArray(entry)) {
    const maybeStory = entry[1];
    if (typeof maybeStory === 'object' && maybeStory !== null && 'title' in maybeStory) {
      const value = (maybeStory as { title?: unknown }).title;
      return typeof value === 'string' ? value : '';
    }
  }

  return '';
}

function sortStories(a: unknown, b: unknown): number {
  const titleA = getStoryTitle(a);
  const titleB = getStoryTitle(b);

  const categoryA = titleA.split('/')[0] ?? '';
  const categoryB = titleB.split('/')[0] ?? '';

  const categoryIndexA = STORY_CATEGORY_ORDER.indexOf(
    categoryA as (typeof STORY_CATEGORY_ORDER)[number]
  );
  const categoryIndexB = STORY_CATEGORY_ORDER.indexOf(
    categoryB as (typeof STORY_CATEGORY_ORDER)[number]
  );

  const normalizedCategoryIndexA = categoryIndexA === -1 ? Number.MAX_SAFE_INTEGER : categoryIndexA;
  const normalizedCategoryIndexB = categoryIndexB === -1 ? Number.MAX_SAFE_INTEGER : categoryIndexB;

  if (normalizedCategoryIndexA !== normalizedCategoryIndexB) {
    return normalizedCategoryIndexA - normalizedCategoryIndexB;
  }

  return titleA.localeCompare(titleB);
}

const preview: Preview = {
  decorators: [withBackgrounds],
  parameters: {
    options: {
      storySort: sortStories,
    },
    backgrounds: {
      default: 'plain',
      values: [
        { name: 'plain', value: 'white' },
        { name: 'dark', value: '#111827' },
      ],
    },
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
