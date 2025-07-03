import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/bookmarks')({
  component: () => (
    <div className="p-2">
      <h1 className="text-2xl font-bold">Bookmarks</h1>
      <p className="mt-2">Your saved bookmarks will appear here</p>
    </div>
  ),
})