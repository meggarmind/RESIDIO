import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Empty list in a settings page: what is missing and, when allowed, the first action (#788). */
export function SettingsEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/** Loading placeholder for a settings list or form, in place of bare "Loading..." text. */
export function SettingsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Active / inactive pill on semantic tokens instead of raw palette colours. */
export function ActiveStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        active
          ? 'border-success/20 bg-success/10 text-success'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
