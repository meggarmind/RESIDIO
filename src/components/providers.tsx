'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { LayoutThemeProvider } from '@/contexts/layout-theme-context';
import { Toaster } from '@/components/ui/sonner';
import { AiAssistantProvider } from '@/contexts/ai-assistant-context';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes — data stays fresh across navigations
            gcTime: 10 * 60 * 1000,   // 10 minutes — garbage collection
            refetchOnWindowFocus: false,
            refetchOnMount: false,     // Don't refetch on mount if data is still fresh
            refetchOnReconnect: false,
            retry: 1,
            retryDelay: 1000,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <LayoutThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AiAssistantProvider>
              {children}
              <Toaster />
            </AiAssistantProvider>
          </AuthProvider>
        </QueryClientProvider>
      </LayoutThemeProvider>
    </ThemeProvider>
  );
}
