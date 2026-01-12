'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MaintenancePage() {
  const router = useRouter();
  const [message, setMessage] = useState('System is currently undergoing maintenance. Please check back shortly.');
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const checkStatus = async () => {
    setChecking(true);

    try {
      // Fetch maintenance_mode setting via public API endpoint
      const response = await fetch('/api/settings/maintenance-mode', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.maintenance_mode === false) {
        // Maintenance mode disabled, redirect to home
        router.push('/');
      } else {
        // Still in maintenance, update message
        setMessage(data.message || 'System is currently undergoing maintenance.');
        // Reset countdown
        setCountdown(60);
      }
    } catch (error) {
      console.error('Failed to check maintenance status:', error);
      setMessage('System is currently undergoing maintenance. Unable to check status.');
    }

    setChecking(false);
  };

  useEffect(() => {
    // Initial check
    checkStatus();

    // Auto-refresh countdown
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          checkStatus();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted/50 via-background to-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
            <Settings className="h-10 w-10 text-primary animate-spin-slow" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">System Maintenance</CardTitle>
            <CardDescription className="mt-2 text-base">{message}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-center">
          {/* Manual refresh button */}
          <Button
            onClick={checkStatus}
            disabled={checking}
            variant="outline"
            className="w-full"
            size="lg"
          >
            {checking ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Check Status Now
              </>
            )}
          </Button>

          {/* Auto-refresh info */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Automatically checking in <span className="font-mono font-semibold">{countdown}s</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This page will reload when maintenance is complete
            </p>
          </div>

          {/* Additional info */}
          <div className="pt-4 border-t text-xs text-muted-foreground space-y-1">
            <p>If you believe you should have access during maintenance,</p>
            <p>please contact your system administrator.</p>
          </div>
        </CardContent>
      </Card>

      {/* Background decoration */}
      <style jsx global>{\`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      \`}</style>
    </div>
  );
}
