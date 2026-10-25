'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function BillingPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Billing page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8" role="alert" data-error-state="billing-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle>Billing could not be loaded</CardTitle>
          <CardDescription>Nothing was changed. Try again.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
