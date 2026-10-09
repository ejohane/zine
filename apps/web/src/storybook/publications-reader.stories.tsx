import type { Meta, StoryObj } from '@storybook/react-vite';
import fixture from '../../../../packages/shared/src/fixtures/publications/v1.json';
import { PublicReader } from '../public-publications/reader';
import { ReaderDataSchema } from '../public-publications/model';
import '../public-publications/reader.css';
const meta = {
  title: 'Publications/Reader',
  component: PublicReader,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PublicReader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const IndependentIssue: Story = {
  args: { data: ReaderDataSchema.parse({ type: 'issue', issue: fixture.publicIssue }) },
};
export const WeeklyIssue: Story = {
  args: { data: ReaderDataSchema.parse({ type: 'issue', issue: fixture.weeklyIssue }) },
};
export const PublicationArchive: Story = {
  args: {
    data: ReaderDataSchema.parse({
      type: 'publication',
      publication: fixture.publicPublication,
      issues: [fixture.publicIssue],
      nextCursor: null,
    }),
  },
};
export const Unavailable: Story = { args: { data: { type: 'unavailable', temporary: false } } };
export const TemporaryFailure: Story = { args: { data: { type: 'unavailable', temporary: true } } };
export const Saved: Story = {
  args: { ...IndependentIssue.args, message: 'Saved to your Library.' },
};
