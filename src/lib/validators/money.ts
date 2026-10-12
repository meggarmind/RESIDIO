import { z } from 'zod';

/**
 * Shared validation for client-supplied money amounts (issue #466).
 *
 * Every server action that moves money must run its amount through
 * `validateMoneyAmount` BEFORE any write. Amounts are in naira (major units).
 */

/** Largest single amount any money action accepts (1 billion). */
export const MAX_MONEY_AMOUNT = 1_000_000_000;

/** Maximum decimal places for a money amount. */
export const MONEY_DECIMAL_PLACES = 2;

export interface MoneyValidationOptions {
  /** Field name used in the error message. Defaults to "Amount". */
  label?: string;
  /** Accept exactly zero (default false: amount must be greater than zero). */
  allowZero?: boolean;
  /** Override the upper bound. Defaults to MAX_MONEY_AMOUNT. */
  max?: number;
}

/**
 * Returns an error message, or null when the amount is acceptable:
 * a finite number, > 0 (or >= 0 with allowZero), at most the upper bound, and
 * at most two decimal places.
 */
export function validateMoneyAmount(
  amount: unknown,
  options: MoneyValidationOptions = {}
): string | null {
  const { label = 'Amount', allowZero = false, max = MAX_MONEY_AMOUNT } = options;

  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return `${label} must be a finite number`;
  }
  if (allowZero ? amount < 0 : amount <= 0) {
    return allowZero
      ? `${label} cannot be negative`
      : `${label} must be greater than zero`;
  }
  if (amount > max) {
    return `${label} cannot exceed ${max.toLocaleString('en-US')}`;
  }
  const scaled = amount * 10 ** MONEY_DECIMAL_PLACES;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    return `${label} can have at most ${MONEY_DECIMAL_PLACES} decimal places`;
  }
  return null;
}

/** Zod schema applying `validateMoneyAmount`. */
export function moneyAmountSchema(options: MoneyValidationOptions = {}) {
  return z.number().superRefine((value, ctx) => {
    const error = validateMoneyAmount(value, options);
    if (error) ctx.addIssue({ code: 'custom', message: error });
  });
}
