import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';

/**
 * The command palette's static Quick Actions.
 *
 * Kept out of the component so the permission mapping below is importable by
 * `quick-action-permissions.test.ts`. It is a hand-maintained table pointing at
 * routes whose guards live somewhere else entirely (`ROUTE_PERMISSIONS`), and
 * the settings sidebar has already drifted from that table once — hence the
 * structural test rather than trust.
 */
export interface QuickAction {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  type: 'action';
  /** Every permission the action needs, ALL required (`hasAllPermissions`).
   *
   * For a navigation action that is the permission gating its target route.
   * For an action that *writes*, it is that route permission AND the write
   * permission: `/residents/new` and `/houses/new` have no ROUTE_PERMISSIONS
   * entry of their own, so middleware admits them on the parent's `.view` —
   * a view-only role could open the form and only then be refused by the
   * server action. Listing both means the palette offers the action only to
   * someone who can both reach the page and complete it. */
  permissions: Permission[];
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'add-resident',
    title: 'Add New Resident',
    subtitle: 'Register a new resident to a property',
    href: '/residents/new',
    type: 'action',
    permissions: [PERMISSIONS.RESIDENTS_VIEW, PERMISSIONS.RESIDENTS_CREATE],
  },
  {
    id: 'create-invoice',
    title: 'Create Invoice',
    subtitle: 'Generate a new invoice for a resident',
    href: '/billing',
    type: 'action',
    permissions: [PERMISSIONS.BILLING_VIEW],
  },
  {
    id: 'add-house',
    title: 'Add House',
    subtitle: 'Add a new property to the estate',
    href: '/houses/new', // Assumes this route exists or modal trigger
    type: 'action',
    permissions: [PERMISSIONS.HOUSES_VIEW, PERMISSIONS.HOUSES_CREATE],
  },
  {
    id: 'security-log',
    // The page on disk is /security/logs; this pointed at the singular and so
    // dropped the user on a 404 every time.
    title: 'View Security Log',
    subtitle: 'Check recent security activity',
    href: '/security/logs',
    type: 'action',
    permissions: [PERMISSIONS.SECURITY_VIEW],
  },
];
