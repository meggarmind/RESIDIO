import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishAnnouncementCore } from '@/lib/announcements/publish';

const { addToQueue } = vi.hoisted(() => ({ addToQueue: vi.fn() }));
vi.mock('@/lib/notifications/queue', async (orig) => ({
  ...(await orig<object>()),
  addToQueue,
}));

const announcement = {
  id: 'a1',
  title: 'T',
  content: 'C',
  summary: null,
  target_audience: 'tenants',
  target_houses: null,
  status: 'draft',
};

/**
 * Client double that rejects a select naming a column the table lacks, as PostgREST does,
 * so a regression to `residents.resident_role` errors instead of passing silently.
 */
function client() {
  const columns: Record<string, string[]> = {
    residents: ['id', 'account_status'],
    resident_houses: ['resident_id', 'resident_role', 'is_active', 'house_id'],
  };
  const from = vi.fn((table: string) => {
    let selected = '';
    const q: Record<string, unknown> = {
      then: (f: (v: unknown) => unknown) => {
        const bad = (columns[table] ?? [])
          .length && selected.split(',').map((c) => c.trim()).some((c) => !columns[table].includes(c));
        const data: Record<string, unknown> = {
          whatsapp_optins: [
            { resident_id: 'r1', phone_number: '1' },
            { resident_id: 'r2', phone_number: '2' },
          ],
          residents: [{ id: 'r1' }, { id: 'r2' }],
          resident_houses: [{ resident_id: 'r1', resident_role: 'tenant' }],
        };
        return Promise.resolve(
          bad ? { data: null, error: { message: `column ${table}.${selected} does not exist` } } : { data: data[table], error: null }
        ).then(f);
      },
    };
    for (const m of ['update', 'eq', 'is', 'in']) q[m] = vi.fn().mockReturnValue(q);
    q.select = vi.fn((cols: string) => {
      selected = cols;
      return q;
    });
    q.single = vi.fn().mockResolvedValue({ data: table === 'announcements' ? announcement : null, error: null });
    return q;
  });
  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  addToQueue.mockResolvedValue({ success: true });
});

describe('announcement WhatsApp delivery by enum audience', () => {
  it('queues only residents holding an allowed role on an active house assignment', async () => {
    const res = await publishAnnouncementCore(client() as never, 'a1', null);
    expect(res.data && res.whatsappQueued).toBe(1);
    expect(addToQueue).toHaveBeenCalledTimes(1);
  });

  it('logs the database error rather than returning 0 silently', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = client();
    const orig = c.from;
    c.from = vi.fn((t: string) => {
      const q = orig(t) as Record<string, unknown>;
      if (t === 'residents') q.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(f);
      return q;
    });
    await publishAnnouncementCore(c as never, 'a1', null);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('resident read failed'), { message: 'boom' });
  });
});
