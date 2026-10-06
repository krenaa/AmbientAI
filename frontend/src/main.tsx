import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './Toast.tsx'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const rootElement = document.getElementById('root')!

if (!clerkPubKey) {
  createRoot(rootElement).render(
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-center font-sans">
      <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
          ⚠️
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">
          Clerk Key Missing
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Missing Clerk publishable key. Please set{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-cyan-400">
            VITE_CLERK_PUBLISHABLE_KEY
          </code>{' '}
          in your environment variables or <code className="text-cyan-400">.env</code> file.
        </p>
      </div>
    </div>
  )
  throw new Error("Missing Publishable Key: Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file.")
}

createRoot(rootElement).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPubKey}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>,
)

