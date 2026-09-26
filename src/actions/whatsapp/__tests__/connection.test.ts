import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { resolveWhatsAppConfig } from '@/lib/whatsapp/config';
import {
  getWhatsAppConnectionStatus,
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

describe('WhatsApp connection actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isEncryptionConfigured).mockReturnValue(true);
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
      vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

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
      vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

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

    it('tests a Chatmaid connection with an authenticated read, not a send', async () => {
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
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      try {
        const result = await testWhatsAppConnection();

        expect(result.data).toEqual({ ok: true, message: 'Connected to the Chatmaid API.' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://developers-api.chatmaid.net/v1/phone-numbers');
        expect(init.method ?? 'GET').toBe('GET');
        expect(init.headers).toEqual({ Authorization: 'Bearer sk_test_fake_key' });
      } finally {
        vi.unstubAllGlobals();
      }
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
