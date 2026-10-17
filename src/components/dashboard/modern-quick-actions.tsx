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
    accentColor: 'text-chart-1',
    bgColor: 'bg-chart-1/10',
  },
  {
    label: 'Record Payment',
    description: 'Manual payment entry',
    href: '/payments/new',
    icon: CreditCard,
    accentColor: 'text-chart-2',
    bgColor: 'bg-chart-2/10',
  },
  {
    label: 'Generate Invoices',
    description: 'Create monthly invoices',
    href: '/billing/generate',
    icon: FileText,
    accentColor: 'text-chart-3',
    bgColor: 'bg-chart-3/10',
  },
  {
    label: 'Import Statement',
    description: 'Bank statement upload',
    href: '/billing/imports/new',
    icon: Upload,
    accentColor: 'text-chart-4',
    bgColor: 'bg-chart-4/10',
  },
  {
    label: 'Add House',
    description: 'Register property',
    href: '/houses/new',
    icon: Home,
    accentColor: 'text-chart-5',
    bgColor: 'bg-chart-5/10',
  },
  {
    label: 'Security Contact',
    description: 'Register contact',
    href: '/security/contacts/new',
    icon: ShieldPlus,
    accentColor: 'text-muted-foreground',
    bgColor: 'bg-muted',
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
        'bg-card',
        'border border-border',
        'shadow-sm transition-all duration-200',
        'hover:shadow-md hover:border-border',
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
        <p className="text-sm font-semibold text-foreground">
          {action.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
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
      'rounded-xl border bg-card p-6 shadow-sm'
    )}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          Quick Actions
        </h3>
        <Link
          href="/settings"
          className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
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
