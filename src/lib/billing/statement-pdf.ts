import { renderToBuffer } from '@react-pdf/renderer';
import { getEstateLogoUrl } from '@/lib/branding/estate-logo-server';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { AccountStatementPDF } from '@/lib/pdf/account-statement';
import type { AccountStatementData } from '@/lib/billing/account-statement-data';

/** The estate name on statements, from settings. */
export async function statementEstateName(): Promise<string> {
  const settings = await getRawSettingsAsService(['estate_name']);
  const value = settings.status === 'ok' ? settings.values.get('estate_name') : null;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Residio Estate';
}

/**
 * The one account statement PDF render (#1253), shared by the admin route and WhatsApp (chat and
 * email), so a statement change reaches every form.
 */
export async function renderStatementPdf(statement: AccountStatementData): Promise<Buffer> {
  const settings = await getRawSettingsAsService(['estate_address']);
  const address = settings.status === 'ok' ? settings.values.get('estate_address') : null;
  return renderToBuffer(AccountStatementPDF({
    data: statement,
    estateName: await statementEstateName(),
    estateAddress: typeof address === 'string' ? address.trim() : '',
    estateLogoUrl: await getEstateLogoUrl(),
  }));
}
