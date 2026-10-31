import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/statement')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
  component: () => null,
})
