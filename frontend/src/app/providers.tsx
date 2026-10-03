"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import PwaProvider from '@/components/pwa/PwaProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000, // 2 minutes cache validity
        gcTime: 3 * 60 * 1000, // 3 minutes garbage collection to reduce client memory retention
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        networkMode: 'offlineFirst',
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
