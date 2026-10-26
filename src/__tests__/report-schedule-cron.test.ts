import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: {
    id: 'sched-1',
    name: 'Monthly finance',
    report_type: 'financial_overview',
    frequency: 'monthly',
    recipients: ['treasurer@example.com'],
    created_by: null,
  },
  scheduleUpdate: vi.fn(),
  archiveInsert: vi.fn(),
  upload: vi.fn(),
  sendEmail: vi.fn(),
  renderReportPdf: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'report_schedules') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({ order: async () => ({ data: [mocks.schedule], error: null }) }),
            }),
          }),
          update: (values: unknown) => {
            mocks.scheduleUpdate(values);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      return {
        insert: (values: unknown) => {
          mocks.archiveInsert(values);
          return { select: () => ({ single: async () => ({ data: { id: 'a1' }, error: null }) }) };
        },
      };
    },
    storage: { from: () => ({ upload: mocks.upload }) },
  }),
}));
vi.mock('@/lib/reports/report-generator', () => ({
  generateReportWithClient: async () => ({ report: { data: {} }, error: null }),
}));
vi.mock('@/lib/pdf/reports/renderer', () => ({
  renderReportPdf: mocks.renderReportPdf,
}));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: async () => ({ estateName: 'Palm Grove Estate', estateAddress: '1 Palm Road' }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));

import { processDueSchedules } from '@/lib/reports/process-schedules';

// #999: the one scheduled-report job must save, email and advance a due schedule.
describe('processDueSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.renderReportPdf.mockResolvedValue(Buffer.from('pdf'));
    mocks.sendEmail.mockResolvedValue({ success: true });
  });

  it('archives the report, emails recipients and advances next_run_at', async () => {
    const result = await processDueSchedules();

    expect(result).toEqual({ processed: 1, failed: 0, errors: [] });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.archiveInsert).toHaveBeenCalledWith(
      expect.objectContaining({ schedule_id: 'sched-1', recipients: ['treasurer@example.com'] }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [{ email: 'treasurer@example.com', name: 'Monthly finance' }] }),
    );
    // #1203: the PDF and the email body carry the Settings estate, not the product name.
    expect(mocks.renderReportPdf).toHaveBeenCalledWith('financial_overview', {}, 'Palm Grove Estate');
    const body = mocks.sendEmail.mock.calls[0][0].react;
    expect(body.props).toMatchObject({ estateName: 'Palm Grove Estate', preview: 'Financial Overview from Palm Grove Estate' });
    const update = mocks.scheduleUpdate.mock.calls[0][0] as { next_run_at: string; last_run_at: string };
    expect(new Date(update.next_run_at).getTime()).toBeGreaterThan(new Date(update.last_run_at).getTime());
  });

  it('does not advance next_run_at when the email fails', async () => {
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'smtp down' });

    const result = await processDueSchedules();

    expect(result.failed).toBe(1);
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled();
  });
});
