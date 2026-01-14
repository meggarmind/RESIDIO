'use client';

import * as React from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { UserCheck, Car, Clock, ArrowRight, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AccessLogWithDetails } from '@/types/database';

/**
 * Property Visitor Activity Card Component
 *
 * Displays last 10 visitor check-ins for the current property.
 * Shows visitor name, check-in time, duration, and vehicle information.
 *
 * Features:
 * - Timeline/list view format
 * - Relative time display ("2 hours ago")
 * - Vehicle plate badge
 * - Empty state for no activity
 * - Compact layout optimized for mobile
 */

interface PropertyVisitorActivityCardProps {
  /** Last 10 access logs for this property */
  accessLogs: AccessLogWithDetails[];
  /** Loading state */
  isLoading?: boolean;
  /** Property ID for "View All" link */
  houseId: string;
  className?: string;
}

export function PropertyVisitorActivityCard({
  accessLogs,
  isLoading = false,
  houseId,
  className,
}: PropertyVisitorActivityCardProps) {
  // Calculate duration between check-in and check-out
  const getDuration = (checkIn: string | null, checkOut: string | null) => {
    if (!checkIn || !checkOut) return null;

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (accessLogs.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <UserCheck
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'hsl(var(--foreground))',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'hsl(var(--foreground))',
            }}
          >
            Recent Visitor Activity
          </h3>
        </div>
        <div className="text-center py-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'hsl(var(--muted))',
            }}
          >
            <UserCheck
              style={{
                width: '24px',
                height: '24px',
                color: 'hsl(var(--muted-foreground))',
              }}
            />
          </div>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--muted-foreground)',
            }}
          >
            No recent visitor activity recorded
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg p-6 border',
        'bg-card',
        className
      )}
      style={{
        borderColor: 'hsl(var(--border))',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UserCheck
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'hsl(var(--foreground))',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'hsl(var(--foreground))',
            }}
          >
            Recent Visitor Activity
          </h3>
        </div>
        <Badge
          variant="secondary"
          style={{
            fontSize: 'var(--text-xs)',
          }}
        >
          {accessLogs.length}
        </Badge>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {accessLogs.map((log, index) => {
          const duration = getDuration(log.check_in_time, log.check_out_time);
          const isCheckedOut = !!log.check_out_time;

          return (
            <div
              key={log.id}
              className={cn(
                'relative pl-4 pb-3',
                index < accessLogs.length - 1 && 'border-l-2'
              )}
              style={{
                borderColor: index < accessLogs.length - 1 ? 'hsl(var(--border))' : 'transparent',
              }}
            >
              {/* Timeline Dot */}
              <div
                className="absolute left-[-5px] top-[6px] w-2.5 h-2.5 rounded-full"
                style={{
                  background: isCheckedOut ? 'hsl(var(--success, 142.1 70.6% 45.3%))' : 'hsl(var(--primary))',
                }}
              />

              {/* Log Content */}
              <div
                className="rounded-lg p-3"
                style={{
                  background: 'hsl(var(--muted))',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                {/* Visitor Name */}
                <p
                  className="font-medium mb-1"
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {log.contact?.full_name || 'Unknown Contact'}
                </p>

                {/* Check-in Time */}
                <div className="flex items-center gap-4 flex-wrap text-xs mb-2">
                  <div className="flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <Clock className="w-3 h-3" />
                    <span>
                      {log.check_in_time
                        ? formatDistanceToNow(new Date(log.check_in_time), { addSuffix: true })
                        : 'No time'}
                    </span>
                  </div>
                  {duration && (
                    <div className="flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <Calendar className="w-3 h-3" />
                      <span>{duration}</span>
                    </div>
                  )}
                </div>

                {/* Vehicle Badge */}
                {log.vehicle?.plate_number && (
                  <span className="text-xs ml-auto font-mono bg-muted px-1.5 py-0.5 rounded border border-border">
                    {log.vehicle.plate_number}
                  </span>
                )}

                {/* Status Badge */}
                {!isCheckedOut && (
                  <Badge variant="success" className="text-xs ml-2">
                    Currently Inside
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* View All Link */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
        <Link
          href="/portal/security"
          className="flex items-center justify-between text-sm hover:underline"
          style={{
            color: 'var(--primary)'
          }}
        >
          <span>View All Activity</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
