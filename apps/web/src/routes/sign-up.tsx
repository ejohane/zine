import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-up')({
  component: SignUpTestPage,
})

function SignUpTestPage() {
  const timestamp = new Date().toISOString()
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="bg-green-100 border-2 border-green-500 rounded-lg p-6 mb-6">
            <h1 className="text-3xl font-bold text-green-800 mb-2">
              ✅ TEST: Sign-up Route Working!
            </h1>
            <p className="text-green-700">
              Route successfully loaded in production
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">Route Test Details</h2>
            <div className="text-left space-y-2 text-sm text-gray-600">
              <p><strong>Route:</strong> /sign-up</p>
              <p><strong>Component:</strong> SignUpTestPage</p>
              <p><strong>Timestamp:</strong> {timestamp}</p>
              <p><strong>Status:</strong> Successfully rendered</p>
            </div>
            
            <div className="pt-4 border-t">
              <p className="text-gray-500 text-xs">
                If you can see this page, the basic /sign-up routing is working correctly.
                The issue is likely Clerk-specific rather than fundamental routing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}