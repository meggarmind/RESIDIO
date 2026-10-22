import type { PerformanceEvent, PerformanceTelemetrySink } from "./types";

export const PERFORMANCE_INGEST_PATH = "/api/telemetry/performance";
const MAX_BATCH = 20;
const FLUSH_MS = 10_000;

/**
 * Batches events and posts them to the ingest route. Fails silently: telemetry
 * must never surface an error or block the page. `mutation_failure` is not sent
 * in this slice (#957), so it is dropped here rather than rejected by the server.
 */
export function createBeaconSink(): PerformanceTelemetrySink & { flush(): void } {
  let queue: PerformanceEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (queue.length === 0) return;
    const body = JSON.stringify({ events: queue });
    queue = [];
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && navigator.sendBeacon?.(PERFORMANCE_INGEST_PATH, blob)) return;
      void fetch(PERFORMANCE_INGEST_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Dropped on purpose.
    }
  }

  return {
    emit(event) {
      if (event.type === "mutation_failure") return;
      queue.push(event);
      if (queue.length >= MAX_BATCH) flush();
      else timer ??= setTimeout(flush, FLUSH_MS);
    },
    flush,
  };
}
