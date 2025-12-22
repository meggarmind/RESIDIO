/**
 * Phase 11: Notification System
 *
 * Central export for the notification library.
 *
 * This module provides a comprehensive notification system with:
 * - Multi-channel support (email now, SMS/WhatsApp future-proofed)
 * - Template rendering with {{variable}} interpolation
 * - Queue-based sending with deduplication
 * - Escalation workflow management
 * - Per-resident preference management
 *
 * @example
 * ```typescript
 * import {
 *   // Types
 *   NotificationChannel,
 *   NotificationCategory,
 *
 *   // Template rendering
 *   renderTemplate,
 *
 *   // Queue management
 *   addToQueue,
 *   processQueue,
 *
 *   // Send immediately
 *   sendImmediate,
 *
 *   // Preferences
 *   shouldSendToResident,
 *
 *   // Escalation
 *   advanceEscalation,
 *   resolveEscalation,
 * } from '@/lib/notifications';
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================
export * from './types';

// ============================================================================
// TEMPLATE RENDERING
// ============================================================================
export {
  // Error class
  TemplateRenderError,

  // Core functions
  extractVariables,
  validateVariables,
  interpolate,
  renderTemplate,
  previewTemplate,
  analyzeTemplate,

  // Utilities
  formatCurrency,
  formatDate,
  truncateForPreview,
} from './templates';

// ============================================================================
// DEDUPLICATION
// ============================================================================
export {
  // Constants
  DEFAULT_DEDUP_WINDOW_MINUTES,

  // Key generation
  generateDeduplicationKey,
  parseDeduplicationKey,

  // Checking
  checkDuplication,
  shouldQueue,

  // Maintenance
  cleanupOldQueueEntries,
  getDuplicatesForEntity,
} from './deduplication';

// ============================================================================
// SENDING
// ============================================================================
export {
  // Core sending
  sendNotification,
  sendAndRecordNotification,

  // Immediate (bypass queue)
  sendImmediate,
} from './send';

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================
export {
  // Constants
  PRIORITY,

  // Adding to queue
  addToQueue,
  addBatchToQueue,

  // Processing
  processQueue,

  // Management
  cancelQueueItem,
  retryQueueItem,

  // Queries
  getQueueStats,
  getQueueItems,

  // Maintenance
  purgeOldItems,
} from './queue';

// ============================================================================
// ESCALATION
// ============================================================================
export {
  // State management
  getOrCreateEscalationState,
  getEscalationState,
  advanceEscalation,
  resolveEscalation,
  resolveAllEscalationsForEntity,
  resetEscalation,

  // Scheduling
  scheduleNextEscalation,
  getDueEscalations,

  // Queries
  getActiveEscalations,
  getEscalationSummary,
} from './escalation';

// ============================================================================
// PREFERENCES
// ============================================================================
export {
  // Constants
  DEFAULT_PREFERENCES,

  // CRUD
  createDefaultPreferences,
  getPreferences,
  getPreferencesByCategory,
  getPreference,
  updatePreference,
  updatePreferences,
  deletePreferences,

  // Checks
  shouldSendToResident,

  // Bulk updates
  setAllChannelsForCategory,
  setAllCategoriesForChannel,
} from './preferences';
