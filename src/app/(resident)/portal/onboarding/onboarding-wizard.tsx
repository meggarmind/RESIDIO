'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { useUser } from '@/lib/auth/auth-context';
import { useResident } from '@/hooks/use-residents';
import { useSetUserThemeOverride } from '@/hooks/use-theme-preferences';
import { useVisualTheme } from '@/contexts/visual-theme-context';
// Import steps
import { ProfileStep } from './steps/profile-step';
import { HouseholdStep } from './steps/household-step';
// We'll need a ThemeStep that wraps the existing content or we can refactor page.tsx content into a component
// For now, let's create a local component or reuse logic in page.tsx. 
// Actually, better to have a clean separation. Let's create ThemeStep in this file or a separate one.
// Let's assume we pass the ThemeStep as a child or incorporate it.

// Let's create a ThemeStep component here for simplicity or separate it.
// I'll create a simple inline one for now or import the logic from page.tsx if it was exported.
// Since page.tsx logic was monolithic, I'll extract it to a step component in page.ts usage
// BUT to be clean, I will make the wizard manage the state and components.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Palette, SkipForward, ChevronRight, Check } from 'lucide-react';
import { VisualThemeSelector } from '@/components/settings/visual-theme-selector';
import { motion } from 'framer-motion';

const ONBOARDING_COMPLETED_KEY = 'residio-portal-onboarding-completed';

const STEPS = {
    THEME: 0,
    PROFILE: 1,
    HOUSEHOLD: 2,
    COMPLETE: 3,
};

// Theme Step Component (extracted from original page)
function ThemeStep({ onNext, onSkip, estateTheme, initialTheme }: any) {
    const [selectedTheme, setSelectedTheme] = useState(initialTheme || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const setUserThemeOverride = useSetUserThemeOverride('resident-portal');
    const { setThemeId } = useVisualTheme();

    const handleContinue = async () => {
        setIsSubmitting(true);
        try {
            if (selectedTheme && selectedTheme !== estateTheme) {
                await setUserThemeOverride.mutateAsync(selectedTheme);
                setThemeId(selectedTheme);
            }
            onNext();
        } catch (error) {
            console.error('Failed to save theme:', error);
            onNext();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-4xl px-4 mx-auto"
        >
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur">
                <CardHeader className="text-center space-y-2 pb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Palette className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Choose Your Theme</CardTitle>
                    <CardDescription className="text-base max-w-md mx-auto">
                        Pick a visual style that suits you. Hover over any theme to preview it in real-time.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="max-h-[50vh] overflow-y-auto pr-2 -mr-2">
                        <VisualThemeSelector
                            value={selectedTheme || estateTheme}
                            onChange={setSelectedTheme}
                            context="resident-portal"
                            allowDefault={false}
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                        <Button variant="ghost" onClick={onNext} className="text-muted-foreground hidden sm:flex">
                            <SkipForward className="h-4 w-4 mr-2" />
                            Use Default
                        </Button>
                        <Button size="lg" onClick={handleContinue} disabled={isSubmitting} className="min-w-[140px] ml-auto">
                            {isSubmitting ? 'Saving...' : <>Continue <ChevronRight className="h-4 w-4 ml-2" /></>}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

// Completion Step
function CompletionStep({ onFinish }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4 max-w-md mx-auto py-12"
        >
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-3xl font-bold">You're All Set!</h2>
            <p className="text-muted-foreground text-lg">
                Your profile is set up. Welcome to your new resident portal.
            </p>
            <div className="pt-8">
                <Button size="lg" onClick={onFinish} className="w-full">
                    Enter Portal
                </Button>
            </div>
        </motion.div>
    );
}

interface OnboardingWizardProps {
    estateTheme: string;
}

export function OnboardingWizard({ estateTheme }: OnboardingWizardProps) {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(STEPS.THEME);
    const { user } = useUser();

    // Fetch resident to check role (for household step skipping)
    const { data: resident } = useResident(user?.resident_id || undefined);

    // Determine if user is primary (can add household members)
    const isPrimary = resident?.houses?.some(h => h.is_primary) ?? false;

    const nextStep = () => {
        if (currentStep === STEPS.PROFILE && !isPrimary) {
            // Skip household step if not primary
            setCurrentStep(STEPS.COMPLETE);
        } else {
            setCurrentStep(prev => prev + 1);
        }
    };

    const prevStep = () => {
        setCurrentStep(prev => prev - 1);
    };

    const finishOnboarding = () => {
        try {
            localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        } catch {
            // ignore
        }
        router.push('/portal');
    };

    // Progress bar
    const totalSteps = isPrimary ? 3 : 2; // Theme, Profile, (Household), Complete doesn't count as step really
    // Normalized progress
    const progress = ((currentStep + 1) / (totalSteps + 1)) * 100;

    return (
        <div className="w-full">
            {/* Progress Indicator (only show before completion) */}
            {currentStep !== STEPS.COMPLETE && (
                <div className="max-w-xs mx-auto mb-8">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>Theme</span>
                        <span>Profile</span>
                        {isPrimary && <span>Household</span>}
                    </div>
                </div>
            )}

            <AnimatePresence mode="wait">
                {currentStep === STEPS.THEME && (
                    <ThemeStep
                        key="theme"
                        estateTheme={estateTheme}
                        initialTheme={estateTheme}
                        onNext={nextStep}
                    />
                )}

                {currentStep === STEPS.PROFILE && (
                    <ProfileStep
                        key="profile"
                        onNext={nextStep}
                        onBack={prevStep}
                    />
                )}

                {currentStep === STEPS.HOUSEHOLD && (
                    <HouseholdStep
                        key="household"
                        onNext={nextStep}
                        onBack={prevStep}
                    />
                )}

                {currentStep === STEPS.COMPLETE && (
                    <CompletionStep
                        key="complete"
                        onFinish={finishOnboarding}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
