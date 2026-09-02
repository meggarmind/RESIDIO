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

function stubEnvCredentials() {
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'env-access-token');
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'env-phone-number-id');
  vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'env-verify-token');
  vi.stubEnv('WHATSAPP_APP_SECRET', 'env-app-secret');
}

describe('getWhatsAppConfig resolution and caching', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('prefers the database config over env vars when both are present', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'ok', config: dbConfig }),
    }));
    stubEnvCredentials();

    const { getWhatsAppConfig } = await import('@/lib/whatsapp/config');

    expect(await getWhatsAppConfig()).toEqual(dbConfig);
  });

  it('falls back to env vars when there is no active database row', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'absent' }),
    }));
    stubEnvCredentials();

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
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'absent' }),
    }));

    const { getWhatsAppConfig, isWhatsAppConfigured } = await import('@/lib/whatsapp/config');

    expect(await getWhatsAppConfig()).toBeNull();
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  // The regression this whole result-type exists to prevent. A stored row that
  // cannot be read must NOT silently hand over to environment credentials:
  // that would defeat a token rotation on any instance whose encryption key is
  // wrong, and verify inbound signatures against the wrong app secret.
  it('does NOT fall back to env vars when a stored row exists but is unusable', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi
        .fn()
        .mockResolvedValue({ status: 'unusable', reason: 'stored credentials could not be decrypted' }),
    }));
    stubEnvCredentials();

    const { resolveWhatsAppConfig, getWhatsAppConfig, isWhatsAppConfigured } = await import(
      '@/lib/whatsapp/config'
    );

    const resolved = await resolveWhatsAppConfig();
    expect(resolved.status).toBe('unusable');
    expect(resolved).toMatchObject({ reason: 'stored credentials could not be decrypted' });

    // and it must not masquerade as a working env-var configuration
    expect(await getWhatsAppConfig()).toBeNull();
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  it('distinguishes unconfigured from unusable', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'absent' }),
    }));

    const { resolveWhatsAppConfig } = await import('@/lib/whatsapp/config');

    expect((await resolveWhatsAppConfig()).status).toBe('unconfigured');
  });

  it('caches the resolved config and only re-reads the database after invalidation', async () => {
    const loader = vi.fn().mockResolvedValue({ status: 'ok', config: dbConfig });
    vi.doMock('@/lib/whatsapp/config-db', () => ({ loadWhatsAppConfigFromDb: loader }));

    const { getWhatsAppConfig, invalidateWhatsAppConfigCache } = await import('@/lib/whatsapp/config');

    await getWhatsAppConfig();
    await getWhatsAppConfig();
    expect(loader).toHaveBeenCalledTimes(1);

    invalidateWhatsAppConfigCache();
    await getWhatsAppConfig();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  // Previously a null result was never cached, so an unconfigured estate --
  // which is the current state -- hit the database on every inbound webhook
  // POST, authenticated or not.
  it('caches negative results so an unconfigured estate does not query per request', async () => {
    const loader = vi.fn().mockResolvedValue({ status: 'absent' });
    vi.doMock('@/lib/whatsapp/config-db', () => ({ loadWhatsAppConfigFromDb: loader }));

    const { getWhatsAppConfig } = await import('@/lib/whatsapp/config');

    await getWhatsAppConfig();
    await getWhatsAppConfig();
    await getWhatsAppConfig();

    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('loadWhatsAppConfigFromDb failure handling', () => {
  beforeEach(() => {
    // vi.doMock registrations persist across vi.resetModules() (which only
    // clears the module instance cache, not mock factories), so the previous
    // describe block's config-db mock must be explicitly removed to exercise
    // the real implementation here.
    vi.doUnmock('@/lib/whatsapp/config-db');
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('reports unusable (never throws) when a stored credential fails to decrypt', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createAdminClient: vi.fn(() => ({
        from: () => ({
          select: () => ({
            eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      provider: 'meta',
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
      })),
    }));
    vi.doMock('@/lib/encryption', () => ({
      decrypt: vi.fn(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      }),
    }));

    const { loadWhatsAppConfigFromDb } = await import('@/lib/whatsapp/config-db');

    const result = await loadWhatsAppConfigFromDb();
    expect(result.status).toBe('unusable');

    // And through the public API: still not a throw, and still not env creds.
    stubEnvCredentials();
    const { getWhatsAppConfig } = await import('@/lib/whatsapp/config');
    await expect(getWhatsAppConfig()).resolves.toBeNull();
  });

  it('reports unusable when the credential lookup itself errors', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createAdminClient: vi.fn(() => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: 'connection reset' } }),
            }),
          }),
        }),
      })),
    }));

    const { loadWhatsAppConfigFromDb } = await import('@/lib/whatsapp/config-db');

    const result = await loadWhatsAppConfigFromDb();
    expect(result.status).toBe('unusable');
  });
});
