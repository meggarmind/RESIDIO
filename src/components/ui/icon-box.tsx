import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Icon Box Component - Modern Design System
 *
 * Decorative icon container with pastel background following the portal-modern design system.
 *
 * Design Specifications:
 * - Sizes: sm (40px), md (48px), lg (56px)
 * - Border radius: 12px (var(--radius-lg))
 * - Background: Pastel colors (pink, blue, purple, orange, green, cyan)
 * - Icon size: 24px (var(--icon-md))
 * - Centered flex layout
 *
 * Usage:
 * <IconBox color="blue" size="md">
 *   <Home />
 * </IconBox>
 */

interface IconBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon color variant */
  color?: 'pink' | 'blue' | 'purple' | 'orange' | 'green' | 'cyan';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Icon element to display */
  children: React.ReactNode;
}

export function IconBox({
  color = 'blue',
  size = 'md',
  className,
  children,
  ...props
}: IconBoxProps) {
  const sizeStyles = {
    sm: { width: '40px', height: '40px' },
    md: { width: '48px', height: '48px' },
    lg: { width: '56px', height: '56px' },
  };

  const colorClasses = {
    pink: 'icon-box-pink',
    blue: 'icon-box-blue',
    purple: 'icon-box-purple',
    orange: 'icon-box-orange',
    green: 'icon-box-green',
    cyan: 'icon-box-cyan',
  };

  return (
    <div
      className={cn('icon-box', colorClasses[color], className)}
      style={sizeStyles[size]}
      {...props}
    >
      {children}
    </div>
  );
}
