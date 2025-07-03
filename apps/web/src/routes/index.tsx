import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-2">
      <h1 className="text-3xl font-bold">Welcome to Zine</h1>
      <p className="mt-2">Your personal bookmark manager</p>
    </div>
  ),
})