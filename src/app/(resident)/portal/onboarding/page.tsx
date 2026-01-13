'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEstateDefaultTheme } from '@/hooks/use-theme-preferences';
import { OnboardingWizard } from './onboarding-wizard';

const ONBOARDING_COMPLETED_KEY = 'residio-portal-onboarding-completed';

/**
 * Portal Onboarding Page
 * 
 * Entry point for new resident onboarding.
 * Now uses the multi-step OnboardingWizard.
 */
export default function PortalOnboardingPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  // Get estate default theme to pass to wizard
  const { data: estateTheme, isLoading: themeLoading } = useEstateDefaultTheme('resident-portal');

  // Check if onboarding was already completed
  useEffect(() => {
    try {
      const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
      if (completed === 'true') {
        router.replace('/portal');
      } else {
        setIsChecking(false);
      }
    } catch {
      setIsChecking(false);
    }
  }, [router]);

  if (themeLoading || isChecking) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-2xl px-4 text-center">
          <div className="h-2 w-1/3 bg-muted rounded mx-auto mb-8" />
          <div className="h-64 bg-muted rounded-lg w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8 px-4">
      <OnboardingWizard estateTheme={estateTheme || 'default'} />
    </div>
  );
}
