import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amount);
}

// Format date as dd/mm/yyyy
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB'); // Returns dd/mm/yyyy
}

// Format date and time as dd/MM/yyyy hh:mmtt (12-hour format)
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${day}/${month}/${year} ${hours.toString().padStart(2, '0')}:${minutes}${ampm}`;
}

// Format validity period as "Valid from X to Y"
export function formatValidityPeriod(from: Date | string, until: Date | string | null): string {
  const fromFormatted = formatDateTime(from);
  if (!until) return `Valid from ${fromFormatted}`;
  const untilFormatted = formatDateTime(until);
  return `Valid from ${fromFormatted} to ${untilFormatted}`;
}

// Get smart relative time display (months/days/hours/minutes)
export function getRelativeTimeDisplay(futureDate: Date | string): string {
  const now = new Date();
  const target = typeof futureDate === 'string' ? new Date(futureDate) : futureDate;
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return 'Expired';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths > 0) return `${diffMonths}mo`;
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMinutes > 0) return `${diffMinutes}m`;
  return '<1m';
}

/**
 * Sanitize search input for use with PostgREST/Supabase ilike queries.
 * Escapes special pattern characters to prevent injection attacks.
 *
 * Special characters in PostgreSQL LIKE patterns:
 * - % matches any sequence of characters
 * - _ matches any single character
 * - \ is the escape character
 *
 * @param input - The raw search input from user
 * @returns Sanitized string safe for use in ilike queries
 */
export function sanitizeSearchInput(input: string): string {
  if (!input) return '';

  // Escape backslash first (order matters), then other special chars
  return input
    .replace(/\\/g, '\\\\')  // \ -> \\
    .replace(/%/g, '\\%')    // % -> \%
    .replace(/_/g, '\\_');   // _ -> \_
}

/**
 * Format property display with shortname as primary identifier.
 *
 * When a property has a shortname (e.g., "OAK-10A"), it returns:
 * - Compact: "OAK-10A"
 * - Full: "OAK-10A • 10A Oak Avenue"
 *
 * Fallback when no shortname:
 * - "10A Oak Avenue" or "10A" if no street
 *
 * @param house - Property object with optional short_name, house_number, and street
 * @param format - 'compact' for shortname only, 'full' for shortname with address
 */
export function formatPropertyDisplay(
  house: {
    short_name?: string | null;
    house_number?: string | null;
    street?: { name?: string | null } | null;
  } | null | undefined,
  format: 'compact' | 'full' = 'compact'
): string {
  if (!house) return '';

  const shortname = house.short_name;
  const houseNumber = house.house_number || '';
  const streetName = house.street?.name || '';

  // Build full address for fallback or full format
  const fullAddress = streetName
    ? `${houseNumber} ${streetName}`.trim()
    : houseNumber;

  // Compact: prefer shortname, fallback to house number
  if (format === 'compact') {
    return shortname || houseNumber || '';
  }

  // Full: shortname with address context
  if (shortname) {
    return fullAddress ? `${shortname} • ${fullAddress}` : shortname;
  }

  return fullAddress;
}

/**
 * Get property shortname for display, with fallback to house number.
 * Use this for table columns, badges, and compact displays.
 */
export function getPropertyShortname(
  house: { short_name?: string | null; house_number?: string | null } | null | undefined
): string {
  if (!house) return '';
  return house.short_name || house.house_number || '';
}

/**
 * Mask an email address by hiding characters in the middle of the local part.
 * Example: feyijimiohioma@gmail.com -> fey********a@gmail.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'Not set';

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;

  if (localPart.length <= 4) {
    return `${localPart[0]}${'*'.repeat(localPart.length - 1)}@${domain}`;
  }

  const prefix = localPart.slice(0, 3);
  const suffix = localPart.slice(-1);
  const maskedLength = localPart.length - 4;

  return `${prefix}${'*'.repeat(maskedLength > 0 ? maskedLength : 3)}${suffix}@${domain}`;
}

/**
 * Mask a phone number by hiding characters in the middle.
 * Example: 08036996725 -> 080*****725
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'Not set';

  // Clean the phone number (remove spaces, dashes, etc.)
  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length <= 6) {
    const visibleStart = cleanPhone.slice(0, 2);
    return `${visibleStart}${'*'.repeat(cleanPhone.length - 2)}`;
  }

  const prefix = cleanPhone.slice(0, 3);
  const suffix = cleanPhone.slice(-3);
  const maskedLength = cleanPhone.length - 6;

  return `${prefix}${'*'.repeat(maskedLength > 0 ? maskedLength : 4)}${suffix}`;
}
