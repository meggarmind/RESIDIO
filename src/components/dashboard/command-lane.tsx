'use client';

import Link from 'next/link';
import { format, isValid } from 'date-fns';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { STATUS_COLORS } from '@/components/dashboard/status-colors';

/** neutral = nothing to judge yet (for example no invoices), never a green tick. */
export type LaneTone = 'neutral' | 'ok' | 'attention' | 'overdue';
export type LaneState = 'loading' | 'unavailable' | 'ready';

export interface LaneRow {
  key: string;
  label: string;
  /** null renders "Unavailable", never a zero. */
  value: string | null;
  hint?: string;
}

export interface LaneAction {
  label: string;
  href: string;
  /** Result of the write or view permission check for this action. */
  allowed: boolean;
}

export interface CommandLaneProps {
  testId: string;
  title: string;
  state: LaneState;
  tone: LaneTone;
  /** ISO time the data was reconciled. Omitted when the snapshot carries none. */
  asOf?: string | null;
  heroLabel: string;
  /** Pre-formatted hero figure. null renders "Unavailable". */
  heroValue: string | null;
  status?: React.ReactNode;
  rows: LaneRow[];
  primary: LaneAction;
  secondary?: LaneAction[];
}

const TONE: Record<LaneTone, { label: string; text: string; icon: React.ElementType }> = {
  neutral: { label: 'Quiet', text: STATUS_COLORS.neutral.text, icon: CircleDashed },
  ok: { label: 'Healthy', text: STATUS_COLORS.ok.text, icon: CheckCircle2 },
  attention: { label: 'Needs attention', text: STATUS_COLORS.attention.text, icon: Clock },
  overdue: { label: 'Overdue', text: STATUS_COLORS.overdue.text, icon: AlertTriangle },
};

export function formatAsOf(asOf?: string | null): string | null {
  if (!asOf) return null;
  const d = new Date(asOf);
  return isValid(d) ? format(d, 'MMM d, h:mm a') : null;
}

export function CommandLane({
  testId,
  title,
  state,
  tone,
  asOf,
  heroLabel,
  heroValue,
  status,
  rows,
  primary,
  secondary = [],
}: CommandLaneProps) {
  const effectiveTone: LaneTone = state === 'ready' ? tone : 'neutral';
  const t = TONE[effectiveTone];
  const Icon = t.icon;
  const headingId = `${testId}-title`;
  const asOfText = state === 'ready' ? formatAsOf(asOf) : null;
  const allowedSecondary = secondary.filter((a) => a.allowed);

  // Six direct children, always, so the lg subgrid keeps header, hero, status,
  // queue and buttons on shared rows across all three lanes.
  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId}
      data-lane-state={state}
      data-tone={effectiveTone}
      className="col-span-12 flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm lg:col-span-4 lg:row-span-6 lg:grid lg:grid-rows-subgrid lg:gap-y-0"
    >
      <header className="flex items-start gap-3 lg:pb-4">
        <Icon className={cn('mt-0.5 h-6 w-6 shrink-0', t.text)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-base font-semibold leading-6">
            {title}
          </h2>
          <p className="text-xs leading-4 text-muted-foreground">
            <span data-testid={`${testId}-state`} className={cn('font-medium', t.text)}>
              {state === 'loading' ? 'Loading' : state === 'unavailable' ? 'Unavailable' : t.label}
            </span>
            {asOfText ? <span data-testid={`${testId}-asof`}>{` · as of ${asOfText}`}</span> : null}
          </p>
        </div>
      </header>

      <div data-testid={`${testId}-hero`} className="lg:pb-2">
        <p className="text-xs font-medium leading-4 text-muted-foreground">{heroLabel}</p>
        {state === 'loading' ? (
          <Skeleton className="mt-1 h-9 w-40" aria-label="Loading figure" />
        ) : (
          <p className="mt-1 break-words text-3xl font-semibold leading-9 tabular-nums">
            {state === 'ready' && heroValue !== null ? heroValue : <span className="text-muted-foreground">Unavailable</span>}
          </p>
        )}
      </div>

      <div data-testid={`${testId}-status`} className="text-xs leading-4 text-muted-foreground lg:pb-4">
        {state === 'loading' ? <Skeleton className="h-4 w-full" /> : state === 'unavailable' ? 'These figures could not be loaded.' : status}
      </div>

      <ul data-testid={`${testId}-queue`} className="divide-y border-y text-sm">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block">{row.label}</span>
              {row.hint && state === 'ready' ? <span className="block text-xs text-muted-foreground">{row.hint}</span> : null}
            </span>
            {state === 'loading' ? (
              <Skeleton className="h-5 w-12" />
            ) : state === 'ready' && row.value !== null ? (
              <span className="shrink-0 font-medium tabular-nums">{row.value}</span>
            ) : (
              <span className="shrink-0 text-muted-foreground">Unavailable</span>
            )}
          </li>
        ))}
      </ul>

      <div className="lg:pt-4">
        {primary.allowed ? (
          <Button asChild className="h-auto min-h-9 w-full whitespace-normal py-2 text-center">
            <Link href={primary.href}>{primary.label}</Link>
          </Button>
        ) : (
          <div>
            <Button disabled className="h-auto min-h-9 w-full whitespace-normal py-2 text-center">
              {primary.label}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">Your role cannot open this.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap content-start gap-2 lg:pt-3">
        {allowedSecondary.map((a) => (
          <Button key={a.href} asChild variant="ghost" size="sm" className="h-auto min-h-8 whitespace-normal px-2 py-1 text-xs">
            <Link href={a.href}>{a.label}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
