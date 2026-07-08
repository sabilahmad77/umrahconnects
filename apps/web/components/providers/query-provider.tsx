'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,   // 30 seconds
            gcTime: 5 * 60 * 1000,  // 5 minutes
            // FIX-03: transient 5xx (e.g. Render free-tier cold start ~50s, upstream
            // timeouts) should retry with backoff instead of surfacing a failed
            // detail load. Do NOT retry auth/client errors (4xx) — those are handled
            // by the apiClient refresh flow (FIX-02).
            retry: (failureCount, error: any) => {
              const status = error?.response?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 3;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
