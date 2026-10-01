"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import PwaProvider from '@/components/pwa/PwaProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes cache validity
        gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <PwaProvider>
        {children}
      </PwaProvider>
    </QueryClientProvider>
  );
}
