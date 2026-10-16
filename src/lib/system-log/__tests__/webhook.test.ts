import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

import { recordSystemAction } from '@/lib/system-log/recorder';
import { recordInboundBatch, recordWebhookDelivery } from '../webhook';

const batch = { accepted: true, processedCount: 2, duplicateCount: 1, ignoredCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordSystemAction).mockResolvedValue({ recorded: true });
});

describe('recordWebhookDelivery', () => {
  it('prefixes the provider into the source', async () => {
    await recordWebhookDelivery({ provider: 'paystack', action: 'payment_event', outcome: 'success' });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'webhook:paystack', action: 'payment_event', outcome: 'success' })
    );
  });
});

describe('recordInboundBatch', () => {
  it('records a success with counts when messages were processed', async () => {
    await recordInboundBatch('whatsapp-meta', batch);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'webhook:whatsapp-meta',
        outcome: 'success',
        summary: { processed: 2, duplicates: 1, ignored: 0 },
      })
    );
  });

  it('records a failure with the error when not accepted', async () => {
    await recordInboundBatch('whatsapp-meta', { ...batch, accepted: false, error: 'could not be processed' });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', error: 'could not be processed' })
    );
  });

  it('records nothing for an ignored-only delivery (ignored messages are counted as processed upstream)', async () => {
    await recordInboundBatch('whatsapp-meta', { ...batch, processedCount: 2, ignoredCount: 2, duplicateCount: 0 });
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('counts only the messages actually acted on', async () => {
    await recordInboundBatch('whatsapp-meta', { ...batch, processedCount: 3, ignoredCount: 1, duplicateCount: 0 });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ summary: { processed: 2, duplicates: 0, ignored: 1 } })
    );
  });

  it('records nothing for a duplicate-only delivery', async () => {
    await recordInboundBatch('whatsapp-meta', { ...batch, processedCount: 0, duplicateCount: 3 });
    expect(recordSystemAction).not.toHaveBeenCalled();
  });
});
