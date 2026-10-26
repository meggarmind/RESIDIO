/**
 * Charge categories (#1189): what a charge is for. Each resident has one wallet per category,
 * and a wallet pays only invoices of its own category. The list lives in public.charge_categories.
 */

/** The category of every charge and wallet that does not name one. */
export const DEFAULT_CHARGE_CATEGORY = 'dues';

export type ChargeCategory = {
    code: string;
    name: string;
    sort_order: number;
};
