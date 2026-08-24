"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  readAdminReadSnapshot,
  saveAdminReadSnapshot,
  type AdminReadSnapshot,
  type AdminReadCacheScope,
} from "@/lib/offline/admin-read-cache";
import { isOnline, useIsOnline } from "@/lib/offline/network-status";
import { recordPerformanceEvent } from "@/lib/performance";

type UseOfflineAdminSnapshotOptions<T> = {
  queryKey: QueryKey;
  cacheKey: string;
  queryFn: () => Promise<T>;
  ttlMs: number;
  enabled?: boolean;
  maxStaleMs?: number;
  queryOptions?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn" | "enabled">;
  estateId?: string;
};

/**
 * React Query adapter for safe admin reads. It remains network-first while
 * online and falls back to a scoped IndexedDB snapshot when disconnected or
 * when the live request fails.
 */
export function useOfflineAdminSnapshot<T>({
  queryKey,
  cacheKey,
  queryFn,
  ttlMs,
  enabled = true,
  maxStaleMs,
  queryOptions,
  estateId = "default",
}: UseOfflineAdminSnapshotOptions<T>) {
  const { user } = useAuth();
  const online = useIsOnline();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<AdminReadSnapshot<T> | null>(null);
  const resolvedEstateId = user?.app_metadata?.estate_id ?? user?.user_metadata?.estate_id ?? estateId;
  const queryKeySignature = JSON.stringify(queryKey);
  const stableQueryKey = useMemo(() => JSON.parse(queryKeySignature) as QueryKey, [queryKeySignature]);
  const scope = useMemo<AdminReadCacheScope | null>(
    () => (user ? { userId: user.id, estateId: resolvedEstateId } : null),
    [resolvedEstateId, user],
  );
  const wasOnline = useRef(online);

  useEffect(() => {
    if (!enabled || !scope) return;
    let cancelled = false;

    void readAdminReadSnapshot<T>(scope, cacheKey).then((cached) => {
      if (cancelled || !cached) return;
      setSnapshot(cached);
      if (queryClient.getQueryData<T>(stableQueryKey) === undefined) {
        queryClient.setQueryData(stableQueryKey, cached.data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, queryClient, scope, stableQueryKey]);

  useEffect(() => {
    if (online && !wasOnline.current && enabled && scope) {
      void queryClient.refetchQueries({ queryKey: stableQueryKey, type: "active" });
    }
    wasOnline.current = online;
  }, [enabled, online, queryClient, scope, stableQueryKey]);

  const query = useQuery<T>({
    ...queryOptions,
    queryKey: stableQueryKey,
    refetchOnReconnect: true,
    enabled: enabled && !!scope,
    queryFn: async () => {
      const startedAt = Date.now();
      const operation = cacheKey.startsWith("residents:") ? "admin.residents" : "admin.snapshot";
      if (!isOnline()) {
        const cached = scope ? await readAdminReadSnapshot<T>(scope, cacheKey) : null;
        if (cached) {
          setSnapshot(cached);
          recordPerformanceEvent({ type: "query_duration", operation, durationMs: Date.now() - startedAt, success: true });
          return cached.data;
        }
      }

      try {
        const data = await queryFn();
        if (scope) {
          const savedAt = Date.now();
          setSnapshot({ data, savedAt, expiresAt: savedAt + ttlMs, isStale: false });
          void saveAdminReadSnapshot(scope, cacheKey, data, { ttlMs, maxStaleMs });
        }
        recordPerformanceEvent({ type: "query_duration", operation, durationMs: Date.now() - startedAt, success: true });
        return data;
      } catch (error) {
        const cached = scope ? await readAdminReadSnapshot<T>(scope, cacheKey) : null;
        if (cached) {
          setSnapshot(cached);
          recordPerformanceEvent({ type: "query_duration", operation, durationMs: Date.now() - startedAt, success: true });
          return cached.data;
        }
        recordPerformanceEvent({ type: "query_duration", operation, durationMs: Date.now() - startedAt, success: false });
        throw error;
      }
    },
  });

  return {
    ...query,
    isOffline: !online,
    isStaleSnapshot: snapshot?.isStale ?? false,
    snapshotSavedAt: snapshot?.savedAt ?? null,
  };
}
