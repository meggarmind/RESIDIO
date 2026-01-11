'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VisualThemeSelector } from '@/components/settings/visual-theme-selector';
import { useEstateDefaultTheme, useSetUserThemeOverride } from '@/hooks/use-theme-preferences';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { Palette, ChevronRight, SkipForward, Check } from 'lucide-react';

const ONBOARDING_COMPLETED_KEY = 'residio-portal-onboarding-completed';

/**
 * Portal Onboarding Page
 *
 * Allows new residents to select their preferred theme when first accessing the portal.
 * Uses the same theme selector component as the Settings page with live hover preview.
 */
export default function PortalOnboardingPage() {
  const router = useRouter();
  const [selectedTheme, setSelectedTheme] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Get estate default theme to pre-select
  const { data: estateTheme, isLoading: themeLoading } = useEstateDefaultTheme('resident-portal');
  const setUserThemeOverride = useSetUserThemeOverride('resident-portal');
  const { setThemeId } = useVisualTheme();

  // Pre-select estate default theme when loaded
  useEffect(() => {
    if (estateTheme && !selectedTheme) {
      setSelectedTheme(estateTheme);
    }
  }, [estateTheme, selectedTheme]);

  // Check if onboarding was already completed
  useEffect(() => {
    try {
      const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
      if (completed === 'true') {
        router.replace('/portal');
      }
    } catch {
      // localStorage not available
    }
  }, [router]);

  const handleContinue = async () => {
    setIsSubmitting(true);
    try {
      // Only save if user selected a different theme than estate default
      if (selectedTheme && selectedTheme !== estateTheme) {
        await setUserThemeOverride.mutateAsync(selectedTheme);
        setThemeId(selectedTheme);
      }

      // Mark onboarding as complete
      try {
        localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
      } catch {
        // localStorage not available
      }

      // Show success animation
      setShowSuccess(true);
      setTimeout(() => {
        router.push('/portal');
      }, 800);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
      // Still proceed to portal
      router.push('/portal');
    }
  };

  const handleSkip = () => {
    try {
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    } catch {
      // localStorage not available
    }
    router.push('/portal');
  };

  if (themeLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-4xl px-4">
          <div className="h-8 bg-muted rounded w-1/3 mx-auto" />
          <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8">
      <AnimatePresence mode="wait">
        {showSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-center space-y-4"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">All set!</h2>
            <p className="text-muted-foreground">Taking you to your portal...</p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-4xl px-4"
          >
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur">
              <CardHeader className="text-center space-y-2 pb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Palette className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Choose Your Theme</CardTitle>
                <CardDescription className="text-base max-w-md mx-auto">
                  Pick a visual style that suits you. Hover over any theme to preview it in real-time.
                  You can always change this later in Settings.
                </CardDescription>

                {/* Progress Indicator */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  <div className="w-8 h-1 rounded-full bg-primary" />
                  <div className="w-8 h-1 rounded-full bg-muted" />
                  <div className="w-8 h-1 rounded-full bg-muted" />
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Theme Selector */}
                <div className="max-h-[50vh] overflow-y-auto pr-2 -mr-2">
                  <VisualThemeSelector
                    value={selectedTheme}
                    onChange={setSelectedTheme}
                    context="resident-portal"
                    allowDefault={false}
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                  <Button
                    variant="ghost"
                    onClick={handleSkip}
                    className="text-muted-foreground"
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    Use Estate Default
                  </Button>

                  <Button
                    size="lg"
                    onClick={handleContinue}
                    disabled={isSubmitting}
                    className="min-w-[140px]"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Saving...
                      </>
                    ) : (
                      <>
                        Continue
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
