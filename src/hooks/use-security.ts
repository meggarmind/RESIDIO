'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  // Settings
  getSecuritySettings,
  getSecurityRolePermissions,
  updateSecurityRolePermissions,
  updateSecuritySetting,
  resetSecuritySettingsToDefault,
  getCurrentUserSecurityPermissions,
  // Contacts
  getSecurityContacts,
  getSecurityContact,
  getResidentSecurityContacts,
  createSecurityContact,
  updateSecurityContact,
  updateSecurityContactStatus,
  deleteSecurityContact,
  searchSecurityContacts,
  getActiveContactCount,
  getExpiredContactCount,
  getExpiringContactCount,
  // Codes
  generateAccessCode,
  getContactAccessCodes,
  regenerateAccessCode,
  revokeAccessCode,
  verifyAccessCode,
  // Access Logs
  recordCheckIn,
  recordCheckOut,
  flagAccess,
  unflagAccess,
  getAccessLogs,
  getContactAccessHistory,
  getTodayAccessLogs,
  getFlaggedAccessLogs,
  getAccessLogStats,
  // Categories
  getSecurityContactCategories,
  getSecurityContactCategory,
  updateSecurityContactCategory,
  createSecurityContactCategory,
  toggleCategoryActive,
  // Export
  exportSecurityContactsCSV,
  exportAccessLogsCSV,
  // Vehicles (Visitor Management Enhancement)
  getContactVehicles,
  getVehicle,
  searchVehicleByPlate,
  createVehicle,
  updateVehicle,
  deactivateVehicle,
  setPrimaryVehicle,
  // Visitor Analytics (Visitor Management Enhancement)
  getVisitorAnalytics,
  getFrequentVisitors,
  getVisitorHistorySummary,
  updateRecurringSchedule,
  getVisitorDashboardStats,
  getContactVisitHistory,
  getTodayExpectedRecurringVisitors,
} from '@/actions/security';
import type {
  CreateSecurityContactData,
  UpdateSecurityContactData,
  UpdateSecurityContactStatusData,
  SecurityContactFilters,
  CreateAccessCodeData,
  RevokeAccessCodeData,
  VerifyAccessCodeData,
  CheckInData,
  CheckOutData,
  FlagAccessData,
  AccessLogsFilters,
  UpdateCategoryData,
  // Visitor Management Enhancement types
  CreateVisitorVehicleData,
  UpdateVisitorVehicleData,
  UpdateRecurringScheduleData,
  VisitorAnalyticsFilters,
} from '@/lib/validators/security-contact';
import type { SecurityRolePermissions } from '@/types/database';

// ==================== Settings Hooks ====================

export function useSecuritySettings() {
  return useQuery({
    queryKey: ['securitySettings'],
    queryFn: async () => {
      const result = await getSecuritySettings();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useSecurityRolePermissions() {
  return useQuery({
    queryKey: ['securityRolePermissions'],
    queryFn: async () => {
      const result = await getSecurityRolePermissions();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCurrentUserSecurityPermissions() {
  return useQuery({
    queryKey: ['currentUserSecurityPermissions'],
    queryFn: async () => {
      const result = await getCurrentUserSecurityPermissions();
      return result;
    },
  });
}

export function useUpdateSecurityRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (permissions: SecurityRolePermissions) => {
      const result = await updateSecurityRolePermissions(permissions);
      if (!result.success) throw new Error(result.error || 'Failed to update permissions');
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securitySettings'] });
      queryClient.invalidateQueries({ queryKey: ['securityRolePermissions'] });
      queryClient.invalidateQueries({ queryKey: ['currentUserSecurityPermissions'] });
    },
  });
}

export function useUpdateSecuritySetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const result = await updateSecuritySetting(key, value);
      if (!result.success) throw new Error(result.error || 'Failed to update setting');
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securitySettings'] });
    },
  });
}

export function useResetSecuritySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await resetSecuritySettingsToDefault();
      if (!result.success) throw new Error(result.error || 'Failed to reset settings');
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securitySettings'] });
      queryClient.invalidateQueries({ queryKey: ['securityRolePermissions'] });
    },
  });
}

