import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconBox } from '@/components/ui/icon-box';
import { ArrowRight } from 'lucide-react';

/**
 * Feature Card Component - Modern Design System
 *
 * Card for displaying features/modules with icon, title, and description.
 *
 * Design Specifications:
 * - Background: White card (var(--color-bg-card))
 * - Border radius: 12px (var(--radius-lg))
 * - Shadow: var(--shadow-md)
 * - Padding: 20px
 * - Icon box: Colorful background (48px)
 * - Title: 16px semibold
 * - Subtitle: 14px gray
 *
 * Example:
 * [Icon Box - Blue]
 * "Properties"
 * "118 Assets"
 *
 * Usage:
 * <FeatureCard
 *   title="Properties"
 *   subtitle="118 Assets"
 *   icon={<Building />}
 *   iconColor="blue"
 *   href="/portal/properties"
 * />
 */

interface FeatureCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Feature title */
  title: string;
  /** Feature subtitle/description */
  subtitle: string;
  /** Icon to display */
  icon: React.ReactNode;
  /** Icon background color */
  iconColor?: 'pink' | 'blue' | 'purple' | 'orange' | 'green' | 'cyan';
  /** Optional link href */
  href?: string;
  /** Optional badge count */
  badge?: number;
}

export function FeatureCard({
  title,
  subtitle,
  icon,
  iconColor = 'blue',
  href,
  badge,
  className,
  ...props
}: FeatureCardProps) {
  const content = (
    <>
      {/* Icon Box */}
      <IconBox color={iconColor} size="md" className="mb-4">
        {icon}
      </IconBox>

      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--foreground)',
            }}
          >
            {title}
          </h3>
          {badge !== undefined && (
            <span
              className="badge badge-neutral"
              style={{
                fontSize: 'var(--text-xs)',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--muted-foreground)',
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Arrow indicator for links */}
      {href && (
        <ArrowRight
          className="mt-2"
          style={{
            width: 'var(--icon-sm)',
            height: 'var(--icon-sm)',
            color: 'var(--muted-foreground)',
          }}
        />
      )}
    </>
  );

  const cardClasses = cn(
    'card card-interactive',
    'flex flex-col',
    href && 'cursor-pointer',
    className
  );

  const cardStyle = {
    padding: 'var(--space-5)', // 20px
  };

  if (href) {
    return (
      <Link href={href} className={cardClasses} style={cardStyle}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClasses} style={cardStyle} {...props}>
      {content}
    </div>
  );
}
