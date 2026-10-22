import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PERMISSIONS, extractRoleName } from '@/lib/auth/action-roles';
import { readTotpSecret } from '@/lib/auth/two-factor-secrets';
import { matchTotpStep } from '@/lib/auth/totp';
import { recordAudit, type AuditEntry } from '@/lib/audit/recorder';
import { sendEmail } from '@/lib/email/send-email';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';
import { maskPhone } from '@/lib/utils';
import { createSupabaseOwesRepository, runAdminOwesLookup, toOwesParams, type OwesRepository } from '@/lib/whatsapp/admin-owes';
import { formatDay, lagosMidnight, lagosParts } from '@/lib/whatsapp/assistant-format';
import { WhatsAppAdminAlertEmail, whatsAppAdminAlertSubject, type WhatsAppAdminAlertEvent } from '@/emails/whatsapp-admin-alert';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import { debtReportAction } from '@/lib/whatsapp/admin-debt-report';

/**
 * WhatsApp admin mode (#972): the security layer every admin action on WhatsApp goes through.
 *
 * WhatsApp gives only the sender's number, so the number is never trusted alone. An admin pins
 * their number with a one-time code issued from their 2FA dashboard session (`ADMIN LINK <code>`),
 * and approves actions with a single-use authenticator code (`ADMIN <code>`). One approval opens a
 * 15-minute session for lookups; an action marked `freshCode` needs a new code every time.
 * Every command re-checks the binding against the live account, so a role change, a disabled
 * account or a new or removed authenticator ends it.
 */

/** Roles the owner allows on WhatsApp (#972 D3); the role must also hold whatsapp_admin.query. */
export const WHATSAPP_ADMIN_ROLES = ['super_admin', 'chairman', 'financial_officer'];
export const ADMIN_LINK_CODE_TTL_MINUTES = 10;
export const ADMIN_SESSION_MINUTES = 15;
export const ADMIN_REQUEST_TTL_MINUTES = 5;
export const ADMIN_REVERIFY_DAYS = 90;
export const ADMIN_IDLE_DAYS = 30;
export const ADMIN_DAILY_ACTION_CAP = 50;
export const ADMIN_MAX_WRONG_CODES = 5;
export const ADMIN_LOCK_MINUTES = 30;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export interface WhatsAppAdminAccount {
  profileId: string;
  fullName: string;
  email: string | null;
  approvalStatus: string | null;
  roleId: string | null;
  roleName: string | null;
  roleDisplayName: string | null;
  permissions: string[];
  /** The decrypted base32 secret when authenticator 2FA is on and readable, else null. */
  totpSecret: string | null;
}

export interface WhatsAppAdminBinding {
  id: string;
  profileId: string;
  phoneNumber: string;
  boundAt: string;
  lastUsedAt: string | null;
  lastTotpStep: number | null;
  sessionExpiresAt: string | null;
  accountFingerprint: string;
}

export type WhatsAppAdminIneligibility = 'account_inactive' | 'role_not_allowed' | 'missing_permission' | 'authenticator_off';
export type WhatsAppAdminEndReason = WhatsAppAdminIneligibility | 'account_changed' | 'reverify_due' | 'idle';

/** Why this account may not use WhatsApp admin mode, or null when it may. */
export function adminIneligibility(account: WhatsAppAdminAccount | null): WhatsAppAdminIneligibility | null {
  if (!account || account.approvalStatus !== 'active') return 'account_inactive';
  if (!account.roleName || !WHATSAPP_ADMIN_ROLES.includes(account.roleName)) return 'role_not_allowed';
  if (!account.permissions.includes(PERMISSIONS.WHATSAPP_ADMIN_QUERY)) return 'missing_permission';
  if (!account.totpSecret) return 'authenticator_off';
  return null;
}

/** Ties a binding to the role and authenticator secret it was made with. */
export function accountFingerprint(account: WhatsAppAdminAccount): string {
  return createHash('sha256')
    .update(['whatsapp-admin:v1', account.profileId, account.roleId ?? '', account.totpSecret ?? ''].join('|'))
    .digest('hex');
}

