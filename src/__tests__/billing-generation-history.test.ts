import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_SECTIONS } from '@/config/navigation';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  buildGenerationResultsCsv,
} from '@/components/billing/generation-history-panel';
import type { GenerationHistoryEntry } from '@/lib/billing/invoice-generation-history';

const baseEntry: GenerationHistoryEntry = {
  id: 'run-1234567890abcdef',
  generated_at: '2026-08-01T10:00:00.000Z',
  generated_by: null,
  trigger_type: 'manual',
  target_period: '2026-08',
  generated_count: 12,
  skipped_count: 3,
  error_count: 2,
  skip_reasons: [
    { house: 'H-01', reason: 'No active billing profile' },
    { house: 'H-02', reason: 'No billable residents' },
    { house: 'H-03', reason: 'Invoice already exists' },
  ],
  errors: ['Failed to create invoice for H-07', 'Wallet allocation failed for H-09'],
  duration_ms: 1500,
  created_at: '2026-08-01T10:00:00.000Z',
  actor: null,
  source: 'run',
  email_queued: 12,
  email_sent: 11,
  email_failed: 1,
};

describe('generation history results export', () => {
  it('builds csv with run metrics', () => {
    const csv = buildGenerationResultsCsv(baseEntry);

    expect(csv.split('\n')[0]).toBe('Metric,Value');
    expect(csv).toContain('Run ID,run-1234567890abcdef');
    expect(csv).toContain('Period,2026-08');
    expect(csv).toContain('Generated,12');
    expect(csv).toContain('Skipped,3');
    expect(csv).toContain('Errors,2');
    expect(csv).toContain('Email queued,12');
    expect(csv).toContain('Email sent,11');
    expect(csv).toContain('Email failed,1');
  });

  it('includes quoted skip reasons and errors sections', () => {
    const lines = buildGenerationResultsCsv(baseEntry).split('\n');

    expect(lines.filter((line) => line.startsWith('"H-')).length).toBe(3);
    expect(lines.filter((line) => line.startsWith('"Failed to') || line.startsWith('"Wallet')).length).toBe(2);
  });

  it('falls back to zeros and placeholders when details are missing', () => {
    const csv = buildGenerationResultsCsv({
      ...baseEntry,
      target_period: null,
      email_queued: undefined,
      email_sent: undefined,
      email_failed: undefined,
      skip_reasons: null,
      errors: null,
    });

    expect(csv).toContain('Period,N/A');
    expect(csv).toContain('Email queued,0');
    expect(csv).toContain('Email sent,0');
    expect(csv).toContain('Email failed,0');
  });
});

describe('billing navigation', () => {
  it('exposes Generate Invoices as a child of Invoices & Dues pointing at /billing/generate', () => {
    const billing = ADMIN_NAV_SECTIONS
      .flatMap((section) => section.items)
      .find((item) => item.id === 'billing');

    expect(billing?.children).toHaveLength(1);
    expect(billing?.children?.[0]).toMatchObject({
      id: 'billing-generate',
      title: 'Generate Invoices',
      href: '/billing/generate',
      permissions: [PERMISSIONS.BILLING_CREATE_INVOICE],
    });
  });
});
