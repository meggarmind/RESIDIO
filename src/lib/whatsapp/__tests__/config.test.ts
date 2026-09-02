import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetaWhatsAppConfig } from '@/lib/whatsapp/config';

const dbConfig: MetaWhatsAppConfig = {
  provider: 'meta',
  accessToken: 'db-access-token',
  phoneNumberId: 'db-phone-number-id',
  verifyToken: 'db-verify-token',
  appSecret: 'db-app-secret',
  apiVersion: 'v23.0',
  graphBaseUrl: 'https://graph.facebook.com',
};

describe('getWhatsAppConfig resolution and caching', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('prefers the database config over env vars when both are present', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue(dbConfig),
    }));
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'env-access-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'env-phone-number-id');
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'env-verify-token');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'env-app-secret');

    const { getWhatsAppConfig } = await import('@/lib/whatsapp/config');

    expect(await getWhatsAppConfig()).toEqual(dbConfig);
  });

  it('falls back to env vars when there is no active database row', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue(null),
    }));
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'env-access-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'env-phone-number-id');
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'env-verify-token');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'env-app-secret');

    const { getWhatsAppConfig } = await import('@/lib/whatsapp/config');

    expect(await getWhatsAppConfig()).toEqual({
      provider: 'meta',
      accessToken: 'env-access-token',
      phoneNumberId: 'env-phone-number-id',
      verifyToken: 'env-verify-token',
      appSecret: 'env-app-secret',
      apiVersion: 'v23.0',
      graphBaseUrl: 'https://graph.facebook.com',
    });
  });

  it('returns null when neither the database nor env vars are configured', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue(null),
    }));

    const { getWhatsAppConfig, isWhatsAppConfigured } = await import('@/lib/whatsapp/config');

    expect(await getWhatsAppConfig()).toBeNull();
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  it('caches the resolved config and only re-reads the database after invalidation', async () => {
    const loader = vi.fn().mockResolvedValue(dbConfig);
    vi.doMock('@/lib/whatsapp/config-db', () => ({ loadWhatsAppConfigFromDb: loader }));

    const { getWhatsAppConfig, invalidateWhatsAppConfigCache } = await import('@/lib/whatsapp/config');

    await getWhatsAppConfig();
    await getWhatsAppConfig();
    expect(loader).toHaveBeenCalledTimes(1);

    invalidateWhatsAppConfigCache();
    await getWhatsAppConfig();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('loadWhatsAppConfigFromDb decrypt failure handling', () => {
  beforeEach(() => {
    // vi.doMock registrations persist across vi.resetModules() (which only
    // clears the module instance cache, not mock factories), so the
    // previous describe block's config-db mock must be explicitly removed
    // to exercise the real implementation here.
    vi.doUnmock('@/lib/whatsapp/config-db');
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns null (never throws) when a stored credential fails to decrypt', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createAdminClient: vi.fn(() => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    access_token_encrypted: 'corrupted-ciphertext',
                    verify_token_encrypted: 'corrupted-ciphertext',
                    app_secret_encrypted: 'corrupted-ciphertext',
                    phone_number_id: 'db-phone-number-id',
                    api_version: 'v23.0',
                    graph_base_url: 'https://graph.facebook.com',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })),
    }));
    vi.doMock('@/lib/encryption', () => ({
      decrypt: vi.fn(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      }),
    }));

    // getWhatsAppConfig() drives loadWhatsAppConfigFromDb() as its first
    // resolution step, so this also proves a decrypt failure surfaces as
    // `null` through the public API rather than rejecting.
    const { getWhatsAppConfig } = await import('@/lib/whatsapp/config');

    await expect(getWhatsAppConfig()).resolves.toBeNull();
  });
});