/** Why a binding must end now, or null while it is still good (#972 D5). */
export function bindingEndReason(
  binding: WhatsAppAdminBinding,
  account: WhatsAppAdminAccount | null,
  now: Date
): WhatsAppAdminEndReason | null {
  const ineligible = adminIneligibility(account);
  if (ineligible) return ineligible;
  if (accountFingerprint(account!) !== binding.accountFingerprint) return 'account_changed';
  if (now.getTime() >= Date.parse(binding.boundAt) + ADMIN_REVERIFY_DAYS * DAY) return 'reverify_due';
  if (now.getTime() >= Date.parse(binding.lastUsedAt ?? binding.boundAt) + ADMIN_IDLE_DAYS * DAY) return 'idle';
  return null;
}

export function hashAdminLinkCode(code: string): string {
  return createHash('sha256').update(`whatsapp-admin-link:${code.trim()}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Commands

export interface WhatsAppAdminActionContext {
  account: WhatsAppAdminAccount;
  binding: WhatsAppAdminBinding;
  now: Date;
  requestId: string;
  /** What the admin sent with the command, e.g. the house code or name. */
  params: Record<string, unknown>;
  audit(entry: AuditEntry): Promise<void>;
  owes: OwesRepository;
}

export interface WhatsAppAdminAction {
  /** The action's own permission (any one of them when a list), checked on top of whatsapp_admin.query. */
  permission: string | string[];
  /** True when every run needs a new authenticator code, even inside a session (a PDF, #972 D2). */
  freshCode: boolean;
  /**
   * Asks a question before the code step (#982). The reply is sent as is, the state is kept with the
   * request, and the admin's next plain reply goes to `choose`.
   */
  begin?(context: { account: WhatsAppAdminAccount; binding: WhatsAppAdminBinding; now: Date }): Promise<{ reply: string; state: Record<string, unknown> }>;
  /** Turns the admin's reply into the request params, or says why it was not understood. */
  choose?(text: string, state: Record<string, unknown>): { params: Record<string, unknown> } | { retry: string };
  /** A string is the reply; the object form also adds `audit` to the request's audit entry (scope, outcome). */
  run(context: WhatsAppAdminActionContext): Promise<string | { reply: string; audit: Record<string, unknown> }>;
}

/** Lagos `HH:MM on dd mmm yyyy`. */
function lagosTime(iso: string): string {
  const time = new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' });
  return `${time} on ${formatDay(iso)}`;
}

/** Only actions listed here run on WhatsApp; each real action is added by its own issue (#981, #982). */
export const WHATSAPP_ADMIN_ACTIONS: Record<string, WhatsAppAdminAction> = {
  status: {
    permission: PERMISSIONS.WHATSAPP_ADMIN_QUERY,
    freshCode: false,
    async run({ account, binding }) {
      return [
        'Admin status',
        `Name: ${account.fullName}`,
        `Role: ${account.roleDisplayName || account.roleName}`,
        `Session ends: ${binding.sessionExpiresAt ? lagosTime(binding.sessionExpiresAt) : 'no session'}`,
      ].join('\n');
    },
  },
  owes: {
    permission: [PERMISSIONS.BILLING_VIEW, PERMISSIONS.REPORTS_VIEW_FINANCIAL],
    freshCode: false,
    run({ account, binding, now, requestId, params, audit, owes }) {
      return runAdminOwesLookup({
        params: toOwesParams(params),
        repository: owes,
        requestId,
        adminProfileId: account.profileId,
        phoneNumber: binding.phoneNumber,
        bindingId: binding.id,
        now,
        audit,
      });
    },
  },
  debt: debtReportAction,
};

/** A request waiting for the admin's street choice is stored under this suffix (#982). */
export const ADMIN_CHOICE_SUFFIX = ':choose';

/** A plain reply that could answer a choice: `ALL` or street numbers such as `2,3`. */
export function looksLikeAdminChoice(text: string | null | undefined): boolean {
  return /^(all|\d{1,3}([\s,]+\d{1,3})*)$/i.test((text || '').trim());
}

export type WhatsAppAdminCommand =
  | { kind: 'help' }
  | { kind: 'link'; code: string }
  | { kind: 'code'; code: string }
  | { kind: 'action'; action: string; params?: Record<string, unknown> };

/**
 * Admin mode starts only on these exact forms (#972 D6). Anything else, even text starting with
 * "admin", stays with the resident assistant.
 */
export function parseWhatsAppAdminCommand(text: string | null | undefined): WhatsAppAdminCommand | null {
  const value = (text || '').trim();
  if (/^ADMIN(\s+HELP)?$/i.test(value)) return { kind: 'help' };
  const link = value.match(/^ADMIN\s+LINK\s+(\d{6})$/i);
  if (link) return { kind: 'link', code: link[1] };
  const code = value.match(/^ADMIN\s+(\d{6})$/i);
  if (code) return { kind: 'code', code: code[1] };
  // Lookup of a house by code or name (#981), and the number picked from its list.
  const owes = value.match(/^ADMIN\s+OWES\s+(\S.*)$/i);
  if (owes) return { kind: 'action', action: 'owes', params: { query: owes[1].trim() } };
  const pick = value.match(/^ADMIN\s+([1-5])$/i);
  if (pick) return { kind: 'action', action: 'owes', params: { pick: Number(pick[1]) } };
  const action = value.match(/^ADMIN\s+([A-Z]+)$/i);
  if (action && Object.hasOwn(WHATSAPP_ADMIN_ACTIONS, action[1].toLowerCase())) {
    return { kind: 'action', action: action[1].toLowerCase() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Repository

export interface WhatsAppAdminRequestInput {
  bindingId: string;
  profileId: string;
  action: string;
  params: Record<string, unknown>;
  status: 'pending' | 'done';
  expiresAt: string;
  providerMessageId: string;
}

export interface WhatsAppAdminRepository {
  getLockedUntil(phoneNumber: string): Promise<string | null>;
  /** Counts a wrong code for the number; at the limit it locks the number and returns the lock end. */
  recordWrongCode(phoneNumber: string, now: Date): Promise<{ lockedUntil: string | null }>;
  clearWrongCodes(phoneNumber: string): Promise<void>;
  /** An unused, unexpired link code: the binding row it belongs to. */
  findLinkCode(codeHash: string, now: Date): Promise<{ id: string; profileId: string } | null>;
  /** Ends the admin's and the number's other bindings, then pins the number. False if the code was used meanwhile. */
  activateBinding(bindingId: string, profileId: string, phoneNumber: string, fingerprint: string, now: Date): Promise<boolean>;
  findActiveBinding(phoneNumber: string): Promise<WhatsAppAdminBinding | null>;
  revokeBinding(bindingId: string, reason: string, now: Date): Promise<void>;
  loadAccount(profileId: string): Promise<WhatsAppAdminAccount | null>;
  /** Stores the accepted step and opens the session; false when this or a later step was already used. */
  acceptCode(bindingId: string, step: number, sessionExpiresAt: string, now: Date): Promise<boolean>;
  touchBinding(bindingId: string, now: Date): Promise<void>;
  /** Inserts a request; a new pending request supersedes any earlier pending one on the binding. */
  createRequest(input: WhatsAppAdminRequestInput): Promise<string>;
  /** Marks the newest live pending request done and returns it, at most once. A request still waiting for a choice is not taken. */
  takePendingRequest(bindingId: string, now: Date): Promise<{ id: string; action: string; params: Record<string, unknown> } | null>;
  /** The live request waiting for the admin's choice: its action and state. */
  findPendingChoice(bindingId: string, now: Date): Promise<{ action: string; state: Record<string, unknown> } | null>;
  countDoneSince(profileId: string, since: string): Promise<number>;
  audit(entry: AuditEntry, actorId: string | null): Promise<void>;
  emailAdmin(account: WhatsAppAdminAccount, event: WhatsAppAdminAlertEvent, phoneNumber: string): Promise<void>;
}

function db(): SupabaseClient {
  // The generated types do not know the #972 tables until that migration is applied.
  return createAdminClient() as unknown as SupabaseClient;
}

type BindingRow = {
  id: string;
  profile_id: string;
  phone_number: string;
  bound_at: string;
  last_used_at: string | null;
  last_totp_step: number | string | null;
  session_expires_at: string | null;
  account_fingerprint: string;
};

function toBinding(row: BindingRow): WhatsAppAdminBinding {
  return {
    id: row.id,
    profileId: row.profile_id,
    phoneNumber: row.phone_number,
    boundAt: row.bound_at,
    lastUsedAt: row.last_used_at,
    lastTotpStep: row.last_totp_step === null ? null : Number(row.last_totp_step),
    sessionExpiresAt: row.session_expires_at,
    accountFingerprint: row.account_fingerprint,
  };
}

/** The account as get_my_access() resolves it, read through the service role, plus its authenticator secret. */
export async function loadWhatsAppAdminAccount(profileId: string): Promise<WhatsAppAdminAccount | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, approval_status, role_id, two_factor_enabled, two_factor_method, two_factor_secret_encrypted, app_roles!profiles_role_id_fkey (name, display_name)')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const role = (Array.isArray(data.app_roles) ? data.app_roles[0] : data.app_roles) as { display_name?: string } | null;
  let permissions: string[] = [];
  if (data.role_id) {
    const { data: grants, error: grantError } = await supabase
      .from('role_permissions')
      .select('permission:app_permissions!inner(name, is_active)')
      .eq('role_id', data.role_id);
    if (grantError) throw grantError;
    permissions = (grants || []).flatMap((row) => {
      const joined = (Array.isArray(row.permission) ? row.permission[0] : row.permission) as { name?: string; is_active?: boolean } | null;
      return joined?.name && joined.is_active === true ? [joined.name] : [];
    });
  }

  let totpSecret: string | null = null;
  if (data.two_factor_enabled && data.two_factor_method === 'authenticator' && data.two_factor_secret_encrypted) {
    try {
      totpSecret = readTotpSecret(data.two_factor_secret_encrypted);
    } catch (decryptError) {
      // An unreadable secret is treated as no authenticator: admin mode refuses rather than guesses.
      console.error('[whatsapp-admin] Could not read the authenticator secret:', decryptError instanceof Error ? decryptError.message : decryptError);
    }
  }

  return {
    profileId: data.id,
    fullName: data.full_name,
    email: data.email,
    approvalStatus: data.approval_status,
    roleId: data.role_id,
    roleName: extractRoleName(data.app_roles),
    roleDisplayName: role?.display_name ?? null,
    permissions,
    totpSecret,
  };
}

const BINDING_COLUMNS = 'id, profile_id, phone_number, bound_at, last_used_at, last_totp_step, session_expires_at, account_fingerprint';

export function createSupabaseWhatsAppAdminRepository(): WhatsAppAdminRepository {
  return {
    async getLockedUntil(phoneNumber) {
      const { data, error } = await db()
        .from('whatsapp_admin_number_locks')
        .select('locked_until')
        .eq('phone_number', phoneNumber)
        .maybeSingle();
      if (error) throw error;
      return (data?.locked_until as string | null) ?? null;
    },

    async recordWrongCode(phoneNumber, now) {
      const { data, error } = await db().rpc('whatsapp_admin_record_wrong_code', {
        p_phone: phoneNumber,
        p_now: now.toISOString(),
      });
      if (error) throw error;
      return { lockedUntil: (data as string | null) ?? null };
    },

    async clearWrongCodes(phoneNumber) {
      const { error } = await db()
        .from('whatsapp_admin_number_locks')
        .update({ failed_attempts: 0, updated_at: new Date().toISOString() })
        .eq('phone_number', phoneNumber);
      if (error) throw error;
    },

    async findLinkCode(codeHash, now) {
      const { data, error } = await db()
        .from('whatsapp_admin_bindings')
        .select('id, profile_id')
        .eq('link_code_hash', codeHash)
        .is('bound_at', null)
        .is('revoked_at', null)
        .gt('link_code_expires_at', now.toISOString())
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, profileId: data.profile_id as string } : null;
    },

    async activateBinding(bindingId, profileId, phoneNumber, fingerprint, now) {
      const supabase = db();
      const at = now.toISOString();
      const ended = { revoked_at: at, revoked_reason: 'replaced', session_expires_at: null, updated_at: at };
      for (const [column, value] of [['profile_id', profileId], ['phone_number', phoneNumber]]) {
        const { error } = await supabase
          .from('whatsapp_admin_bindings')
          .update(ended)
          .eq(column, value)
          .is('revoked_at', null)
          .not('bound_at', 'is', null);
        if (error) throw error;
      }
      const { data, error } = await supabase
        .from('whatsapp_admin_bindings')
        .update({ phone_number: phoneNumber, bound_at: at, account_fingerprint: fingerprint, last_used_at: at, updated_at: at })
        .eq('id', bindingId)
        .is('bound_at', null)
        .is('revoked_at', null)
        .select('id');
      if (error) throw error;
      return (data || []).length === 1;
    },

    async findActiveBinding(phoneNumber) {
      const { data, error } = await db()
        .from('whatsapp_admin_bindings')
        .select(BINDING_COLUMNS)
        .eq('phone_number', phoneNumber)
        .is('revoked_at', null)
        .not('bound_at', 'is', null)
        .maybeSingle();
      if (error) throw error;
      return data ? toBinding(data as BindingRow) : null;
    },

    async revokeBinding(bindingId, reason, now) {
      const at = now.toISOString();
      const { error } = await db()
        .from('whatsapp_admin_bindings')
        .update({ revoked_at: at, revoked_reason: reason, session_expires_at: null, updated_at: at })
        .eq('id', bindingId)
        .is('revoked_at', null);
      if (error) throw error;
    },

    loadAccount: loadWhatsAppAdminAccount,

    async acceptCode(bindingId, step, sessionExpiresAt, now) {
      // Conditional on the stored step, so a code (or an older one) is accepted at most once.
      const { data, error } = await db()
        .from('whatsapp_admin_bindings')
        .update({ last_totp_step: step, session_expires_at: sessionExpiresAt, updated_at: now.toISOString() })
        .eq('id', bindingId)
        .is('revoked_at', null)
        .or(`last_totp_step.is.null,last_totp_step.lt.${step}`)
        .select('id');
      if (error) throw error;
      return (data || []).length === 1;
    },

    async touchBinding(bindingId, now) {
      const { error } = await db()
        .from('whatsapp_admin_bindings')
        .update({ last_used_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('id', bindingId);
      if (error) throw error;
    },

    async createRequest(input) {
      const supabase = db();
      if (input.status === 'pending') {
        const { error: supersedeError } = await supabase
          .from('whatsapp_admin_requests')
          .update({ status: 'expired', completed_at: new Date().toISOString() })
          .eq('binding_id', input.bindingId)
          .eq('status', 'pending');
        if (supersedeError) throw supersedeError;
      }
      const { data, error } = await supabase
        .from('whatsapp_admin_requests')
        .insert({
          binding_id: input.bindingId,
          profile_id: input.profileId,
          action: input.action,
          params: input.params,
          status: input.status,
          expires_at: input.expiresAt,
          provider_message_id: input.providerMessageId,
          completed_at: input.status === 'done' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async takePendingRequest(bindingId, now) {
      const supabase = db();
      const at = now.toISOString();
      const { data, error } = await supabase
        .from('whatsapp_admin_requests')
        .select('id, action, params')
        .eq('binding_id', bindingId)
        .eq('status', 'pending')
        .not('action', 'like', `%${ADMIN_CHOICE_SUFFIX}`)
        .gt('expires_at', at)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: taken, error: takeError } = await supabase
        .from('whatsapp_admin_requests')
        .update({ status: 'done', completed_at: at })
        .eq('id', data.id)
        .eq('status', 'pending')
        .select('id');
      if (takeError) throw takeError;
      return (taken || []).length === 1
        ? { id: data.id as string, action: data.action as string, params: (data.params as Record<string, unknown> | null) ?? {} }
        : null;
    },

    async findPendingChoice(bindingId, now) {
      const { data, error } = await db()
        .from('whatsapp_admin_requests')
        .select('action, params')
        .eq('binding_id', bindingId)
        .eq('status', 'pending')
        .like('action', `%${ADMIN_CHOICE_SUFFIX}`)
        .gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { action: (data.action as string).slice(0, -ADMIN_CHOICE_SUFFIX.length), state: (data.params as Record<string, unknown> | null) ?? {} }
        : null;
    },

    async countDoneSince(profileId, since) {
      const { count, error } = await db()
        .from('whatsapp_admin_requests')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('status', 'done')
        .gte('completed_at', since);
      if (error) throw error;
      return count || 0;
    },

    async audit(entry, actorId) {
      await recordAudit(entry, { userId: actorId });
    },

    async emailAdmin(account, event, phoneNumber) {
      const email = account.email?.trim();
      if (!email) return;
      const settings = await getRawSettingsAsService(['estate_name']);
      const estateName = settings.status === 'ok' && typeof settings.values.get('estate_name') === 'string'
        ? (settings.values.get('estate_name') as string)
        : 'Residio Estate';
      const result = await sendEmail({
        to: { email, name: account.fullName },
        subject: whatsAppAdminAlertSubject(event),
        react: WhatsAppAdminAlertEmail({
          firstName: account.fullName.split(' ')[0] || account.fullName,
          event,
          maskedNumber: maskPhone(phoneNumber),
          estateName,
          lockMinutes: ADMIN_LOCK_MINUTES,
        }),
        emailType: 'notification',
        metadata: { purpose: 'whatsapp_admin_alert', event },
      });
      if (!result.success) throw new Error(result.error || 'WhatsApp admin alert email failed');
    },
  };
}

// ---------------------------------------------------------------------------
// Handler

export const ADMIN_HELP_REPLY = [
  'Admin mode',
  'ADMIN LINK <code>: link this number with the code from the dashboard.',
  'ADMIN STATUS: show your admin status.',
  'ADMIN OWES <house code or name>: show what a house owes.',
  'ADMIN <6-digit code>: approve with your authenticator app code.',
].join('\n');
export const ADMIN_NOT_LINKED_REPLY = 'This number is not linked to an admin account. Link it from Settings > WhatsApp admin access in the dashboard.';
export const ADMIN_BAD_LINK_REPLY = 'That admin link code is invalid or expired. Create a new one in the dashboard.';
export const ADMIN_WRONG_CODE_REPLY = 'That code is wrong or already used. Wait for a new code in your authenticator app and try again.';
export const ADMIN_CAP_REPLY = `You have reached today's limit of ${ADMIN_DAILY_ACTION_CAP} admin requests on WhatsApp. It resets at midnight.`;
export const ADMIN_NOT_ALLOWED_REPLY = 'Your role does not allow that request on WhatsApp.';

const INELIGIBLE_REPLIES: Record<WhatsAppAdminEndReason, string> = {
  account_inactive: 'your admin account is not active',
  role_not_allowed: 'your role does not have WhatsApp admin access',
  missing_permission: 'your role does not have WhatsApp admin access',
  authenticator_off: 'authenticator app 2FA is not on for your account',
  account_changed: 'your role or authenticator app changed',
  reverify_due: `the link is ${ADMIN_REVERIFY_DAYS} days old`,
  idle: `it was not used for ${ADMIN_IDLE_DAYS} days`,
};

function lockedReply(lockedUntil: string): string {
  return `Admin mode is locked on this number after too many wrong codes. Try again after ${lagosTime(lockedUntil)}.`;
}

export interface WhatsAppAdminHandlerOptions {
  repository: WhatsAppAdminRepository;
  reply(body: string): Promise<void>;
  now?: () => Date;
  owesRepository?: OwesRepository;
}

export async function handleWhatsAppAdminMessage(
  message: WhatsAppInboundMessage,
  command: WhatsAppAdminCommand,
  options: WhatsAppAdminHandlerOptions
): Promise<void> {
  const { repository, reply } = options;
  const now = options.now?.() ?? new Date();
  const phoneNumber = normalizePhoneNumber(message.from);
  const masked = maskPhone(phoneNumber);

  const lockedUntil = await repository.getLockedUntil(phoneNumber);
  if (lockedUntil && Date.parse(lockedUntil) > now.getTime()) {
    await reply(lockedReply(lockedUntil));
    return;
  }

  /** Counts a wrong code; on the lock it audits and emails the admin, when one is known. */
  const wrongCode = async (account: WhatsAppAdminAccount | null, bindingId: string | null) => {
    const { lockedUntil: lockEnd } = await repository.recordWrongCode(phoneNumber, now);
    if (account && bindingId) {
      await repository.audit({
        action: 'REJECT',
        entityType: 'whatsapp_admin_bindings',
        entityId: bindingId,
        entityDisplay: `WhatsApp admin link for ${account.fullName}`,
        description: lockEnd ? 'Wrong WhatsApp admin code; admin mode locked on this number' : 'Wrong WhatsApp admin code',
        metadata: { phone_number: masked, locked_until: lockEnd },
      }, account.profileId);
    }
    if (!lockEnd) {
      await reply(command.kind === 'link' ? ADMIN_BAD_LINK_REPLY : ADMIN_WRONG_CODE_REPLY);
      return;
    }
    if (account) {
      try {
        await repository.emailAdmin(account, 'locked', phoneNumber);
      } catch (error) {
        // Best effort: the lock is already in place, and a throw would make the provider retry.
        console.error('[whatsapp-admin] Lock alert email failed:', error);
      }
    }
    await reply(lockedReply(lockEnd));
  };

  if (command.kind === 'link') {
    const code = await repository.findLinkCode(hashAdminLinkCode(command.code), now);
    if (!code) {
      await wrongCode(null, null);
      return;
    }
    const account = await repository.loadAccount(code.profileId);
    const ineligible = adminIneligibility(account);
    if (ineligible) {
      await repository.revokeBinding(code.id, ineligible, now);
      await reply(`This number was not linked: ${INELIGIBLE_REPLIES[ineligible]}.`);
      return;
    }
    if (!(await repository.activateBinding(code.id, code.profileId, phoneNumber, accountFingerprint(account!), now))) {
      await reply(ADMIN_BAD_LINK_REPLY);
      return;
    }
    await repository.clearWrongCodes(phoneNumber);
    await repository.audit({
      action: 'ACTIVATE',
      entityType: 'whatsapp_admin_bindings',
      entityId: code.id,
      entityDisplay: `WhatsApp admin link for ${account!.fullName}`,
      description: 'WhatsApp number linked to an admin account',
      newValues: { phone_number: masked, bound_at: now.toISOString() },
    }, account!.profileId);
    try {
      await repository.emailAdmin(account!, 'linked', phoneNumber);
    } catch (error) {
      console.error('[whatsapp-admin] Link alert email failed:', error);
    }
    await reply('This number is now linked to your admin account. Send ADMIN STATUS to test it.');
    return;
  }

  const binding = await repository.findActiveBinding(phoneNumber);
  if (!binding) {
    await reply(ADMIN_NOT_LINKED_REPLY);
    return;
  }

  const account = await repository.loadAccount(binding.profileId);
  const ended = bindingEndReason(binding, account, now);
  if (ended) {
    await repository.revokeBinding(binding.id, ended, now);
    await repository.audit({
      action: 'DEACTIVATE',
      entityType: 'whatsapp_admin_bindings',
      entityId: binding.id,
      entityDisplay: `WhatsApp admin link for ${account?.fullName ?? 'an admin'}`,
      description: `WhatsApp admin link ended: ${ended}`,
      metadata: { phone_number: masked, reason: ended },
    }, account?.profileId ?? null);
    await reply(`Admin access for this number has ended: ${INELIGIBLE_REPLIES[ended]}. Link it again from the dashboard.`);
    return;
  }
  const admin = account!;

  const run = async (actionName: string, live: WhatsAppAdminBinding, requestId: string, params: Record<string, unknown>) => {
    const action = WHATSAPP_ADMIN_ACTIONS[actionName];
    // The role may have changed between the request and its code.
    if (![action.permission].flat().some((permission) => admin.permissions.includes(permission))) {
      await reply(ADMIN_NOT_ALLOWED_REPLY);
      return;
    }
    const result = await action.run({
      account: admin,
      binding: live,
      now,
      requestId,
      params,
      audit: (entry) => repository.audit(entry, admin.profileId),
      owes: options.owesRepository ?? createSupabaseOwesRepository(),
    });
    const answer = typeof result === 'string' ? result : result.reply;
    await repository.touchBinding(live.id, now);
    await repository.audit({
      action: 'VERIFY',
      entityType: 'whatsapp_admin_requests',
      entityId: requestId,
      entityDisplay: `WhatsApp admin ${actionName} for ${admin.fullName}`,
      description: `Admin action "${actionName}" answered on WhatsApp`,
      metadata: { action: actionName, phone_number: masked, ...(typeof result === 'string' ? {} : result.audit) },
    }, admin.profileId);
    await reply(answer);
  };

  const { year, month, day } = lagosParts(now);
  const overCap = async () =>
    (await repository.countDoneSince(admin.profileId, lagosMidnight(year, month, day).toISOString())) >= ADMIN_DAILY_ACTION_CAP;

  if (command.kind === 'help') {
    await reply(ADMIN_HELP_REPLY);
    return;
  }

  if (command.kind === 'code') {
    const step = matchTotpStep(command.code, admin.totpSecret!, now.getTime());
    const sessionExpiresAt = new Date(now.getTime() + ADMIN_SESSION_MINUTES * MINUTE).toISOString();
    if (
      step === null ||
      (binding.lastTotpStep !== null && step <= binding.lastTotpStep) ||
      !(await repository.acceptCode(binding.id, step, sessionExpiresAt, now))
    ) {
      await wrongCode(admin, binding.id);
      return;
    }
    await repository.clearWrongCodes(phoneNumber);
    await repository.audit({
      action: 'APPROVE',
      entityType: 'whatsapp_admin_bindings',
      entityId: binding.id,
      entityDisplay: `WhatsApp admin link for ${admin.fullName}`,
      description: `WhatsApp admin session opened for ${ADMIN_SESSION_MINUTES} minutes`,
      metadata: { phone_number: masked, session_expires_at: sessionExpiresAt },
    }, admin.profileId);
    const live = { ...binding, lastTotpStep: step, sessionExpiresAt };

    // The cap is checked before the pending request is used, so a capped request is not spent.
    if (await overCap()) {
      await reply(ADMIN_CAP_REPLY);
      return;
    }
    const pending = await repository.takePendingRequest(binding.id, now);
    if (pending && Object.hasOwn(WHATSAPP_ADMIN_ACTIONS, pending.action)) {
      await run(pending.action, live, pending.id, pending.params);
      return;
    }
    await repository.touchBinding(binding.id, now);
    await reply(`Approved. Your admin session ends at ${lagosTime(sessionExpiresAt)}.`);
    return;
  }

  const action = WHATSAPP_ADMIN_ACTIONS[command.action];
  if (![action.permission].flat().some((permission) => admin.permissions.includes(permission))) {
    await reply(ADMIN_NOT_ALLOWED_REPLY);
    return;
  }
  if (await overCap()) {
    await reply(ADMIN_CAP_REPLY);
    return;
  }

  if (action.begin) {
    const started = await action.begin({ account: admin, binding, now });
    await repository.createRequest({
      bindingId: binding.id,
      profileId: admin.profileId,
      action: `${command.action}${ADMIN_CHOICE_SUFFIX}`,
      params: started.state,
      status: 'pending',
      expiresAt: new Date(now.getTime() + ADMIN_REQUEST_TTL_MINUTES * MINUTE).toISOString(),
      providerMessageId: message.id,
    });
    await reply(started.reply);
    return;
  }

  const sessionLive = binding.sessionExpiresAt !== null && Date.parse(binding.sessionExpiresAt) > now.getTime();
  if (!sessionLive || action.freshCode) {
    await repository.createRequest({
      bindingId: binding.id,
      profileId: admin.profileId,
      action: command.action,
      params: command.params ?? {},
      status: 'pending',
      expiresAt: new Date(now.getTime() + ADMIN_REQUEST_TTL_MINUTES * MINUTE).toISOString(),
      providerMessageId: message.id,
    });
    await reply(`To approve, send ADMIN followed by the 6-digit code from your authenticator app within ${ADMIN_REQUEST_TTL_MINUTES} minutes.`);
    return;
  }

  const requestId = await repository.createRequest({
    bindingId: binding.id,
    profileId: admin.profileId,
    action: command.action,
    params: command.params ?? {},
    status: 'done',
    expiresAt: binding.sessionExpiresAt!,
    providerMessageId: message.id,
  });
  await run(command.action, binding, requestId, command.params ?? {});
}

/**
 * A plain reply (`ALL`, `2,3`) to a question an admin action asked (#982). Returns false when this
 * number is not an admin number with a question waiting, so the message stays with the resident
 * assistant. A reply that is not understood keeps the question open.
 */
export async function handleWhatsAppAdminChoice(
  message: WhatsAppInboundMessage,
  options: WhatsAppAdminHandlerOptions
): Promise<boolean> {
  const { repository, reply } = options;
  const now = options.now?.() ?? new Date();
  const binding = await repository.findActiveBinding(normalizePhoneNumber(message.from));
  if (!binding) return false;
  const waiting = await repository.findPendingChoice(binding.id, now);
  if (!waiting || !Object.hasOwn(WHATSAPP_ADMIN_ACTIONS, waiting.action)) return false;
  const action = WHATSAPP_ADMIN_ACTIONS[waiting.action];
  const account = await repository.loadAccount(binding.profileId);
  // A binding that must end is ended by the admin's next ADMIN command, not here.
  if (!account || bindingEndReason(binding, account, now) || !action.choose) return false;

  const chosen = action.choose(message.text?.trim() || '', waiting.state);
  if ('retry' in chosen) {
    await reply(chosen.retry);
    return true;
  }
  await repository.createRequest({
    bindingId: binding.id,
    profileId: account.profileId,
    action: waiting.action,
    params: chosen.params,
    status: 'pending',
    expiresAt: new Date(now.getTime() + ADMIN_REQUEST_TTL_MINUTES * MINUTE).toISOString(),
    providerMessageId: message.id,
  });
  await reply(`To approve, send ADMIN followed by the 6-digit code from your authenticator app within ${ADMIN_REQUEST_TTL_MINUTES} minutes.`);
  return true;
}
