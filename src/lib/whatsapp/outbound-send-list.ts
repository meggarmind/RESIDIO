// Shared by the "Sent messages" server action and its client list (#923); a 'use server' file cannot export constants.
export const OUTBOUND_SENDS_PAGE_SIZE = 25;
export const OUTBOUND_SEND_STATUSES = ['pending', 'sent', 'delivered', 'failed'] as const;
export const OUTBOUND_SEND_PURPOSES = ['inbound_reply', 'notification'] as const;
