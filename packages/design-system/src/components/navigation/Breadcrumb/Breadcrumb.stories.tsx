import type { Meta, StoryObj } from '@storybook/react';
import { Breadcrumb } from './Breadcrumb';
import { Folder, FileText, Settings } from 'lucide-react';

const meta: Meta<typeof Breadcrumb> = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    showHome: {
      control: { type: 'boolean' },
    },
    maxItems: {
      control: { type: 'number' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Documents', onClick: () => console.log('Documents') },
      { label: 'Projects', onClick: () => console.log('Projects') },
      { label: 'Q4 Report', onClick: () => console.log('Q4 Report') },
    ],
  },
};

export const WithoutHome: Story = {
  args: {
    showHome: false,
    items: [
      { label: 'Bookmarks' },
      { label: 'Technology' },
      { label: 'Web Development' },
    ],
  },
};

export const WithIcons: Story = {
  args: {
    items: [
      { 
        label: 'Collections', 
        icon: <Folder className="h-3 w-3" />,
        onClick: () => console.log('Collections')
      },
      { 
        label: 'Articles',
        icon: <FileText className="h-3 w-3" />,
        onClick: () => console.log('Articles')
      },
      { 
        label: 'Settings',
        icon: <Settings className="h-3 w-3" />,
      },
    ],
  },
};

export const LongPath: Story = {
  args: {
    items: [
      { label: 'Root' },
      { label: 'Level 1' },
      { label: 'Level 2' },
      { label: 'Level 3' },
      { label: 'Level 4' },
      { label: 'Level 5' },
      { label: 'Current Page' },
    ],
  },
};

export const WithMaxItems: Story = {
  args: {
    maxItems: 4,
    items: [
      { label: 'Root' },
      { label: 'Level 1' },
      { label: 'Level 2' },
      { label: 'Level 3' },
      { label: 'Level 4' },
      { label: 'Level 5' },
      { label: 'Current Page' },
    ],
  },
};

export const CustomSeparator: Story = {
  args: {
    separator: <span className="mx-1">/</span>,
    items: [
      { label: 'Home' },
      { label: 'Products' },
      { label: 'Electronics' },
      { label: 'Laptops' },
    ],
  },
};

export const RealWorldExample: Story = {
  render: () => (
    <div className="space-y-8">
      <div className="p-4 border rounded-lg">
        <h3 className="font-semibold mb-3">File Browser</h3>
        <Breadcrumb
          items={[
            { label: 'Documents', icon: <Folder className="h-3 w-3" /> },
            { label: '2024', icon: <Folder className="h-3 w-3" /> },
            { label: 'Reports', icon: <Folder className="h-3 w-3" /> },
            { label: 'annual-report.pdf', icon: <FileText className="h-3 w-3" /> },
          ]}
          onHomeClick={() => console.log('Go home')}
        />
      </div>

      <div className="p-4 border rounded-lg">
        <h3 className="font-semibold mb-3">E-commerce Category</h3>
        <Breadcrumb
          showHome={false}
          separator="›"
          items={[
            { label: 'All Products' },
            { label: 'Electronics' },
            { label: 'Computers & Tablets' },
            { label: 'Laptops' },
            { label: 'Gaming Laptops' },
          ]}
        />
      </div>

      <div className="p-4 border rounded-lg">
        <h3 className="font-semibold mb-3">Settings Navigation</h3>
        <Breadcrumb
          homeLabel="Dashboard"
          items={[
            { label: 'Settings', icon: <Settings className="h-3 w-3" /> },
            { label: 'Account' },
            { label: 'Security' },
          ]}
        />
      </div>
    </div>
  ),
};