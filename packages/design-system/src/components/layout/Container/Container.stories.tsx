import type { Meta, StoryObj } from '@storybook/react'
import { Container } from './Container'

const meta = {
  title: 'Layout/Container',
  component: Container,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'full'],
      description: 'Container max-width constraint',
    },
    noPadding: {
      control: 'boolean',
      description: 'Remove horizontal padding',
    },
  },
} satisfies Meta<typeof Container>

export default meta
type Story = StoryObj<typeof meta>

const SampleContent = () => (
  <div className="bg-card border rounded-lg p-8">
    <h2 className="text-2xl font-bold mb-4">Container Content</h2>
    <p className="text-muted-foreground mb-4">
      This content is wrapped in a container component that provides consistent padding and max-width constraints.
    </p>
    <div className="grid grid-cols-3 gap-4">
      <div className="h-20 bg-muted rounded"></div>
      <div className="h-20 bg-muted rounded"></div>
      <div className="h-20 bg-muted rounded"></div>
    </div>
  </div>
)

export const Small: Story = {
  args: {
    size: 'sm',
    children: <SampleContent />,
  },
}

export const Medium: Story = {
  args: {
    size: 'md',
    children: <SampleContent />,
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    children: <SampleContent />,
  },
}

export const Full: Story = {
  args: {
    size: 'full',
    children: <SampleContent />,
  },
}

export const NoPadding: Story = {
  args: {
    size: 'lg',
    noPadding: true,
    children: (
      <div className="bg-gradient-to-r from-orange-400 to-pink-400 p-8 rounded-lg">
        <SampleContent />
      </div>
    ),
  },
}