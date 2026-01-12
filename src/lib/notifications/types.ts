/**
 * Phase 11: Notification System Types
 *
 * Multi-channel notification system with support for email (now) and
 * SMS/WhatsApp (future-proofed via channel field).
 */

// ============================================================================
// CHANNEL TYPES - Future-proofed for SMS/WhatsApp
// ============================================================================

/**
 * Notification channels - currently only email is implemented,
 * but SMS and WhatsApp are defined for future expansion
 */
export type NotificationChannel = 'email' | 'sms' | 'whatsapp';

/**
 * Labels for notification channels
 */
export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

/**
 * Channels that are currently implemented/available
 */
export const IMPLEMENTED_CHANNELS: NotificationChannel[] = ['email'];

/**
 * Check if a channel is currently implemented
 */
export function isChannelImplemented(channel: NotificationChannel): boolean {
  return IMPLEMENTED_CHANNELS.includes(channel);
}

// ============================================================================
// CATEGORY TYPES
// ============================================================================

/**
 * Notification categories for grouping and preferences
 */
export type NotificationCategory = 'payment' | 'invoice' | 'security' | 'general';

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  payment: 'Payment Reminders',
  invoice: 'Invoice Notifications',
  security: 'Security Alerts',
  general: 'General Announcements',
};

// ============================================================================
// TRIGGER TYPES
// ============================================================================

/**
 * Types of triggers that can initiate notifications
 */
export type TriggerType = 'days_before_due' | 'days_after_due' | 'event' | 'cron';

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  days_before_due: 'Days Before Due Date',
  days_after_due: 'Days After Due Date',
  event: 'On Event',
  cron: 'Scheduled (Cron)',
};

/**
 * Event types that can trigger notifications
 */
export type NotificationEventType =
  | 'invoice.created'
  | 'payment.received'
  | 'resident.created'
  | 'security.alert';

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  'invoice.created': 'Invoice Generated',
  'payment.received': 'Payment Received',
  'resident.created': 'New Resident Registered',
  'security.alert': 'Security Alert',
};

// ============================================================================
// STATUS TYPES
// ============================================================================

/**
 * Queue item status
 */
export type QueueStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/**
 * History item status (includes delivery states)
 */
export type HistoryStatus = 'sent' | 'failed' | 'bounced' | 'delivered' | 'opened' | 'clicked';

export const HISTORY_STATUS_LABELS: Record<HistoryStatus, string> = {
  sent: 'Sent',
  failed: 'Failed',
  bounced: 'Bounced',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
};

/**
 * Priority level labels for queue items
 */
export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Urgent',
  3: 'High',
  5: 'Normal',
  7: 'Low',
  9: 'Bulk',
};

/**
 * Preference frequency options
 */
export type PreferenceFrequency = 'all' | 'daily_digest' | 'weekly_digest' | 'none';

export const PREFERENCE_FREQUENCY_LABELS: Record<PreferenceFrequency, string> = {
  all: 'Send All Immediately',
  daily_digest: 'Daily Digest',
  weekly_digest: 'Weekly Digest',
  none: 'Do Not Send',
};

// ============================================================================
// DATABASE ROW TYPES (aligned with database.generated.ts)
// ============================================================================

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
}

/**
 * Notification template from database
 */
