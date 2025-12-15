'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getAuditLogs,
  getEntityAuditLogs,
  getAuditStats,
  getAuditActors,
  type GetAuditLogsParams,
} from '@/actions/audit';
import type { AuditEntityType } from '@/types/database';

/**
 * Hook to fetch audit logs with filtering and pagination.
 */
export function useAuditLogs(params: GetAuditLogsParams = {}) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const result = await getAuditLogs(params);
      if (result.error) throw new Error(result.error);
      return { data: result.data, total: result.total };
    },
  });
}

/**
 * Hook to fetch audit logs for a specific entity.
 * Useful for showing audit history on entity detail pages.
 *
 * @example
 * // On a resident detail page
 * const { data: auditLogs } = useEntityAuditLogs('residents', residentId);
 */
export function useEntityAuditLogs(
  entityType: AuditEntityType,
  entityId: string,
  limit?: number
) {
  return useQuery({
    queryKey: ['entity-audit-logs', entityType, entityId],
    queryFn: async () => {
      const result = await getEntityAuditLogs(entityType, entityId, limit);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!entityId,
  });
}

/**
 * Hook to fetch audit statistics for dashboard display.
 * Auto-refreshes every 30 seconds to show real-time activity.
 */
export function useAuditStats() {
  return useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      const result = await getAuditStats();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Hook to fetch all actors who have audit log entries.
 * Useful for populating actor filter dropdown.
 */
export function useAuditActors() {
  return useQuery({
    queryKey: ['audit-actors'],
    queryFn: async () => {
      const result = await getAuditActors();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}
