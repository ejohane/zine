import { createFileRoute } from '@tanstack/react-router';
import { Button, Card, CardHeader, CardContent, CardFooter, Badge, BookmarkCard, SubscriptionItem } from '@zine/design-system';

export const Route = createFileRoute('/design-system')({
  component: DesignSystemShowcase,
});

function DesignSystemShowcase() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Zine Design System</h1>
      
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Buttons</h2>
        <div className="flex gap-4 flex-wrap">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Badges</h2>
        <div className="flex gap-4 flex-wrap">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Card</h2>
        <Card className="max-w-md">
          <CardHeader>
            <h3 className="text-lg font-semibold">Card Title</h3>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This is a card component from the design system.
            </p>
          </CardContent>
          <CardFooter>
            <Button>Action</Button>
          </CardFooter>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Bookmark Card</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <BookmarkCard
            title="Building a Design System"
            description="Learn how to build a scalable design system from scratch."
            url="https://example.com/design-system"
            tags={['design', 'development', 'tutorial']}
            platform="web"
            savedAt={new Date()}
            onOpen={() => console.log('Open')}
            onEdit={() => console.log('Edit')}
            onDelete={() => console.log('Delete')}
          />
          <BookmarkCard
            title="Tech Podcast Episode"
            description="Weekly discussion about the latest in tech."
            url="https://spotify.com/episode/123"
            tags={['podcast', 'technology']}
            platform="spotify"
            savedAt={new Date()}
            onOpen={() => console.log('Open')}
            onEdit={() => console.log('Edit')}
            onDelete={() => console.log('Delete')}
          />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Subscription Item</h2>
        <div className="space-y-4 max-w-2xl">
          <SubscriptionItem
            title="Building Better Products"
            author="Tech Talks Podcast"
            duration="45:32"
            platform="spotify"
            publishedAt={new Date()}
            onPlay={() => console.log('Play')}
            onMarkPlayed={() => console.log('Mark as played')}
          />
          <SubscriptionItem
            title="React Server Components Explained"
            author="Web Dev Simplified"
            duration="12:45"
            platform="youtube"
            isPlaying={true}
            publishedAt={new Date()}
            onPlay={() => console.log('Play')}
            onMarkPlayed={() => console.log('Mark as played')}
          />
        </div>
      </section>
    </div>
  );
}