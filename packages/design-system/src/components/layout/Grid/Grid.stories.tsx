import type { Meta, StoryObj } from '@storybook/react'
import { Grid } from './Grid'

const meta = {
  title: 'Layout/Grid',
  component: Grid,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    gap: {
      control: 'select',
      options: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12],
      description: 'Gap between grid items',
    },
    variant: {
      control: 'select',
      options: ['fixed', 'autoFit', 'autoFill'],
      description: 'Grid layout variant',
    },
    minChildWidth: {
      control: 'text',
      description: 'Minimum width for children in auto variants',
    },
  },
} satisfies Meta<typeof Grid>

export default meta
type Story = StoryObj<typeof meta>

const GridItem = ({ index }: { index: number }) => (
  <div className="h-32 bg-card border rounded-lg flex items-center justify-center">
    <span className="text-2xl font-bold text-muted-foreground">{index}</span>
  </div>
)

export const Fixed: Story = {
  args: {
    cols: 3,
    gap: 4,
    variant: 'fixed',
    children: Array.from({ length: 6 }, (_, i) => <GridItem key={i} index={i + 1} />),
  },
}

export const Responsive: Story = {
  args: {
    cols: { sm: 2, md: 3, lg: 4, xl: 5 },
    gap: 4,
    variant: 'fixed',
    children: Array.from({ length: 10 }, (_, i) => <GridItem key={i} index={i + 1} />),
  },
}

export const AutoFit: Story = {
  args: {
    gap: 4,
    variant: 'autoFit',
    minChildWidth: '200px',
    children: Array.from({ length: 8 }, (_, i) => <GridItem key={i} index={i + 1} />),
  },
}

export const AutoFill: Story = {
  args: {
    gap: 4,
    variant: 'autoFill',
    minChildWidth: '200px',
    children: Array.from({ length: 5 }, (_, i) => <GridItem key={i} index={i + 1} />),
  },
}

export const TightGap: Story = {
  args: {
    cols: 4,
    gap: 1,
    variant: 'fixed',
    children: Array.from({ length: 8 }, (_, i) => <GridItem key={i} index={i + 1} />),
  },
}

export const LargeGap: Story = {
  args: {
    cols: 3,
    gap: 8,
    variant: 'fixed',
    children: Array.from({ length: 6 }, (_, i) => <GridItem key={i} index={i + 1} />),
  },
}

export const SingleColumn: Story = {
  args: {
    cols: 1,
    gap: 4,
    variant: 'fixed',
    children: Array.from({ length: 3 }, (_, i) => <GridItem key={i} index={i + 1} />),
  },
}