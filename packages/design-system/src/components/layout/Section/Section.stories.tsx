import type { Meta, StoryObj } from '@storybook/react'
import { Section } from './Section'

const meta = {
  title: 'Layout/Section',
  component: Section,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'Section title',
    },
    action: {
      control: 'text',
      description: 'Action button text',
    },
    onAction: {
      action: 'action clicked',
      description: 'Action button click handler',
    },
  },
} satisfies Meta<typeof Section>

export default meta
type Story = StoryObj<typeof meta>

const SectionContent = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div className="h-32 bg-card border rounded-lg"></div>
    <div className="h-32 bg-card border rounded-lg"></div>
    <div className="h-32 bg-card border rounded-lg"></div>
    <div className="h-32 bg-card border rounded-lg"></div>
  </div>
)

export const Default: Story = {
  args: {
    title: 'Recently Played',
    action: 'See all',
    onAction: () => console.log('Action clicked'),
    children: <SectionContent />,
  },
}

export const NoAction: Story = {
  args: {
    title: 'Your Library',
    children: <SectionContent />,
  },
}

export const CustomAction: Story = {
  args: {
    title: 'Trending Now',
    action: 'View more',
    onAction: () => console.log('View more clicked'),
    children: <SectionContent />,
  },
}

export const CustomHeader: Story = {
  args: {
    headerContent: (
      <div className="flex items-center justify-between w-full">
        <div>
          <h2 className="text-xl font-semibold">Custom Header</h2>
          <p className="text-sm text-muted-foreground">With description</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
          Custom Action
        </button>
      </div>
    ),
    children: <SectionContent />,
  },
}

export const NoHeader: Story = {
  args: {
    children: <SectionContent />,
  },
}