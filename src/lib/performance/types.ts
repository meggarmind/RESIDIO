/**
 * Performance telemetry deliberately has no arbitrary metadata field. Keeping
 * the event contract closed prevents callers from accidentally sending names,
 * tokens, response bodies, or error objects to an observability sink.
 */
export type PerformanceEventType =
  | "query_duration"
  | "result_size"
  | "cache_hit"
  | "cache_miss"
  | "stale_snapshot"
  | "offline_action"
  | "mutation_failure";

export interface PerformanceEventBase {
  readonly version: 1;
  readonly occurredAt: number;
}

export interface QueryDurationEvent extends PerformanceEventBase {
  readonly type: "query_duration";
  readonly operation: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly resultCount?: number;
}

export interface ResultSizeEvent extends PerformanceEventBase {
  readonly type: "result_size";
  readonly operation: string;
  readonly itemCount?: number;
  readonly byteSize?: number;
}

export interface CacheEvent extends PerformanceEventBase {
  readonly type: "cache_hit" | "cache_miss";
  readonly cache: string;
  readonly ageMs?: number;
}

export interface StaleSnapshotEvent extends PerformanceEventBase {
  readonly type: "stale_snapshot";
  readonly snapshot: string;
  readonly ageMs: number;
  readonly maxStaleMs: number;
}

export interface OfflineActionEvent extends PerformanceEventBase {
  readonly type: "offline_action";
  readonly action: string;
  readonly blocked: boolean;
}

export interface MutationFailureEvent extends PerformanceEventBase {
  readonly type: "mutation_failure";
  readonly mutation: string;
  readonly retryable: boolean;
  readonly errorCode?: string;
}

export type PerformanceEvent =
  | QueryDurationEvent
  | ResultSizeEvent
  | CacheEvent
  | StaleSnapshotEvent
  | OfflineActionEvent
  | MutationFailureEvent;

type EventInput<T extends PerformanceEvent> = Omit<T, "occurredAt" | "version">;

export type PerformanceEventInput =
  | EventInput<QueryDurationEvent>
  | EventInput<ResultSizeEvent>
  | EventInput<CacheEvent>
  | EventInput<StaleSnapshotEvent>
  | EventInput<OfflineActionEvent>
  | EventInput<MutationFailureEvent>;

export interface PerformanceTelemetrySink {
  emit(event: PerformanceEvent): void;
}

export interface PerformanceTelemetryOptions {
  /** A closed, payload-free sink. The default sink intentionally does nothing. */
  readonly sink?: PerformanceTelemetrySink;
  readonly enabled?: boolean;
  /** A value in [0, 1]. Production defaults to 10%; non-production to 100%. */
  readonly sampleRate?: number;
  /** Injectable only for deterministic tests; never receives application data. */
  readonly random?: () => number;
  /** Injectable only for deterministic tests. */
  readonly clock?: () => number;
}