// ==================== Contact Hooks ====================

export function useSecurityContacts(filters: SecurityContactFilters = {}) {
  return useQuery({
    queryKey: ['securityContacts', filters],
    queryFn: async () => {
      const result = await getSecurityContacts(filters);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

/**
 * Hook to get the count of truly active security contacts.
 * Excludes contacts with all expired access codes.
 */
export function useActiveContactCount() {
  return useQuery({
    queryKey: ['activeContactCount'],
    queryFn: async () => {
      const result = await getActiveContactCount();
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    // Optimized: 60s → 120s (count doesn't change frequently)
    refetchInterval: 120000,
    staleTime: 60000,
  });
}

/**
 * Hook to get the count of expired security contacts.
 * Includes contacts with status='active' but all codes expired.
 */
export function useExpiredContactCount() {
  return useQuery({
    queryKey: ['expiredContactCount'],
    queryFn: async () => {
      const result = await getExpiredContactCount();
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    // Optimized: 60s → 120s (count doesn't change frequently)
    refetchInterval: 120000,
    staleTime: 60000,
  });
}

/**
 * Hook to get the count of contacts expiring within X days.
 */
export function useExpiringContactCount(days: number = 7) {
  return useQuery({
    queryKey: ['expiringContactCount', days],
    queryFn: async () => {
      const result = await getExpiringContactCount(days);
      if (result.error) throw new Error(result.error);
      return result.count;
    },
    // Optimized: 60s → 300s (expiring contacts are checked less frequently)
    refetchInterval: 300000,
    staleTime: 120000,
  });
}

export function useSecurityContact(id: string | undefined) {
  return useQuery({
    queryKey: ['securityContact', id],
    queryFn: async () => {
      if (!id) throw new Error('Contact ID is required');
      const result = await getSecurityContact(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useResidentSecurityContacts(residentId: string | undefined) {
  return useQuery({
    queryKey: ['residentSecurityContacts', residentId],
    queryFn: async () => {
      if (!residentId) throw new Error('Resident ID is required');
      const result = await getResidentSecurityContacts(residentId);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
    enabled: !!residentId,
  });
}

export function useSearchSecurityContacts(query: string) {
  return useQuery({
    queryKey: ['searchSecurityContacts', query],
    queryFn: async () => {
      const result = await searchSecurityContacts(query);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: query.length >= 2,
  });
}

export function useCreateSecurityContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSecurityContactData) => {
      const result = await createSecurityContact(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['securityContacts'] });
      queryClient.invalidateQueries({ queryKey: ['residentSecurityContacts', variables.resident_id] });
    },
  });
}

export function useUpdateSecurityContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateSecurityContactData) => {
      const result = await updateSecurityContact(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['securityContacts'] });
      queryClient.invalidateQueries({ queryKey: ['securityContact', variables.id] });
    },
  });
}

export function useUpdateSecurityContactStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateSecurityContactStatusData) => {
      const result = await updateSecurityContactStatus(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['securityContacts'] });
      queryClient.invalidateQueries({ queryKey: ['securityContact', variables.id] });
    },
  });
}

export function useDeleteSecurityContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteSecurityContact(id);
      if (!result.success) throw new Error(result.error || 'Failed to delete contact');
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securityContacts'] });
    },
  });
}

// ==================== Access Code Hooks ====================

export function useContactAccessCodes(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contactAccessCodes', contactId],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');
      const result = await getContactAccessCodes(contactId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!contactId,
  });
}

export function useVerifyAccessCode() {
  return useMutation({
    mutationFn: async (data: VerifyAccessCodeData) => {
      const result = await verifyAccessCode(data);
      if (result.error) throw new Error(result.error);
      return result;
    },
  });
}

export function useGenerateAccessCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAccessCodeData) => {
      const result = await generateAccessCode(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contactAccessCodes', variables.contact_id] });
      queryClient.invalidateQueries({ queryKey: ['securityContact', variables.contact_id] });
    },
  });
}

