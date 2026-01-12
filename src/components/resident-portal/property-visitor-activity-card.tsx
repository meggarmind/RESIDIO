'use client';

import * as React from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { UserCheck, Car, Clock, ArrowRight, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AccessLog } from '@/types/database';

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
  accessLogs: AccessLog[];
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
          borderColor: 'var(--color-border)',
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
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <UserCheck
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
            }}
          >
            Recent Visitor Activity
          </h3>
        </div>
        <div className="text-center py-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'var(--color-bg-muted)',
            }}
          >
            <UserCheck
              style={{
                width: '24px',
                height: '24px',
                color: 'var(--color-text-muted)',
              }}
            />
          </div>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
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
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UserCheck
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
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
                borderColor: index < accessLogs.length - 1 ? 'var(--color-border)' : 'transparent',
              }}
            >
              {/* Timeline Dot */}
              <div
                className="absolute left-[-5px] top-[6px] w-2.5 h-2.5 rounded-full"
                style={{
                  background: isCheckedOut ? 'var(--color-success)' : 'var(--color-primary)',
                }}
              />

              {/* Log Content */}
              <div
                className="rounded-lg p-3"
                style={{
                  background: 'var(--color-bg-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Visitor Name */}
                <p
                  className="font-medium mb-1"
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {log.contact_name || 'Unknown Visitor'}
                </p>

                {/* Check-in Time */}
                <div className="flex items-center gap-4 flex-wrap text-xs mb-2">
                  <div className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                    <Clock className="w-3 h-3" />
                    <span>
                      {log.check_in_time
                        ? formatDistanceToNow(new Date(log.check_in_time), { addSuffix: true })
                        : 'No time'}
                    </span>
                  </div>
                  {duration && (
                    <div className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                      <Calendar className="w-3 h-3" />
                      <span>{duration}</span>
                    </div>
                  )}
                </div>

                {/* Vehicle Badge */}
                {log.vehicle_plate && (
                  <Badge variant="outline" className="text-xs">
                    <Car className="w-3 h-3 mr-1" />
                    {log.vehicle_plate}
                  </Badge>
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
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <Link
          href="/portal/security"
          className="flex items-center justify-between text-sm hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          <span>View All Activity</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
