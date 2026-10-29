import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PERMISSIONS, extractRoleName } from '@/lib/auth/action-roles';
import { readTotpSecret } from '@/lib/auth/two-factor-secrets';
import { matchTotpStep } from '@/lib/auth/totp';
import { recordAudit, type AuditEntry } from '@/lib/audit/recorder';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { getSettingResultAsService } from '@/lib/settings/service';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';
import { maskPhone } from '@/lib/utils';
import { OWES_PROMPT, createSupabaseOwesRepository, runAdminOwesLookup, toOwesParams, type OwesRepository } from '@/lib/whatsapp/admin-owes';
import { isOnRoster } from '@/lib/whatsapp/co-resident';
import { formatDay, lagosMidnight, lagosParts } from '@/lib/whatsapp/assistant-format';
import { WhatsAppAdminAlertEmail, whatsAppAdminAlertSubject, type WhatsAppAdminAlertEvent } from '@/emails/whatsapp-admin-alert';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import { debtReportAction } from '@/lib/whatsapp/admin-debt-report';

/**
 * WhatsApp admin mode (#972): the security layer every admin action on WhatsApp goes through.
 *
 * WhatsApp gives only the sender's number, so the number is never trusted alone. An admin pins
 * their number with a one-time code issued from their 2FA dashboard session (`ADMIN LINK <code>`),
 * or it is linked on first use when it is the phone of the resident record tied to their profile
 * (#1292). Admin tools open from "6. Admin tools" on the main menu, or `ADMIN`. When a code is
 * needed, a single-use authenticator code opens a 15-minute session; an action marked `freshCode`
 * needs a new code every time. Every turn re-checks the binding against the live account, so a role
 * change, a disabled account or a new or removed authenticator ends it.
 */

/** Role categories that may use admin tools (#1290 decision 4): every staff role, never a resident role. */
export const WHATSAPP_ADMIN_ROLE_CATEGORIES = ['exco', 'bot', 'staff'];
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
  /** app_roles.category: exco, bot, staff or resident. */
  roleCategory: string | null;
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
  /** The admin's own "Code required" switch (#1292); a code is needed only when this and the global switch are on. */
  codeRequired: boolean;
}

export type WhatsAppAdminIneligibility = 'account_inactive' | 'role_not_allowed' | 'missing_permission' | 'authenticator_off';
export type WhatsAppAdminEndReason = WhatsAppAdminIneligibility | 'account_changed' | 'reverify_due' | 'idle';

/**
 * Why this account may not use WhatsApp admin mode, or null when it may. The authenticator is
 * required only when a code is needed for this admin (#1292).
 */
export function adminIneligibility(account: WhatsAppAdminAccount | null, codeNeeded = true): WhatsAppAdminIneligibility | null {
  if (!account || account.approvalStatus !== 'active') return 'account_inactive';
  if (!account.roleName || !WHATSAPP_ADMIN_ROLE_CATEGORIES.includes(account.roleCategory ?? '')) return 'role_not_allowed';
  if (!account.permissions.includes(PERMISSIONS.WHATSAPP_ADMIN_QUERY)) return 'missing_permission';
  if (codeNeeded && !account.totpSecret) return 'authenticator_off';
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
  now: Date,
  codeNeeded = true
): WhatsAppAdminEndReason | null {
  const ineligible = adminIneligibility(account, codeNeeded);
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
  /** The Admin tools menu line (#1292). */
  label: string;
  /** The action's own permission (any one of them when a list), checked on top of whatsapp_admin.query. */
  permission: string | string[];
  /** True when every run needs a new authenticator code, even inside a session (a PDF, #972 D2). */
  freshCode: boolean;
  /**
   * Asks a question before the code step (#982). The reply is sent as is, the state is kept with the
   * request, and the admin's next plain reply goes to `choose`. No state means there is nothing to choose.
   */
  begin?(context: { account: WhatsAppAdminAccount; binding: WhatsAppAdminBinding; now: Date }): Promise<{ reply: string; state?: Record<string, unknown> }>;
  /** Turns the admin's reply into the request params, or says why it was not understood. */
  choose?(text: string, state: Record<string, unknown>): { params: Record<string, unknown> } | { retry: string };
  /** A string is the reply; the object form also adds `audit` to the request's audit entry (scope, outcome). */
  run(context: WhatsAppAdminActionContext): Promise<string | { reply: string; audit: Record<string, unknown> }>;
  /** Set when the item stays open after an answer for another entry: the line added under the answer. */
  again?: string;
}

