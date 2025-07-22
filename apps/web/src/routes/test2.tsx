import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/test2')({
  component: Test2Page,
})

function Test2Page() {
  const [count, setCount] = React.useState(0)
  const [currentTime, setCurrentTime] = React.useState(new Date().toLocaleString())

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleString())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">⚡ Test Page 2</h1>
      <div className="space-y-6">
        <p className="text-lg">Interactive deployment verification test page #2</p>
        
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
          <p className="font-bold">🧪 Interactive Tests</p>
          <p>This page tests React state management and effects.</p>
        </div>

        <div className="border rounded-lg p-4 space-y-4">
          <h2 className="text-xl font-semibold">Counter Test</h2>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setCount(count - 1)}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              -
            </button>
            <span className="text-2xl font-mono">{count}</span>
            <button 
              onClick={() => setCount(count + 1)}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
            >
              +
            </button>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">Live Clock</h2>
          <p className="text-lg font-mono">{currentTime}</p>
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">Navigation Test</h2>
          <p className="mb-2">Links to other pages work correctly:</p>
          <div className="flex gap-2">
            <a href="/" className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600">
              Home
            </a>
            <a href="/test1" className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600">
              Test 1
            </a>
            <a href="/bookmarks" className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600">
              Bookmarks
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}