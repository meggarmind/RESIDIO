import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { shouldSendToResident } from '@/lib/notifications/preferences';
import { isEventChannelEnabled } from '@/lib/notifications/event-content';
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in';
import { addToQueue } from '@/lib/notifications/queue';
import { buildLandlordDuesReceiptWhatsApp } from '@/lib/whatsapp/outbound';
import { formatDay } from '@/lib/whatsapp/assistant-format';
import { LandlordDuesEmail } from '@/emails/landlord-dues';
import { formatDuesLines, formatNgn, joinMonths, type DuesContact, type DuesLine } from '@/lib/billing/landlord-dues';

/**
 * Receipts for a split of a landlord's Dues payment (#1192): the landlord gets one receipt with the
 * amount per flat, each tenant gets "Your dues for [months] were paid by your landlord". Email and
 * WhatsApp follow the same rules as the payment receipt: the admin channel switch, the resident's
 * preference, the communications override and, for WhatsApp, the opt-in. Not a server action.
 */

export type TenantReceipt = {
    tenant: DuesContact;
    flat: string;
    amount: number;
    months: string[];
};

type Receipt = {
    recipient: DuesContact;
    amount: number;
    subject: string;
    heading: string;
    paragraph: string;
    note: string;
    lines: DuesLine[];
};

export async function sendLandlordDuesReceipts(input: {
    splitId: string;
    landlord: DuesContact;
    paymentDate: string;
    tenants: TenantReceipt[];
}): Promise<{ sent: number; errors: string[] }> {
    if (input.tenants.length === 0) return { sent: 0, errors: [] };
    const date = formatDay(input.paymentDate);
    const flats: DuesLine[] = input.tenants.map((t) => ({ label: t.flat, amount: t.amount }));
    const total = flats.reduce((sum, flat) => sum + flat.amount, 0);

    const receipts: Receipt[] = [
        {
            recipient: input.landlord,
            amount: total,
            subject: `Receipt: dues paid for your tenants, ${formatNgn(total)}`,
            heading: 'Dues paid for your tenants',
            paragraph: `On ${date} your payment paid these dues for your tenants.`,
            note: `Dues paid for your tenants: ${formatDuesLines(flats)}`,
            lines: flats,
        },
        ...input.tenants.map((t) => {
            const months = joinMonths(t.months);
            const paid = months ? `Your dues for ${months} were paid by your landlord` : 'Your dues were paid by your landlord';
            return {
                recipient: t.tenant,
                amount: t.amount,
                subject: `Receipt: ${paid}`,
                heading: 'Dues paid by your landlord',
                paragraph: `${paid} on ${date}.`,
                note: paid,
                lines: [{ label: t.flat, amount: t.amount }],
            };
        }),
    ];

    const estate = await getEstateEmailSettings();
    const emailOn = await isEventChannelEnabled('payment_receipt', 'email');
    const whatsappOn = await isEventChannelEnabled('payment_receipt', 'whatsapp');
    let sent = 0;
    const errors: string[] = [];

    for (const receipt of receipts) {
        const { recipient } = receipt;
        const name = `${recipient.first_name} ${recipient.last_name}`;

        if (emailOn && recipient.email) {
            const preference = await shouldSendToResident({ residentId: recipient.id, category: 'payment', channel: 'email' });
            const override = preference.shouldSend ? await resolveResidentOverride([recipient.id]) : null;
            if (override && !override.ok) {
                errors.push(`Email to ${name}: ${override.error}`);
            } else if (override?.ok) {
                const result = await sendEmail({
                    to: { email: recipient.email, name, residentId: recipient.id },
                    subject: receipt.subject,
                    react: LandlordDuesEmail({
                        estateName: estate.estateName || 'Estate',
                        estateEmail: estate.estateEmail,
                        estatePhone: estate.estatePhone,
                        estateAddress: estate.estateAddress,
                        estateLogoUrl: estate.estateLogoUrl,
                        heading: receipt.heading,
                        recipientName: name,
                        paragraphs: [receipt.paragraph],
                        lines: receipt.lines.map((line) => ({ label: line.label, amount: formatNgn(line.amount) })),
                        total: receipt.lines.length > 1 ? formatNgn(receipt.amount) : undefined,
                    }),
                    emailType: 'payment_receipt',
                    residentOverride: override.residentOverride,
                    metadata: { landlordDuesSplitId: input.splitId },
                });
                if (result.success) sent++;
                else errors.push(`Email to ${name}: ${result.error}`);
            }
        }

        if (whatsappOn && recipient.phone_primary) {
            const preference = await shouldSendToResident({ residentId: recipient.id, category: 'payment', channel: 'whatsapp' });
            if (preference.shouldSend && (await isWhatsAppOptedIn(recipient.id, recipient.phone_primary))) {
                const queued = await addToQueue(buildLandlordDuesReceiptWhatsApp({
                    splitId: input.splitId,
                    residentId: recipient.id,
                    residentPhone: recipient.phone_primary,
                    residentName: name,
                    amount: receipt.amount,
                    paymentDate: input.paymentDate,
                    note: receipt.note,
                }));
                if (queued.success) sent++;
                else if (!queued.isDuplicate) errors.push(`WhatsApp to ${name}: ${queued.error}`);
            }
        }
    }
    return { sent, errors };
}
