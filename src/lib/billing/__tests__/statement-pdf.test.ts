import { describe, expect, it, vi } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { AccountStatementPDF } from '@/lib/pdf/account-statement';
import { renderStatementPdf, statementEstateName } from '@/lib/billing/statement-pdf';
import type { AccountStatementData } from '@/lib/billing/account-statement-data';

vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF')) }));
vi.mock('@/lib/pdf/account-statement', () => ({ AccountStatementPDF: vi.fn(() => null) }));
vi.mock('@/lib/branding/estate-logo-server', () => ({ getEstateLogoUrl: vi.fn().mockResolvedValue('https://logo.test/l.png') }));
vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: vi.fn(async (keys: string[]) => ({
    status: 'ok',
    values: new Map(([['estate_name', ' Palm Estate '], ['estate_address', ' 1 Palm Road ']] as Array<[string, string]>).filter(([key]) => keys.includes(key))),
  })),
}));

describe('renderStatementPdf (#1253)', () => {
  it('renders the statement with the estate name, address and logo from settings', async () => {
    const statement = { closingBalance: 0 } as unknown as AccountStatementData;
    const pdf = await renderStatementPdf(statement);
    expect(pdf.toString()).toBe('%PDF');
    expect(vi.mocked(AccountStatementPDF)).toHaveBeenCalledWith({
      data: statement,
      estateName: 'Palm Estate',
      estateAddress: '1 Palm Road',
      estateLogoUrl: 'https://logo.test/l.png',
    });
    expect(vi.mocked(renderToBuffer)).toHaveBeenCalledTimes(1);
  });

  it('is the render both the admin route and the WhatsApp delivery use', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['src/app/api/statements/route.ts', 'src/lib/whatsapp/statement-delivery.ts']) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain("from '@/lib/billing/statement-pdf'");
      expect(source).not.toContain('AccountStatementPDF');
      expect(source).not.toContain('renderToBuffer');
    }
  });

  it('falls back to a default estate name', async () => {
    const { getRawSettingsAsService } = await import('@/lib/settings/service');
    vi.mocked(getRawSettingsAsService).mockResolvedValueOnce({ status: 'error', message: 'down' });
    expect(await statementEstateName()).toBe('Residio Estate');
  });
});
