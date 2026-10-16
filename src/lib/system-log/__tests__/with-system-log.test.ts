import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

import { recordSystemAction } from '@/lib/system-log/recorder';
import { withSystemLog } from '../with-system-log';

describe('withSystemLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordSystemAction).mockResolvedValue({ recorded: true });
  });

  it('records success with the summary and duration and returns the response untouched', async () => {
    const response = { status: 200, marker: 'same' };
    const result = await withSystemLog('cron:x', 'run', async (run) => {
      run.summary = { sent: 3 };
      return response;
    });
    expect(result).toBe(response);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:x', action: 'run', outcome: 'success', summary: { sent: 3 } })
    );
    expect(vi.mocked(recordSystemAction).mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records failure for a 5xx response with the error the handler set', async () => {
    await withSystemLog('cron:x', 'run', async (run) => {
      run.error = 'db down';
      return { status: 500 };
    });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', error: 'db down' })
    );
  });

  it('honours an explicit partial outcome', async () => {
    await withSystemLog('cron:x', 'run', async (run) => {
      run.outcome = 'partial';
      return { status: 200 };
    });
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'partial' }));
  });

  it('records failure and rethrows when the handler throws', async () => {
    const boom = new Error('boom');
    await expect(
      withSystemLog('cron:x', 'run', async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', error: boom })
    );
  });

  it('does not change the response when the recorder reports a failed write', async () => {
    vi.mocked(recordSystemAction).mockResolvedValue({ recorded: false });
    const response = { status: 200 };
    await expect(withSystemLog('cron:x', 'run', async () => response)).resolves.toBe(response);
  });
});
