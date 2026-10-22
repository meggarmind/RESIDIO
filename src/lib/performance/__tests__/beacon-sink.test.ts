import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBeaconSink, PERFORMANCE_INGEST_PATH } from '../beacon-sink';
import type { PerformanceEvent } from '../types';

const ok: PerformanceEvent = { version: 1, occurredAt: 1, type: 'cache_miss', cache: 'a' };

describe('createBeaconSink', () => {
  const sendBeacon = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    sendBeacon.mockReset().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('batches events and sends them once after the flush delay', () => {
    const sink = createBeaconSink();
    sink.emit(ok);
    sink.emit(ok);
    expect(sendBeacon).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe(PERFORMANCE_INGEST_PATH);
  });

  it('drops mutation_failure', () => {
    const sink = createBeaconSink();
    sink.emit({ version: 1, occurredAt: 1, type: 'mutation_failure', mutation: 'a', retryable: true });
    sink.flush();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('falls back to fetch and swallows its failure', () => {
    sendBeacon.mockReturnValue(false);
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const sink = createBeaconSink();
    sink.emit(ok);
    expect(() => sink.flush()).not.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(PERFORMANCE_INGEST_PATH, expect.objectContaining({ method: 'POST', keepalive: true }));
  });
});
