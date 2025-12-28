'use client';

import * as React from 'react';
import { useIsDesktop } from '@/hooks/use-media-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type ResponsiveSheetVariant = 'drawer' | 'modal' | 'sheet';

interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /**
   * Variant determines desktop behavior:
   * - 'drawer': Right-side drawer on desktop (for detail views)
   * - 'modal': Centered dialog on desktop (for forms)
   * - 'sheet': Always use bottom sheet (no desktop optimization)
   */
  variant?: ResponsiveSheetVariant;
  /**
   * Desktop drawer width (only applies to 'drawer' variant)
   */
  drawerWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /**
   * Modal max width (only applies to 'modal' variant)
   */
  modalSize?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Mobile sheet height
   */
  mobileHeight?: string;
  /**
   * Additional className for the content container
   */
  className?: string;
}

const drawerWidthClasses = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-md',
  lg: 'w-full max-w-lg',
  xl: 'w-full max-w-xl',
  full: 'w-full max-w-[600px]',
};

const modalSizeClasses = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
};

export function ResponsiveSheet({
  open,
  onOpenChange,
  children,
  variant = 'drawer',
  drawerWidth = 'lg',
  modalSize = 'lg',
  mobileHeight = 'h-[85vh]',
  className,
}: ResponsiveSheetProps) {
  const isDesktop = useIsDesktop();

  // Always use sheet on mobile, or if variant is 'sheet'
  if (!isDesktop || variant === 'sheet') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(mobileHeight, 'rounded-t-3xl', className)}
        >
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Use drawer (right-side sheet) for 'drawer' variant
  if (variant === 'drawer') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            drawerWidthClasses[drawerWidth],
            'h-full overflow-y-auto',
            className
          )}
        >
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Use centered dialog for 'modal' variant
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(modalSizeClasses[modalSize], 'max-h-[90vh] overflow-y-auto', className)}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

// Re-export header/footer/title/description for convenience
// These work with both Sheet and Dialog

interface ResponsiveSheetHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export function ResponsiveSheetHeader({ className, children }: ResponsiveSheetHeaderProps) {
  // This works because both SheetHeader and DialogHeader have similar structure
  // We'll use a div that matches both styling patterns
  return (
    <div className={cn('flex flex-col gap-1.5 pb-4', className)}>
      {children}
    </div>
  );
}

interface ResponsiveSheetTitleProps {
  className?: string;
  children: React.ReactNode;
}

export function ResponsiveSheetTitle({ className, children }: ResponsiveSheetTitleProps) {
  return (
    <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)}>
      {children}
    </h2>
  );
}

interface ResponsiveSheetDescriptionProps {
  className?: string;
  children: React.ReactNode;
}

export function ResponsiveSheetDescription({ className, children }: ResponsiveSheetDescriptionProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      {children}
    </p>
  );
}

interface ResponsiveSheetFooterProps {
  className?: string;
  children: React.ReactNode;
}

export function ResponsiveSheetFooter({ className, children }: ResponsiveSheetFooterProps) {
  return (
    <div className={cn('mt-auto flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end', className)}>
      {children}
    </div>
  );
}

interface ResponsiveSheetBodyProps {
  className?: string;
  children: React.ReactNode;
}

export function ResponsiveSheetBody({ className, children }: ResponsiveSheetBodyProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-1', className)}>
      {children}
    </div>
  );
}
