import { createElement } from 'react';
import { usableEstateLogoUrl } from '@/lib/branding/estate-logo';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { logAudit } from '@/lib/audit/logger';
import { ClearanceCertificatePDF } from '@/lib/pdf/clearance-certificate';
import { loadRecipientGroups, sendableMembers, type RecipientGroupMember } from '@/lib/groups/recipient-groups';
import { formatDay } from '@/lib/whatsapp/assistant-format';
import { hasQueuedResidentSend, sendWhatsAppToResident, type ResidentSendResult } from '@/lib/whatsapp/resident-send';
import type { ClearanceCertificate } from '@/actions/residents/move-out-renter';

/**
 * Issuing a clearance certificate (#816 decisions 20-22, 24): the PDF is saved to the permanent,
 * private documents store with the house it covers, and a copy goes to each member of the selected
 * recipient group. Every way a certificate is issued uses this: the admin move-out wizards and an
 * approved WhatsApp request. A copy that fails is logged, never lets the certificate fail, and can be
 * retried from the WhatsApp operations console.
 */

export const CLEARANCE_CATEGORY = 'Clearance certificates';
/** The system setting that names the recipient group (seeded to "Estate officials" by migration 20261021000100). */
export const CLEARANCE_COPY_SETTING = 'clearance_copy_recipient_group_id';
export const DOCUMENTS_BUCKET = 'documents';
const SIGNED_URL_SECONDS = 60 * 60;

export interface IssueCertificateInput {
  certificate: ClearanceCertificate;
  /** `move_out` for the wizards, `financial` for a clearance asked for over WhatsApp. */
  variant: 'move_out' | 'financial';
  destinationText?: string;
  /** The admin profile the document is saved under (documents.uploaded_by). */
  issuedBy: string;
}

export interface IssuedCertificate {
  documentId: string;
  filePath: string;
  pdf: Buffer;
  /** True when this certificate number was issued before; nothing was saved or copied again. */
  alreadyIssued: boolean;
}

// clearance_certificate_copies is not in the generated types until migration 20261022000000 is applied.
const copies = (client: ReturnType<typeof createAdminClient>) => (client as unknown as SupabaseClient).from('clearance_certificate_copies');

async function estateDetails() {
  const settings = await getRawSettingsAsService(['estate_name', 'estate_address', 'estate_logo_url']);
  const value = (key: string) => {
    const raw = settings.status === 'ok' ? settings.values.get(key) : null;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  };
  return { estateName: value('estate_name') ?? 'Residio Estate', estateAddress: value('estate_address') ?? '', estateLogoUrl: usableEstateLogoUrl(settings.status === 'ok' ? settings.values.get('estate_logo_url') : null) };
}

async function signedUrl(client: ReturnType<typeof createAdminClient>, path: string): Promise<string> {
  const signed = await client.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (!signed.data?.signedUrl) throw new Error(`Certificate signed URL failed: ${signed.error?.message || 'no URL'}`);
  return signed.data.signedUrl;
}

export function copyMessage(certificate: Pick<ClearanceCertificate, 'residentName' | 'houseAddress' | 'clearanceDate'>): string {
  return `Clearance certificate issued: ${certificate.residentName}, ${certificate.houseAddress}, ${formatDay(certificate.clearanceDate)}.`;
}

export async function issueClearanceCertificate(input: IssueCertificateInput): Promise<IssuedCertificate> {
  const { certificate } = input;
  const admin = createAdminClient();
  const filePath = `clearance-certificates/${certificate.certificateNumber}.pdf`;

  const { data: existing, error: existingError } = await admin.from('documents').select('id').eq('file_path', filePath).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { documentId: existing.id, filePath, pdf: Buffer.alloc(0), alreadyIssued: true };

  const estate = await estateDetails();
  const pdf = await renderToBuffer(
    createElement(ClearanceCertificatePDF, { certificate, variant: input.variant, destinationText: input.destinationText, ...estate }) as Parameters<typeof renderToBuffer>[0]
  );

  const upload = await admin.storage.from(DOCUMENTS_BUCKET).upload(filePath, new Uint8Array(pdf), { contentType: 'application/pdf', upsert: false });
  if (upload.error) throw new Error(`Certificate upload failed: ${upload.error.message}`);

  const { data: category } = await admin.from('document_categories').select('id').eq('name', CLEARANCE_CATEGORY).maybeSingle();
  const { data: document, error } = await admin
    .from('documents')
    .insert({
      title: `Clearance certificate ${certificate.certificateNumber}`,
      description: `${certificate.residentName}, ${certificate.houseAddress}`,
      file_name: `${certificate.certificateNumber}.pdf`,
      file_path: filePath,
      file_type: 'pdf',
      file_size_bytes: pdf.length,
      mime_type: 'application/pdf',
      category_id: category?.id ?? null,
      house_id: certificate.houseId,
      resident_id: certificate.residentId,
      uploaded_by: input.issuedBy,
      version: 1,
    })
    .select('id, title')
    .single();
  if (error || !document) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    throw new Error(`Certificate document not saved: ${error?.message ?? 'no row'}`);
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'documents',
    entityId: document.id,
    entityDisplay: document.title,
    newValues: { title: document.title, file_path: filePath, house_id: certificate.houseId, category: CLEARANCE_CATEGORY },
    description: `Clearance certificate ${certificate.certificateNumber} saved`,
  });

  await sendCertificateCopies(document.id, filePath, certificate).catch((e) => console.error('[clearance] Copies not sent:', e));
  return { documentId: document.id, filePath, pdf, alreadyIssued: false };
}

