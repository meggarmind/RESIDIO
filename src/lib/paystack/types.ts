/**
 * Paystack Payment Gateway Types
 *
 * Type definitions for Paystack API integration
 * Documentation: https://paystack.com/docs/api/
 */

// Paystack transaction channels
export type PaystackChannel = 'card' | 'bank' | 'ussd' | 'qr' | 'mobile_money' | 'bank_transfer' | 'eft';

// Paystack transaction status
export type PaystackTransactionStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'abandoned'
  | 'reversed';

// Initialize transaction request
export interface PaystackInitializeRequest {
  email: string;
  amount: number; // Amount in kobo (smallest currency unit)
  reference?: string; // Optional - Paystack generates if not provided
  callback_url?: string;
  metadata?: PaystackMetadata;
  channels?: PaystackChannel[];
  currency?: 'NGN' | 'USD' | 'GHS' | 'ZAR' | 'KES';
}

// Metadata for tracking
export interface PaystackMetadata {
  invoice_id: string;
  resident_id: string;
  house_id?: string;
  invoice_number?: string;
  custom_fields?: Array<{
    display_name: string;
    variable_name: string;
    value: string;
  }>;
  [key: string]: unknown;
}

// Initialize transaction response
export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

// Verify transaction response
export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: PaystackTransactionData;
}

// Transaction data (from verify or webhook)
export interface PaystackTransactionData {
  id: number;
  domain: string;
  status: PaystackTransactionStatus;
  reference: string;
  amount: number; // In kobo
  message: string | null;
  gateway_response: string;
  paid_at: string | null;
  created_at: string;
  channel: PaystackChannel;
  currency: string;
  ip_address: string;
  metadata: PaystackMetadata;
  fees: number;
  fees_split: null | Record<string, unknown>;
  authorization: PaystackAuthorization;
  customer: PaystackCustomer;
  requested_amount: number;
  transaction_date: string;
  plan_object?: Record<string, unknown>;
  subaccount?: Record<string, unknown>;
}

// Authorization details (for recurring payments)
export interface PaystackAuthorization {
  authorization_code: string;
  bin: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  channel: PaystackChannel;
  card_type: string;
  bank: string;
  country_code: string;
  brand: string;
  reusable: boolean;
  signature: string;
  account_name: string | null;
}

// Customer details
export interface PaystackCustomer {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  customer_code: string;
  phone: string | null;
  metadata: Record<string, unknown>;
  risk_action: string;
}

// Webhook event types
export type PaystackWebhookEvent =
  | 'charge.success'
  | 'charge.failed'
  | 'transfer.success'
  | 'transfer.failed'
  | 'transfer.reversed'
  | 'subscription.create'
  | 'subscription.disable'
  | 'subscription.enable';

// Webhook payload
export interface PaystackWebhookPayload {
  event: PaystackWebhookEvent;
  data: PaystackTransactionData;
}

// Paystack API error response
export interface PaystackErrorResponse {
  status: false;
  message: string;
  data?: unknown;
}

// Application-level types

// Transaction record for database
export interface PaystackTransaction {
  id: string;
  payment_id: string | null;
  invoice_id: string;
  resident_id: string;
  house_id: string | null;
  reference: string;
  amount_kobo: number;
  channel: PaystackChannel | null;
  status: PaystackTransactionStatus;
  authorization_code: string | null;
  customer_code: string | null;
  gateway_response: string | null;
  paid_at: string | null;
  response_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Initialize payment input
export interface InitializePaymentInput {
  invoice_id: string;
  resident_id: string;
  house_id?: string;
  email: string;
  amount: number; // In Naira
  callback_url: string;
}

// Initialize payment result
export interface InitializePaymentResult {
  success: boolean;
  error?: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

// Verify payment result
export interface VerifyPaymentResult {
  success: boolean;
  error?: string;
  data?: {
    status: PaystackTransactionStatus;
    reference: string;
    amount: number; // In Naira
    paid_at: string | null;
    channel: PaystackChannel | null;
    invoice_id: string;
  };
}

// Webhook processing result
export interface WebhookProcessingResult {
  success: boolean;
  error?: string;
  action?: 'payment_created' | 'already_processed' | 'status_updated' | 'ignored';
  transaction_id?: string;
  payment_id?: string;
}
