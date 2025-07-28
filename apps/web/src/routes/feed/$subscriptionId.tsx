import { createFileRoute } from '@tanstack/react-router'
import { FeedPage } from '../../components/feed/FeedPage'

export const Route = createFileRoute('/feed/$subscriptionId')({
  component: () => {
    const { subscriptionId } = Route.useParams()
    return <FeedPage subscriptionId={subscriptionId} />
  }
})