import { describe, expect, it, vi } from 'vitest';
import {
  alertParametersMissing,
  checkParameters,
  runPreflight,
} from '../../../scripts/backup-cron-preflight.mjs';

const SECRET = 'SENTINEL-cron-secret-4f9a1c';
const API_KEY = 'SENTINEL-resend-key-77be02';
const alertEnv = {
  ALERT_RESEND_API_KEY: API_KEY,
  ALERT_EMAIL_FROM: 'alerts@example.com',
  ALERT_EMAIL_TO: 'sysadmin@example.com',
};
const good = { APP_URL: 'https://stage.example.com', CRON_SECRET: SECRET };

describe('checkParameters', () => {
  it.each(['stage', 'production'])('is ok when all are set (%s)', (environment) => {
    expect(checkParameters(environment, good)).toEqual({ environment, missing: [], ok: true });
  });

  it('reports the one missing name', () => {
    expect(checkParameters('stage', { APP_URL: good.APP_URL })).toEqual({
      environment: 'stage',
      missing: ['CRON_SECRET'],
      ok: false,
    });
    expect(checkParameters('production', { CRON_SECRET: SECRET }).missing).toEqual(['APP_URL']);
  });

  it('reports both when none are set', () => {
    expect(checkParameters('production', {}).missing).toEqual(['APP_URL', 'CRON_SECRET']);
  });

  it('treats empty and whitespace-only values as missing', () => {
    expect(checkParameters('stage', { APP_URL: '', CRON_SECRET: '   \n' }).missing).toEqual([
      'APP_URL',
      'CRON_SECRET',
    ]);
  });

  it('rejects a non-https APP_URL', () => {
    expect(checkParameters('stage', { ...good, APP_URL: 'http://stage.example.com' }).ok).toBe(false);
    expect(checkParameters('stage', { ...good, APP_URL: 'stage.example.com' }).ok).toBe(false);
  });

  it('rejects an APP_URL with a path, query or credentials', () => {
    for (const url of [
      'https://stage.example.com/app',
      'https://stage.example.com/?x=1',
      'https://user:pw@stage.example.com',
    ]) {
      expect(checkParameters('stage', { ...good, APP_URL: url }).missing).toEqual(['APP_URL']);
    }
  });

  // The workflow appends `/api/...` to the raw value, so a value that merely normalises
  // to an origin still breaks the call (`https://host//api/...` gets a 308 that curl
  // does not follow, and the run goes green without generating anything).
  it('rejects values that only normalise to an origin', () => {
    for (const url of [
      'https://stage.example.com/',
      'https:stage.example.com',
      'https:/stage.example.com',
      'https:///stage.example.com',
      'https://stage.example.com?',
      'https://stage.example.com#',
      'https://stage.example.com\n',
      ' https://stage.example.com',
      'https://@stage.example.com',
      'HTTPS://stage.example.com',
    ]) {
      expect(checkParameters('stage', { ...good, APP_URL: url }).missing, JSON.stringify(url)).toEqual(['APP_URL']);
    }
  });

  it('accepts a bare https origin, with a port if given', () => {
    expect(checkParameters('stage', { ...good, APP_URL: 'https://stage.example.com' }).ok).toBe(true);
    expect(checkParameters('stage', { ...good, APP_URL: 'https://stage.example.com:8443' }).ok).toBe(true);
  });
});

describe('alertParametersMissing', () => {
  it('names the environment and missing names, never values', () => {
    const result = checkParameters('production', { APP_URL: '', CRON_SECRET: SECRET });
    const payload = alertParametersMissing(result, alertEnv);
    expect(payload.subject).toContain('production');
    expect(payload.subject).toContain('APP_URL');
    expect(payload.to).toEqual(['sysadmin@example.com']);
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(API_KEY);
  });
});

describe('runPreflight', () => {
  it('sends no request when parameters are ok', async () => {
    const fetchImpl = vi.fn();
    const out = await runPreflight('stage', { ...good, ...alertEnv }, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.outputs).toEqual({ ok: 'true', missing: '' });
    expect(out.exitCode).toBe(0);
  });

  it('sends exactly one Resend request when parameters are missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const out = await runPreflight('stage', { CRON_SECRET: SECRET, ...alertEnv }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.body).not.toContain(SECRET);
    expect(out.outputs).toEqual({ ok: 'false', missing: 'APP_URL' });
    expect(out.exitCode).toBe(0);
    expect(out.logs.join('\n')).not.toContain(SECRET);
    expect(out.logs.join('\n')).not.toContain(API_KEY);
  });

  it('fails loudly when the alert parameters are themselves missing', async () => {
    const fetchImpl = vi.fn();
    const out = await runPreflight('production', { CRON_SECRET: SECRET }, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.exitCode).not.toBe(0);
    expect(out.outputs.ok).toBe('false');
    expect(out.logs.some((line) => line.startsWith('::error::'))).toBe(true);
    expect(out.logs.join('\n')).not.toContain(SECRET);
  });

  it('fails when Resend rejects the alert or the request throws', async () => {
    const rejected = await runPreflight('stage', alertEnv, vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(rejected.exitCode).not.toBe(0);
    const thrown = await runPreflight('stage', alertEnv, vi.fn().mockRejectedValue(new Error('boom')));
    expect(thrown.exitCode).not.toBe(0);
  });
});
