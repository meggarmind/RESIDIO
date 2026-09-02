export {
  getWhatsAppConfig,
  resolveWhatsAppConfig,
  isWhatsAppConfigured,
  invalidateWhatsAppConfigCache,
} from '@/lib/whatsapp/config';
export {
  createMetaWhatsAppProvider,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
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
  WHATSAPP_TEMPLATE_NAMES,
  isApprovedWhatsAppTemplateName,
  whatsappTemplate,
  type WhatsAppTemplateName,
} from '@/lib/whatsapp/templates';
export {
  buildAnnouncementWhatsApp,
  buildInvoiceReminderWhatsApp,
  buildPaymentReceivedWhatsApp,
} from '@/lib/whatsapp/outbound';
export {
  createSupabaseWhatsAppFinancialRepository,
  composeStatementAnswer,
  canPerformWhatsAppFinancialLookup,
  handleFinancialMessage,
  type FinancialAnswer,
  type FinancialHouse,
  type FinancialMenuItem,
  type WhatsAppFinancialHandlerOptions,
  type WhatsAppFinancialRepository,
  type WhatsAppFinancialSession,
  type StatementCompositionInput,
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
  WhatsAppTemplateMessage,
  WhatsAppTextMessage,
} from '@/lib/whatsapp/types';
