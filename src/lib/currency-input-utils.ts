/**
 * Utility functions for currency input formatting
 * Handles comma-separated number formatting for Nigerian Naira (NGN)
 */

/**
 * Formats a number or numeric string with comma separators
 * @param value - Number or string to format
 * @returns Formatted string with commas (e.g., "1,234.56")
 */
export function formatNumberWithCommas(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  // Convert to string and remove any existing formatting
  const cleanValue = String(value).replace(/[^\d.-]/g, '');

  if (cleanValue === '' || cleanValue === '-') {
    return cleanValue;
  }

  // Split into integer and decimal parts
  const [integerPart, decimalPart] = cleanValue.split('.');

  // Format integer part with commas
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Combine with decimal part if it exists
  return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

/**
 * Parses a formatted currency string to a clean number
 * @param value - Formatted string (e.g., "₦1,234.56" or "1,234.56")
 * @returns Clean numeric value
 */
export function parseFormattedNumber(value: string | undefined | null): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  // Remove all non-numeric characters except decimal point and minus sign
  const cleanValue = String(value).replace(/[^\d.-]/g, '');

  if (cleanValue === '' || cleanValue === '-') {
    return 0;
  }

  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculates the correct cursor position after formatting
 * Prevents cursor jumping when commas are added/removed
 *
 * @param oldValue - Previous formatted value
 * @param newValue - New formatted value
 * @param oldCursor - Previous cursor position
 * @returns New cursor position
 */
export function getCursorPosition(
  oldValue: string,
  newValue: string,
  oldCursor: number
): number {
  // Count commas before cursor in old value
  const commasBeforeOld = (oldValue.substring(0, oldCursor).match(/,/g) || []).length;

  // Count commas before cursor in new value
  const commasBeforeNew = (newValue.substring(0, oldCursor).match(/,/g) || []).length;

  // Adjust cursor position based on comma difference
  const offset = commasBeforeNew - commasBeforeOld;

  return Math.max(0, Math.min(newValue.length, oldCursor + offset));
}

/**
 * Cleans and validates numeric input
 * Removes invalid characters, handles multiple decimal points
 *
 * @param value - Raw input value
 * @param allowDecimals - Whether to allow decimal points
 * @param maxDecimals - Maximum decimal places allowed
 * @returns Cleaned value
 */
export function cleanNumericInput(
  value: string,
  allowDecimals = true,
  maxDecimals = 2
): string {
  // Remove all non-numeric characters except decimal point and minus
  let cleaned = value.replace(/[^\d.-]/g, '');

  // Handle negative sign (only at start)
  const hasNegative = cleaned.startsWith('-');
  cleaned = cleaned.replace(/-/g, '');
  if (hasNegative) {
    cleaned = '-' + cleaned;
  }

  // Handle decimal points
  if (!allowDecimals) {
    cleaned = cleaned.replace(/\./g, '');
  } else {
    // Only allow one decimal point
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }

    // Limit decimal places
    if (parts.length === 2 && parts[1].length > maxDecimals) {
      cleaned = parts[0] + '.' + parts[1].substring(0, maxDecimals);
    }
  }

  // Remove leading zeros (except for "0.xx")
  if (cleaned.length > 1 && cleaned.startsWith('0') && !cleaned.startsWith('0.')) {
    cleaned = cleaned.replace(/^0+/, '');
  }

  return cleaned;
}
