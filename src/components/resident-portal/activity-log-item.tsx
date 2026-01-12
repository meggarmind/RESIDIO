import * as React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * Activity Log Item Component - Modern Design System
 *
 * Compact list item for displaying recent activity/actions in the right sidebar.
 *
 * Design Specifications:
 * - Layout: Avatar (32px) + Content (name/action) + Timestamp
 * - Padding: 12px vertical
 * - Border bottom: 1px solid light gray (last item: no border)
 * - Avatar: 32px circle with initials
 * - Name: 14px semibold
 * - Action: 12px gray
 * - Timestamp: 12px gray, right-aligned
 *
 * Example:
 * [Avatar] "John Doe"           "2hrs ago"
 *          "Paid invoice #123"
 *
 * Usage:
 * <ActivityLogItem
 *   userName="John Doe"
 *   action="Paid invoice #123"
 *   timestamp="2hrs ago"
 *   avatarColor="blue"
 * />
 */

interface ActivityLogItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** User's display name */
  userName: string;
  /** Action description */
  action: string;
  /** Relative timestamp (e.g., "2hrs ago", "Just now") */
  timestamp: string;
  /** Avatar color variant */
  avatarColor?: 'pink' | 'blue' | 'purple' | 'orange' | 'green' | 'cyan';
  /** Whether this is the last item (removes border) */
  isLast?: boolean;
}

export function ActivityLogItem({
  userName,
  action,
  timestamp,
  avatarColor = 'blue',
  isLast = false,
  className,
  ...props
}: ActivityLogItemProps) {
  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const initials = getInitials(userName);

  const avatarColorMap = {
    pink: 'var(--color-icon-bg-pink)',
    blue: 'var(--color-icon-bg-blue)',
    purple: 'var(--color-icon-bg-purple)',
    orange: 'var(--color-icon-bg-orange)',
    green: 'var(--color-icon-bg-green)',
    cyan: 'var(--color-icon-bg-cyan)',
  };

  return (
    <div
      className={cn('list-item', 'flex items-start gap-3', className)}
      style={{
        paddingTop: 'var(--space-3)', // 12px
        paddingBottom: 'var(--space-3)',
        borderBottom: isLast
          ? 'none'
          : '1px solid var(--color-bg-input)',
      }}
      {...props}
    >
      {/* Avatar */}
      <Avatar
        style={{
          width: '32px',
          height: '32px',
          flexShrink: 0,
        }}
      >
        <AvatarFallback
          style={{
            background: avatarColorMap[avatarColor],
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name and Timestamp */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className="truncate"
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-text-primary)',
            }}
          >
            {userName}
          </span>
          <span
            className="flex-shrink-0"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            {timestamp}
          </span>
        </div>

        {/* Action */}
        <p
          className="truncate"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {action}
        </p>
      </div>
    </div>
  );
}
