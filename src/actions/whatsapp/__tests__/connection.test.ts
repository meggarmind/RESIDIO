import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { resolveWhatsAppConfig } from '@/lib/whatsapp/config';
import {
  getWhatsAppConnectionStatus,
  getWhatsAppOverrideNumbers,
  saveWhatsAppCredentials,
  disconnectWhatsApp,
  testWhatsAppConnection,
} from '../connection';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({
  PERMISSIONS: { WHATSAPP_VIEW: 'whatsapp.view', WHATSAPP_MANAGE: 'whatsapp.manage' },
}));
const settingsMocks = vi.hoisted(() => ({ getRawSettingsAsService: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: settingsMocks.getRawSettingsAsService }));
vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => `enc(${value})`),
  isEncryptionConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/whatsapp/config', () => ({
  resolveWhatsAppConfig: vi.fn(),
  invalidateWhatsAppConfigCache: vi.fn(),
}));

const viewer = { authorized: true, userId: 'viewer-1', role: null, roleName: null, roleId: null, permissions: [], error: null };
const manager = { authorized: true, userId: 'admin-1', role: null, roleName: null, roleId: null, permissions: [], error: null };
const unauthorized = { authorized: false, userId: null, role: null, roleName: null, roleId: null, permissions: [], error: 'Forbidden' };

function query(result: { data?: unknown; error?: unknown }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'eq', 'update']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

function optinQuery(result: { data?: unknown; error?: unknown }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'eq']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  return chain;
}

function chatmaidAdmin(rpc: ReturnType<typeof vi.fn>, optins: unknown[] = []) {
  const optinChain = optinQuery({ data: optins, error: null });
  return { rpc, from: vi.fn().mockReturnValue(optinChain), optinChain };
}

function overrideSettings(values: Record<string, string> = {}) {
  settingsMocks.getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map(Object.entries(values)) });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const PAIRED_PHONES = { data: [{ id: 'phone-1', e164: '+2348031234567' }] };

