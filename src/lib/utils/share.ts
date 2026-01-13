import { AccessCode } from "@/types/database";
import { formatDateTime } from "@/lib/utils";

/**
 * Generates a formatted message for sharing an access code.
 */
export function getShareMessage(
    accessCode: AccessCode,
    estateName: string = "Residio Estate"
): string {
    const code = accessCode.code;
    const validUntil = accessCode.valid_until
        ? `valid until ${formatDateTime(accessCode.valid_until)}`
        : "valid for one-time use";

    return `Hello! Here is your access code for ${estateName}:\n\n*${code}*\n\nThis code is ${validUntil}.\nPlease show this to security upon arrival.`;
}

/**
 * Generates a WhatsApp share link with the pre-filled message.
 */
export function getWhatsAppShareLink(
    accessCode: AccessCode,
    estateName?: string
): string {
    const message = getShareMessage(accessCode, estateName);
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
