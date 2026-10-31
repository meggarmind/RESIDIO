/**
 * Push notices (receipts, reminders, announcements, documents) arrive in the same chat as the bot's
 * replies to the resident. Without a mark they read like one more reply and get missed (#1351). Every
 * push notice therefore starts with an icon and a bold title, which the phone's lock screen also shows,
 * and ends with an italic footer. The Assistant's replies to a resident's own message never use this.
 *
 * The header and footer are added in code, not in the editable wording, so an admin edit cannot
 * remove them. Pure, so the announcement form can preview the text; servers use `buildNotice`.
 */
export const NOTICE_TITLES = {
  payment_received: '✅ Payment received',
  payment_confirmed: '✅ Payment confirmed',
  payment_not_confirmed: '⚠️ Payment not confirmed',
  payment_reminder: '🔔 Payment reminder',
  announcement: '📢 Announcement',
  clearance: '📄 Clearance certificate',
  estate_notice: '📌 Estate notice',
} as const;

export type NoticeKind = keyof typeof NOTICE_TITLES;

/** The footer's estate name when Settings has none. */
export const DEFAULT_ESTATE_NAME = 'the estate office';

/** Wraps a push notice body: bold title line, the body, then the footer naming the estate. */
export function formatNotice(kind: NoticeKind, body: string, estateName?: string | null): string {
  const estate = estateName?.trim() || DEFAULT_ESTATE_NAME;
  return `*${NOTICE_TITLES[kind]}*\n\n${body.trim()}\n\n_Automatic notice from ${estate}_`;
}
