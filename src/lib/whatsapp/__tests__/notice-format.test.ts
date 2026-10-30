import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatNotice } from '@/lib/whatsapp/notice-format';
import { buildNotice, loadNoticeEstateName } from '@/lib/whatsapp/build-notice';
import { getRawSettingsAsService } from '@/lib/settings/service';

vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: vi.fn() }));

/** #1351: a push notice starts with an icon and bold title and ends with a footer, so it never reads like a bot reply. */
describe('formatNotice', () => {
  it('puts the bold title first, then the body, then the italic footer', () => {
    expect(formatNotice('payment_received', 'Amount: *NGN 100*', 'Opera Estate')).toBe(
      '*✅ Payment received*\n\nAmount: *NGN 100*\n\n_Automatic notice from Opera Estate_'
    );
  });

  it('trims the body so the blank lines around it stay single', () => {
    expect(formatNotice('announcement', '\n  Water off  \n', 'Opera Estate')).toBe(
      '*📢 Announcement*\n\nWater off\n\n_Automatic notice from Opera Estate_'
    );
  });

  it('names the estate office when the estate name is blank', () => {
    expect(formatNotice('estate_notice', 'Hi', '  ')).toBe('*📌 Estate notice*\n\nHi\n\n_Automatic notice from the estate office_');
  });
});

describe('loadNoticeEstateName', () => {
  beforeEach(() => vi.mocked(getRawSettingsAsService).mockReset());

  it('reads the estate name from settings', async () => {
    vi.mocked(getRawSettingsAsService).mockResolvedValue({ status: 'ok', values: new Map([['estate_name', ' Opera Estate ']]) });
    expect(await loadNoticeEstateName()).toBe('Opera Estate');
    expect(await buildNotice('payment_reminder', 'Due soon')).toBe(
      '*🔔 Payment reminder*\n\nDue soon\n\n_Automatic notice from Opera Estate_'
    );
  });

  it('falls back to the estate office when the read fails', async () => {
    vi.mocked(getRawSettingsAsService).mockResolvedValue({ status: 'error', message: 'down' });
    expect(await loadNoticeEstateName()).toBe('the estate office');
  });
});
