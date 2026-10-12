/**
 * Store inbound email attachments in the email-imports bucket (#467).
 *
 * Attachment names come from an email any outside sender controls, so they are
 * never used as storage paths. The object name is server-generated, the
 * original name is kept only as metadata, content must match an allowlisted
 * magic-byte signature, size is capped, and nothing is overwritten (no upsert).
 */

import {
  MAX_EMAIL_ATTACHMENT_BYTES,
  SNIFFED_MIME,
  buildStoragePath,
  checkSizeCap,
  matchesAllowedType,
  sanitizeFilename,
  type SniffedType,
} from '@/lib/uploads';

export const ALLOWED_ATTACHMENT_TYPES: ReadonlyArray<SniffedType> = ['pdf', 'png', 'jpeg', 'xlsx'];

export interface InboundAttachment {
  id: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface StoredAttachment {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

interface StorageUploader {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        options: { contentType: string; upsert: boolean }
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export async function storeEmailAttachments(
  client: StorageUploader,
  basePath: string,
  attachments: InboundAttachment[]
): Promise<{ stored: StoredAttachment[]; skipped: Array<{ name: string; reason: string }> }> {
  const stored: StoredAttachment[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const attachment of attachments) {
    // Keep a sanitized copy of the original name as display metadata only.
    const displayName = sanitizeFilename(attachment.filename);

    const sizeError = checkSizeCap(attachment.data.length, MAX_EMAIL_ATTACHMENT_BYTES, 'Attachment');
    if (sizeError) {
      skipped.push({ name: displayName, reason: sizeError });
      continue;
    }

    const sniffed = matchesAllowedType(attachment.data, ALLOWED_ATTACHMENT_TYPES);
    if (!sniffed) {
      skipped.push({ name: displayName, reason: 'Unsupported or unrecognised file content' });
      continue;
    }

    let path: string;
    try {
      path = buildStoragePath(`${basePath}/attachments`, attachment.filename);
    } catch (error) {
      skipped.push({
        name: displayName,
        reason: error instanceof Error ? error.message : 'Unsafe storage path',
      });
      continue;
    }

    // Trust the sniffed type, not the sender-declared MIME type.
    const contentType = SNIFFED_MIME[sniffed];
    const { error } = await client.storage
      .from('email-imports')
      .upload(path, attachment.data, { contentType, upsert: false });

    if (error) {
      skipped.push({ name: displayName, reason: error.message });
      continue;
    }

    stored.push({ name: displayName, path, size: attachment.data.length, mimeType: contentType });
  }

  return { stored, skipped };
}
