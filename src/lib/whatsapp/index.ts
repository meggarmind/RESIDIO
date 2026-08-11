export { getWhatsAppConfig, isWhatsAppConfigured } from '@/lib/whatsapp/config';
export {
  createMetaWhatsAppProvider,
  sendWhatsAppMessage,
  type WhatsAppProvider,
} from '@/lib/whatsapp/provider';
export { verifyWhatsAppSignature, verifyWhatsAppToken } from '@/lib/whatsapp/signature';
export {
  createInMemoryProcessedMessageStore,
  createSupabaseProcessedMessageStore,
  extractWhatsAppMessages,
  handleInboundMessage,
} from '@/lib/whatsapp/inbound';
export { createWhatsAppSimulator, type WhatsAppSimulator } from '@/lib/whatsapp/simulator';
export {
  createSupabaseWhatsAppFinancialRepository,
  handleFinancialMessage,
  type FinancialAnswer,
  type FinancialHouse,
  type FinancialMenuItem,
  type WhatsAppFinancialHandlerOptions,
  type WhatsAppFinancialRepository,
  type WhatsAppFinancialSession,
} from '@/lib/whatsapp/financial';
export {
  createSupabaseWhatsAppIdentityRepository,
  handleResidentMessage,
  generateWhatsAppLinkCode,
  hashWhatsAppLinkCode,
  type WhatsAppIdentityHandlerOptions,
  type WhatsAppIdentityRepository,
  type WhatsAppIdentityResult,
  type WhatsAppResidentIdentity,
} from '@/lib/whatsapp/identity';
export type {
  InboundMessageHandlerOptions,
  InboundMessageResult,
  ProcessedMessageStore,
  WhatsAppInboundMessage,
  WhatsAppInboundPayload,
  WhatsAppSendResult,
  WhatsAppTextMessage,
} from '@/lib/whatsapp/types';
