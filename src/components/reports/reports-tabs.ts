/** The tabs of the reports page; the `?tab=` address value is the tab's own value (#1373). */
export const REPORTS_TABS = ['new', 'recent', 'schedules', 'archive', 'wallet-check'] as const;
export type ReportsTab = (typeof REPORTS_TABS)[number];

/** A missing or unknown `?tab=` opens New report. */
export function parseReportsTab(value: string | null | undefined): ReportsTab {
  return REPORTS_TABS.find((tab) => tab === value) ?? 'new';
}
