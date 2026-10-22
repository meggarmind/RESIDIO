'use client';

import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { LayoutThemeProvider } from '@/contexts/layout-theme-context';
import { Toaster } from '@/components/ui/sonner';
import { AiAssistantProvider } from '@/contexts/ai-assistant-context';
import { assertOnlineForMutation } from '@/lib/offline/network-status';
import { clearAdminReadCache } from '@/lib/offline/admin-read-cache';
import { useAuth } from '@/lib/auth/auth-provider';
import { configurePerformanceTelemetry } from '@/lib/performance';
import { createBeaconSink } from '@/lib/performance/beacon-sink';

function SessionQueryIsolation({ queryClient }: { queryClient: QueryClient }) {
  const { user } = useAuth();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (previousUserId.current !== null && previousUserId.current !== nextUserId) {
      queryClient.clear();
      void clearAdminReadCache();
    }
    previousUserId.current = nextUserId;
  }, [queryClient, user?.id]);

  return null;
}

/** Sends admin load-time metrics to the ingest route, which refuses anyone who is not a signed-in admin (#957). */
function PerformanceTelemetryWiring() {
  useEffect(() => {
    const sink = createBeaconSink();
    const restore = configurePerformanceTelemetry({ sink });
    const onHide = () => {
      if (document.visibilityState === 'hidden') sink.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      sink.flush();
      restore();
    };
  }, []);

  return null;
}

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
            refetchOnReconnect: true,
            retry: 1,
            retryDelay: 1000,
          },
          mutations: {
            onMutate: () => assertOnlineForMutation('admin.mutation'),
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
            <SessionQueryIsolation queryClient={queryClient} />
            <PerformanceTelemetryWiring />
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
