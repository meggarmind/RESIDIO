import { createAdminClient } from '@/lib/supabase/server';
import type { AuditAction, AuditEntityType, AuditLogInsert } from '@/types/database';
import { getChangedValues } from './helpers';

/**
 * The audit recorder: builds an Audit Entry from the actor, the entity type and the old and new
 * rows. It owns the diff, the entity display name and the failure policy (it never throws).
 *
 * This is deliberately NOT a 'use server' module. `logAudit` (logger.ts) is the thin delegate
 * existing callers use; new code can call `recordAudit` with an actor it already holds.
 */

/** Structurally satisfied by the Access result and by the authorize result. */
export interface AuditActor {
  userId: string | null;
}

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityDisplay?: string;
  /** Row before the change. With `newRow`, the diff is computed; alone, it is stored whole. */
  oldRow?: Record<string, unknown> | null;
  /** Row after the change. With `oldRow`, the diff is computed; alone, it is stored whole. */
  newRow?: Record<string, unknown> | null;
  /** Used as-is when given (legacy `logAudit` callers); wins over anything derived from rows. */
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditSink {
  insert(row: AuditLogInsert): Promise<{ error: { message: string } | null }>;
}

/** The real sink: the admin client writing into `audit_logs`. */
export function createAuditSink(): AuditSink {
  return {
    async insert(row) {
      // Admin client so the insert succeeds regardless of the actor's RLS context.
      const { error } = await createAdminClient().from('audit_logs').insert(row);
      return { error: error ? { message: error.message } : null };
    },
  };
}

const DEFAULT_DISPLAY_FIELDS = ['name', 'title', 'display_name'] as const;

/**
 * Candidate fields per entity type; the first non-empty string wins. A nested array means
 * "join these fields with a space". Exhaustive: adding an `AuditEntityType` member is a
 * TypeScript error until it has an entry here.
 */
