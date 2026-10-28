import { chargeLabel } from '@/lib/whatsapp/assistant-format';

/**
 * What an invoice is for, named as it was billed (#1253): the item names on its rate snapshot. The
 * billing profile's current name is only a fallback, because profiles are renamed for today's rate.
 */
export function invoiceLabel(invoice: { invoice_type: string | null; rate_snapshot?: unknown; profileName: string | null; periodStart: string | null }): string {
  const items = (invoice.rate_snapshot as { items?: unknown } | null | undefined)?.items;
  const names = Array.isArray(items)
    ? [...new Set(items.map((item) => (typeof item?.name === 'string' ? item.name.trim() : '')).filter(Boolean))]
    : [];
  return chargeLabel({
    invoice_type: invoice.invoice_type,
    profileName: names.length ? names.join(' + ') : invoice.profileName,
    periodStart: invoice.periodStart,
  });
}
