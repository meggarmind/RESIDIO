import { afterEach, describe, expect, it } from "vitest";
import { assertOnlineForMutation, OfflineMutationError } from "@/lib/offline/network-status";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

describe("admin mutation network guard", () => {
  it("allows mutations when the browser is online", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: true },
    });

    expect(() => assertOnlineForMutation()).not.toThrow();
  });

  it("rejects mutations when the browser is offline", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: false },
    });

    expect(() => assertOnlineForMutation()).toThrow(OfflineMutationError);
  });
});
