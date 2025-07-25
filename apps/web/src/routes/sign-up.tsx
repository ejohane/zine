import { createFileRoute, Link } from '@tanstack/react-router'
import { SignUp } from '@clerk/clerk-react'
import { AuthLayout } from '../components/auth/AuthLayout'

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <AuthLayout 
      title="Create Account" 
      subtitle="Sign up to start organizing your bookmarks."
    >
      <SignUp 
        afterSignUpUrl="/"
        signInUrl="/sign-in"
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border-none",
          }
        }}
      />
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-600">
          Already have an account?{' '}
          <Link 
            to="/sign-in" 
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Sign in here
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}