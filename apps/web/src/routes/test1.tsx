import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/test1')({
  component: Test1Page,
})

function Test1Page() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-green-600 mb-4">🚀 Test Page 1</h1>
      <div className="space-y-4">
        <p className="text-lg">Deployment verification test page #1</p>
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <p className="font-bold">✅ Success!</p>
          <p>If you can see this page, the frontend deployment is working correctly.</p>
        </div>
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">System Info:</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Environment: {import.meta.env.MODE}</li>
            <li>Base URL: {import.meta.env.BASE_URL}</li>
            <li>Development: {import.meta.env.DEV ? 'Yes' : 'No'}</li>
            <li>Production: {import.meta.env.PROD ? 'Yes' : 'No'}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}