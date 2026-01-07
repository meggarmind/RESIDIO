'use client';

import { useState } from 'react';
import { Eye, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useImpersonation } from '@/hooks/use-impersonation';
import { endImpersonationSession } from '@/actions/impersonation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ImpersonationBannerProps {
  className?: string;
  onSwitchResident?: () => void;
}

/**
 * Impersonation Banner
 *
 * Fixed banner displayed at the top of the portal when an admin is
 * impersonating a resident. Shows the impersonated resident's name
 * and house address, with options to switch resident or exit.
 *
 * This banner cannot be dismissed and remains visible throughout
 * the impersonation session.
 */
export function ImpersonationBanner({
  className,
  onSwitchResident,
}: ImpersonationBannerProps) {
  const { impersonationState, endImpersonation, isEnding } = useImpersonation();
  const [showExitDialog, setShowExitDialog] = useState(false);

  // Don't render if not impersonating
  if (!impersonationState?.isActive) return null;

  const handleExit = async () => {
    // Force exit after timeout - user should NEVER be stuck
    const forceExitTimeout = setTimeout(async () => {
      // Try to end session in DB before redirecting
      const stored = sessionStorage.getItem('residio_impersonation');
      if (stored) {
        try {
          const state = JSON.parse(stored);
          if (state.sessionId) {
            await endImpersonationSession(state.sessionId);
          }
        } catch {
          // Ignore errors - we're forcing exit anyway
        }
      }
      sessionStorage.removeItem('residio_impersonation');
      window.location.href = '/dashboard';
    }, 5000); // 5 second timeout

    try {
      await endImpersonation();
      clearTimeout(forceExitTimeout);
    } catch {
      clearTimeout(forceExitTimeout);
      // Fallback: Direct server action call with session storage
      const stored = sessionStorage.getItem('residio_impersonation');
      if (stored) {
        try {
          const state = JSON.parse(stored);
          if (state.sessionId) {
            await endImpersonationSession(state.sessionId);
          }
        } catch {
          // Ignore parse errors
        }
      }
      // Always clear storage on exit attempt
      sessionStorage.removeItem('residio_impersonation');
    }
    setShowExitDialog(false);
    // Redirect to admin dashboard
    window.location.href = '/dashboard';
  };

  return (
    <>
      <div
        className={cn(
          'fixed top-0 left-0 right-0 z-50',
          'bg-amber-500 dark:bg-amber-600',
          'text-amber-950 dark:text-amber-50',
          'shadow-lg',
          className
        )}
      >
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Impersonation indicator */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex-shrink-0 p-1.5 bg-amber-400/30 dark:bg-amber-500/30 rounded-full">
                <Eye className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  Viewing as{' '}
                  <span className="font-bold">
                    {impersonationState.impersonatedResidentName}
                  </span>
                </p>
                {impersonationState.impersonatedHouseAddress && (
                  <p className="text-xs opacity-80 truncate">
                    {impersonationState.impersonatedHouseAddress}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {onSwitchResident && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSwitchResident}
                  className="text-amber-950 dark:text-amber-50 hover:bg-amber-400/30 dark:hover:bg-amber-500/30"
                >
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Switch</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExitDialog(true)}
                className="text-amber-950 dark:text-amber-50 hover:bg-amber-400/30 dark:hover:bg-amber-500/30"
              >
                {isEnding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <LogOut className="h-4 w-4 mr-1.5" />
                    <span className="hidden sm:inline">Exit</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Read-only notice */}
          <div className="mt-1 text-xs opacity-70 text-center">
            <span className="bg-amber-400/30 dark:bg-amber-500/30 px-2 py-0.5 rounded">
              Read-only mode - Actions are disabled
            </span>
          </div>
        </div>
      </div>

      {/* Spacer to prevent content from going under the banner */}
      <div className="h-[72px]" />

      {/* Exit confirmation dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit Impersonation?</AlertDialogTitle>
            <AlertDialogDescription>
              You are currently viewing the portal as{' '}
              <strong>{impersonationState.impersonatedResidentName}</strong>.
              Exiting will return you to the admin dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExit}>
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Exiting...
                </>
              ) : (
                'Exit Impersonation'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Read-only wrapper component
 *
 * Wraps content and adds visual indicators when in impersonation mode.
 * Disables all interactive elements within.
 */
export function ImpersonationReadOnlyWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isImpersonating } = useImpersonation();

  if (!isImpersonating) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative', className)}>
      {/* Overlay to prevent interactions */}
      <div
        className="absolute inset-0 bg-transparent z-10"
        style={{ pointerEvents: 'all' }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      {/* Dimmed content */}
      <div className="opacity-60 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
