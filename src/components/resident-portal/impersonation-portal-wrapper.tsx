'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useImpersonation } from '@/hooks/use-impersonation';
import { ImpersonationBanner } from './impersonation-banner';
import { ResidentImpersonationSelector } from '@/components/admin/resident-impersonation-selector';
import { Loader2 } from 'lucide-react';

interface ImpersonationPortalWrapperProps {
  children: React.ReactNode;
}

/**
 * Inner component that uses useSearchParams (requires Suspense boundary)
 */
function ImpersonationPortalWrapperInner({ children }: ImpersonationPortalWrapperProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isLoading: authLoading } = useAuth();
  const {
    isImpersonating,
    impersonationState,
    canImpersonate,
    isLoading: impersonationLoading,
    logPageView,
  } = useImpersonation();

  const [showSelector, setShowSelector] = useState(false);
  const [hasCheckedAccess, setHasCheckedAccess] = useState(false);

  // Check for impersonate mode via URL parameter
  const impersonateMode = searchParams.get('impersonate') === 'true';

  // Check if we should show the selector based on URL param
  useEffect(() => {
    if (authLoading || impersonationLoading) return;

    // If URL has ?impersonate=true and admin can impersonate and not already impersonating
    if (impersonateMode && canImpersonate && !isImpersonating) {
      setShowSelector(true);
    }

    setHasCheckedAccess(true);
  }, [authLoading, impersonationLoading, impersonateMode, canImpersonate, isImpersonating]);

  // Log page views during impersonation
  useEffect(() => {
    if (isImpersonating && impersonationState?.sessionId) {
      logPageView(pathname);
    }
  }, [pathname, isImpersonating, impersonationState?.sessionId, logPageView]);

  // Handle successful impersonation selection
  const handleSuccess = () => {
    setShowSelector(false);
    // Remove the ?impersonate=true param from URL
    if (impersonateMode) {
      router.replace('/portal');
    }
  };

  // Handle selector close without selection
  const handleClose = (open: boolean) => {
    if (!open && !isImpersonating) {
      // If they close without selecting and came via URL param, redirect to dashboard
      if (impersonateMode) {
        router.push('/dashboard');
      }
    }
    setShowSelector(open);
  };

  // Show loading while checking access
  if (authLoading || impersonationLoading || !hasCheckedAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If impersonate mode requested but user cannot impersonate
  if (impersonateMode && !canImpersonate && !isImpersonating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold mb-2">Impersonation Not Available</h2>
          <p className="text-muted-foreground mb-4">
            You do not have permission to impersonate residents.
          </p>
          <a
            href="/portal"
            className="text-primary hover:underline"
          >
            View Your Portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Impersonation banner (fixed at top) */}
      {isImpersonating && (
        <ImpersonationBanner
          onSwitchResident={() => setShowSelector(true)}
        />
      )}

      {/* Resident selector dialog */}
      <ResidentImpersonationSelector
        open={showSelector}
        onOpenChange={handleClose}
        onSuccess={handleSuccess}
      />

      {/* Portal content */}
      {children}
    </>
  );
}

/**
 * Impersonation Portal Wrapper
 *
 * Wraps the portal content to handle impersonation state:
 * 1. Shows the impersonation banner when an admin is impersonating
 * 2. Shows the resident selector when URL has ?impersonate=true
 * 3. Logs page views during impersonation for audit
 *
 * Entry points for impersonation:
 * - /portal?impersonate=true - Opens selector dialog
 * - Portal header "View as..." button
 * - Dashboard sidebar "View as Resident" link
 *
 * Note: Uses Suspense internally because useSearchParams requires it
 */
export function ImpersonationPortalWrapper({ children }: ImpersonationPortalWrapperProps) {
  return (
    <Suspense fallback={<>{children}</>}>
      <ImpersonationPortalWrapperInner>
        {children}
      </ImpersonationPortalWrapperInner>
    </Suspense>
  );
}
