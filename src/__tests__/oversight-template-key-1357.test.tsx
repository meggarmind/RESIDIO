// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const pathname = { current: '/' };
const keys: (string | undefined)[] = [];
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('@/components/ui/page-transition', () => ({
  PageTransition: ({ transitionKey, children }: { transitionKey?: string; children: React.ReactNode }) => {
    keys.push(transitionKey);
    return <>{children}</>;
  },
}));

import Template from '@/app/template';

const keyFor = (path: string) => {
  pathname.current = path;
  render(<Template>x</Template>);
  cleanup();
  return keys.at(-1);
};

afterEach(() => cleanup());

describe('root template animation key (#1357)', () => {
  it('gives every Oversight page one key, so its layout and menu stay mounted', () => {
    const oversight = ['/system', '/system/audit-logs', '/analytics', '/analytics/announcements', '/reports', '/reports/financial-overview'];
    expect(new Set(oversight.map(keyFor))).toEqual(new Set(['oversight']));
  });

  it('keeps one key for Settings and the pathname elsewhere', () => {
    expect(keyFor('/settings/estate')).toBe('/settings');
    expect(keyFor('/residents')).toBe('/residents');
    expect(keyFor('/systematic')).toBe('/systematic');
  });
});

describe('Oversight route group (#1357)', () => {
  it('has one layout for /system, /analytics and /reports', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = (p: string) => join(process.cwd(), 'src/app/(dashboard)/(oversight)', p);
    expect(existsSync(dir('layout.tsx'))).toBe(true);
    for (const area of ['system', 'analytics', 'reports']) {
      expect(existsSync(dir(`${area}/layout.tsx`)), area).toBe(false);
    }
  });
});
