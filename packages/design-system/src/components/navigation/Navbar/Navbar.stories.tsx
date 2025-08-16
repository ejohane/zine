import type { Meta, StoryObj } from '@storybook/react';
import { Navbar } from './Navbar';
import { Button } from '../../ui/button';
import { BookOpen } from 'lucide-react';

const meta: Meta<typeof Navbar> = {
  title: 'Navigation/Navbar',
  component: Navbar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    sticky: {
      control: { type: 'boolean' },
    },
    mobileBreakpoint: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    logo: (
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <span className="font-bold text-xl">Zine</span>
      </div>
    ),
    items: [
      { label: 'Home', active: true },
      { label: 'Bookmarks' },
      { label: 'Subscriptions' },
      { label: 'Settings' },
    ],
    actions: (
      <>
        <Button variant="ghost" size="sm">
          Sign In
        </Button>
        <Button size="sm">Get Started</Button>
      </>
    ),
  },
};

export const SimpleNav: Story = {
  args: {
    items: [
      { label: 'Dashboard', active: true },
      { label: 'Projects' },
      { label: 'Team' },
      { label: 'Reports' },
    ],
  },
};

export const WithOnlyLogo: Story = {
  args: {
    logo: (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 bg-primary rounded" />
        <span className="font-bold text-xl">Brand</span>
      </div>
    ),
  },
};

export const ComplexNavbar: Story = {
  render: () => (
    <div>
      <Navbar
        logo={
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">Zine</span>
          </div>
        }
        items={[
          { label: 'Dashboard', active: true, onClick: () => console.log('Dashboard') },
          { label: 'Bookmarks', onClick: () => console.log('Bookmarks') },
          { label: 'Subscriptions', onClick: () => console.log('Subscriptions') },
          { label: 'Discover', onClick: () => console.log('Discover') },
        ]}
        actions={
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </Button>
            <Button variant="ghost" size="icon">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </Button>
            <Button>New Bookmark</Button>
          </div>
        }
      />
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Page Content</h1>
        <p className="text-gray-600">
          The navbar above is sticky by default and will remain at the top when scrolling.
        </p>
        <div className="h-[1500px] mt-8 bg-gray-50 rounded p-4">
          <p>Scroll to see sticky behavior</p>
        </div>
      </div>
    </div>
  ),
};