export function useRegenerateAccessCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (codeId: string) => {
      const result = await regenerateAccessCode(codeId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contactAccessCodes'] });
      queryClient.invalidateQueries({ queryKey: ['securityContacts'] });
    },
  });
}

export function useRevokeAccessCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: RevokeAccessCodeData) => {
      const result = await revokeAccessCode(data);
      if (!result.success) throw new Error(result.error || 'Failed to revoke code');
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contactAccessCodes'] });
      queryClient.invalidateQueries({ queryKey: ['securityContacts'] });
    },
  });
}

// ==================== Access Log Hooks ====================

export function useAccessLogs(filters: AccessLogsFilters = {}) {
  return useQuery({
    queryKey: ['accessLogs', filters],
    queryFn: async () => {
      const result = await getAccessLogs(filters);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
  });
}

export function useContactAccessHistory(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contactAccessHistory', contactId],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');
      const result = await getContactAccessHistory(contactId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!contactId,
  });
}

export function useTodayAccessLogs() {
  return useQuery({
    queryKey: ['todayAccessLogs'],
    queryFn: async () => {
      const result = await getTodayAccessLogs();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useFlaggedAccessLogs() {
  return useQuery({
    queryKey: ['flaggedAccessLogs'],
    queryFn: async () => {
      const result = await getFlaggedAccessLogs();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useAccessLogStats() {
  return useQuery({
    queryKey: ['accessLogStats'],
    queryFn: async () => {
      const result = await getAccessLogStats();
      if (result.error) throw new Error(result.error);
      return result;
    },
    // Optimized: 60s → 120s (stats aggregates don't need frequent updates)
    refetchInterval: 120000,
    staleTime: 60000,
  });
}

export function useRecordCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CheckInData) => {
      const result = await recordCheckIn(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessLogs'] });
      queryClient.invalidateQueries({ queryKey: ['todayAccessLogs'] });
      queryClient.invalidateQueries({ queryKey: ['accessLogStats'] });
      queryClient.invalidateQueries({ queryKey: ['contactAccessCodes'] });
    },
  });
}

export function useRecordCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CheckOutData) => {
      const result = await recordCheckOut(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessLogs'] });
      queryClient.invalidateQueries({ queryKey: ['todayAccessLogs'] });
    },
  });
}

export function useFlagAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: FlagAccessData) => {
      const result = await flagAccess(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessLogs'] });
      queryClient.invalidateQueries({ queryKey: ['flaggedAccessLogs'] });
      queryClient.invalidateQueries({ queryKey: ['accessLogStats'] });
    },
  });
}

export function useUnflagAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (logId: string) => {
      const result = await unflagAccess(logId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessLogs'] });
      queryClient.invalidateQueries({ queryKey: ['flaggedAccessLogs'] });
      queryClient.invalidateQueries({ queryKey: ['accessLogStats'] });
    },
  });
}

// ==================== Category Hooks ====================

export function useSecurityContactCategories(includeInactive: boolean = false) {
  return useQuery({
    queryKey: ['securityContactCategories', includeInactive],
    queryFn: async () => {
      const result = await getSecurityContactCategories(includeInactive);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useSecurityContactCategory(id: string | undefined) {
  return useQuery({
    queryKey: ['securityContactCategory', id],
    queryFn: async () => {
      if (!id) throw new Error('Category ID is required');
      const result = await getSecurityContactCategory(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

export function useUpdateSecurityContactCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateCategoryData) => {
      const result = await updateSecurityContactCategory(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['securityContactCategories'] });
      queryClient.invalidateQueries({ queryKey: ['securityContactCategory', variables.id] });
    },
  });
}

export function useCreateSecurityContactCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      default_validity_days: number;
      max_validity_days: number;
      requires_photo?: boolean;
      requires_id_document?: boolean;
      sort_order?: number;
    }) => {
      const result = await createSecurityContactCategory(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securityContactCategories'] });
    },
  });
}

export function useToggleCategoryActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await toggleCategoryActive(id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securityContactCategories'] });
    },
  });
}

// ==================== Export Hooks ====================

