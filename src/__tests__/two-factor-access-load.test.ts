import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadAccessWithRetry, type ProfileLoadResult } from '@/lib/auth/access-load';

// #1341: after the two-factor screen the app opened with the empty permission set read
// before the code was accepted, so only the Dashboard menu showed until a refresh.

const noWait = () => Promise.resolve();

function loader(results: ProfileLoadResult[]) {
  return vi.fn(async () => results.shift() ?? 'failed');
}

describe('loadAccessWithRetry (#1341)', () => {
  it('stops at the first loaded result', async () => {
    const load = loader(['loaded', 'failed']);
    await expect(loadAccessWithRetry(load, { wait: noWait })).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries an incomplete or failed load until it is loaded', async () => {
    const load = loader(['incomplete', 'failed', 'loaded']);
    await expect(loadAccessWithRetry(load, { wait: noWait })).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('gives up after the set number of tries and returns the last result', async () => {
    const load = loader(['failed', 'failed', 'incomplete', 'loaded']);
    await expect(loadAccessWithRetry(load, { wait: noWait })).resolves.toBe('incomplete');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('waits longer before each retry', async () => {
    const wait = vi.fn(noWait);
    await loadAccessWithRetry(loader(['failed', 'failed', 'failed']), { wait, delayMs: 100 });
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });
});

describe('two-factor sign-in wiring (#1341)', () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8').replace(/\s+/g, '');

  it('the provider does not load the session on the two-factor screen', () => {
    const source = read('src/lib/auth/auth-provider.tsx');
    expect(source).toContain("NO_BOOTSTRAP_PATHS=newSet(['/login','/auth/verify-2fa'])");
    expect(source).toContain('if(NO_BOOTSTRAP_PATHS.has(pathname)){');
  });

  it('a role with no access rows is never cached', () => {
    const source = read('src/lib/auth/auth-provider.tsx');
    expect(source).toMatch(/access\.status==='no-access'\)\{[^}]*accessIncomplete=true;cacheUnsafe=true;/);
  });

  it('the screen loads access before it opens the app', () => {
    const source = read('src/app/auth/verify-2fa/verify-2fa-form.tsx');
    expect(source).toContain('awaitloadAccessWithRetry(refreshProfile)');
    expect(source).toContain('}else{awaitenterApp();}');
    expect(source).not.toContain('router.push(redirectTo);}}catch');
  });
});
