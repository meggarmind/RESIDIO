export type ResidentDetailTab = 'overview' | 'money' | 'security' | 'notes';

// Tabs merged or removed in #783; old `?tab=` links land on their new home.
const LEGACY_TABS: Record<string, ResidentDetailTab> = {
  transactions: 'money',
  payments: 'money',
  aliases: 'money',
  emergency: 'overview',
  notifications: 'overview',
};

/** The tab to show for a `?tab=` value; unknown or unpermitted values fall back to Overview. */
export function resolveResidentTab(tabParam: string | null, canViewNotes: boolean): ResidentDetailTab {
  const tab = tabParam ? LEGACY_TABS[tabParam] ?? tabParam : 'overview';
  if (tab === 'money' || tab === 'security') return tab;
  if (tab === 'notes' && canViewNotes) return 'notes';
  return 'overview';
}

/**
 * True when a resident load failed because the row does not exist (or is not visible):
 * PostgREST `.single()` with no row, or an id that is not a UUID. Anything else is a
 * real failure (network, server) and must not be reported as "not found".
 */
export function isResidentNotFoundError(message: string | undefined): boolean {
  return !!message && /(0|no\)) rows|invalid input syntax for type uuid/i.test(message);
}
