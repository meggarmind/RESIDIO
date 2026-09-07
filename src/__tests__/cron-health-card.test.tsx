import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { CronHealthCard } from '@/components/dashboard/cron-health-card';

/**
 * Regression test for issue #106.
 *
 * `/settings/system` and `/settings/system/health` crashed to the error
 * boundary with `Cannot read properties of undefined (reading 'overall')`.
 * `CronHealthCard` renders with `enabled: mounted` (see the component's own
 * comment above its status-resolution lines), so during SSR / static
 * prerendering -- and briefly on the client before hydration -- the query is
 * disabled: `isLoading` is `false`, `error` is `null`, and `data` is
 * genuinely `undefined`. The buggy code cast `data` directly
 * (`(data as { overall?: string }).overall`) instead of optional-chaining
 * it, so it threw the instant that branch was reached instead of falling
 * through to the `'unknown'` fallback.
 *
 * `useQuery` is mocked directly (rather than mocking the server action it
 * calls) so these tests drive the exact settled-with-no-data shape the
 * issue describes, independent of how the query function itself resolves.
 */

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

vi.mock('@/actions/system/cron-status', () => ({
  getCronStatus: vi.fn(),
}));

const mockedUseQuery = vi.mocked(useQuery);

function mockQueryResult(data: unknown) {
  mockedUseQuery.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  } as unknown as ReturnType<typeof useQuery>);
}

describe('CronHealthCard', () => {
  it('does not crash and falls back to "unknown" when the query has settled with data: undefined', () => {
    mockQueryResult(undefined);

    expect(() => renderToStaticMarkup(<CronHealthCard />)).not.toThrow();

    const markup = renderToStaticMarkup(<CronHealthCard />);
    expect(markup).toContain('unknown');
  });

  it('does not crash and falls back to "unknown" when the query has settled with data: {} (empty payload)', () => {
    mockQueryResult({});

    expect(() => renderToStaticMarkup(<CronHealthCard />)).not.toThrow();

    const markup = renderToStaticMarkup(<CronHealthCard />);
    expect(markup).toContain('unknown');
  });

  it('still resolves overall status from a `status`-shaped payload', () => {
    mockQueryResult({ status: 'healthy', jobs: [], lastChecked: '2026-01-01T00:00:00.000Z' });

    const markup = renderToStaticMarkup(<CronHealthCard />);
    expect(markup).toContain('healthy');
  });
});
