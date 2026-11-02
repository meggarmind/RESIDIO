import { createHash } from 'node:crypto';

/**
 * The id of a new month row: a name-based UUID (version 5 layout, SHA-1) of the category and month.
 * `budgets` has no unique key on (category_id, period_start), so two saves of the same new year at
 * the same time would otherwise insert two rows for one month. With this id they write the same
 * primary key, and the upsert on `id` makes the second one an update (#1406). Server only.
 */
export function budgetRowId(categoryId: string, periodStart: string): string {
    const hash = createHash('sha1').update(`residio:budget:${categoryId}:${periodStart}`).digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
