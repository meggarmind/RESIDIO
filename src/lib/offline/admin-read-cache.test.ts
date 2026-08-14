import { describe, expect, it } from "vitest";
import { readAdminReadSnapshot, saveAdminReadSnapshot } from "@/lib/offline/admin-read-cache";

describe("admin read cache", () => {
  it("degrades safely when IndexedDB is unavailable", async () => {
    const scope = { userId: "user-1", estateId: "estate-1" };

    await expect(saveAdminReadSnapshot(scope, "dashboard", { value: 1 }, { ttlMs: 1000 })).resolves.toBeUndefined();
    await expect(readAdminReadSnapshot(scope, "dashboard")).resolves.toBeNull();
  });
});
