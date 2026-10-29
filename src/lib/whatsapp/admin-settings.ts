import { PERMISSIONS } from '@/lib/auth/action-roles';

/** The Admin tools menu items an owner can grant per role (#1295). `whatsapp_admin.query` is the base, not an item. */
export const WHATSAPP_ADMIN_ITEMS = [
  { permission: PERMISSIONS.WHATSAPP_ADMIN_RESIDENT_STATUS, label: 'Resident status' },
  { permission: PERMISSIONS.WHATSAPP_ADMIN_DEBT_REPORT, label: 'Security debt status' },
  { permission: PERMISSIONS.WHATSAPP_ADMIN_COLLECTIONS, label: "Today's collections" },
  { permission: PERMISSIONS.WHATSAPP_ADMIN_CLEARANCE_QUEUE, label: 'Clearance requests' },
  { permission: PERMISSIONS.WHATSAPP_ADMIN_APPROVE_PAYMENT, label: 'Approve payment report' },
] as const;

export const WHATSAPP_ADMIN_ITEM_PERMISSIONS: string[] = WHATSAPP_ADMIN_ITEMS.map((item) => item.permission);

export type WhatsAppAdminRowStatus = 'active' | 'ending';

export interface WhatsAppAdminRow {
  bindingId: string;
  profileId: string;
  name: string;
  roleName: string;
  maskedNumber: string;
  boundAt: string;
  /** When the link ends at the latest: 90 days after linking, or 30 days without use. */
  endsAt: string;
  lastUsedAt: string | null;
  codeRequired: boolean;
  /** `ending` when the link no longer works (role, account or authenticator changed, or it timed out). */
  status: WhatsAppAdminRowStatus;
}

export type WhatsAppAdminFilter = 'all' | 'code_off' | 'ending';

export function filterWhatsAppAdminRows(rows: WhatsAppAdminRow[], search: string, filter: WhatsAppAdminFilter): WhatsAppAdminRow[] {
  const term = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === 'code_off' && row.codeRequired) return false;
    if (filter === 'ending' && row.status !== 'ending') return false;
    return !term || `${row.name} ${row.roleName} ${row.maskedNumber}`.toLowerCase().includes(term);
  });
}

export interface WhatsAppAdminCandidate {
  profileId: string;
  name: string;
  roleName: string;
}

export interface WhatsAppAdminRoleGridRole {
  roleId: string;
  name: string;
  /** Item permissions this role holds. */
  granted: string[];
}

export interface WhatsAppAdminSettingsState {
  /** Holds the roles-management permission: sees every admin and edits links, switches and the grid. */
  canManage: boolean;
  viewerProfileId: string;
  globalCodeRequired: boolean;
  rows: WhatsAppAdminRow[];
  /** Admin accounts with no active link; empty unless `canManage`. */
  candidates: WhatsAppAdminCandidate[];
  roles: WhatsAppAdminRoleGridRole[];
}
