'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Receipt,
  FileText,
  UserPlus,
  FolderOpen,
  LayoutGrid,
  DoorOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatementGeneratorDialog } from '@/components/billing/statement-generator-dialog';
import { cn } from '@/lib/utils';

/**
 * Property Quick Actions Menu Component
 *
 * Displays 2x2 grid of contextual action buttons for quick property management.
 * Actions are role-based and property-specific.
 *
 * Features:
 * - Icon + label per action
 * - Role-based visibility/disabled state
 * - Property-scoped navigation with query params
 * - Modal dialogs for statement generation
 * - Responsive grid layout
 */

interface PropertyQuickActionsMenuProps {
  /** Property ID for scoped actions */
  houseId: string;
  /** Resident ID for statement generation */
  residentId?: string;
  /** Whether user can manage household (primary resident) */
  canManage?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Handler for Add Member action (overrides default navigation) */
  onAddMember?: () => void;
  /** Handler for Move Out action */
  onMoveOut?: () => void;
  /** Whether user is a tenant (to show move out action) */
  isTenant?: boolean;
  className?: string;
}

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  colorClass: string;
  bgClass: string;
}

export function PropertyQuickActionsMenu({
  houseId,
  residentId,
  canManage = false,
  isLoading = false,
  onAddMember,
  onMoveOut,
  isTenant = false,
  className,
}: PropertyQuickActionsMenuProps) {

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
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Define quick actions
  const actions: QuickAction[] = [
    {
      label: 'View Invoices',
      icon: <Receipt className="w-5 h-5" />,
      href: `/portal/invoices?house=${houseId}`,
      colorClass: 'text-blue-600 dark:text-blue-400',
      bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Download Statement',
      icon: <FileText className="w-5 h-5" />,
      colorClass: 'text-green-600 dark:text-green-400',
      bgClass: 'bg-green-50 dark:bg-green-900/20',
      isStatementAction: true, // Special flag for statement dialog
    } as QuickAction & { isStatementAction?: boolean },
    {
      label: 'Add Member',
      icon: <UserPlus className="w-5 h-5" />,
      href: !onAddMember && canManage ? '/portal/household' : undefined,
      onClick: onAddMember,
      disabled: !canManage,
      colorClass: canManage ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-600',
      bgClass: canManage ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-gray-50 dark:bg-gray-900/20',
    },
    {
      label: 'View Documents',
      icon: <FolderOpen className="w-5 h-5" />,
      href: `/portal/documents?house=${houseId}`,
      colorClass: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      label: 'Move Out',
      icon: <DoorOpen className="w-5 h-5" />,
      onClick: onMoveOut,
      disabled: !isTenant,
      colorClass: isTenant ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400 dark:text-gray-600',
      bgClass: isTenant ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-gray-50 dark:bg-gray-900/20',
    },
  ];

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
      <div className="flex items-center gap-2 mb-4">
        <LayoutGrid
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
          Quick Actions
        </h3>
      </div>

      {/* Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action, index) => {
          const extendedAction = action as QuickAction & { isStatementAction?: boolean };

          // Create the button content
          const buttonContent = (
            <>
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  action.bgClass
                )}
              >
                <div className={action.colorClass}>{action.icon}</div>
              </div>
              <span
                className="text-sm font-medium"
                style={{
                  color: action.disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                }}
              >
                {action.label}
              </span>
            </>
          );

          // Special handling for Statement action - wrap in dialog
          if (extendedAction.isStatementAction && residentId) {
            return (
              <StatementGeneratorDialog
                key={index}
                residentId={residentId}
                defaultHouseId={houseId}
                trigger={
                  <Button
                    variant="outline"
                    className="h-24 flex-col gap-2 w-full"
                  >
                    {buttonContent}
                  </Button>
                }
              />
            );
          }

          // Regular action button
          const ActionButton = (
            <Button
              variant="outline"
              className={cn(
                'h-24 flex-col gap-2 w-full',
                action.disabled && 'opacity-50 cursor-not-allowed'
              )}
              onClick={action.onClick}
              disabled={action.disabled}
              asChild={!!action.href && !action.disabled}
            >
              {action.href && !action.disabled ? (
                <Link href={action.href}>{buttonContent}</Link>
              ) : (
                buttonContent
              )}
            </Button>
          );

          return (
            <React.Fragment key={index}>
              {ActionButton}
            </React.Fragment>
          );
        })}
      </div>

      {/* Info Text for Disabled Actions */}
      {!canManage && (
        <p
          className="text-xs mt-3 text-center"
          style={{
            color: 'var(--color-text-muted)',
          }}
        >
          Some actions require primary resident permissions
        </p>
      )}
    </div>
  );
}
