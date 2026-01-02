'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useImpersonation } from '@/hooks/use-impersonation';
import { ImpersonationBanner } from './impersonation-banner';
import { ResidentImpersonationSelector } from '@/components/admin/resident-impersonation-selector';
import { Loader2 } from 'lucide-react';

interface ImpersonationPortalWrapperProps {
  children: React.ReactNode;
}

/**
 * Impersonation Portal Wrapper
 *
 * Wraps the portal content to handle impersonation state:
 * 1. Shows the impersonation banner when an admin is impersonating
 * 2. Shows the resident selector when a super admin accesses the portal
 * 3. Logs page views during impersonation for audit
 */
export function ImpersonationPortalWrapper({ children }: ImpersonationPortalWrapperProps) {
  const pathname = usePathname();
  const { profile, isLoading: authLoading, isResident } = useAuth();
  const {
    isImpersonating,
    impersonationState,
    canImpersonate,
    isSuperAdmin,
    isLoading: impersonationLoading,
    logPageView,
  } = useImpersonation();

  const [showSelector, setShowSelector] = useState(false);
  const [hasCheckedAccess, setHasCheckedAccess] = useState(false);

  // Determine if user is an admin (has a role but not necessarily a resident)
  const isAdmin = profile?.role_id != null;
  const isAdminWithoutResident = isAdmin && !isResident;

  // Check if admin needs to select a resident to impersonate
  useEffect(() => {
    if (authLoading || impersonationLoading) return;

    // If admin without resident access and can impersonate, show selector
    if (isAdminWithoutResident && canImpersonate && !isImpersonating) {
      setShowSelector(true);
    }

    setHasCheckedAccess(true);
  }, [authLoading, impersonationLoading, isAdminWithoutResident, canImpersonate, isImpersonating]);

  // Log page views during impersonation
  useEffect(() => {
    if (isImpersonating && impersonationState?.sessionId) {
      logPageView(pathname);
    }
  }, [pathname, isImpersonating, impersonationState?.sessionId, logPageView]);

  // Show loading while checking access
  if (authLoading || impersonationLoading || !hasCheckedAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If admin needs to select a resident (no active impersonation and no resident link)
  if (isAdminWithoutResident && !isImpersonating && canImpersonate) {
    return (
      <>
        <ResidentImpersonationSelector
          open={showSelector}
          onOpenChange={(open) => {
            if (!open) {
              // If they close without selecting, redirect to dashboard
              window.location.href = '/dashboard';
            }
          }}
          onSuccess={() => {
            setShowSelector(false);
            // The page will refresh with impersonation active
          }}
        />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center p-8">
            <h2 className="text-xl font-semibold mb-2">Select a Resident</h2>
            <p className="text-muted-foreground">
              Please select a resident to view the portal as.
            </p>
          </div>
        </div>
      </>
    );
  }

  // If admin without resident access and cannot impersonate
  if (isAdminWithoutResident && !isImpersonating && !canImpersonate) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            You do not have a linked resident account or impersonation permission.
          </p>
          <a
            href="/dashboard"
            className="text-primary hover:underline"
          >
            Return to Dashboard
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

      {/* Resident selector dialog (for switching residents) */}
      {isImpersonating && (
        <ResidentImpersonationSelector
          open={showSelector}
          onOpenChange={setShowSelector}
        />
      )}

      {/* Portal content */}
      {children}
    </>
  );
}
