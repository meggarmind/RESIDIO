import React from 'react';
import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Page Header
 *
 * Theme-aware page header with title, description, optional back control and actions.
 * Has no hooks and no 'use client', so a Server Component page can pass a lucide icon.
 */
interface EnhancedPageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
  animate?: boolean;
  backHref?: string;
  backLabel?: string;
}

export function EnhancedPageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  animate = true,
  backHref,
  backLabel,
}: EnhancedPageHeaderProps) {
  return (
    <div className={cn(
      'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4',
      animate && 'animate-slide-up',
      className
    )}>
      <div className="flex items-center gap-4">
        {backHref && (
          <Button variant="ghost" size="icon" asChild aria-label={backLabel ?? 'Go back'}>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}
        {Icon && (
          <div className="flex h-12 w-12 items-center justify-center transition-transform duration-300 hover:scale-105 rounded-xl bg-primary/10 dark:bg-primary/20">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm sm:text-base mt-1 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