/** Lagos `HH:MM`. */
function lagosClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' });
}

/** Lagos `HH:MM on dd mmm yyyy`. */
function lagosTime(iso: string): string {
  return `${lagosClock(iso)} on ${formatDay(iso)}`;
}

/** Only actions listed here run on WhatsApp; each real action is added by its own issue (#981, #982). */
export const WHATSAPP_ADMIN_ACTIONS: Record<string, WhatsAppAdminAction> = {
  owes: {
    label: 'Resident status',
    permission: PERMISSIONS.WHATSAPP_ADMIN_RESIDENT_STATUS,
    freshCode: false,
    async begin() {
      return { reply: OWES_PROMPT, state: {} };
    },
    choose(text) {
      return { params: /^[1-5]$/.test(text) ? { pick: Number(text) } : { query: text } };
    },
    again: 'Send another house code or name, or reply 0 for Admin tools.',
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

/** Admin tools menu numbers (#1292). A number whose item the role may not use reads as unrecognised. */
export const WHATSAPP_ADMIN_MENU: Record<string, string> = { '1': 'owes', '2': 'debt' };

/** A request waiting for the admin's answer to an item's question is stored under this suffix (#982). */
export const ADMIN_CHOICE_SUFFIX = ':choose';

/**
 * The admin steps, stored as the number's one conversation node in whatsapp_sessions (#1292), so a
 * reply always goes to the step on screen: the code prompt, the Admin tools menu, and an item's question.
 */
export const ADMIN_CODE_NODE = 'admin_code';
export const ADMIN_MENU_NODE = 'admin_menu';
export const ADMIN_ITEM_NODE = 'admin_item';

export function isAdminNode(node: string): boolean {
  return node === ADMIN_CODE_NODE || node === ADMIN_MENU_NODE || node === ADMIN_ITEM_NODE;
}

export type WhatsAppAdminCommand =
  | { kind: 'open' }
  | { kind: 'link'; code: string }
  | { kind: 'code'; code: string };

/**
 * Typed admin commands (#1292 item 7): `ADMIN` opens Admin tools, `ADMIN LINK <code>` links the
 * number, `ADMIN <6-digit code>` approves. Anything else, even text starting with "admin", stays
 * with the resident assistant.
 */
export function parseWhatsAppAdminCommand(text: string | null | undefined): WhatsAppAdminCommand | null {
  const value = (text || '').trim();
  if (/^ADMIN$/i.test(value)) return { kind: 'open' };
  const link = value.match(/^ADMIN\s+LINK\s+(\d{6})$/i);
  if (link) return { kind: 'link', code: link[1] };
  const code = value.match(/^ADMIN\s+(\d{6})$/i);
  if (code) return { kind: 'code', code: code[1] };
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
  /** The global "Code required" switch; true when it cannot be read, so admin tools fail closed. */
  getCodeRequired(): Promise<boolean>;
  /**
   * The one admin profile whose resident record has this phone and which has no active binding yet,
   * for the automatic link (#1292 item 6); null when there is none or more than one.
   */
  findAutoLinkProfile(phoneNumber: string): Promise<string | null>;
  /** Pins the number to the profile without a link code; null when either already has an active binding. */
  createBinding(input: { profileId: string; phoneNumber: string; fingerprint: string; totpStep: number | null; sessionExpiresAt: string | null; now: Date }): Promise<WhatsAppAdminBinding | null>;
  /** Opens or ends the admin session (null) without a code: admin tools with no code needed, and LOCK. */
  setSessionExpiry(bindingId: string, sessionExpiresAt: string | null, now: Date): Promise<void>;
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
  code_required: boolean | null;
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
    codeRequired: row.code_required !== false,
  };
}

/** The account as get_my_access() resolves it, read through the service role, plus its authenticator secret. */
export async function loadWhatsAppAdminAccount(profileId: string): Promise<WhatsAppAdminAccount | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, approval_status, role_id, two_factor_enabled, two_factor_method, two_factor_secret_encrypted, app_roles!profiles_role_id_fkey (name, display_name, category)')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const role = (Array.isArray(data.app_roles) ? data.app_roles[0] : data.app_roles) as { display_name?: string; category?: string | null } | null;
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
    roleCategory: role?.category ?? null,
    permissions,
    totpSecret,
  };
}

