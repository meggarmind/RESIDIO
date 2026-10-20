import { normalizePhoneNumber } from '@/lib/sms/termii';

/**
 * A WhatsApp from-number (the bridge phone) must never be the number the
 * communications override redirects WhatsApp to: the redirected message would
 * be sent to the sender itself and silently vanish (#904).
 *
 * Pure and client-safe: the settings actions, both settings pages and the send
 * seam all use this one comparison.
 */

export interface OverrideNumbers {
  phone: string;
  whatsappPhone: string;
}

export type OverrideNumberField = 'whatsappPhone' | 'phone';

/** Blank on either side is never a conflict. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? '').trim();
  const right = (b ?? '').trim();
  return left !== '' && right !== '' && normalizePhoneNumber(left) === normalizePhoneNumber(right);
}

/** The number the resolver redirects WhatsApp to: the WhatsApp override, else the override phone. */
export function effectiveOverrideWhatsAppTarget(override: OverrideNumbers): { field: OverrideNumberField; value: string } {
  const whatsappPhone = override.whatsappPhone.trim();
  return whatsappPhone !== ''
    ? { field: 'whatsappPhone', value: whatsappPhone }
    : { field: 'phone', value: override.phone.trim() };
}

/** Error for saving a from-number that equals the effective override WhatsApp target, else null. */
export function fromNumberConflict(fromNumber: string, override: OverrideNumbers): string | null {
  const target = effectiveOverrideWhatsAppTarget(override);
  if (!samePhone(fromNumber, target.value)) return null;
  return target.field === 'whatsappPhone'
    ? 'From number is the same as the WhatsApp number in Communications override settings. Redirected messages would be sent to the bridge phone itself. Change one of them.'
    : 'From number is the same as the override phone in Communications override settings, which WhatsApp uses because the override WhatsApp number is blank. Redirected messages would be sent to the bridge phone itself. Change one of them.';
}

/**
 * Error for saving override numbers that would redirect WhatsApp to the saved
 * from-number, with the offending field. The override phone only counts while
 * the override WhatsApp number is blank (it is then the WhatsApp fallback).
 */
export function overrideNumberConflict(
  override: OverrideNumbers,
  fromNumber: string | null | undefined
): { field: OverrideNumberField; message: string } | null {
  const target = effectiveOverrideWhatsAppTarget(override);
  if (!samePhone(target.value, fromNumber)) return null;
  return target.field === 'whatsappPhone'
    ? {
        field: 'whatsappPhone',
        message: 'The override WhatsApp number is the same as the WhatsApp from-number in WhatsApp connection settings. Redirected messages would be sent to the bridge phone itself.',
      }
    : {
        field: 'phone',
        message: 'The override phone is the same as the WhatsApp from-number in WhatsApp connection settings, and WhatsApp uses it because the override WhatsApp number is blank. Redirected messages would be sent to the bridge phone itself.',
      };
}
