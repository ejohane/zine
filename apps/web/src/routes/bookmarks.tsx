import { createFileRoute } from '@tanstack/react-router'
import { PageWrapper } from '../components/layout/PageWrapper'

function BookmarksPage() {
  return (
    <PageWrapper>
      <h1 className="text-2xl font-bold">Bookmarks</h1>
      <p className="mt-2">Your saved bookmarks will appear here (auth removed)</p>
    </PageWrapper>
  )
}

export const Route = createFileRoute('/bookmarks')({
  component: BookmarksPage,
})