import type {
  PerformanceEvent,
  PerformanceEventInput,
  PerformanceTelemetryOptions,
  PerformanceTelemetrySink,
} from "./types";

const MAX_LABEL_LENGTH = 64;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_COUNT = 1_000_000_000;
const MAX_BYTE_SIZE = 1_000_000_000_000;
const REDACTED_LABEL = "redacted";

const NOOP_SINK: PerformanceTelemetrySink = {
  emit: () => undefined,
};

function isProductionRuntime(): boolean {
  try {
    const runtime = globalThis as typeof globalThis & {
      process?: { env?: { NODE_ENV?: string } };
    };
    return runtime.process?.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
}

function defaultSampleRate(): number {
  return isProductionRuntime() ? 0.1 : 1;
}

function clamp(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.round(value)), maximum);
}

/**
 * Labels are logical operation names, not identifiers. Anything outside the
 * small allow-list is replaced before it reaches a sink, which prevents raw
 * emails, UUIDs, query strings, and other accidental payloads from leaking.
 */
function safeLabel(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_LABEL_LENGTH ||
    !/^[a-z][a-z._:-]*$/.test(value)
  ) {
    return REDACTED_LABEL;
  }

  return value;
}

function safeTimestamp(clock: () => number): number {
  try {
    const timestamp = clock();
    return Number.isFinite(timestamp) ? Math.max(0, Math.floor(timestamp)) : 0;
  } catch {
    return 0;
  }
}

function sanitizeEvent(event: PerformanceEventInput, occurredAt: number): PerformanceEvent | null {
  if (!event || typeof event !== "object" || typeof event.type !== "string") return null;

  switch (event.type) {
    case "query_duration":
      return {
        version: 1,
        occurredAt,
        type: event.type,
        operation: safeLabel(event.operation),
        durationMs: clamp(event.durationMs, MAX_DURATION_MS),
        success: event.success === true,
        ...(event.resultCount === undefined
          ? {}
          : { resultCount: clamp(event.resultCount, MAX_COUNT) }),
      };
    case "result_size":
      return {
        version: 1,
        occurredAt,
        type: event.type,
        operation: safeLabel(event.operation),
        ...(event.itemCount === undefined
          ? {}
          : { itemCount: clamp(event.itemCount, MAX_COUNT) }),
        ...(event.byteSize === undefined
          ? {}
          : { byteSize: clamp(event.byteSize, MAX_BYTE_SIZE) }),
      };
    case "cache_hit":
    case "cache_miss":
      return {
        version: 1,
        occurredAt,
        type: event.type,
        cache: safeLabel(event.cache),
        ...(event.ageMs === undefined ? {} : { ageMs: clamp(event.ageMs, MAX_DURATION_MS) }),
      };
    case "stale_snapshot":
      return {
        version: 1,
        occurredAt,
        type: event.type,
        snapshot: safeLabel(event.snapshot),
        ageMs: clamp(event.ageMs, MAX_DURATION_MS),
        maxStaleMs: clamp(event.maxStaleMs, MAX_DURATION_MS),
      };
    case "offline_action":
      return {
        version: 1,
        occurredAt,
        type: event.type,
        action: safeLabel(event.action),
        blocked: event.blocked === true,
      };
    case "mutation_failure":
      return {
        version: 1,
        occurredAt,
        type: event.type,
        mutation: safeLabel(event.mutation),
        retryable: event.retryable === true,
        ...(event.errorCode === undefined ? {} : { errorCode: safeLabel(event.errorCode) }),
      };
    default:
      return null;
  }
}

export class PerformanceTelemetry {
  private readonly sink: PerformanceTelemetrySink;
  private readonly enabled: boolean;
  private readonly sampleRate: number;
  private readonly random: () => number;
  private readonly clock: () => number;

  constructor(options: PerformanceTelemetryOptions = {}) {
    this.sink = options.sink ?? NOOP_SINK;
    this.enabled = options.enabled ?? true;
    this.sampleRate = Math.min(Math.max(options.sampleRate ?? defaultSampleRate(), 0), 1);
    this.random = options.random ?? Math.random;
    this.clock = options.clock ?? Date.now;
  }

  /** Returns false for disabled, sampled-out, malformed, or sink-failed events. */
  record(event: PerformanceEventInput): boolean {
    try {
      if (!this.enabled || this.sampleRate === 0) return false;
      if (this.sampleRate < 1 && this.random() >= this.sampleRate) return false;

      const sanitized = sanitizeEvent(event, safeTimestamp(this.clock));
      if (!sanitized) return false;

      this.sink.emit(sanitized);
      return true;
    } catch {
      // Telemetry must never break or disclose anything about the host app.
      return false;
    }
  }
}

let globalTelemetry = new PerformanceTelemetry();

export function getPerformanceTelemetry(): PerformanceTelemetry {
  return globalTelemetry;
}

export function configurePerformanceTelemetry(options: PerformanceTelemetryOptions): () => void {
  const previous = globalTelemetry;
  globalTelemetry = new PerformanceTelemetry(options);
  return () => {
    globalTelemetry = previous;
  };
}

export function recordPerformanceEvent(event: PerformanceEventInput): boolean {
  return globalTelemetry.record(event);
}
