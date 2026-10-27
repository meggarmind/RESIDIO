type ProfileJoin = { name: string | null } | { name: string | null }[] | null | undefined;

/**
 * The name of what an invoice bills (#1253): the item names in its rate snapshot, else the billing
 * profile name. Profiles are named for today's rate ("10k per month"), so an older invoice at another
 * rate would carry a wrong label; the snapshot was written when the invoice was raised.
 */
export function invoiceChargeName(invoice: { rate_snapshot?: unknown; billing_profile?: ProfileJoin }): string | null {
  const items = (invoice.rate_snapshot as { items?: Array<{ name?: unknown }> } | null | undefined)?.items;
  const names = Array.isArray(items)
    ? items.map((item) => (typeof item?.name === 'string' ? item.name.trim() : '')).filter(Boolean)
    : [];
  if (names.length) return [...new Set(names)].join(' + ');
  const profile = Array.isArray(invoice.billing_profile) ? invoice.billing_profile[0] : invoice.billing_profile;
  return profile?.name?.trim() || null;
}
