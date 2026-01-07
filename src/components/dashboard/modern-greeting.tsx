'use client';

import { cn } from '@/lib/utils';

interface ModernGreetingProps {
  name: string;
  className?: string;
}

/**
 * Modern Theme Greeting Component
 *
 * Displays personalized time-appropriate greeting with Modern theme styling.
 * Features generous spacing and Modern typography scale.
 */
export function ModernGreeting({ name, className }: ModernGreetingProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className={cn('space-y-2', className)}>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Hello {name}, {greeting}
      </h1>
      <p className="text-base text-gray-500 dark:text-gray-400">
        Let&apos;s check your estate
      </p>
    </div>
  );
}
