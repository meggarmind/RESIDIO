import * as React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * List Item Component - Modern Design System
 *
 * Flexible list item for tables and lists with icon/avatar, content, and meta information.
 *
 * Design Specifications:
 * - Layout: Icon/Avatar (40px) + Content (title + subtitle) + Meta (right-aligned)
 * - Padding: 12px vertical, 0 horizontal
 * - Border bottom: 1px solid light gray
 * - Hover: Light gray background
 * - Icon: 40px circle with background color
 * - Title: 14px semibold
 * - Subtitle: 12px gray
 * - Meta: Right-aligned content (badge, amount, etc.)
 *
 * Example:
 * [Icon] "Invoice #12345"              [$500] [Badge]
 *        "Due: Jan 15, 2024"
 *
 * Usage:
 * <ListItem
 *   icon={Receipt}
 *   iconColor="blue"
 *   title="Invoice #12345"
 *   subtitle="Due: Jan 15, 2024"
 *   meta={<Badge>Paid</Badge>}
 * />
 */

interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon component (optional) */
  icon?: LucideIcon;
  /** Icon background color */
  iconColor?: 'pink' | 'blue' | 'purple' | 'orange' | 'green' | 'cyan';
  /** Avatar text (if no icon provided) */
  avatar?: string;
  /** Main title text */
  title: string;
  /** Subtitle text (optional) */
  subtitle?: string;
  /** Right-aligned meta content (badges, amounts, etc.) */
  meta?: React.ReactNode;
  /** Whether this is the last item (removes border) */
  isLast?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export function ListItem({
  icon,
  iconColor = 'blue',
  avatar,
  title,
  subtitle,
  meta,
  isLast = false,
  onClick,
  className,
  ...props
}: ListItemProps) {
  const iconColorMap = {
    pink: 'var(--color-icon-bg-pink)',
    blue: 'var(--color-icon-bg-blue)',
    purple: 'var(--color-icon-bg-purple)',
    orange: 'var(--color-icon-bg-orange)',
    green: 'var(--color-icon-bg-green)',
    cyan: 'var(--color-icon-bg-cyan)',
  };

  // Get initials from avatar text
  const getInitials = (text: string) => {
    return text
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const Icon = icon;

  return (
    <div
      className={cn(
        'list-item',
        'flex items-center gap-3 transition-colors duration-150',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        paddingTop: 'var(--space-3)', // 12px
        paddingBottom: 'var(--space-3)',
        borderBottom: isLast
          ? 'none'
          : '1px solid var(--color-bg-input)',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background = 'var(--color-bg-input)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
      {...props}
    >
      {/* Icon or Avatar */}
      {Icon ? (
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-full)',
            background: iconColorMap[iconColor],
          }}
        >
          <Icon
            style={{
              width: 'var(--icon-sm)', // 20px
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      ) : avatar ? (
        <Avatar
          style={{
            width: '40px',
            height: '40px',
            flexShrink: 0,
          }}
        >
          <AvatarFallback
            style={{
              background: iconColorMap[iconColor],
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
            }}
          >
            {getInitials(avatar)}
          </AvatarFallback>
        </Avatar>
      ) : null}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3
          className="truncate"
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
            marginBottom: subtitle ? 'var(--space-1)' : '0',
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className="truncate"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Meta */}
      {meta && (
        <div className="flex-shrink-0 flex items-center gap-2">
          {meta}
        </div>
      )}
    </div>
  );
}
