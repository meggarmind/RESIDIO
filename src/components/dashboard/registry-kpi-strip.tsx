import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RegistryKpi {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

interface RegistryKpiStripProps {
  items: RegistryKpi[];
  isLoading?: boolean;
}

const toneClasses = {
  default: 'text-muted-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
};

export function RegistryKpiStrip({ items, isLoading = false }: RegistryKpiStripProps) {
  return (
    <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
      {items.map(({ label, value, detail, icon: Icon, tone = 'default' }, index) => (
        <div
          key={label}
          className={cn(
            'flex min-w-0 items-center gap-3 px-4 py-3',
            index > 0 && 'border-t sm:border-t-0 sm:border-l'
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', toneClasses[tone])} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-lg font-semibold tabular-nums">{isLoading ? '-' : value}</p>
              {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
