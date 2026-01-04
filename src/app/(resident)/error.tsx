'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Home, AlertTriangle } from 'lucide-react';

export default function ResidentPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Portal error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bill-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-bill-card border border-border rounded-2xl p-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-16 w-16 bg-bill-secondary rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-bill-text mb-2">
          Something went wrong
        </h2>

        <p className="text-sm text-bill-text-secondary mb-6">
          An error occurred while loading this page. Please try again or return to your dashboard.
        </p>

        <div className="flex flex-col gap-3">
          <Button onClick={reset} className="w-full">
            Try again
          </Button>

          <Button variant="outline" asChild className="w-full">
            <Link href="/portal">
              <Home className="h-4 w-4 mr-2" />
              Portal Dashboard
            </Link>
          </Button>
        </div>

        {error.digest && (
          <p className="mt-4 text-xs text-bill-text-secondary">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
