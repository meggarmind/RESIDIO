"use client";

import { recordPerformanceEvent } from "@/lib/performance";

/**
 * Small, dependency-free IndexedDB adapter for safe admin read snapshots.
 *
 * This cache deliberately has no mutation queue. Financial, security, and
 * access-control writes must be performed against the live Supabase service.
 */

const DATABASE_NAME = "residio-admin-read-cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const CACHE_SCHEMA_VERSION = 1;
const TELEMETRY_CACHE_NAME = "admin.read";

export type AdminReadCacheScope = {
  userId: string;
  estateId?: string | null;
};

export type AdminReadSnapshot<T> = {
  data: T;
  savedAt: number;
  expiresAt: number;
  isStale: boolean;
};

type StoredSnapshot<T> = Omit<AdminReadSnapshot<T>, "isStale"> & {
  id: string;
  schemaVersion: number;
  maxStaleAt: number;
};

export const ADMIN_READ_CACHE_TTLS = {
  dashboard: 5 * 60 * 1000,
  list: 2 * 60 * 1000,
} as const;

function databaseAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function scopeKey(scope: AdminReadCacheScope): string {
  return `${scope.userId}:${scope.estateId ?? "default"}`;
}

function snapshotKey(scope: AdminReadCacheScope, key: string): string {
  return `${scopeKey(scope)}:${key}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!databaseAvailable()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline cache"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline cache request failed"));
  });
}

export async function saveAdminReadSnapshot<T>(
  scope: AdminReadCacheScope,
  key: string,
  data: T,
  options: { ttlMs: number; maxStaleMs?: number },
): Promise<void> {
  const database = await openDatabase();
  if (!database) return;

  const savedAt = Date.now();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put({
    id: snapshotKey(scope, key),
    data,
    savedAt,
    expiresAt: savedAt + options.ttlMs,
    maxStaleAt: savedAt + options.ttlMs + (options.maxStaleMs ?? 24 * 60 * 60 * 1000),
    schemaVersion: CACHE_SCHEMA_VERSION,
  } satisfies StoredSnapshot<T>);

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save offline snapshot"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline snapshot transaction aborted"));
  }).finally(() => database.close());
}

export async function readAdminReadSnapshot<T>(
  scope: AdminReadCacheScope,
  key: string,
): Promise<AdminReadSnapshot<T> | null> {
  const database = await openDatabase();
  if (!database) {
    recordPerformanceEvent({ type: "cache_miss", cache: TELEMETRY_CACHE_NAME });
    return null;
  }

  try {
    const stored = await requestResult<StoredSnapshot<T> | undefined>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(snapshotKey(scope, key)),
    );
    if (!stored || stored.schemaVersion !== CACHE_SCHEMA_VERSION) {
      recordPerformanceEvent({ type: "cache_miss", cache: TELEMETRY_CACHE_NAME });
      return null;
    }
    if (Date.now() > stored.maxStaleAt) {
      recordPerformanceEvent({ type: "cache_miss", cache: TELEMETRY_CACHE_NAME });
      await deleteAdminReadSnapshot(scope, key);
      return null;
    }
    const isStale = Date.now() > stored.expiresAt;
    const ageMs = Math.max(0, Date.now() - stored.savedAt);
    recordPerformanceEvent(isStale
      ? { type: "stale_snapshot", snapshot: "admin.read", ageMs, maxStaleMs: Math.max(0, stored.maxStaleAt - stored.savedAt) }
      : { type: "cache_hit", cache: TELEMETRY_CACHE_NAME, ageMs });
    return {
      data: stored.data,
      savedAt: stored.savedAt,
      expiresAt: stored.expiresAt,
      isStale,
    };
  } finally {
    database.close();
  }
}

export async function deleteAdminReadSnapshot(scope: AdminReadCacheScope, key: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(snapshotKey(scope, key)));
  } finally {
    database.close();
  }
}

export async function clearAdminReadCache(scope?: AdminReadCacheScope): Promise<void> {
  const database = await openDatabase();
  if (!database) return;

  try {
    if (!scope) {
      await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear());
      return;
    }

    const store = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
    const request = store.openCursor();
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error("Unable to clear offline scope"));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (String(cursor.key).startsWith(`${scopeKey(scope)}:`)) cursor.delete();
        cursor.continue();
      };
    });
  } finally {
    database.close();
  }
}