async function recordCopy(
  client: ReturnType<typeof createAdminClient>,
  documentId: string,
  recipientId: string,
  body: string,
  outcome: ResidentSendResult
): Promise<void> {
  const { data: previous } = await copies(client).select('attempts').eq('document_id', documentId).eq('recipient_resident_id', recipientId).maybeSingle();
  const { error } = await copies(client).upsert(
    {
      document_id: documentId,
      recipient_resident_id: recipientId,
      // A copy held back by a cap is queued, and the queue marks it sent or failed (#1044).
      status: outcome.sent ? 'sent' : outcome.deferred ? 'scheduled' : 'failed',
      error: outcome.sent ? null : outcome.reason,
      body,
      attempts: ((previous as { attempts: number } | null)?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'document_id,recipient_resident_id' }
  );
  if (error) console.error('[clearance] Copy outcome not recorded:', { documentId, recipientId, error });
}

/** The members of the selected group, one message each; a member who cannot receive is logged as failed with the reason. */
async function sendCertificateCopies(documentId: string, filePath: string, certificate: ClearanceCertificate): Promise<void> {
  const admin = createAdminClient();
  const setting = await getRawSettingsAsService([CLEARANCE_COPY_SETTING]);
  const groupId = setting.status === 'ok' ? setting.values.get(CLEARANCE_COPY_SETTING) : null;
  if (typeof groupId !== 'string' || !groupId.trim()) return;

  const groups = await loadRecipientGroups(admin);
  if (groups.error) throw new Error(`Recipient group not loaded: ${groups.error}`);
  const group = groups.data.find((candidate) => candidate.id === groupId.trim());
  if (!group) return;

  const body = copyMessage(certificate);
  const url = await signedUrl(admin, filePath);
  for (const member of sendableMembers(group.members)) {
    const outcome = await copyTo(member, documentId, body, url, filePath);
    await recordCopy(admin, documentId, member.residentId, body, outcome);
  }
}

async function copyTo(member: RecipientGroupMember, documentId: string, body: string, url: string, filePath: string): Promise<ResidentSendResult> {
  // The settings page warns about the same cases (no number, not opted in); here they are logged.
  if (member.warning) return { sent: false, reason: member.warning };
  return sendWhatsAppToResident(member.residentId, body, {
    seed: `clearance-copy:${documentId}:${member.residentId}`,
    mediaUrls: [url],
    deferMedia: [{ bucket: DOCUMENTS_BUCKET, path: filePath }],
    clearanceCopy: { documentId, recipientId: member.residentId },
  });
}

/** Sends a failed copy again with a fresh signed URL. Returns the new outcome; the console shows it. */
export async function retryClearanceCopy(copyId: string): Promise<({ sent: true } | { sent: false; reason: string }) & { documentId?: string }> {
  const admin = createAdminClient();
  const { data, error } = await copies(admin)
    .select('document_id, recipient_resident_id, body, status, document:documents(file_path)')
    .eq('id', copyId)
    .maybeSingle();
  if (error) throw error;
  const copy = data as { document_id: string; recipient_resident_id: string; body: string; status: string; document: { file_path: string } | { file_path: string }[] | null } | null;
  if (!copy) return { sent: false, reason: 'copy not found' };
  if (copy.status === 'scheduled') return { sent: false, reason: 'copy is already scheduled to send automatically', documentId: copy.document_id };
  if (copy.status !== 'failed') return { sent: false, reason: 'copy was already sent' };
  const document = Array.isArray(copy.document) ? copy.document[0] : copy.document;
  if (!document) return { sent: false, reason: 'certificate not found', documentId: copy.document_id };

  // A copy held back by a cap and still waiting in the queue (#1044); sending it again here would deliver it twice.
  if (await hasQueuedResidentSend(`clearance-copy:${copy.document_id}:${copy.recipient_resident_id}`, ['pending', 'processing'])) {
    return { sent: false, reason: 'copy is already scheduled to send automatically', documentId: copy.document_id };
  }
  const outcome = await sendWhatsAppToResident(copy.recipient_resident_id, copy.body, {
    seed: `clearance-copy:${copy.document_id}:${copy.recipient_resident_id}:${Date.now()}`,
    mediaUrls: [await signedUrl(admin, document.file_path)],
  });
  await recordCopy(admin, copy.document_id, copy.recipient_resident_id, copy.body, outcome);
  return { ...outcome, documentId: copy.document_id };
}
