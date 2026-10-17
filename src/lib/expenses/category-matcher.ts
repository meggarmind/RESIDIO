import type { ExpenseCategory } from '@/types/database';

export type CategoryMatchResult = {
  category: ExpenseCategory | null;
  matchedKeyword: string | null;
};

/**
 * Pure keyword match of a transaction description against expense categories.
 * Categories must already be in priority order (sort_order, then name); the first
 * category with a keyword contained in the description wins. Case-insensitive.
 */
export function findMatchingExpenseCategory(
  categories: ExpenseCategory[] | null | undefined,
  description: string
): CategoryMatchResult {
  const normalizedDescription = description.toLowerCase();

  for (const category of categories ?? []) {
    if (!category.keywords || category.keywords.length === 0) continue;

    for (const keyword of category.keywords) {
      if (normalizedDescription.includes(keyword.toLowerCase())) {
        return { category, matchedKeyword: keyword };
      }
    }
  }

  return { category: null, matchedKeyword: null };
}
