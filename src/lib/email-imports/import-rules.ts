/**
 * Gmail import rules (#1349): the senders and subject words the Gmail fetch searches for.
 *
 * Shared by the Settings form and `updateSyncCriteria`, so the client and the server refuse the
 * same input. Each sender becomes `from:<sender>` and each subject word `"<word>"` in the Gmail
 * query (`gmail-client.ts`), so a value with a space, a quote or Gmail syntax could widen the search.
 */

export const IMPORT_RULES_MAX_ITEMS = 20;

// An email address or a domain: no spaces, no Gmail operators.
const SENDER_PATTERN = /^(?:[a-z0-9._%+-]+@)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const SENDER_MAX_LENGTH = 254;
const KEYWORD_MAX_LENGTH = 60;

export interface ImportRules {
  senders: string[];
  keywords: string[];
}

/** One value per line. Trims, drops blanks and repeats. */
export function parseRuleList(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split('\n')) {
    const value = part.trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

/** Returns the cleaned rules, or the first problem in words an admin can act on. */
export function validateImportRules(
  input: { senders: unknown; keywords: unknown } | null | undefined
): { rules: ImportRules; error: null } | { rules: null; error: string } {
  const { senders, keywords } = input ?? {};
  if (!Array.isArray(senders) || !senders.every((s) => typeof s === 'string')) {
    return { rules: null, error: 'Senders must be a list of email addresses or domains.' };
  }
  if (!Array.isArray(keywords) || !keywords.every((k) => typeof k === 'string')) {
    return { rules: null, error: 'Subject words must be a list of words.' };
  }

  const cleanSenders = parseRuleList(senders.join('\n').toLowerCase());
  const cleanKeywords = parseRuleList(keywords.join('\n'));

  if (cleanSenders.length === 0) {
    return { rules: null, error: 'Enter at least one sender.' };
  }
  if (cleanSenders.length > IMPORT_RULES_MAX_ITEMS) {
    return { rules: null, error: `Enter at most ${IMPORT_RULES_MAX_ITEMS} senders.` };
  }
  const badSender = cleanSenders.find((s) => s.length > SENDER_MAX_LENGTH || !SENDER_PATTERN.test(s));
  if (badSender) {
    return { rules: null, error: `"${badSender}" is not an email address or a domain.` };
  }

  if (cleanKeywords.length > IMPORT_RULES_MAX_ITEMS) {
    return { rules: null, error: `Enter at most ${IMPORT_RULES_MAX_ITEMS} subject words.` };
  }
  const badKeyword = cleanKeywords.find((k) => k.length > KEYWORD_MAX_LENGTH || /["\\]/.test(k));
  if (badKeyword) {
    return {
      rules: null,
      error: `"${badKeyword}" cannot be used: subject words have no quotes and at most ${KEYWORD_MAX_LENGTH} characters.`,
    };
  }

  return { rules: { senders: cleanSenders, keywords: cleanKeywords }, error: null };
}
