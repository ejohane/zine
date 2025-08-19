import { createFileRoute } from '@tanstack/react-router';
import { 
  Button, 
  Card, 
  BottomSheet,
  Container,
  Section,
  Stack,
  Badge,
  Separator
} from '@zine/design-system';
import { 
  Plus, 
  Settings, 
  Share2, 
  Heart, 
  Bookmark, 
  Filter,
  Search,
  ChevronRight
} from 'lucide-react';

export const Route = createFileRoute('/silk-demo')({
  component: SilkDemo,
});

function SilkDemo() {

  const quickActions = [
    { icon: Plus, label: 'Add Bookmark', color: 'text-blue-500' },
    { icon: Search, label: 'Search', color: 'text-green-500' },
    { icon: Filter, label: 'Filter', color: 'text-purple-500' },
    { icon: Settings, label: 'Settings', color: 'text-gray-500' },
  ];

  const shareOptions = [
    { label: 'Copy Link', icon: '🔗' },
    { label: 'Share via Email', icon: '📧' },
    { label: 'Share on Twitter', icon: '🐦' },
    { label: 'Share on Facebook', icon: '👍' },
  ];

  const filterOptions = [
    { label: 'All', count: 124 },
    { label: 'Articles', count: 45 },
    { label: 'Videos', count: 32 },
    { label: 'Podcasts', count: 28 },
    { label: 'Social Posts', count: 19 },
  ];

  return (
    <Container className="py-8">
      <Section>
        <Stack gap={8}>
          <div>
            <h1 className="text-3xl font-bold mb-2">Silk UI Components Demo</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Explore the Silk UI components integrated into the Zine design system
            </p>
          </div>

          <Separator />

          <div>
            <h2 className="text-2xl font-semibold mb-4">Bottom Sheet Examples</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              <Card className="p-6">
                <h3 className="font-semibold mb-2">Quick Actions</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  A bottom sheet with quick action buttons
                </p>
                <BottomSheet
                  trigger={
                    <Button className="w-full">
                      Open Quick Actions
                    </Button>
                  }
                  title="Quick Actions"
                  description="Choose an action to perform"
                >
                  <div className="grid grid-cols-2 gap-4 pb-4">
                    {quickActions.map((action) => (
                      <button
                        key={action.label}
                        className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <action.icon className={`h-8 w-8 ${action.color} mx-auto mb-2`} />
                        <span className="text-sm font-medium">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </BottomSheet>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-2">Filter Options</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Filter content by type with counters
                </p>
                <BottomSheet
                  trigger={
                    <Button variant="outline" className="w-full">
                      <Filter className="h-4 w-4 mr-2" />
                      Open Filters
                    </Button>
                  }
                  title="Filter Content"
                  description="Select content types to display"
                >
                  <Stack gap={2} className="pb-4">
                    {filterOptions.map((option) => (
                      <button
                        key={option.label}
                        className="w-full p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-between"
                      >
                        <span className="font-medium">{option.label}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{option.count}</Badge>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </Stack>
                </BottomSheet>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-2">Share Sheet</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Share content through various channels
                </p>
                <BottomSheet
                  trigger={
                    <Button variant="secondary" className="w-full">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  }
                  title="Share"
                  description="Choose how you'd like to share this content"
                >
                  <div className="grid grid-cols-2 gap-4 pb-4">
                    {shareOptions.map((option) => (
                      <button
                        key={option.label}
                        className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-center"
                      >
                        <span className="text-2xl mb-2 block">{option.icon}</span>
                        <span className="text-sm">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </BottomSheet>
              </Card>
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="text-2xl font-semibold mb-4">Interactive Examples</h2>
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Bookmark Card with Bottom Sheet</h3>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">Understanding React Server Components</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        A deep dive into the new React Server Components architecture
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">Article</Badge>
                        <span className="text-xs text-gray-500">5 min read</span>
                      </div>
                    </div>
                    <BottomSheet
                      trigger={
                        <Button size="icon" variant="ghost">
                          <Heart className="h-4 w-4" />
                        </Button>
                      }
                      title="Bookmark Options"
                    >
                      <Stack gap={2}>
                        <button className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-between">
                          <span>Add to Favorites</span>
                          <Heart className="h-4 w-4" />
                        </button>
                        <button className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-between">
                          <span>Save to Collection</span>
                          <Bookmark className="h-4 w-4" />
                        </button>
                        <button className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-between">
                          <span>Share</span>
                          <Share2 className="h-4 w-4" />
                        </button>
                      </Stack>
                    </BottomSheet>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </Stack>
      </Section>

    </Container>
  );
}