import type { Meta, StoryObj } from '@storybook/react';
import { BottomSheet } from './BottomSheet';
import { Button } from '../../ui/button';

const meta: Meta<typeof BottomSheet> = {
  title: 'Silk/BottomSheet',
  component: BottomSheet,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button>Open Bottom Sheet</Button>,
    title: 'Bottom Sheet Title',
    description: 'This is a description for the bottom sheet',
    children: (
      <div className="space-y-4 pb-4">
        <p className="text-gray-700 dark:text-gray-300">
          This is the content of the bottom sheet. You can put anything here!
        </p>
        <div className="space-y-2">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-medium mb-2">Option 1</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Description for option 1
            </p>
          </div>
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-medium mb-2">Option 2</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Description for option 2
            </p>
          </div>
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-medium mb-2">Option 3</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Description for option 3
            </p>
          </div>
        </div>
      </div>
    ),
  },
};

export const WithForm: Story = {
  args: {
    trigger: <Button variant="outline">Open Form</Button>,
    title: 'Create New Bookmark',
    children: (
      <form className="space-y-4 pb-4">
        <div>
          <label className="block text-sm font-medium mb-2">Title</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            placeholder="Enter bookmark title"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">URL</label>
          <input
            type="url"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Notes</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            rows={4}
            placeholder="Add your notes here..."
          />
        </div>
        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">Save Bookmark</Button>
          <Button type="button" variant="outline" className="flex-1">Cancel</Button>
        </div>
      </form>
    ),
  },
};

export const LongContent: Story = {
  args: {
    trigger: <Button>Open Long Content</Button>,
    title: 'Terms of Service',
    description: 'Please review our terms carefully',
    children: (
      <div className="space-y-4 pb-4">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
            <h4 className="font-medium mb-2">Section {i + 1}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
          </div>
        ))}
      </div>
    ),
  },
};