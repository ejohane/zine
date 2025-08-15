import type { Meta, StoryObj } from '@storybook/react'
import { AppShell } from './AppShell'

const meta = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    fullHeight: {
      control: 'boolean',
      description: 'Whether the app shell should take full viewport height',
    },
    noPadding: {
      control: 'boolean',
      description: 'Remove default padding from main content area',
    },
  },
} satisfies Meta<typeof AppShell>

export default meta
type Story = StoryObj<typeof meta>

const HeaderContent = () => (
  <div className="container flex h-16 items-center">
    <div className="text-lg font-semibold">Zine App</div>
    <nav className="ml-auto flex gap-4">
      <button className="text-sm">Home</button>
      <button className="text-sm">Library</button>
      <button className="text-sm">Settings</button>
    </nav>
  </div>
)

const FooterContent = () => (
  <div className="container flex h-12 items-center justify-center">
    <p className="text-sm text-muted-foreground">© 2025 Zine</p>
  </div>
)

const MainContent = () => (
  <div className="container">
    <h1 className="text-4xl font-bold mb-4">Welcome to Zine</h1>
    <p className="text-muted-foreground mb-8">
      Your personal content aggregator for podcasts, videos, and articles.
    </p>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="h-32 rounded-lg bg-card border"></div>
      <div className="h-32 rounded-lg bg-card border"></div>
      <div className="h-32 rounded-lg bg-card border"></div>
    </div>
  </div>
)

export const Default: Story = {
  args: {
    header: <HeaderContent />,
    footer: <FooterContent />,
    children: <MainContent />,
  },
}

export const NoHeader: Story = {
  args: {
    footer: <FooterContent />,
    children: <MainContent />,
  },
}

export const NoFooter: Story = {
  args: {
    header: <HeaderContent />,
    children: <MainContent />,
  },
}

export const MinimalShell: Story = {
  args: {
    children: <MainContent />,
  },
}

export const NoPadding: Story = {
  args: {
    header: <HeaderContent />,
    children: (
      <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-8">
        <MainContent />
      </div>
    ),
    noPadding: true,
  },
}