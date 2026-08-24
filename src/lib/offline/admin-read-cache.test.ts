import { describe, expect, it } from "vitest";
import {
  ADMIN_READ_CACHE_TTLS,
  getAdminReadCacheScope,
  readAdminReadSnapshot,
  saveAdminReadSnapshot,
} from "@/lib/offline/admin-read-cache";

describe("admin read cache", () => {
  it("degrades safely when IndexedDB is unavailable", async () => {
    const scope = getAdminReadCacheScope("user-1", "estate-1");

    await expect(saveAdminReadSnapshot(scope, "dashboard", { value: 1 }, { ttlMs: 1000 })).resolves.toBeUndefined();
    await expect(readAdminReadSnapshot(scope, "dashboard")).resolves.toBeNull();
  });

  it("keeps cache scope tied to both user and estate", () => {
    expect(getAdminReadCacheScope("user-1", "estate-1")).toEqual({ userId: "user-1", estateId: "estate-1" });
    expect(getAdminReadCacheScope("user-2", "estate-1")).not.toEqual(getAdminReadCacheScope("user-1", "estate-1"));
    expect(getAdminReadCacheScope("user-1", "estate-2")).not.toEqual(getAdminReadCacheScope("user-1", "estate-1"));
  });

  it("defines bounded TTLs for dashboard and list snapshots", () => {
    expect(ADMIN_READ_CACHE_TTLS.dashboard).toBe(5 * 60 * 1000);
    expect(ADMIN_READ_CACHE_TTLS.list).toBe(2 * 60 * 1000);
  });
});
