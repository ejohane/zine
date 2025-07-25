import { createFileRoute, Link } from '@tanstack/react-router'
import { SignIn } from '@clerk/clerk-react'
import { AuthLayout } from '../components/auth/AuthLayout'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <AuthLayout 
      title="Sign In" 
      subtitle="Welcome back! Please sign in to your account."
    >
      <SignIn 
        afterSignInUrl="/"
        signUpUrl="/sign-up"
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border-none",
          }
        }}
      />
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-600">
          Don't have an account?{' '}
          <Link 
            to="/sign-up" 
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Sign up here
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}