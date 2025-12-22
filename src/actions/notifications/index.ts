/**
 * Phase 11: Notification Server Actions
 *
 * Central export for all notification-related server actions.
 */

// Templates
export {
  getTemplates,
  getTemplate,
  getTemplateByName,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplateActive,
  duplicateTemplate,
} from './templates';

// Schedules
export {
  getSchedules,
  getSchedule,
  getSchedulesByTrigger,
  getSchedulesByEvent,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  toggleScheduleActive,
  getEscalationChain,
} from './schedules';

// Queue
export {
  getNotificationQueue,
  getQueueItem,
  getQueueStatistics,
  queueNotificationFromTemplate,
  queueDirectNotification,
  cancelNotification,
  retryNotification,
  processNotificationQueue,
  getQueueForResident,
} from './queue';

// History
export {
  getNotificationHistory,
  getHistoryEntry,
  getHistoryForResident,
  getNotificationStats,
  getRecentNotifications,
  searchNotificationHistory,
  getDeliveryRate,
} from './history';

// Preferences
export {
  getResidentPreferences,
  getResidentPreferencesByCategory,
  updateResidentPreference,
  updateResidentPreferences,
  initializeResidentPreferences,
  toggleCategoryNotifications,
  toggleChannelNotifications,
  resetResidentPreferences,
  getPreferenceSummary,
} from './preferences';

// Send
export {
  sendTemplateNotification,
  sendDirectNotification,
  sendBulkNotification,
  sendWelcomeNotification,
  sendInvoiceNotification,
} from './send';
