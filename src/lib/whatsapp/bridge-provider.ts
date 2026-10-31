/**
 * Providers that are QR-paired WhatsApp Web bridges (Chatmaid, WAHA). They share
 * behaviour that Meta and Twilio lack: free-text sends instead of approved
 * templates, file attachment by URL, delivery acks by webhook, and the SMS
 * fallback after a failed urgent send.
 *
 * Kept free of imports so client components can use it. `isBridgeProvider` in
 * `config.ts` is the same test on a resolved config.
 */
export function isBridgeProviderName(provider: string | null | undefined): boolean {
  return provider === 'chatmaid' || provider === 'waha';
}
