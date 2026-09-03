'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, XCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CardStatus } from './system-status';

const STATUS_LABEL: Record<CardStatus, string> = {
  healthy: 'Healthy',
  warning: 'Needs attention',
  critical: 'Critical',
  neutral: 'Info',
};

const STATUS_BADGE_VARIANT: Record<CardStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  healthy: 'default',
  warning: 'secondary',
  critical: 'destructive',
  neutral: 'outline',
};

function StatusIcon({ status }: { status: CardStatus }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'critical':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return null;
  }
}

export interface StatusCardProps {
  /** Card title, e.g. "Notification Queue". */
  title: string;
  /** One-line description of what this card watches. */
  description: string;
  /** Where the card links to for the full page. */
  href: string;
  icon: LucideIcon;
  /**
   * At-a-glance severity. Omit (or pass 'neutral') for cards that are
   * informational rather than a health signal, e.g. audit activity counts.
   */
  status?: CardStatus;
  /** The headline figure, e.g. a count. */
  value?: ReactNode;
  /** Small supporting line under the value. */
  subtext?: ReactNode;
  isLoading?: boolean;
  /**
   * Set when the underlying server action returned an error for a viewer who
   * *is* permitted to see this card (a genuinely failed fetch, not a missing
   * permission — cards for permissions the viewer lacks are not rendered at
   * all, see `filterVisibleCards`). Rendered as a small muted notice rather
   * than surfacing the raw error string, with the card link still live so
   * the viewer can open the full page to investigate or retry there.
   */
  errorMessage?: string | null;
  onRetry?: () => void;
}

/**
 * One System-dashboard card: a live subject (cron, queue, audit, accounts)
 * or a plain link (data tools), rendered so a healthy state and a bad state
 * are visibly different at a glance — not just two cards with different
 * numbers in otherwise identical chrome.
 */
export function StatusCard({
  title,
  description,
  href,
  icon: Icon,
  status = 'neutral',
  value,
  subtext,
  isLoading,
  errorMessage,
  onRetry,
}: StatusCardProps) {
  return (
    <Link href={href} className="block h-full">
      <Card
        variant="stat"
        interactive
        animate
        className={cn(
          'h-full transition-colors',
          status === 'critical' && 'border-destructive/50',
          status === 'warning' && 'border-yellow-500/50',
          status === 'healthy' && 'border-green-500/30'
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon
              className={cn(
                'h-5 w-5 shrink-0',
                status === 'healthy' && 'text-green-500',
                status === 'warning' && 'text-yellow-500',
                status === 'critical' && 'text-red-500',
                status === 'neutral' && 'text-muted-foreground'
              )}
            />
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{title}</CardTitle>
              <CardDescription className="truncate">{description}</CardDescription>
            </div>
          </div>
          {status !== 'neutral' && !isLoading && !errorMessage && (
            <Badge variant={STATUS_BADGE_VARIANT[status]} className="shrink-0 gap-1">
              <StatusIcon status={status} />
              <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : errorMessage ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Unable to load right now.</p>
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRetry();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Retry
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2">
              <div>
                {value !== undefined && <p className="text-2xl font-bold leading-none">{value}</p>}
                {subtext && <p className="text-xs text-muted-foreground mt-1.5">{subtext}</p>}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mb-0.5" />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
