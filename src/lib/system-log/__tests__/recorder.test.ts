import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    throw new Error('network must not be used in tests');
  },
}));

import {
  recordSystemAction,
  redactError,
  redactSummary,
  type SystemActionRow,
  type SystemLogSink,
} from '../recorder';

function fakeSink(result: { error: { message: string } | null } = { error: null }) {
  const rows: SystemActionRow[] = [];
  const sink: SystemLogSink = {
    insert: async (row) => {
      rows.push(row);
      return result;
    },
  };
  return { sink, rows };
}

afterEach(() => vi.restoreAllMocks());

describe('recordSystemAction', () => {
  it('inserts a row with the expected shape', async () => {
    const { sink, rows } = fakeSink();
    const result = await recordSystemAction(
      {
        source: 'cron:process-notifications',
        action: 'run',
        outcome: 'partial',
        summary: { sent: 3, failed: 1 },
        error: new Error('one failed'),
        durationMs: 120,
      },
      sink
    );
    expect(result).toEqual({ recorded: true });
    expect(rows).toEqual([
      {
        source: 'cron:process-notifications',
        action: 'run',
        outcome: 'partial',
        summary: { sent: 3, failed: 1 },
        error_message: 'one failed',
        duration_ms: 120,
      },
    ]);
  });

  it('defaults summary to {} and nullable fields to null', async () => {
    const { sink, rows } = fakeSink();
    await recordSystemAction({ source: 's', action: 'a', outcome: 'success' }, sink);
    expect(rows[0].summary).toEqual({});
    expect(rows[0].error_message).toBeNull();
    expect(rows[0].duration_ms).toBeNull();
  });

  it('returns recorded:false and logs when the sink reports an error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sink } = fakeSink({ error: { message: 'insert denied' } });
    const result = await recordSystemAction({ source: 'webhook:paystack', action: 'charge', outcome: 'failure' }, sink);
    expect(result).toEqual({ recorded: false });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[SystemLog]'),
      expect.objectContaining({ source: 'webhook:paystack', action: 'charge', error: 'insert denied' })
    );
  });

  it('does not throw when the sink throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink: SystemLogSink = {
      insert: async () => {
        throw new Error('boom');
      },
    };
    await expect(
      recordSystemAction({ source: 's', action: 'a', outcome: 'success' }, sink)
    ).resolves.toEqual({ recorded: false });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[SystemLog]'),
      expect.objectContaining({ source: 's', action: 'a', error: 'boom' })
    );
  });

  it('redacts the summary before it reaches the sink', async () => {
    const { sink, rows } = fakeSink();
    await recordSystemAction(
      { source: 's', action: 'a', outcome: 'success', summary: { count: 1, apiKey: 'k' } },
      sink
    );
    expect(rows[0].summary).toEqual({ count: 1, apiKey: '[redacted]' });
  });
});

describe('redactSummary', () => {
  it('replaces secret-looking keys at any depth', () => {
    const out = redactSummary({
      ok: 1,
      Authorization: 'Bearer x',
      nested: { deep: { password: 'p', api_key: 'k', 'x-api-key': 'k', cookie: 'c', signature: 's', rawBody: 'r', payload: {}, count: 2 } },
      list: [{ token: 't', id: 'a' }],
    });
    expect(out).toEqual({
      ok: 1,
      Authorization: '[redacted]',
      nested: {
        deep: {
          password: '[redacted]',
          api_key: '[redacted]',
          'x-api-key': '[redacted]',
          cookie: '[redacted]',
          signature: '[redacted]',
          rawBody: '[redacted]',
          payload: '[redacted]',
          count: 2,
        },
      },
      list: [{ token: '[redacted]', id: 'a' }],
    });
  });

  it('redacts keys that match exactly one alternative of the key pattern', () => {
    const out = redactSummary({ body: 'b', raw: 'r', client_secret: 's', count: 1, id: 'a' });
    expect(out).toEqual({ body: '[redacted]', raw: '[redacted]', client_secret: '[redacted]', count: 1, id: 'a' });
  });

  it('truncates strings to 200 characters', () => {
    const out = redactSummary({ s: 'x'.repeat(300), short: 'ok' });
    expect((out.s as string).length).toBe(200);
    expect(out.short).toBe('ok');
  });

  it('caps arrays at 50 items', () => {
    const out = redactSummary({ ids: Array.from({ length: 80 }, (_, i) => i) });
    expect(out.ids as number[]).toHaveLength(50);
    expect((out.ids as number[])[49]).toBe(49);
  });

  it('limits nesting depth to 5', () => {
    const out = redactSummary({ a: { b: { c: { d: { e: { f: 1 } } } } } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(out.a.b.c.d.e).toBe('[truncated]');
    expect(out.a.b.c.d).toEqual({ e: '[truncated]' });
  });

  it('keeps numbers, booleans and nulls', () => {
    expect(redactSummary({ n: 1, b: false, z: null })).toEqual({ n: 1, b: false, z: null });
  });
});

describe('redactError', () => {
  it('returns null when there is no error', () => {
    expect(redactError(undefined)).toBeNull();
    expect(redactError(null)).toBeNull();
  });

  it('stores the message only, never the stack', () => {
    const error = new Error('bad thing');
    expect(error.stack).toBeTruthy();
    const out = redactError(error);
    expect(out).toBe('bad thing');
    expect(out).not.toContain('at ');
  });

  it('truncates the message to 500 characters', () => {
    expect(redactError(new Error('m'.repeat(900)))?.length).toBe(500);
  });

  it('handles strings and message-bearing objects, and never stores the object', () => {
    expect(redactError('plain')).toBe('plain');
    expect(redactError({ message: 'pg error', details: { secret: 1 } })).toBe('pg error');
    expect(redactError({ code: 1 })).toBe('Unknown error');
  });
});
