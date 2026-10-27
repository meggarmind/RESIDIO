/**
 * True for the QR-paired WhatsApp Web bridges (Chatmaid #401, WAHA #1262).
 * They have no approved templates, send media by URL and can drop off when
 * the handset disconnects, so they share bridge-only behaviour: editable
 * wording, the urgent SMS fallback and the stale-pending send alert.
 */
export function isBridgeProvider(provider: string | null | undefined): boolean {
  return provider === 'chatmaid' || provider === 'waha';
}

/** Providers that report delivery status by webhook (#839). */
export const BRIDGE_PROVIDERS = ['chatmaid', 'waha'] as const;