export function useExportSecurityContactsCSV() {
  return useMutation({
    mutationFn: async (filters: SecurityContactFilters = {}) => {
      const result = await exportSecurityContactsCSV(filters);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useExportAccessLogsCSV() {
  return useMutation({
    mutationFn: async (filters: {
      date_from?: string;
      date_to?: string;
      flagged_only?: boolean;
    } = {}) => {
      const result = await exportAccessLogsCSV(filters);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

// ==================== Vehicle Hooks (Visitor Management Enhancement) ====================

export function useContactVehicles(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contactVehicles', contactId],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');
      const result = await getContactVehicles(contactId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!contactId,
  });
}

export function useVehicle(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: async () => {
      if (!vehicleId) throw new Error('Vehicle ID is required');
      const result = await getVehicle(vehicleId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!vehicleId,
  });
}

export function useSearchVehicleByPlate() {
  return useMutation({
    mutationFn: async (plateNumber: string) => {
      const result = await searchVehicleByPlate(plateNumber);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateVisitorVehicleData) => {
      const result = await createVehicle(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contactVehicles', variables.contact_id] });
      queryClient.invalidateQueries({ queryKey: ['visitorDashboardStats'] });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateVisitorVehicleData) => {
      const result = await updateVehicle(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', variables.id] });
      if (data?.contact_id) {
        queryClient.invalidateQueries({ queryKey: ['contactVehicles', data.contact_id] });
      }
    },
  });
}

export function useDeactivateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicleId: string) => {
      const result = await deactivateVehicle(vehicleId);
      if (!result.success) throw new Error(result.error || 'Failed to deactivate vehicle');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contactVehicles'] });
      queryClient.invalidateQueries({ queryKey: ['visitorDashboardStats'] });
    },
  });
}

export function useSetPrimaryVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicleId: string) => {
      const result = await setPrimaryVehicle(vehicleId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data?.contact_id) {
        queryClient.invalidateQueries({ queryKey: ['contactVehicles', data.contact_id] });
      }
    },
  });
}

// ==================== Visitor Analytics Hooks (Visitor Management Enhancement) ====================

export function useVisitorAnalytics(filters: VisitorAnalyticsFilters = {}) {
  return useQuery({
    queryKey: ['visitorAnalytics', filters],
    queryFn: async () => {
      const result = await getVisitorAnalytics(filters);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useFrequentVisitors(minVisits: number = 5, days: number = 30, limit: number = 20) {
  return useQuery({
    queryKey: ['frequentVisitors', minVisits, days, limit],
    queryFn: async () => {
      const result = await getFrequentVisitors(minVisits, days, limit);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 300000, // Refresh every 5 minutes
  });
}

export function useVisitorHistorySummary(contactId: string | undefined, days: number = 90) {
  return useQuery({
    queryKey: ['visitorHistorySummary', contactId, days],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');
      const result = await getVisitorHistorySummary(contactId, days);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!contactId,
  });
}

export function useUpdateRecurringSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateRecurringScheduleData) => {
      const result = await updateRecurringSchedule(data);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['securityContact', variables.contact_id] });
      queryClient.invalidateQueries({ queryKey: ['securityContacts'] });
      queryClient.invalidateQueries({ queryKey: ['visitorAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['todayExpectedVisitors'] });
    },
  });
}

export function useVisitorDashboardStats() {
  return useQuery({
    queryKey: ['visitorDashboardStats'],
    queryFn: async () => {
      const result = await getVisitorDashboardStats();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds for real-time feel
  });
}

export function useContactVisitHistory(contactId: string | undefined, page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ['contactVisitHistory', contactId, page, limit],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');
      const result = await getContactVisitHistory(contactId, page, limit);
      if (result.error) throw new Error(result.error);
      return { data: result.data, count: result.count };
    },
    enabled: !!contactId,
  });
}

export function useTodayExpectedRecurringVisitors() {
  return useQuery({
    queryKey: ['todayExpectedVisitors'],
    queryFn: async () => {
      const result = await getTodayExpectedRecurringVisitors();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}