const BINDING_COLUMNS = 'id, profile_id, phone_number, bound_at, last_used_at, last_totp_step, session_expires_at, account_fingerprint, code_required';

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

    async getCodeRequired() {
      const result = await getSettingResultAsService('whatsapp_admin_code_required');
      return !(result.status === 'ok' && (result.value === false || result.value === 'false'));
    },

    async findAutoLinkProfile(phoneNumber) {
      const supabase = db();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, resident:residents!profiles_resident_id_fkey (phone_primary, phone_secondary)')
        .not('resident_id', 'is', null);
      if (error) throw error;
      const matches = (data || []).filter((row) => {
        const resident = (Array.isArray(row.resident) ? row.resident[0] : row.resident) as { phone_primary: string | null; phone_secondary: string | null } | null;
        return resident !== null && isOnRoster(resident, phoneNumber);
      });
      if (matches.length !== 1) return null;
      const profileId = matches[0].id as string;
      const { count, error: bindingError } = await supabase
        .from('whatsapp_admin_bindings')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .is('revoked_at', null)
        .not('bound_at', 'is', null);
      if (bindingError) throw bindingError;
      return count ? null : profileId;
    },

    async createBinding({ profileId, phoneNumber, fingerprint, totpStep, sessionExpiresAt, now }) {
      const at = now.toISOString();
      const { data, error } = await db()
        .from('whatsapp_admin_bindings')
        .insert({
          profile_id: profileId,
          // No link code was used: an unguessable placeholder that is never looked up (bound_at is set).
          link_code_hash: hashAdminLinkCode(`auto:${randomUUID()}`),
          link_code_expires_at: at,
          phone_number: phoneNumber,
          bound_at: at,
          account_fingerprint: fingerprint,
          last_used_at: at,
          last_totp_step: totpStep,
          session_expires_at: sessionExpiresAt,
        })
        .select(BINDING_COLUMNS)
        .single();
      // The partial unique indexes refuse a second active binding for the admin or the number.
      if (error?.code === '23505') return null;
      if (error) throw error;
      return toBinding(data as BindingRow);
    },

    async setSessionExpiry(bindingId, sessionExpiresAt, now) {
      const { error } = await db()
        .from('whatsapp_admin_bindings')
        .update({ session_expires_at: sessionExpiresAt, updated_at: now.toISOString() })
        .eq('id', bindingId)
        .is('revoked_at', null);
      if (error) throw error;
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
      const estate = await getEstateEmailSettings();
      const result = await sendEmail({
        to: { email, name: account.fullName },
        subject: whatsAppAdminAlertSubject(event),
        react: WhatsAppAdminAlertEmail({
          firstName: account.fullName.split(' ')[0] || account.fullName,
          event,
          maskedNumber: maskPhone(phoneNumber),
          ...estate,
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

export const ADMIN_BAD_LINK_REPLY = 'That admin link code is invalid or expired. Create a new one in the dashboard.';
export const ADMIN_WRONG_CODE_REPLY = 'That code is wrong or already used. Wait for a new code in your authenticator app and try again.';
export const ADMIN_CAP_REPLY = `You have reached today's limit of ${ADMIN_DAILY_ACTION_CAP} admin requests on WhatsApp. It resets at midnight.`;
export const ADMIN_NOT_ALLOWED_REPLY = 'Your role does not allow that request on WhatsApp.';
export const ADMIN_CODE_PROMPT = 'Admin tools: enter the 6-digit code from your authenticator app, or reply 0 for menu.';
export const ADMIN_LOCKED_REPLY = 'Admin tools are locked. Reply 0 for menu.';
export const ADMIN_MENU_FOOTER = 'Reply 0 for menu or LOCK to lock now.';
const APPROVE_PROMPT = `To approve, send the 6-digit code from your authenticator app within ${ADMIN_REQUEST_TTL_MINUTES} minutes.`;
const NOT_CAUGHT = "I didn't catch that.";

/** Replies that leave the admin steps for the resident assistant, which then answers them as usual. */
const LEAVE_WORDS = new Set(['0', 'menu', 'hi', 'hello', 'start', 'exit', 'end', 'close', 'bye', 'goodbye', 'quit']);

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

function mayRun(account: WhatsAppAdminAccount, action: WhatsAppAdminAction): boolean {
  return [action.permission].flat().some((permission) => account.permissions.includes(permission));
}

function sessionLive(binding: WhatsAppAdminBinding | null, now: Date): boolean {
  return !!binding?.sessionExpiresAt && Date.parse(binding.sessionExpiresAt) > now.getTime();
}

/** Header, the items this role may use, and the footer (#1292 item 4). */
export function adminMenuText(account: WhatsAppAdminAccount, binding: WhatsAppAdminBinding | null): string {
  const items = Object.entries(WHATSAPP_ADMIN_MENU)
    .filter(([, name]) => mayRun(account, WHATSAPP_ADMIN_ACTIONS[name]))
    .map(([number, name]) => `${number}. ${WHATSAPP_ADMIN_ACTIONS[name].label}`);
  return [
    `Admin tools: ${account.fullName}, ${account.roleDisplayName || account.roleName}`,
    ...(binding?.sessionExpiresAt ? [`Session ends ${lagosClock(binding.sessionExpiresAt)}`] : []),
    '',
    ...(items.length > 0 ? items : ['Your role has no admin tools yet.']),
    '',
    ADMIN_MENU_FOOTER,
  ].join('\n');
}

export interface WhatsAppAdminHandlerOptions {
  repository: WhatsAppAdminRepository;
  reply(body: string): Promise<void>;
  /** Sets the number's one conversation node (#1292): an admin step, or `main` when the admin steps end. */
  setStep(node: string): Promise<void>;
  now?: () => Date;
  owesRepository?: OwesRepository;
}

/** Who this number is for admin tools, re-checked against the live account on every turn (#1292 item 2). */
type AdminAccess =
  | { kind: 'admin'; account: WhatsAppAdminAccount; binding: WhatsAppAdminBinding | null; codeNeeded: boolean }
  | { kind: 'ended'; reason: WhatsAppAdminEndReason };

async function resolveAdminAccess(repository: WhatsAppAdminRepository, phoneNumber: string, now: Date): Promise<AdminAccess | null> {
  const codeRequired = await repository.getCodeRequired();
  const binding = await repository.findActiveBinding(phoneNumber);
  if (binding) {
    const account = await repository.loadAccount(binding.profileId);
    const codeNeeded = codeRequired && binding.codeRequired;
    const ended = bindingEndReason(binding, account, now, codeNeeded);
    if (!ended) return { kind: 'admin', account: account!, binding, codeNeeded };
    await repository.revokeBinding(binding.id, ended, now);
    await repository.audit({
      action: 'DEACTIVATE',
      entityType: 'whatsapp_admin_bindings',
      entityId: binding.id,
      entityDisplay: `WhatsApp admin link for ${account?.fullName ?? 'an admin'}`,
      description: `WhatsApp admin link ended: ${ended}`,
      metadata: { phone_number: maskPhone(phoneNumber), reason: ended },
    }, account?.profileId ?? null);
    return { kind: 'ended', reason: ended };
  }
  // No binding yet: the number may still be linked on first use (#1292 item 6). With no binding the
  // admin's own switch is at its default, on.
  const profileId = await repository.findAutoLinkProfile(phoneNumber);
  if (!profileId) return null;
  const account = await repository.loadAccount(profileId);
  if (adminIneligibility(account, codeRequired)) return null;
  return { kind: 'admin', account: account!, binding: null, codeNeeded: codeRequired };
}

/** What an admin turn was asked to do: open Admin tools, take a code, or answer the step on screen. */
type AdminInput = { kind: 'open' } | { kind: 'code'; code: string } | { kind: 'step'; node: string };

/** One admin turn. False when this number is not an admin number, or the reply leaves the admin steps. */
async function adminTurn(message: WhatsAppInboundMessage, input: AdminInput, options: WhatsAppAdminHandlerOptions): Promise<boolean> {
  const { repository, reply, setStep } = options;
  const now = options.now?.() ?? new Date();
  const phoneNumber = normalizePhoneNumber(message.from);
  const masked = maskPhone(phoneNumber);

  const access = await resolveAdminAccess(repository, phoneNumber, now);
  if (!access) {
    // Nothing is revealed: the message is answered as the resident assistant would (#1292 decision 1).
    if (input.kind === 'step') await setStep('main');
    return false;
  }
  if (access.kind === 'ended') {
    await reply(`Admin access for this number has ended: ${INELIGIBLE_REPLIES[access.reason]}.`);
    await setStep('main');
    return true;
  }
  const lockedUntil = await repository.getLockedUntil(phoneNumber);
  if (lockedUntil && Date.parse(lockedUntil) > now.getTime()) {
    await reply(lockedReply(lockedUntil));
    await setStep('main');
    return true;
  }
  const { account: admin, codeNeeded } = access;
  let binding = access.binding;
  const text = message.text?.trim() || '';
  const lower = text.toLowerCase();

  const showMenu = async (live: WhatsAppAdminBinding | null, prefix?: string) => {
    const menu = adminMenuText(admin, live);
    await reply(prefix ? `${prefix}\n\n${menu}` : menu);
    await setStep(ADMIN_MENU_NODE);
  };
  const askCode = async (prefix?: string) => {
    await reply(prefix ? `${prefix}\n\n${ADMIN_CODE_PROMPT}` : ADMIN_CODE_PROMPT);
    await setStep(ADMIN_CODE_NODE);
  };
  const { year, month, day } = lagosParts(now);
  const overCap = async () =>
    (await repository.countDoneSince(admin.profileId, lagosMidnight(year, month, day).toISOString())) >= ADMIN_DAILY_ACTION_CAP;

  /** The automatic link on first use (#1292 item 6): audited and emailed like a dashboard link. */
  const autoLink = async (totpStep: number | null, sessionExpiresAt: string | null) => {
    const created = await repository.createBinding({
      profileId: admin.profileId,
      phoneNumber,
      fingerprint: accountFingerprint(admin),
      totpStep,
      sessionExpiresAt,
      now,
    });
    if (!created) return null;
    await repository.audit({
      action: 'ACTIVATE',
      entityType: 'whatsapp_admin_bindings',
      entityId: created.id,
      entityDisplay: `WhatsApp admin link for ${admin.fullName}`,
      description: "WhatsApp number linked to an admin account automatically: it is the phone of the admin's resident record",
      newValues: { phone_number: masked, bound_at: now.toISOString() },
    }, admin.profileId);
    try {
      await repository.emailAdmin(admin, 'linked', phoneNumber);
    } catch (error) {
      console.error('[whatsapp-admin] Link alert email failed:', error);
    }
    return created;
  };

  const run = async (actionName: string, live: WhatsAppAdminBinding, requestId: string, params: Record<string, unknown>) => {
    const action = WHATSAPP_ADMIN_ACTIONS[actionName];
    // The role may have changed between the request and its code.
    if (!mayRun(admin, action)) {
      await showMenu(live, ADMIN_NOT_ALLOWED_REPLY);
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
    if (action.again && action.begin) {
      // The item stays on screen for the next entry, such as a number from a pick-list.
      const next = await action.begin({ account: admin, binding: live, now });
      await createChoice(actionName, live, next.state ?? {});
      await reply(`${answer}\n\n${action.again}`);
      await setStep(ADMIN_ITEM_NODE);
      return;
    }
    // The answer goes on its own, so it can be forwarded without the menu (#1179).
    await reply(answer);
    await showMenu(live);
  };

  const createChoice = (actionName: string, live: WhatsAppAdminBinding, state: Record<string, unknown>) =>
    repository.createRequest({
      bindingId: live.id,
      profileId: admin.profileId,
      action: `${actionName}${ADMIN_CHOICE_SUFFIX}`,
      params: state,
      status: 'pending',
      expiresAt: new Date(now.getTime() + ADMIN_REQUEST_TTL_MINUTES * MINUTE).toISOString(),
      providerMessageId: message.id,
    });

  /** Runs the request now, or holds it for a code when one is needed. */
  const request = async (actionName: string, live: WhatsAppAdminBinding, params: Record<string, unknown>) => {
    const action = WHATSAPP_ADMIN_ACTIONS[actionName];
    if (!mayRun(admin, action)) return showMenu(live, ADMIN_NOT_ALLOWED_REPLY);
    if (await overCap()) return showMenu(live, ADMIN_CAP_REPLY);
    if (codeNeeded && action.freshCode) {
      await repository.createRequest({
        bindingId: live.id,
        profileId: admin.profileId,
        action: actionName,
        params,
        status: 'pending',
        expiresAt: new Date(now.getTime() + ADMIN_REQUEST_TTL_MINUTES * MINUTE).toISOString(),
        providerMessageId: message.id,
      });
      await reply(APPROVE_PROMPT);
      await setStep(ADMIN_CODE_NODE);
      return;
    }
    const requestId = await repository.createRequest({
      bindingId: live.id,
      profileId: admin.profileId,
      action: actionName,
      params,
      status: 'done',
      expiresAt: live.sessionExpiresAt!,
      providerMessageId: message.id,
    });
    await run(actionName, live, requestId, params);
  };

  const open = async () => {
    if (codeNeeded) return sessionLive(binding, now) ? showMenu(binding) : askCode();
    // No code needed (#1292 item 3): the linked number alone opens Admin tools; the session still ends in 15 minutes.
    binding ??= await autoLink(null, null);
    if (!binding) {
      // Another message linked the number or the admin first; the next turn finds that binding.
      await reply('Admin tools could not open just now. Reply ADMIN to try again.');
      await setStep('main');
      return;
    }
    if (!sessionLive(binding, now)) {
      const sessionExpiresAt = new Date(now.getTime() + ADMIN_SESSION_MINUTES * MINUTE).toISOString();
      await repository.setSessionExpiry(binding.id, sessionExpiresAt, now);
      await repository.audit({
        action: 'APPROVE',
        entityType: 'whatsapp_admin_bindings',
        entityId: binding.id,
        entityDisplay: `WhatsApp admin link for ${admin.fullName}`,
        description: `WhatsApp admin session opened for ${ADMIN_SESSION_MINUTES} minutes without a code (code not required)`,
        metadata: { phone_number: masked, session_expires_at: sessionExpiresAt },
      }, admin.profileId);
      binding = { ...binding, sessionExpiresAt };
    }
    await repository.touchBinding(binding.id, now);
    return showMenu(binding);
  };

  /** Counts a wrong code; on the lock it audits and emails the admin. */
  const wrongCode = async () => {
    const { lockedUntil: lockEnd } = await repository.recordWrongCode(phoneNumber, now);
    if (binding) {
      await repository.audit({
        action: 'REJECT',
        entityType: 'whatsapp_admin_bindings',
        entityId: binding.id,
        entityDisplay: `WhatsApp admin link for ${admin.fullName}`,
        description: lockEnd ? 'Wrong WhatsApp admin code; admin mode locked on this number' : 'Wrong WhatsApp admin code',
        metadata: { phone_number: masked, locked_until: lockEnd },
      }, admin.profileId);
    }
    if (!lockEnd) {
      await reply(ADMIN_WRONG_CODE_REPLY);
      return;
    }
    try {
      await repository.emailAdmin(admin, 'locked', phoneNumber);
    } catch (error) {
      // Best effort: the lock is already in place, and a throw would make the provider retry.
      console.error('[whatsapp-admin] Lock alert email failed:', error);
    }
    await reply(lockedReply(lockEnd));
    await setStep('main');
  };

  const takeCode = async (code: string) => {
    if (!codeNeeded) return open();
    const step = matchTotpStep(code, admin.totpSecret!, now.getTime());
    const sessionExpiresAt = new Date(now.getTime() + ADMIN_SESSION_MINUTES * MINUTE).toISOString();
    let live: WhatsAppAdminBinding | null;
    if (binding) {
      if (
        step === null ||
        (binding.lastTotpStep !== null && step <= binding.lastTotpStep) ||
        !(await repository.acceptCode(binding.id, step, sessionExpiresAt, now))
      ) {
        return wrongCode();
      }
      live = { ...binding, lastTotpStep: step, sessionExpiresAt };
    } else {
      // The automatic link with a code needed happens only after a good code (#1292 item 6).
      if (step === null) return wrongCode();
      live = await autoLink(step, sessionExpiresAt);
      if (!live) return askCode(ADMIN_WRONG_CODE_REPLY);
    }
    await repository.clearWrongCodes(phoneNumber);
    await repository.audit({
      action: 'APPROVE',
      entityType: 'whatsapp_admin_bindings',
      entityId: live.id,
      entityDisplay: `WhatsApp admin link for ${admin.fullName}`,
      description: `WhatsApp admin session opened for ${ADMIN_SESSION_MINUTES} minutes`,
      metadata: { phone_number: masked, session_expires_at: sessionExpiresAt },
    }, admin.profileId);

    // The cap is checked before the pending request is used, so a capped request is not spent.
    if (await overCap()) return showMenu(live, ADMIN_CAP_REPLY);
    const pending = await repository.takePendingRequest(live.id, now);
    if (pending && Object.hasOwn(WHATSAPP_ADMIN_ACTIONS, pending.action)) return run(pending.action, live, pending.id, pending.params);
    await repository.touchBinding(live.id, now);
    return showMenu(live);
  };

  if (input.kind === 'open') {
    await open();
    return true;
  }
  if (input.kind === 'code') {
    await takeCode(input.code);
    return true;
  }

  // The step on screen (#1292 item 4).
  const node = input.node;
  if (lower === 'lock') {
    if (binding?.sessionExpiresAt) await repository.setSessionExpiry(binding.id, null, now);
    await reply(ADMIN_LOCKED_REPLY);
    await setStep('main');
    return true;
  }
  if (node === ADMIN_CODE_NODE) {
    if (/^\d{6}$/.test(text.replace(/\s+/g, ''))) {
      await takeCode(text.replace(/\s+/g, ''));
      return true;
    }
    if (LEAVE_WORDS.has(lower)) {
      await setStep('main');
      return false;
    }
    await askCode(NOT_CAUGHT);
    return true;
  }

  if (!sessionLive(binding, now)) {
    if (codeNeeded) {
      await askCode('Your admin session has ended.');
    } else {
      await reply('Your admin session has ended. Reply ADMIN to open Admin tools again.');
      await setStep('main');
    }
    return true;
  }
  // A live session implies a binding.
  const live = binding!;

  if (node === ADMIN_ITEM_NODE) {
    if (lower === '0' || lower === 'cancel') {
      await showMenu(live);
      return true;
    }
    if (LEAVE_WORDS.has(lower)) {
      await setStep('main');
      return false;
    }
    const waiting = await repository.findPendingChoice(live.id, now);
    const action = waiting && Object.hasOwn(WHATSAPP_ADMIN_ACTIONS, waiting.action) ? WHATSAPP_ADMIN_ACTIONS[waiting.action] : null;
    if (!waiting || !action?.choose) {
      await showMenu(live, `That question ran out after ${ADMIN_REQUEST_TTL_MINUTES} minutes.`);
      return true;
    }
    const chosen = action.choose(text, waiting.state);
    if ('retry' in chosen) {
      await reply(chosen.retry);
      return true;
    }
    await request(waiting.action, live, chosen.params);
    return true;
  }

  // The Admin tools menu.
  if (LEAVE_WORDS.has(lower)) {
    await setStep('main');
    return false;
  }
  const actionName = WHATSAPP_ADMIN_MENU[lower];
  const action = actionName ? WHATSAPP_ADMIN_ACTIONS[actionName] : null;
  if (!actionName || !action || !mayRun(admin, action)) {
    await showMenu(live, NOT_CAUGHT);
    return true;
  }
  if (await overCap()) {
    await showMenu(live, ADMIN_CAP_REPLY);
    return true;
  }
  if (!action.begin) {
    await request(actionName, live, {});
    return true;
  }
  const started = await action.begin({ account: admin, binding: live, now });
  if (!started.state) {
    await showMenu(live, started.reply);
    return true;
  }
  await createChoice(actionName, live, started.state);
  await reply(started.reply);
  await setStep(ADMIN_ITEM_NODE);
  return true;
}

/**
 * A typed admin command. `ADMIN LINK <code>` is always answered; `ADMIN` and `ADMIN <code>` only for
 * an admin number. False means the message goes on to the resident assistant (#1292 item 7).
 */
export async function handleWhatsAppAdminMessage(
  message: WhatsAppInboundMessage,
  command: WhatsAppAdminCommand,
  options: WhatsAppAdminHandlerOptions
): Promise<boolean> {
  if (command.kind !== 'link') return adminTurn(message, command, options);

  const { repository, reply } = options;
  const now = options.now?.() ?? new Date();
  const phoneNumber = normalizePhoneNumber(message.from);
  const masked = maskPhone(phoneNumber);

  const lockedUntil = await repository.getLockedUntil(phoneNumber);
  if (lockedUntil && Date.parse(lockedUntil) > now.getTime()) {
    await reply(lockedReply(lockedUntil));
    return true;
  }
  await options.setStep('main');

  const code = await repository.findLinkCode(hashAdminLinkCode(command.code), now);
  if (!code) {
    const { lockedUntil: lockEnd } = await repository.recordWrongCode(phoneNumber, now);
    await reply(lockEnd ? lockedReply(lockEnd) : ADMIN_BAD_LINK_REPLY);
    return true;
  }
  const account = await repository.loadAccount(code.profileId);
  const ineligible = adminIneligibility(account);
  if (ineligible) {
    await repository.revokeBinding(code.id, ineligible, now);
    await reply(`This number was not linked: ${INELIGIBLE_REPLIES[ineligible]}.`);
    return true;
  }
  if (!(await repository.activateBinding(code.id, code.profileId, phoneNumber, accountFingerprint(account!), now))) {
    await reply(ADMIN_BAD_LINK_REPLY);
    return true;
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
  await reply('This number is now linked to your admin account. Reply ADMIN to open Admin tools.');
  return true;
}

/** A reply while an admin step is on screen. False when it leaves the admin steps for the resident assistant. */
export function handleWhatsAppAdminStep(message: WhatsAppInboundMessage, node: string, options: WhatsAppAdminHandlerOptions): Promise<boolean> {
  return adminTurn(message, { kind: 'step', node }, options);
}

/** Item 6 on the resident main menu (#1292 item 1). */
export interface WhatsAppAdminTools {
  /** The item's label for this number, or null when it must not be shown, not even locked. */
  menuLabel(phoneNumber: string): Promise<string | null>;
  /** Opens Admin tools; false when the number is no longer an admin number. */
  open(message: WhatsAppInboundMessage, io: Pick<WhatsAppAdminHandlerOptions, 'reply' | 'setStep'>): Promise<boolean>;
}

export function createWhatsAppAdminTools(
  repository: WhatsAppAdminRepository = createSupabaseWhatsAppAdminRepository(),
  now: () => Date = () => new Date()
): WhatsAppAdminTools {
  return {
    async menuLabel(phoneNumber) {
      const access = await resolveAdminAccess(repository, normalizePhoneNumber(phoneNumber), now());
      if (access?.kind !== 'admin') return null;
      if (!access.codeNeeded) return 'Admin tools';
      return sessionLive(access.binding, now()) ? 'Admin tools (unlocked)' : 'Admin tools (code needed)';
    },
    open(message, io) {
      return adminTurn(message, { kind: 'open' }, { repository, now, ...io });
    },
  };
}
