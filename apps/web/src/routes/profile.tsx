import { createFileRoute } from '@tanstack/react-router'
import { UserProfile } from '@clerk/clerk-react'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>
        <UserProfile 
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-lg",
            }
          }}
        />
      </div>
    </div>
  )
}