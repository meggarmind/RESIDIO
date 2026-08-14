import { describe, expect, it, vi } from "vitest";

import {
  configurePerformanceTelemetry,
  PerformanceTelemetry,
  recordPerformanceEvent,
} from "../index";
import type { PerformanceEvent } from "../index";

describe("performance telemetry seam", () => {
  it("supports every closed event type without accepting payloads", () => {
    const events: PerformanceEvent[] = [];
    const telemetry = new PerformanceTelemetry({ sink: { emit: (event) => events.push(event) }, clock: () => 1234 });

    for (const event of [
      { type: "query_duration", operation: "dashboard.snapshot", durationMs: 12, success: true },
      { type: "result_size", operation: "dashboard.snapshot", itemCount: 4, byteSize: 512 },
      { type: "cache_hit", cache: "admin.snapshot", ageMs: 30 },
      { type: "cache_miss", cache: "admin.snapshot" },
      { type: "stale_snapshot", snapshot: "admin.snapshot", ageMs: 80, maxStaleMs: 100 },
      { type: "offline_action", action: "payment.create", blocked: true },
      { type: "mutation_failure", mutation: "payment.create", retryable: false, errorCode: "timeout" },
    ] satisfies Array<Parameters<PerformanceTelemetry["record"]>[0]>) {
      expect(telemetry.record(event)).toBe(true);
    }

    expect(events).toHaveLength(7);
    expect(events.every((event) => event.version === 1 && event.occurredAt === 1234)).toBe(true);
    expect(events.every((event) => !Object.prototype.hasOwnProperty.call(event, "payload"))).toBe(true);
  });

  it("redacts unsafe labels and bounds metrics before emission", () => {
    const emit = vi.fn();
    const telemetry = new PerformanceTelemetry({ sink: { emit }, clock: () => 9 });

    telemetry.record({
      type: "mutation_failure",
      mutation: "alice@example.com?token=secret",
      retryable: true,
      errorCode: "ERR-500",
    });
    telemetry.record({
      type: "query_duration",
      operation: "dashboard.snapshot",
      durationMs: Number.POSITIVE_INFINITY,
      resultCount: Number.MAX_SAFE_INTEGER,
      success: true,
    });

    expect(emit).toHaveBeenNthCalledWith(1, {
      version: 1,
      occurredAt: 9,
      type: "mutation_failure",
      mutation: "redacted",
      retryable: true,
      errorCode: "redacted",
    });
    expect(emit).toHaveBeenNthCalledWith(2, {
      version: 1,
      occurredAt: 9,
      type: "query_duration",
      operation: "dashboard.snapshot",
      durationMs: 0,
      resultCount: 1_000_000_000,
      success: true,
    });
  });

  it("samples safely and treats a disabled instance as a no-op", () => {
    const emit = vi.fn();
    const event = { type: "cache_hit", cache: "admin.snapshot" } as const;
    const sampledOut = new PerformanceTelemetry({ sink: { emit }, sampleRate: 0.1, random: () => 0.9 });
    const disabled = new PerformanceTelemetry({ sink: { emit }, enabled: false });

    expect(sampledOut.record(event)).toBe(false);
    expect(disabled.record(event)).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it("swallows clock, sampler, and sink failures without logging", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const telemetry = new PerformanceTelemetry({
      sink: { emit: () => { throw new Error("sensitive sink detail"); } },
      clock: () => { throw new Error("sensitive clock detail"); },
    });

    expect(() => telemetry.record({ type: "offline_action", action: "payment.create", blocked: true })).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("provides a reversible global configuration for client and server callers", () => {
    const emit = vi.fn();
    const restore = configurePerformanceTelemetry({ sink: { emit }, sampleRate: 1, clock: () => 42 });

    expect(recordPerformanceEvent({ type: "stale_snapshot", snapshot: "admin.snapshot", ageMs: 4, maxStaleMs: 10 })).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);

    restore();
    expect(recordPerformanceEvent({ type: "stale_snapshot", snapshot: "admin.snapshot", ageMs: 4, maxStaleMs: 10 })).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
