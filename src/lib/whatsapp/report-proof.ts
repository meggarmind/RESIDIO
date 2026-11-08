import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveWhatsAppConfig } from '@/lib/whatsapp/config';
import { downloadWahaMedia, type WahaMediaDownload } from '@/lib/whatsapp/providers/waha';
import type { WhatsAppInboundMedia } from '@/lib/whatsapp/types';

/**
 * The receipt a resident sends in "Report a payment" over WAHA (#1455): checked, downloaded from WAHA
 * and stored in the private `payment-proofs` bucket. The report keeps the path and the pending
 * payment's `proof_url` gets it. Chatmaid does not pass files, so this is WAHA only.
 */

export const PAYMENT_PROOFS_BUCKET = 'payment-proofs';
export const REPORT_PROOF_MAX_BYTES = 5 * 1024 * 1024;

const PROOF_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** The content type and file extension of an accepted receipt, or null for any other type. */
export function reportProofType(mimetype: string | null): { contentType: string; extension: string } | null {
  const contentType = mimetype?.split(';')[0].trim().toLowerCase() ?? '';
  const extension = PROOF_EXTENSIONS[contentType];
  return extension ? { contentType, extension } : null;
}

export type ReportProofResult =
  | { status: 'stored'; path: string }
  | { status: 'unsupported_type' | 'too_large' | 'failed' };

export interface ReportProofDeps {
  /** The WAHA connection, or null when WAHA is not the configured provider. */
  loadConfig: () => Promise<{ baseUrl: string; apiKey: string } | null>;
  download: (config: { baseUrl: string; apiKey: string }, mediaUrl: string, maxBytes: number) => Promise<WahaMediaDownload>;
  upload: (path: string, bytes: Uint8Array, contentType: string) => Promise<{ error: { message: string } | null }>;
  newId: () => string;
}

const defaultDeps: ReportProofDeps = {
  async loadConfig() {
    const resolved = await resolveWhatsAppConfig();
    return resolved.status === 'ok' && resolved.config.provider === 'waha' ? resolved.config : null;
  },
  download: (config, mediaUrl, maxBytes) => downloadWahaMedia(config, mediaUrl, maxBytes),
  async upload(path, bytes, contentType) {
    const { error } = await createAdminClient().storage.from(PAYMENT_PROOFS_BUCKET).upload(path, bytes, { contentType, upsert: false });
    return { error };
  },
  newId: randomUUID,
};

/** Logs the outcome only: never the URL, the number or the file. */
function failed(reason: string, detail?: Record<string, unknown>): ReportProofResult {
  console.warn('[whatsapp-report-proof] Receipt not attached:', { reason, ...detail });
  return { status: 'failed' };
}

/**
 * Stores the receipt under `whatsapp/<residentId>/<uuid>.<ext>`. Never throws: a wrong type, a file over
 * 5 MB or a failed download or upload gives a status, and the report goes on without a file.
 */
export async function storeReportProof(
  input: { residentId: string; media: WhatsAppInboundMedia },
  deps: ReportProofDeps = defaultDeps
): Promise<ReportProofResult> {
  const type = reportProofType(input.media.mimetype);
  if (!type) return { status: 'unsupported_type' };
  if (!input.media.url) return failed('no_media_url');

  try {
    const config = await deps.loadConfig();
    if (!config) return failed('waha_not_configured');

    const download = await deps.download(config, input.media.url, REPORT_PROOF_MAX_BYTES);
    if (!download.ok) {
      if (download.reason === 'too_large') return { status: 'too_large' };
      return failed(download.reason, download.httpStatus ? { httpStatus: download.httpStatus } : undefined);
    }

    const path = `whatsapp/${input.residentId}/${deps.newId()}.${type.extension}`;
    const { error } = await deps.upload(path, download.bytes, type.contentType);
    if (error) return failed('upload_failed', { error: error.message });
    return { status: 'stored', path };
  } catch (error) {
    return failed('unexpected_error', { error: error instanceof Error ? error.message : 'unknown error' });
  }
}

