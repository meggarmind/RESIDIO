import { renderToBuffer } from '@react-pdf/renderer';
import type { AccountStatementData } from '@/lib/billing/account-statement-data';
import { getEstateLogoUrl } from '@/lib/branding/estate-logo-server';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { AccountStatementPDF } from '@/lib/pdf/account-statement';

/**
 * The one account statement PDF (#1253): the admin download (/api/statements), the WhatsApp chat PDF
 * and the emailed PDF all render through here, with the estate name, address and logo from Settings.
 * Build the data with loadAccountStatement, so a change to either shows on every statement.
 */
export async function renderAccountStatementPdf(data: AccountStatementData): Promise<Buffer> {
  const settings = await getRawSettingsAsService(['estate_name', 'estate_address']);
  const text = (key: string) => {
    const value = settings.status === 'ok' ? settings.values.get(key) : null;
    return typeof value === 'string' ? value.trim() : '';
  };
  return renderToBuffer(AccountStatementPDF({
    data,
    estateName: text('estate_name') || 'Residio Estate',
    estateAddress: text('estate_address'),
    estateLogoUrl: await getEstateLogoUrl(),
  }));
}