export interface NotificationTemplate {
  id: string;
  name: string;
  display_name: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  subject_template: string | null;
  body_template: string;
  html_template: string | null;
  variables: TemplateVariable[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Notification schedule from database
 */
export interface NotificationSchedule {
  id: string;
  name: string;
  template_id: string;
  trigger_type: TriggerType;
  trigger_value: number | null;
  cron_expression: string | null;
  event_type: NotificationEventType | null;
  escalation_sequence: number;
  parent_schedule_id: string | null;
  conditions: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Notification queue item from database
 */
export interface NotificationQueueItem {
  id: string;
  template_id: string | null;
  schedule_id: string | null;
  recipient_id: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  html_body: string | null;
  variables: Record<string, unknown> | null;
  priority: number;
  status: QueueStatus;
  deduplication_key: string | null;
  dedup_window_minutes: number | null;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Notification history entry from database
 */
export interface NotificationHistoryEntry {
  id: string;
  queue_id: string | null;
  template_id: string | null;
  schedule_id: string | null;
  recipient_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: NotificationChannel;
  subject: string | null;
  body_preview: string | null;
  status: HistoryStatus;
  external_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

/**
 * Notification preference from database
 */
export interface NotificationPreference {
  id: string;
  resident_id: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  frequency: PreferenceFrequency;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Escalation state from database
 */
export interface EscalationState {
  id: string;
  entity_type: string;
  entity_id: string;
  resident_id: string;
  current_level: number;
  last_notification_id: string | null;
  last_notified_at: string | null;
  next_scheduled_at: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// INPUT/OPERATION TYPES
// ============================================================================

/**
 * Input for creating a new template
 */
export interface CreateTemplateInput {
  name: string;
  display_name: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  subject_template?: string;
  body_template: string;
  html_template?: string;
  variables?: TemplateVariable[];
  is_active?: boolean;
}

/**
 * Input for updating a template
 */
export interface UpdateTemplateInput {
  display_name?: string;
  category?: NotificationCategory;
  channel?: NotificationChannel;
  subject_template?: string;
  body_template?: string;
  html_template?: string;
  variables?: TemplateVariable[];
  is_active?: boolean;
}

/**
 * Input for creating a new schedule
 */
export interface CreateScheduleInput {
  name: string;
  template_id: string;
  trigger_type: TriggerType;
  trigger_value?: number;
  cron_expression?: string;
  event_type?: NotificationEventType;
  escalation_sequence?: number;
  parent_schedule_id?: string;
  conditions?: Record<string, unknown>;
  is_active?: boolean;
}

/**
 * Input for updating a schedule
 */
export interface UpdateScheduleInput {
  name?: string;
  template_id?: string;
  trigger_type?: TriggerType;
  trigger_value?: number;
  cron_expression?: string;
  event_type?: NotificationEventType;
  escalation_sequence?: number;
  parent_schedule_id?: string;
  conditions?: Record<string, unknown>;
  is_active?: boolean;
}

/**
 * Input for queueing a notification
 */
export interface QueueNotificationInput {
  template_id?: string;
  schedule_id?: string;
  recipient_id: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  html_body?: string;
  variables?: Record<string, unknown>;
  priority?: number;
  scheduled_for?: Date;
  deduplication_key?: string;
  dedup_window_minutes?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating notification preferences
 */
export interface UpdatePreferencesInput {
  resident_id: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled?: boolean;
  frequency?: PreferenceFrequency;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result from rendering a template
 */
export interface RenderTemplateResult {
  subject: string | null;
  body: string;
  html: string | null;
}

/**
 * Result from checking deduplication
 */
export interface DeduplicationCheckResult {
  isDuplicate: boolean;
  existingId?: string;
  reason?: string;
}

/**
 * Result from sending a notification
 */
export interface SendNotificationResult {
  success: boolean;
  historyId?: string;
  externalId?: string;
  error?: string;
}

/**
 * Result from processing the queue
 */
export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ queueId: string; error: string }>;
}

// ============================================================================
// JOINED/ENRICHED TYPES
// ============================================================================

/**
 * Schedule with template details
 */
export interface ScheduleWithTemplate extends NotificationSchedule {
  template: NotificationTemplate;
}

/**
 * Queue item with recipient and template details
 */
export interface QueueItemWithDetails extends NotificationQueueItem {
  template?: NotificationTemplate;
  recipient?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone_primary: string;
    resident_code: string;
  };
}

/**
 * History entry with recipient and template details
 */
export interface HistoryEntryWithDetails extends NotificationHistoryEntry {
  template?: NotificationTemplate;
  recipient?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone_primary: string;
    resident_code: string;
  };
}

/**
 * Preferences grouped by category
 */
export interface PreferencesByCategory {
  category: NotificationCategory;
  channels: {
    channel: NotificationChannel;
    enabled: boolean;
    frequency: PreferenceFrequency;
    implemented: boolean;
  }[];
}
