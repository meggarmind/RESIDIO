/**
 * Money for react-pdf documents. The built-in Helvetica fonts have no naira glyph, so
 * `Intl`'s currency style prints a broken character there; the ISO code is printed instead.
 * Screen code keeps `formatCurrency` from `@/lib/utils`.
 */
export function formatPdfCurrency(amount: number, fractionDigits = 2): string {
  const number = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Math.abs(amount));
  return `${amount < 0 ? '-' : ''}NGN ${number}`;
}
