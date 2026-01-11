/**
 * Paystack Payment Gateway Module
 *
 * Re-exports all Paystack-related utilities and types
 */

// Client functions
export {
  paystackConfig,
  isPaystackConfigured,
  isPaystackPublicKeyAvailable,
  generateReference,
  nairaToKobo,
  koboToNaira,
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  getChannelDisplayName,
} from './client';

// Types
export type {
  PaystackChannel,
  PaystackTransactionStatus,
  PaystackInitializeRequest,
  PaystackInitializeResponse,
  PaystackVerifyResponse,
  PaystackTransactionData,
  PaystackAuthorization,
  PaystackCustomer,
  PaystackWebhookEvent,
  PaystackWebhookPayload,
  PaystackErrorResponse,
  PaystackMetadata,
  PaystackTransaction,
  InitializePaymentInput,
  InitializePaymentResult,
  VerifyPaymentResult,
  WebhookProcessingResult,
} from './types';
