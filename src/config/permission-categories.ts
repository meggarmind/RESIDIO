/**
 * Display metadata for `app_permissions.category`.
 *
 * Kept deliberately thin — labels and a preferred order, nothing else. The set
 * of categories that actually renders is derived at runtime from the
 * permissions the server returns, so a category added by a migration shows up
 * on its own. These maps only decide what it is *called* and where it *sits*.
 *
 * That inversion is the point. The previous hardcoded list in
 * `role-permissions-dialog.tsx` was the render source, so the three categories
 * missing from it (`notes`, `email_imports`, `personnel`) were invisible in the
 * picker and could not be granted to a new role at all.
 */

/** Categories merged into another for display. `imports` reads as part of Payments. */
export const PERMISSION_CATEGORY_ALIASES: Record<string, string> = {
  imports: 'payments',
};

/** Resolve a raw category to the one it renders under. */
export function resolvePermissionCategory(category: string): string {
  return PERMISSION_CATEGORY_ALIASES[category] ?? category;
}

export const PERMISSION_CATEGORY_LABELS: Record<string, string> = {
  residents: 'Residents',
  houses: 'Houses',
  projects: 'Capital Projects',
  finance: 'Finance & Expenditure',
  payments: 'Payments & Imports',
  imports: 'Payments & Imports',
  billing: 'Billing',
  security: 'Security',
  personnel: 'Personnel & Vendors',
  documents: 'Documents',
  notes: 'Notes',
  announcements: 'Announcements',
  notifications: 'Notifications',
  report_subscriptions: 'Report Subscriptions',
  email_imports: 'Email Imports',
  reports: 'Reports',
  approvals: 'Approvals',
  impersonation: 'Impersonation',
  two_factor: 'Two-Factor Authentication',
  settings: 'Settings',
  system: 'System',
};

/**
 * Preferred display order. Categories absent from this list still render — they
 * are appended alphabetically after the known ones.
 */
export const PERMISSION_CATEGORY_ORDER: string[] = [
  'residents',
  'houses',
  'projects',
  'finance',
  'payments',
  'billing',
  'security',
  'personnel',
  'documents',
  'notes',
  'announcements',
  'notifications',
  'report_subscriptions',
  'email_imports',
  'reports',
  'approvals',
  'impersonation',
  'two_factor',
  'settings',
  'system',
];

/** Title-cased fallback for a category nobody has labelled yet: `email_imports` -> `Email Imports`. */
export function permissionCategoryLabel(category: string): string {
  return (
    PERMISSION_CATEGORY_LABELS[category] ??
    category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/**
 * Order a set of categories for display: known ones in
 * `PERMISSION_CATEGORY_ORDER`, then anything else alphabetically.
 */
export function sortPermissionCategories(categories: Iterable<string>): string[] {
  return [...new Set(categories)].sort((a, b) => {
    const ia = PERMISSION_CATEGORY_ORDER.indexOf(a);
    const ib = PERMISSION_CATEGORY_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}
