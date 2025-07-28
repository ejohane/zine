import { createFileRoute } from '@tanstack/react-router'
import { FeedPage } from '../components/feed/FeedPage'

export const Route = createFileRoute('/feed')({
  component: () => <FeedPage />
})