import { createFileRoute } from '@tanstack/react-router'
import ApiDebugger from '@/components/ApiDebugger'

export const Route = createFileRoute('/api-debugger')({
  component: ApiDebugger,
})