import type { TransactionTag } from '@/types/database';

export type AutoTagMatch = {
  tag: TransactionTag | null;
  matchedKeyword: string | null;
};

/**
 * Pure keyword matcher shared by `autoTagTransaction` and `createImportRows`.
 *
 * `tags` must already be filtered to one transaction type, active only, and ordered by
 * sort_order then name. The first tag with a keyword contained in the description wins
 * (case-insensitive substring); tags without keywords are skipped.
 */
export function findMatchingTag(
  tags: readonly TransactionTag[] | null | undefined,
  description: string
): AutoTagMatch {
  if (!tags) return { tag: null, matchedKeyword: null };

  const normalizedDescription = description.toLowerCase();

  for (const tag of tags) {
    if (!tag.keywords || tag.keywords.length === 0) continue;

    for (const keyword of tag.keywords) {
      if (normalizedDescription.includes(keyword.toLowerCase())) {
        return { tag, matchedKeyword: keyword };
      }
    }
  }

  return { tag: null, matchedKeyword: null };
}
