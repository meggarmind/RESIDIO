/**
 * One source for dashboard status colours (#758). Green is `chart-1`, amber is
 * `chart-3`, red is `destructive`. The `status-*` tokens are not used: they
 * resolve to gold, orange and red with the subtle variant equal to the base.
 *
 * Contrast against the card (WCAG, measured from the OKLCH values):
 * - text: light 70% mix with black, 6.2 to 9.8:1. dark green/amber as is, 4.9 to 6.2:1.
 *   dark red is lifted 20% toward white, 4.8:1 on the lightest dark card.
 * - border: light 80% mix with black, 4.6 to 7.8:1. dark as is, 3.3 to 6.2:1 (non-text, 3:1 needed).
 */
export type StatusState = 'ok' | 'attention' | 'overdue' | 'neutral';

export const STATUS_COLORS: Record<StatusState, { text: string; border: string }> = {
  ok: {
    text: 'text-[color-mix(in_oklch,var(--chart-1)_70%,black)] dark:text-chart-1',
    border: 'border-[color-mix(in_oklch,var(--chart-1)_80%,black)] dark:border-chart-1',
  },
  attention: {
    text: 'text-[color-mix(in_oklch,var(--chart-3)_70%,black)] dark:text-chart-3',
    border: 'border-[color-mix(in_oklch,var(--chart-3)_80%,black)] dark:border-chart-3',
  },
  overdue: {
    text: 'text-[color-mix(in_oklch,var(--destructive)_70%,black)] dark:text-[color-mix(in_oklch,var(--destructive)_80%,white)]',
    border: 'border-[color-mix(in_oklch,var(--destructive)_80%,black)] dark:border-destructive',
  },
  neutral: {
    text: 'text-muted-foreground',
    border: 'border-border',
  },
};
