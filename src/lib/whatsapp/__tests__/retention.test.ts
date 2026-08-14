import { describe, expect, it, vi } from 'vitest';
import { purgeWhatsAppOperationalState } from '@/lib/whatsapp/retention';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

describe('WhatsApp operational retention', () => {
  it('purges expired sessions and processed messages with bounded cutoffs', async () => {
    const deleteQuery = (count: number) => {
      const query = { delete: vi.fn(), lt: vi.fn() };
      query.delete.mockReturnValue(query);
      query.lt.mockResolvedValue({ count, error: null });
      return query;
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => table === 'whatsapp_sessions' ? deleteQuery(2) : deleteQuery(3)),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(purgeWhatsAppOperationalState({ sessionDays: 1, processedMessageDays: 2 })).resolves.toEqual({
      sessions: 2,
      processedMessages: 3,
    });
  });
});
