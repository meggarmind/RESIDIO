import { NextResponse } from 'next/server';
import { closeCurrentWhatsAppApproval } from '@/lib/auth/two-factor-whatsapp-close';

/**
 * "Cancel and Sign Out" on the verify page (#1389): closes this login session's open WhatsApp
 * approval quietly, so a later reply in the chat is not read as an answer. The session comes from
 * the cookie; the body is not read.
 */
export async function POST() {
  await closeCurrentWhatsAppApproval();
  return NextResponse.json({ success: true });
}
