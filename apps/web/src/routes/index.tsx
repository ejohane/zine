import { createFileRoute } from '@tanstack/react-router'
import { useBookmarks } from '../hooks/useBookmarks'

function Home() {
  const { data: bookmarks, isLoading, error } = useBookmarks()

  if (isLoading) return <div className="p-2">Loading bookmarks...</div>
  if (error) return <div className="p-2">Error loading bookmarks: {error.message}</div>

  return (
    <div className="p-2">
      <h1 className="text-3xl font-bold">Welcome to Zine</h1>
      <p className="mt-2">Your personal bookmark manager</p>
      
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Bookmarks</h2>
        <ul className="space-y-2">
          {bookmarks?.map((bookmark) => (
            <li key={bookmark.id} className="p-2 border rounded">
              {bookmark.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: Home,
})