describe('WhatsApp connection actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.mocked(isEncryptionConfigured).mockReturnValue(true);
    overrideSettings();
  });

  describe('getWhatsAppConnectionStatus', () => {
    it('lets a WHATSAPP_VIEW holder read status without exposing any secret', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(viewer as never);
      const row = query({
        data: {
          provider: 'meta',
          phone_number_id: '123456',
          whatsapp_from_number: null,
          api_version: 'v23.0',
          updated_at: '2026-09-01T00:00:00Z',
          access_token_encrypted: 'ciphertext-access-token',
          verify_token_encrypted: 'ciphertext-verify-token',
          app_secret_encrypted: 'ciphertext-app-secret',
          auth_token_encrypted: null,
          account_sid_encrypted: null,
          updated_by_profile: { full_name: 'Ada Admin' },
        },
        error: null,
      });
      vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(row) } as never);

      const result = await getWhatsAppConnectionStatus();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          connected: true,
          provider: 'meta',
          phoneNumberId: '123456',
          apiVersion: 'v23.0',
          updatedByName: 'Ada Admin',
          hasAccessToken: true,
          hasVerifyToken: true,
          hasAppSecret: true,
          hasAuthToken: false,
        })
      );

      // Never returns a secret or anything decrypted -- only presence booleans.
      const serialized = JSON.stringify(result.data);
      expect(serialized).not.toContain('ciphertext-access-token');
      expect(serialized).not.toContain('ciphertext-verify-token');
      expect(serialized).not.toContain('ciphertext-app-secret');
    });
  });

  describe('saveWhatsAppCredentials', () => {
    it('refuses to save without WHATSAPP_MANAGE, even for a view-only caller', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(unauthorized as never);

      const result = await saveWhatsAppCredentials({
        provider: 'meta',
        accessToken: 'token',
        phoneNumberId: '123',
        verifyToken: 'verify',
        appSecret: 'secret',
      });

      expect(result).toEqual({ success: false, data: null, error: 'Forbidden' });
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(encrypt).not.toHaveBeenCalled();
    });

    it('lets a WHATSAPP_MANAGE holder save Meta credentials, encrypted, and returns the verify token once', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null });
      vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

      const result = await saveWhatsAppCredentials({
        provider: 'meta',
        accessToken: 'super-secret-token',
        phoneNumberId: '123456',
        verifyToken: 'verify-me',
        appSecret: 'app-secret-value',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ provider: 'meta', verifyToken: 'verify-me' });
      expect(rpc).toHaveBeenCalledWith(
        'replace_whatsapp_credentials',
        expect.objectContaining({
          p_provider: 'meta',
          p_access_token_encrypted: 'enc(super-secret-token)',
          p_verify_token_encrypted: 'enc(verify-me)',
          p_app_secret_encrypted: 'enc(app-secret-value)',
          p_phone_number_id: '123456',
          p_actor_id: 'admin-1',
        })
      );
    });

    it('never writes a plaintext secret into the audit log', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null });
      vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

      await saveWhatsAppCredentials({
        provider: 'meta',
        accessToken: 'super-secret-token',
        phoneNumberId: '123456',
        verifyToken: 'verify-me',
        appSecret: 'app-secret-value',
      });

      expect(logAudit).toHaveBeenCalledTimes(1);
      const auditPayload = vi.mocked(logAudit).mock.calls[0][0];

      expect(auditPayload.newValues).toEqual({
        provider: 'meta',
        phoneNumberId: '123456',
        apiVersion: 'v23.0',
      });

      const serialized = JSON.stringify(auditPayload);
      expect(serialized).not.toContain('super-secret-token');
      expect(serialized).not.toContain('verify-me');
      expect(serialized).not.toContain('app-secret-value');
    });

    it('returns a friendly error and touches neither the database nor encrypt() when the server encryption key is missing', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(isEncryptionConfigured).mockReturnValue(false);

      const result = await saveWhatsAppCredentials({
        provider: 'twilio',
        accountSid: 'AC123',
        authToken: 'token',
        fromNumber: '+15551234567',
      });

      expect(result).toEqual({
        success: false,
        data: null,
        error: 'Server encryption key is not configured; contact your deployment administrator',
      });
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(encrypt).not.toHaveBeenCalled();
    });

    it('saves Chatmaid credentials encrypted through the Chatmaid RPC params', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-2' }, error: null });
      vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(PAIRED_PHONES)));

      const result = await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2348031234567',
      });

      expect(result).toEqual({ success: true, data: { provider: 'chatmaid' }, error: null });
      expect(rpc).toHaveBeenCalledWith('replace_whatsapp_credentials', {
        p_provider: 'chatmaid',
        p_chatmaid_api_key_encrypted: 'enc(sk_test_fake_key)',
        p_chatmaid_webhook_secret_encrypted: 'enc(whsec_fake_secret)',
        p_whatsapp_from_number: '+2348031234567',
        p_actor_id: 'admin-1',
      });
    });

    it('never writes a Chatmaid API key or webhook secret into the audit log', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-2' }, error: null });
      vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(PAIRED_PHONES)));

      await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2348031234567',
      });

      expect(logAudit).toHaveBeenCalledTimes(1);
      const auditPayload = vi.mocked(logAudit).mock.calls[0][0];
      expect(auditPayload).toEqual(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'whatsapp_provider_credentials',
          entityId: 'row-2',
          newValues: { provider: 'chatmaid', fromNumber: '+2348031234567' },
        })
      );

      const serialized = JSON.stringify(auditPayload);
      expect(serialized).not.toContain('sk_test_fake_key');
      expect(serialized).not.toContain('whsec_fake_secret');
    });

    it('rejects a Chatmaid from number that is not paired to the account, naming the paired phones', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn();
      vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAIRED_PHONES));
      vi.stubGlobal('fetch', fetchMock);

      // The 2026-10-19 typo: a 235 (Chad) country code for the 234 bridge phone.
      const result = await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2358031234567',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('+2358031234567 is not paired to this Chatmaid account');
      expect(result.error).toContain('Paired phones on this account: +2348031234567.');
      expect(fetchMock.mock.calls[0][0]).toBe('https://developers-api.chatmaid.net/v1/phone-numbers');
      expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer sk_test_fake_key' });
      expect(rpc).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('says so when the Chatmaid account has no paired phones', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn();
      vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

      const result = await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2348031234567',
      });

      expect(result.error).toContain('This Chatmaid account has no paired phones.');
      expect(rpc).not.toHaveBeenCalled();
    });

    it('rejects a Chatmaid from number that belongs to an opted-in resident', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn();
      const admin = chatmaidAdmin(rpc, [{ id: 'optin-1' }]);
      vi.mocked(createAdminClient).mockReturnValue(admin as never);
      // Even when Chatmaid lists it: a resident's own number is never the bridge.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'p', e164: '+2348036996725' }] })));

      const result = await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2348036996725',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('belongs to an opted-in resident');
      expect(admin.from).toHaveBeenCalledWith('whatsapp_optins');
      expect(admin.optinChain.eq).toHaveBeenCalledWith('phone_number', '+2348036996725');
      expect(admin.optinChain.eq).toHaveBeenCalledWith('opted_in', true);
      expect(rpc).not.toHaveBeenCalled();
    });

    describe('communications override conflict (#904)', () => {
      const chatmaid = (fromNumber: string) => ({
        provider: 'chatmaid' as const,
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber,
      });
      const twilio = (fromNumber: string) => ({
        provider: 'twilio' as const,
        accountSid: 'AC123',
        authToken: 'tok',
        fromNumber,
      });

      it('rejects a Chatmaid from number equal to the override WhatsApp number, before any lookup', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        const rpc = vi.fn();
        vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        overrideSettings({ comms_override_whatsapp_phone: '+2348037000101', comms_override_phone: '+15550100100' });

        const result = await saveWhatsAppCredentials(chatmaid('+2348037000101'));

        expect(result.success).toBe(false);
        expect(result.error).toContain('same as the WhatsApp number in Communications override');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(rpc).not.toHaveBeenCalled();
      });

      it('compares after normalising, so a local-format override number still conflicts', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        const rpc = vi.fn();
        vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
        overrideSettings({ comms_override_whatsapp_phone: '08037000101' });

        const result = await saveWhatsAppCredentials(chatmaid('+2348037000101'));

        expect(result.success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
      });

      it('rejects a from number equal to the override phone when the override WhatsApp number is blank', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        const rpc = vi.fn();
        vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
        overrideSettings({ comms_override_phone: '+2348037000101' });

        const result = await saveWhatsAppCredentials(chatmaid('+2348037000101'));

        expect(result.success).toBe(false);
        expect(result.error).toContain('same as the override phone');
        expect(rpc).not.toHaveBeenCalled();
      });

      it('allows a from number equal to the override phone when the override WhatsApp number is set', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-2' }, error: null });
        vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'p', e164: '+2348037000101' }] })));
        overrideSettings({ comms_override_phone: '+2348037000101', comms_override_whatsapp_phone: '+15550100200' });

        const result = await saveWhatsAppCredentials(chatmaid('+2348037000101'));

        expect(result.success).toBe(true);
      });

      it('fails closed when the override settings cannot be read', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        const rpc = vi.fn();
        vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
        settingsMocks.getRawSettingsAsService.mockResolvedValue({ status: 'error', message: 'boom' });

        const result = await saveWhatsAppCredentials(chatmaid('+2348037000101'));

        expect(result.success).toBe(false);
        expect(result.error).toContain('Could not verify');
        expect(rpc).not.toHaveBeenCalled();
      });

      it('applies the same rule to a Twilio from number', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-3' }, error: null });
        vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
        overrideSettings({ comms_override_whatsapp_phone: '+15551234567' });

        const result = await saveWhatsAppCredentials(twilio('whatsapp:+15551234567'));

        expect(result.success).toBe(false);
        expect(result.error).toContain('same as the WhatsApp number in Communications override');
        expect(rpc).not.toHaveBeenCalled();
      });

      it('saves a Twilio from number that differs from the override numbers', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-3' }, error: null });
        vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
        overrideSettings({ comms_override_whatsapp_phone: '+15559999999' });

        expect((await saveWhatsAppCredentials(twilio('+15551234567'))).success).toBe(true);
      });
    });

    describe('getWhatsAppOverrideNumbers', () => {
      it('returns the override phone and WhatsApp number to a WHATSAPP_MANAGE holder', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(manager as never);
        overrideSettings({ comms_override_phone: '+15550100100', comms_override_whatsapp_phone: '+15550100200' });
        expect(await getWhatsAppOverrideNumbers()).toEqual({
          success: true,
          data: { phone: '+15550100100', whatsappPhone: '+15550100200' },
          error: null,
        });
      });

      it('reads nothing for a caller without WHATSAPP_MANAGE', async () => {
        vi.mocked(authorizePermission).mockResolvedValue(unauthorized as never);
        const result = await getWhatsAppOverrideNumbers();
        expect(result.success).toBe(false);
        expect(settingsMocks.getRawSettingsAsService).not.toHaveBeenCalled();
      });
    });

    it('does not save Chatmaid credentials the API rejects', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn();
      vi.mocked(createAdminClient).mockReturnValue(chatmaidAdmin(rpc) as never);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })));

      const result = await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2348031234567',
      });

      expect(result.error).toBe('Chatmaid rejected the request (HTTP 401). Check the API key.');
      expect(rpc).not.toHaveBeenCalled();
    });

    it.each([
      ['a dashboard phone id', '6ab0154c3986c20fd36f0aec'],
      ['a number without the leading +', '2348031234567'],
      ['a number with spaces', '+234 803 123 4567'],
      ['a number with a leading prefix', 'x+2348031234567'],
      ['a number with a trailing suffix', '+2348031234567x'],
      ['a number whose country code starts with 0', '+02348031234567'],
      ['a number longer than 15 digits', '+2348031234567890'],
    ])('rejects a Chatmaid from number that is %s, before touching the database', async (_label, fromNumber) => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);

      const result = await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/E\.164/);
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(encrypt).not.toHaveBeenCalled();
    });

    it.each([
      ['API key', { apiKey: '' }, 'API key is required'],
      ['webhook signing secret', { webhookSecret: '   ' }, 'Webhook signing secret is required'],
    ])('requires the Chatmaid %s', async (_label, override, message) => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);

      const result = await saveWhatsAppCredentials({
        provider: 'chatmaid',
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2348031234567',
        ...override,
      });

      expect(result).toEqual({ success: false, data: null, error: message });
      expect(createAdminClient).not.toHaveBeenCalled();
    });
  });

  describe('Chatmaid status and connection test', () => {
    it('reports Chatmaid secret presence as booleans only', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(viewer as never);
      const row = query({
        data: {
          provider: 'chatmaid',
          phone_number_id: null,
          whatsapp_from_number: '+2348031234567',
          api_version: null,
          updated_at: '2026-09-22T00:00:00Z',
          access_token_encrypted: null,
          verify_token_encrypted: null,
          app_secret_encrypted: null,
          auth_token_encrypted: null,
          account_sid_encrypted: null,
          chatmaid_api_key_encrypted: 'ciphertext-chatmaid-key',
          chatmaid_webhook_secret_encrypted: 'ciphertext-chatmaid-secret',
          updated_by_profile: null,
        },
        error: null,
      });
      vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(row) } as never);

      const result = await getWhatsAppConnectionStatus();

      expect(result.data).toEqual(
        expect.objectContaining({
          connected: true,
          provider: 'chatmaid',
          fromNumber: '+2348031234567',
          hasChatmaidApiKey: true,
          hasChatmaidWebhookSecret: true,
          hasAccessToken: false,
        })
      );
      const serialized = JSON.stringify(result.data);
      expect(serialized).not.toContain('ciphertext-chatmaid-key');
      expect(serialized).not.toContain('ciphertext-chatmaid-secret');
    });

    const chatmaidConfig = {
      status: 'ok' as const,
      config: {
        provider: 'chatmaid' as const,
        apiKey: 'sk_test_fake_key',
        webhookSecret: 'whsec_fake_secret',
        fromNumber: '+2348031234567',
        baseUrl: 'https://developers-api.chatmaid.net',
      },
    };

    it('tests a Chatmaid connection with authenticated reads, not a send, and reports the bridge status', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfig);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(PAIRED_PHONES))
        .mockResolvedValueOnce(jsonResponse({ data: { connectionStatus: 'connected' } }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await testWhatsAppConnection();

      expect(result.data).toEqual({
        ok: true,
        message: 'Connected to the Chatmaid API. +2348031234567 is paired; bridge status: connected.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        'https://developers-api.chatmaid.net/v1/phone-numbers',
        'https://developers-api.chatmaid.net/v1/phone-numbers/phone-1/status',
      ]);
      for (const [, init] of fetchMock.mock.calls) {
        expect(init.method ?? 'GET').toBe('GET');
        expect(init.headers).toEqual({ Authorization: 'Bearer sk_test_fake_key' });
      }
    });

    it('fails the Chatmaid test when the paired phone is not connected to the bridge', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfig);
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(jsonResponse(PAIRED_PHONES))
          .mockResolvedValueOnce(jsonResponse({ data: { connectionStatus: 'disconnected' } }))
      );

      const result = await testWhatsAppConnection();

      expect(result.data).toEqual({
        ok: false,
        message: 'Connected to the Chatmaid API. +2348031234567 is paired; bridge status: disconnected.',
      });
    });

    it('fails the Chatmaid test when the stored from number is not paired', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue({
        ...chatmaidConfig,
        config: { ...chatmaidConfig.config, fromNumber: '+2358031234567' },
      });
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAIRED_PHONES));
      vi.stubGlobal('fetch', fetchMock);

      const result = await testWhatsAppConnection();

      expect(result.data).toEqual({
        ok: false,
        message:
          'From number +2358031234567 is not paired to this Chatmaid account. Paired phones on this account: +2348031234567.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reports a rejected Chatmaid key without returning the upstream body', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue({
        status: 'ok',
        config: {
          provider: 'chatmaid',
          apiKey: 'sk_test_fake_key',
          webhookSecret: 'whsec_fake_secret',
          fromNumber: '+2348031234567',
          baseUrl: 'https://developers-api.chatmaid.net',
        },
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream-detail', { status: 401 })));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const result = await testWhatsAppConnection();

        expect(result.data?.ok).toBe(false);
        expect(result.data?.message).toContain('Chatmaid rejected the request (HTTP 401)');
        expect(JSON.stringify(result)).not.toContain('upstream-detail');
      } finally {
        vi.unstubAllGlobals();
        consoleError.mockRestore();
      }
    });
  });

  describe('WAHA credentials, status and connection test (#1262)', () => {
    const waha = {
      provider: 'waha' as const,
      apiKey: 'waha_fake_key',
      webhookSecret: 'waha_fake_secret',
      baseUrl: 'https://waha.example.com',
      session: 'default',
      fromNumber: '+2348031234567',
    };

    const wahaAdmin = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as never;

    it('saves WAHA credentials encrypted through the WAHA RPC params, with the plain address and session', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-3' }, error: null });
      vi.mocked(createAdminClient).mockReturnValue(wahaAdmin(rpc));

      const result = await saveWhatsAppCredentials(waha);

      expect(result).toEqual({ success: true, data: { provider: 'waha' }, error: null });
      expect(rpc).toHaveBeenCalledWith('replace_whatsapp_credentials', {
        p_provider: 'waha',
        p_waha_api_key_encrypted: 'enc(waha_fake_key)',
        p_waha_webhook_secret_encrypted: 'enc(waha_fake_secret)',
        p_waha_base_url: 'https://waha.example.com',
        p_waha_session: 'default',
        p_whatsapp_from_number: '+2348031234567',
        p_actor_id: 'admin-1',
      });
    });

    it('defaults the session name to "default" when none is given', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn().mockResolvedValue({ data: { id: 'row-3' }, error: null });
      vi.mocked(createAdminClient).mockReturnValue(wahaAdmin(rpc));
      const withoutSession: Partial<typeof waha> = { ...waha };
      delete withoutSession.session;

      await saveWhatsAppCredentials(withoutSession as never);

      expect(rpc.mock.calls[0][1]).toMatchObject({ p_waha_session: 'default' });
    });

    it('never writes a WAHA API key or webhook secret into the audit log', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(createAdminClient).mockReturnValue(wahaAdmin(vi.fn().mockResolvedValue({ data: { id: 'row-3' }, error: null })));

      await saveWhatsAppCredentials(waha);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: { provider: 'waha', baseUrl: 'https://waha.example.com', session: 'default', fromNumber: '+2348031234567' },
        })
      );
      const serialized = JSON.stringify(vi.mocked(logAudit).mock.calls);
      expect(serialized).not.toContain('waha_fake_key');
      expect(serialized).not.toContain('waha_fake_secret');
    });

    it('refuses to save without WHATSAPP_MANAGE', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(unauthorized as never);

      expect(await saveWhatsAppCredentials(waha)).toEqual({ success: false, data: null, error: 'Forbidden' });
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(encrypt).not.toHaveBeenCalled();
    });

    it.each([
      ['an address that is not https', { baseUrl: 'http://waha.example.com' }, 'Server address must start with https://'],
      ['an address with a trailing slash', { baseUrl: 'https://waha.example.com/' }, 'Server address must not end with a slash'],
      ['an address that is not a URL', { baseUrl: 'waha.example.com' }, 'Server address must be a valid URL'],
      ['a from number that is not E.164', { fromNumber: '08031234567' }, 'From number must be in E.164 format'],
      ['an empty API key', { apiKey: '  ' }, 'API key is required'],
      ['an empty webhook secret', { webhookSecret: '' }, 'Webhook secret is required'],
      ['a blank session name', { session: '   ' }, 'Session name is required'],
    ])('rejects %s, before touching the database or encrypting', async (_label, override, message) => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);

      const result = await saveWhatsAppCredentials({ ...waha, ...override });

      expect(result.success).toBe(false);
      expect(result.error).toContain(message);
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(encrypt).not.toHaveBeenCalled();
    });

    it('rejects a from number equal to the override WhatsApp number', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const rpc = vi.fn();
      vi.mocked(createAdminClient).mockReturnValue(wahaAdmin(rpc));
      overrideSettings({ comms_override_whatsapp_phone: '+2348031234567', comms_override_phone: '+15550100100' });

      const result = await saveWhatsAppCredentials(waha);

      expect(result.success).toBe(false);
      expect(result.error).toContain('same as the WhatsApp number in Communications override');
      expect(rpc).not.toHaveBeenCalled();
    });

    it('reports WAHA secret presence as booleans and returns the address and session, never a ciphertext', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(viewer as never);
      const row = query({
        data: {
          provider: 'waha',
          phone_number_id: null,
          whatsapp_from_number: '+2348031234567',
          api_version: null,
          updated_at: '2026-10-27T00:00:00Z',
          waha_api_key_encrypted: 'ciphertext-waha-key',
          waha_webhook_secret_encrypted: 'ciphertext-waha-secret',
          waha_base_url: 'https://waha.example.com',
          waha_session: 'estate',
          updated_by_profile: null,
        },
        error: null,
      });
      vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(row) } as never);

      const result = await getWhatsAppConnectionStatus();

      expect(result.data).toEqual(
        expect.objectContaining({
          connected: true,
          provider: 'waha',
          fromNumber: '+2348031234567',
          hasWahaApiKey: true,
          hasWahaWebhookSecret: true,
          wahaBaseUrl: 'https://waha.example.com',
          wahaSession: 'estate',
          hasChatmaidApiKey: false,
        })
      );
      expect(row.select.mock.calls[0][0]).toContain('waha_base_url');
      const serialized = JSON.stringify(result.data);
      expect(serialized).not.toContain('ciphertext-waha-key');
      expect(serialized).not.toContain('ciphertext-waha-secret');
    });

    const wahaConfig = { status: 'ok' as const, config: waha };
    const session = (body: Record<string, unknown>) => jsonResponse({ name: 'default', ...body });

    it('tests a WAHA connection with one authenticated read, not a send', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(wahaConfig);
      const fetchMock = vi.fn().mockResolvedValue(session({ status: 'WORKING', me: { id: '2348031234567@c.us', pushName: 'Estate' } }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await testWhatsAppConnection();

      expect(result.data).toEqual({
        ok: true,
        message: 'Connected to WAHA. +2348031234567 is paired; session status: WORKING.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://waha.example.com/api/sessions/default');
      expect(init.method ?? 'GET').toBe('GET');
      expect(init.headers).toEqual({ 'X-Api-Key': 'waha_fake_key' });
    });

    it('fails the WAHA test when the session is not WORKING', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(wahaConfig);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(session({ status: 'SCAN_QR_CODE', me: null })));

      const result = await testWhatsAppConnection();

      expect(result.data).toEqual({
        ok: false,
        message: 'WAHA session default is SCAN_QR_CODE. Pair the handset in the WAHA dashboard.',
      });
    });

    it('fails the WAHA test when the stored from number is not the paired number (#843)', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ ...wahaConfig, config: { ...waha, fromNumber: '+2358031234567' } });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(session({ status: 'WORKING', me: { id: '2348031234567@c.us' } })));

      const result = await testWhatsAppConnection();

      expect(result.data).toEqual({
        ok: false,
        message: 'From number +2358031234567 is not paired to this WAHA session. Paired phone on this session: +2348031234567.',
      });
    });

    it('says so when a WORKING session reports no paired phone', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(wahaConfig);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(session({ status: 'WORKING' })));

      const result = await testWhatsAppConnection();

      expect(result.data?.ok).toBe(false);
      expect(result.data?.message).toContain('This WAHA session has no paired phone.');
    });

    it('reports a rejected WAHA key without returning the upstream body', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(wahaConfig);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream-detail waha_fake_key', { status: 401 })));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const result = await testWhatsAppConnection();

        expect(result.data?.ok).toBe(false);
        expect(result.data?.message).toContain('WAHA rejected the request (HTTP 401)');
        expect(JSON.stringify(result)).not.toContain('upstream-detail');
        expect(JSON.stringify(result)).not.toContain('waha_fake_key');
      } finally {
        vi.unstubAllGlobals();
        consoleError.mockRestore();
      }
    });

    it('reports an unreachable WAHA server generically', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(wahaConfig);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED waha_fake_key')));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const result = await testWhatsAppConnection();

        expect(result.data).toEqual({
          ok: false,
          message: 'Could not reach the WhatsApp provider. Check server network access and try again.',
        });
      } finally {
        vi.unstubAllGlobals();
        consoleError.mockRestore();
      }
    });
  });

  describe('disconnectWhatsApp', () => {
    it('deactivates the active row and records a DEACTIVATE audit entry', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(manager as never);
      const active = query({
        data: { id: 'row-1', provider: 'meta', phone_number_id: '123456', whatsapp_from_number: null },
        error: null,
      });
      const update = query({ data: null, error: null });
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValueOnce(active).mockReturnValueOnce(update),
      } as never);

      const result = await disconnectWhatsApp();

      expect(result).toEqual({ success: true, data: null, error: null });
      expect(update.update).toHaveBeenCalledWith({ is_active: false, updated_by: 'admin-1' });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DEACTIVATE', entityType: 'whatsapp_provider_credentials', entityId: 'row-1' })
      );
    });

    it('requires WHATSAPP_MANAGE and never queries the database otherwise', async () => {
      vi.mocked(authorizePermission).mockResolvedValue(unauthorized as never);

      const result = await disconnectWhatsApp();

      expect(result).toEqual({ success: false, data: null, error: 'Forbidden' });
      expect(createAdminClient).not.toHaveBeenCalled();
    });
  });
});
