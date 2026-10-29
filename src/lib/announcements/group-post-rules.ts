import type { Announcement } from '@/types/database';

/**
 * Rules for posting an announcement to the estate WhatsApp group (#1328, parent #1323). Pure, so
 * the form, the publish buttons and the server read the same answer.
 */

/** Shown in place of Publish to a user without `announcements.post_to_group`. */
export const GROUP_POST_PERMISSION_REASON = 'Only Super Admin, Chairman or Secretary can post to the estate group.';

type AudienceFields = Pick<Announcement, 'target_audience' | 'target_group_slug' | 'target_houses'>;

/** Group posts are for the whole estate only (owner decision 7): street, house and group audiences stay one-to-one. */
export function isEstateWideAudience(announcement: AudienceFields): boolean {
  return (
    (announcement.target_audience ?? 'all') === 'all' &&
    !announcement.target_group_slug &&
    !(announcement.target_houses && announcement.target_houses.length > 0)
  );
}

/** The tick only takes effect on an estate-wide announcement. */
export function wantsEstateGroupPost(
  announcement: AudienceFields & Pick<Announcement, 'post_to_whatsapp_group'>
): boolean {
  return announcement.post_to_whatsapp_group === true && isEstateWideAudience(announcement);
}

/**
 * The group message. Same text as a one-to-one WhatsApp announcement: the `announcement`
 * template (`renderTemplateToText`) with the parameters `buildAnnouncementWhatsApp` passes.
 */
export function announcementGroupText(announcement: Pick<Announcement, 'title' | 'summary' | 'content'>): string {
  const summary = announcement.summary || announcement.content.substring(0, 500);
  return `${announcement.title || 'Announcement'}\n\n${summary || ''}`;
}
