import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActionLogTable } from '@/components/system/action-log-table';
import type { SystemActionLogRow } from '@/actions/system/action-log';

const base = { total: 0, page: 1, limit: 25, onPageChange: vi.fn() };

describe('ActionLogTable', () => {
  it('renders the empty state', () => {
    const html = renderToStaticMarkup(<ActionLogTable {...base} rows={[]} />);
    expect(html).toContain('No actions recorded');
  });

  it('renders the filtered empty state', () => {
    const html = renderToStaticMarkup(<ActionLogTable {...base} rows={[]} hasFilters />);
    expect(html).toContain('No entries match the current filters.');
  });

  it('renders an error state', () => {
    const html = renderToStaticMarkup(<ActionLogTable {...base} rows={null} error="denied" />);
    expect(html).toContain('Could not load the action log: denied');
  });

  it('renders rows with outcome, duration, error and collapsed summary JSON', () => {
    const row: SystemActionLogRow = {
      id: 'r1',
      occurred_at: '2026-10-15T10:00:00.000Z',
      source: 'cron:process-notifications',
      action: 'run',
      outcome: 'failure',
      summary: { sent: 3 },
      error_message: 'smtp down',
      duration_ms: 120,
    };
    const html = renderToStaticMarkup(<ActionLogTable {...base} rows={[row]} total={1} />);
    expect(html).toContain('cron:process-notifications');
    expect(html).toContain('failure');
    expect(html).toContain('120 ms');
    expect(html).toContain('smtp down');
    expect(html).toContain('<details>');
    expect(html).toContain('&quot;sent&quot;: 3');
  });
});
