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
          {bookmarks && bookmarks.length > 0 ? bookmarks.map((bookmark) => (
            <li key={bookmark.id} className="p-2 border rounded">
              <div className="font-medium">{bookmark.title}</div>
              {bookmark.description && (
                <div className="text-sm text-gray-600 mt-1">{bookmark.description}</div>
              )}
              <div className="text-xs text-gray-500 mt-1">
                {bookmark.source && <span className="bg-gray-200 px-2 py-1 rounded mr-2">{bookmark.source}</span>}
                {bookmark.contentType && <span className="bg-blue-200 px-2 py-1 rounded">{bookmark.contentType}</span>}
              </div>
            </li>
          )) : (
            <li className="p-2 text-gray-500">No bookmarks found</li>
          )}
        </ul>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: Home,
})