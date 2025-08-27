import {
  ThemeProvider,
  ThemeSwitcher,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Input,
  Text,
  MediaCard,
  QueueItem,
  ActionCard,
} from '@zine/design-system';
import { Settings, Plus, Search } from 'lucide-react';

export default function TestThemePage() {
  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen bg-white dark:bg-neutral-950">
        <div className="max-w-7xl mx-auto p-8 space-y-8">
          {/* Theme Switcher */}
          <div>
            <h1 className="text-3xl font-bold mb-4 text-neutral-900 dark:text-neutral-100">
              Theme Test
            </h1>
            <ThemeSwitcher />
          </div>

          {/* Buttons */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Buttons
            </h2>
            <div className="flex gap-2 flex-wrap">
              <Button variant="default">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </div>

          {/* Cards */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Cards
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card variant="elevated">
                <CardHeader>
                  <CardTitle>Elevated Card</CardTitle>
                  <CardDescription>This card uses elevation for depth</CardDescription>
                </CardHeader>
                <CardContent>
                  <Text>Card content with proper dark mode support</Text>
                </CardContent>
              </Card>
              <Card variant="outlined">
                <CardHeader>
                  <CardTitle>Outlined Card</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text>This card has a border</Text>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Badges */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Badges
            </h2>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default">Default</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="spotify">Spotify</Badge>
              <Badge variant="youtube">YouTube</Badge>
            </div>
          </div>

          {/* Input */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Input Fields
            </h2>
            <div className="space-y-2 max-w-md">
              <Input placeholder="Enter text here..." />
              <Input placeholder="Disabled input" disabled />
            </div>
          </div>

          {/* Pattern Components */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Media Cards
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MediaCard
                title="Building a Design System"
                creator="Sarah Chen"
                contentType="video"
                duration="12:34"
              />
              <MediaCard
                title="The Future of AI"
                creator="Tech Talks"
                contentType="podcast"
                duration="45:00"
              />
              <MediaCard
                title="Design Best Practices"
                creator="UX Weekly"
                contentType="article"
              />
            </div>
          </div>

          {/* Queue Items */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Queue Items
            </h2>
            <div className="max-w-2xl space-y-2">
              <QueueItem
                title="React Native Best Practices"
                creator="Mobile Dev Weekly"
                source="YouTube"
                contentType="video"
              />
              <QueueItem
                title="Design Systems Explained"
                creator="UX Podcast"
                source="Spotify"
                contentType="podcast"
              />
              <QueueItem
                title="The Art of Component Design"
                creator="Dev Blog"
                source="Medium"
                contentType="article"
              />
            </div>
          </div>

          {/* Action Cards */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Action Cards
            </h2>
            <div className="flex gap-4 flex-wrap">
              <ActionCard
                icon={<Plus size={32} className="text-primary-500" />}
                label="Add Item"
                onPress={() => console.log('Add clicked')}
              />
              <ActionCard
                icon={<Search size={32} className="text-primary-500" />}
                label="Search"
                onPress={() => console.log('Search clicked')}
              />
              <ActionCard
                icon={<Settings size={32} className="text-neutral-400" />}
                label="Settings"
                disabled
              />
            </div>
          </div>

          {/* Color Palette */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Color Palette
            </h2>
            <div className="flex gap-4 flex-wrap">
              <div className="text-center">
                <div className="w-20 h-20 bg-primary-500 rounded-lg mb-2" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Primary</span>
              </div>
              <div className="text-center">
                <div className="w-20 h-20 bg-neutral-200 dark:bg-neutral-700 rounded-lg mb-2" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Neutral</span>
              </div>
              <div className="text-center">
                <div className="w-20 h-20 bg-success-500 rounded-lg mb-2" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Success</span>
              </div>
              <div className="text-center">
                <div className="w-20 h-20 bg-warning-500 rounded-lg mb-2" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Warning</span>
              </div>
              <div className="text-center">
                <div className="w-20 h-20 bg-error-500 rounded-lg mb-2" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Error</span>
              </div>
            </div>
          </div>

          {/* Typography Examples */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
              Typography
            </h2>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                Heading 1
              </p>
              <p className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200">
                Heading 2
              </p>
              <p className="text-xl font-medium text-neutral-700 dark:text-neutral-300">
                Heading 3
              </p>
              <p className="text-base text-neutral-600 dark:text-neutral-400">
                Body text with normal weight
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-500">
                Small text for captions
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-600">
                Extra small text
              </p>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}