export const ENTITY_DISPLAY_FIELDS: Record<AuditEntityType, readonly (string | readonly string[])[]> = {
  residents: [['first_name', 'last_name']],
  houses: ['house_number', 'short_name'],
  resident_houses: DEFAULT_DISPLAY_FIELDS,
  invoices: ['invoice_number'],
  payments: ['reference_number'],
  billing_profiles: ['name'],
  billing_profile_versions: DEFAULT_DISPLAY_FIELDS,
  wallets: DEFAULT_DISPLAY_FIELDS,
  wallet_payment_batches: DEFAULT_DISPLAY_FIELDS,
  approval_requests: ['request_type'],
  streets: ['name'],
  house_types: ['name'],
  security_contacts: ['full_name'],
  security_contact_categories: ['name'],
  access_codes: ['code'],
  access_logs: DEFAULT_DISPLAY_FIELDS,
  profiles: ['full_name', 'email'],
  system_settings: ['key', 'name'],
  bank_statement_imports: ['file_name'],
  resident_payment_aliases: ['alias_name'],
  estate_bank_accounts: [['bank_name', 'account_number']],
  transaction_tags: ['name'],
  app_roles: ['display_name', 'name'],
  app_permissions: DEFAULT_DISPLAY_FIELDS,
  role_permissions: DEFAULT_DISPLAY_FIELDS,
  role_assignment_rules: DEFAULT_DISPLAY_FIELDS,
  notification_templates: ['display_name', 'name'],
  notification_schedules: ['name'],
  notification_queue: DEFAULT_DISPLAY_FIELDS,
  notification_history: DEFAULT_DISPLAY_FIELDS,
  notification_preferences: DEFAULT_DISPLAY_FIELDS,
  escalation_states: DEFAULT_DISPLAY_FIELDS,
  invoice_generation_log: DEFAULT_DISPLAY_FIELDS,
  invoice_generation_run: DEFAULT_DISPLAY_FIELDS,
  report_archive: ['report_type'],
  verification_tokens: DEFAULT_DISPLAY_FIELDS,
  announcements: ['title'],
  announcement_categories: ['name'],
  announcement_read_receipts: DEFAULT_DISPLAY_FIELDS,
  in_app_notifications: ['title'],
  message_templates: ['name'],
  report_subscriptions: DEFAULT_DISPLAY_FIELDS,
  impersonation_sessions: DEFAULT_DISPLAY_FIELDS,
  documents: ['title'],
  document_categories: ['name'],
  document_tags: ['name'],
  document_tag_assignments: DEFAULT_DISPLAY_FIELDS,
  document_custom_fields: ['name'],
  document_custom_field_values: DEFAULT_DISPLAY_FIELDS,
  entity_notes: ['title'],
  gmail_oauth_credentials: ['email_address'],
  email_imports: DEFAULT_DISPLAY_FIELDS,
  email_messages: DEFAULT_DISPLAY_FIELDS,
  email_transactions: ['description'],
  estate_bank_account_passwords: DEFAULT_DISPLAY_FIELDS,
  clearance_certificate: ['certificate_number'],
  late_fee_waivers: DEFAULT_DISPLAY_FIELDS,
  late_fee_log: DEFAULT_DISPLAY_FIELDS,
  paystack_transactions: DEFAULT_DISPLAY_FIELDS,
  two_factor_tokens: DEFAULT_DISPLAY_FIELDS,
  two_factor_backup_codes: DEFAULT_DISPLAY_FIELDS,
  two_factor_policies: DEFAULT_DISPLAY_FIELDS,
  two_factor_audit_log: DEFAULT_DISPLAY_FIELDS,
  whatsapp_optins: DEFAULT_DISPLAY_FIELDS,
  whatsapp_pending_contacts: DEFAULT_DISPLAY_FIELDS,
  whatsapp_link_tokens: DEFAULT_DISPLAY_FIELDS,
  whatsapp_sessions: DEFAULT_DISPLAY_FIELDS,
  whatsapp_provider_credentials: DEFAULT_DISPLAY_FIELDS,
  visitor_vehicles: ['plate_number'],
  expenses: ['description'],
  payment_records: ['reference'],
  petty_cash_accounts: ['name'],
  vendors: ['name'],
  personnel_engagements: DEFAULT_DISPLAY_FIELDS,
  projects: ['name'],
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Resolve the display name of an entity from its row, or undefined when nothing resolves. */
export function resolveEntityDisplay(
  entityType: AuditEntityType,
  row: Record<string, unknown> | null | undefined
): string | undefined {
  if (!row) return undefined;
  for (const candidate of ENTITY_DISPLAY_FIELDS[entityType]) {
    if (typeof candidate === 'string') {
      const value = nonEmptyString(row[candidate]);
      if (value) return value;
    } else {
      const parts = candidate
        .map((field) => nonEmptyString(row[field]))
        .filter((part): part is string => part !== null);
      if (parts.length > 0) return parts.join(' ');
    }
  }
  return undefined;
}

function buildRow(entry: AuditEntry, actorId: string): AuditLogInsert {
  let oldValues = entry.oldValues;
  let newValues = entry.newValues;

  if (oldValues === undefined || newValues === undefined) {
    const { oldRow, newRow } = entry;
    if (oldRow && newRow) {
      const changes = getChangedValues(oldRow, newRow);
      oldValues ??= changes.old;
      newValues ??= changes.new;
    } else {
      if (oldRow) oldValues ??= oldRow;
      if (newRow) newValues ??= newRow;
    }
  }

  const entityDisplay =
    entry.entityDisplay || resolveEntityDisplay(entry.entityType, entry.newRow ?? entry.oldRow);

  return {
    actor_id: actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_display: entityDisplay || null,
    old_values: (oldValues || null) as AuditLogInsert['old_values'],
    new_values: (newValues || null) as AuditLogInsert['new_values'],
    description: entry.description || null,
    metadata: (entry.metadata || null) as AuditLogInsert['metadata'],
    ip_address: null, // Could be populated from request headers in future
    user_agent: null, // Could be populated from request headers in future
  };
}

/**
 * Record an Audit Entry. Never throws: audit failures must not break the operation being audited.
 * The actor comes from the caller; this function does not resolve a session itself.
 */
export async function recordAudit(
  entry: AuditEntry,
  actor: AuditActor,
  sink?: AuditSink
): Promise<{ recorded: boolean }> {
  try {
    if (!actor.userId) {
      console.error('[Audit] Cannot log audit: No authenticated user');
      return { recorded: false };
    }

    const row = buildRow(entry, actor.userId);
    const { error } = await (sink ?? createAuditSink()).insert(row);

    if (error) {
      console.error('[Audit] Failed to log audit event:', {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        error: error.message,
      });
      return { recorded: false };
    }
    return { recorded: true };
  } catch (error) {
    console.error('[Audit] Unexpected error:', {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      error,
    });
    return { recorded: false };
  }
}
