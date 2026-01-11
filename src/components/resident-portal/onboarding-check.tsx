'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const ONBOARDING_COMPLETED_KEY = 'residio-portal-onboarding-completed';
const ONBOARDING_PATH = '/portal/onboarding';

/**
 * Onboarding Check Component
 *
 * Checks if the user has completed onboarding and redirects to the onboarding
 * page if they haven't. Uses localStorage to track completion status.
 *
 * This wrapper should be used in the portal layout to ensure all portal pages
 * are protected by the onboarding check.
 */
export function OnboardingCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    // Skip check if we're already on the onboarding page
    if (pathname === ONBOARDING_PATH) {
      setIsChecking(false);
      return;
    }

    try {
      const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
      if (completed !== 'true') {
        setShouldRedirect(true);
      }
    } catch {
      // localStorage not available, proceed normally
    }
    setIsChecking(false);
  }, [pathname]);

  useEffect(() => {
    if (shouldRedirect && !isChecking) {
      router.replace(ONBOARDING_PATH);
    }
  }, [shouldRedirect, isChecking, router]);

  // Show loading state while checking
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // If we need to redirect, show nothing (redirect will happen)
  if (shouldRedirect && pathname !== ONBOARDING_PATH) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Hook to check onboarding status
 */
export function useOnboardingStatus() {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const status = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
      setCompleted(status === 'true');
    } catch {
      setCompleted(true); // Assume completed if localStorage not available
    }
  }, []);

  const markCompleted = () => {
    try {
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
      setCompleted(true);
    } catch {
      // localStorage not available
    }
  };

  const reset = () => {
    try {
      localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
      setCompleted(false);
    } catch {
      // localStorage not available
    }
  };

  return { completed, markCompleted, reset };
}
