'use client';

import Link from 'next/link';
import {
  UserPlus,
  CreditCard,
  FileText,
  Upload,
  Home,
  ShieldPlus,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePendingApprovalsCount } from '@/hooks/use-approvals';
import { Badge } from '@/components/ui/badge';

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  accentColor: string;
  bgColor: string;
  showBadge?: boolean;
}

const quickActions: QuickAction[] = [
  {
    label: 'Add Resident',
    description: 'Register new resident',
    href: '/residents/new',
    icon: UserPlus,
    accentColor: 'text-[#10B981]',
    bgColor: 'bg-[#10B981]/10',
  },
  {
    label: 'Record Payment',
    description: 'Manual payment entry',
    href: '/payments/new',
    icon: CreditCard,
    accentColor: 'text-[#0EA5E9]',
    bgColor: 'bg-[#0EA5E9]/10',
  },
  {
    label: 'Generate Invoices',
    description: 'Create monthly invoices',
    href: '/billing/generate',
    icon: FileText,
    accentColor: 'text-[#F59E0B]',
    bgColor: 'bg-[#F59E0B]/10',
  },
  {
    label: 'Import Statement',
    description: 'Bank statement upload',
    href: '/billing/imports/new',
    icon: Upload,
    accentColor: 'text-[#8B5CF6]',
    bgColor: 'bg-[#8B5CF6]/10',
  },
  {
    label: 'Add House',
    description: 'Register property',
    href: '/houses/new',
    icon: Home,
    accentColor: 'text-[#F43F5E]',
    bgColor: 'bg-[#F43F5E]/10',
  },
  {
    label: 'Security Contact',
    description: 'Register contact',
    href: '/security/contacts/new',
    icon: ShieldPlus,
    accentColor: 'text-[#64748B]',
    bgColor: 'bg-[#64748B]/10',
    showBadge: true,
  },
];

interface ActionCardProps {
  action: QuickAction;
  pendingCount?: number;
}

function ActionCard({ action, pendingCount }: ActionCardProps) {
  const Icon = action.icon;
  const showBadge = action.showBadge && pendingCount && pendingCount > 0;

  return (
    <Link
      href={action.href}
      className={cn(
        'group flex flex-col items-center justify-center gap-3 rounded-xl p-6 text-center',
        'bg-white dark:bg-[#1E293B]',
        'border border-gray-200 dark:border-[#334155]',
        'shadow-sm transition-all duration-200',
        'hover:shadow-md hover:border-gray-300 dark:hover:border-[#475569]',
        'hover:-translate-y-0.5'
      )}
    >
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-xl transition-transform duration-200',
          'group-hover:scale-110',
          action.bgColor
        )}
      >
        <Icon className={cn('h-7 w-7', action.accentColor)} />
      </div>
      <div className="relative">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {action.label}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {action.description}
        </p>
        {showBadge && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-4 h-5 min-w-[20px] px-1.5 text-xs font-semibold rounded-full"
          >
            {pendingCount}
          </Badge>
        )}
      </div>
    </Link>
  );
}

/**
 * Modern Quick Actions Grid
 *
 * A 2-column (mobile) / 3-column (desktop) grid of action cards
 * featuring Modern theme styling with:
 * - Rounded corners (rounded-xl)
 * - Subtle shadows and hover effects
 * - Centered icons with color-coded backgrounds
 * - Clear labels and descriptions
 */
export function ModernQuickActions() {
  const { data: pendingCount } = usePendingApprovalsCount();

  return (
    <div className={cn(
      'rounded-xl border bg-white p-6 shadow-sm',
      'dark:bg-[#1E293B] dark:border-[#334155]'
    )}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Quick Actions
        </h3>
        <Link
          href="/settings"
          className="flex items-center gap-1 text-sm font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors"
        >
          Settings
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {quickActions.map((action) => (
          <ActionCard
            key={action.href}
            action={action}
            pendingCount={pendingCount}
          />
        ))}
      </div>
    </div>
  );
}
