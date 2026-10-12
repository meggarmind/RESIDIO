import { describe, expect, it, vi } from 'vitest';
import { storeEmailAttachments } from '@/lib/email-imports/store-attachments';

function fakeClient(error: { message: string } | null = null) {
  const upload = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ upload });
  return { client: { storage: { from } }, upload, from };
}

const pdf = Buffer.from('%PDF-1.7 hello');
const att = (filename: string, data: Buffer, mimeType = 'application/pdf') => ({
  id: 'a1',
  filename,
  mimeType,
  data,
});

describe('storeEmailAttachments', () => {
  it('never uses the sender filename as a path segment', async () => {
    const { client, upload } = fakeClient();
    const { stored } = await storeEmailAttachments(client, 'imp/msg', [
      att('../../other-import/x/attachments/victim.pdf', pdf),
    ]);

    const path = upload.mock.calls[0][0] as string;
    expect(path.startsWith('imp/msg/attachments/')).toBe(true);
    expect(path.split('/')).toHaveLength(4);
    expect(path).not.toContain('..');
    expect(path).not.toContain('other-import');
    expect(stored[0].path).toBe(path);
    expect(stored[0].name).toBe('victim.pdf');
  });

  it('does not upsert, so an existing object is never overwritten', async () => {
    const { client, upload } = fakeClient();
    await storeEmailAttachments(client, 'imp/msg', [att('a.pdf', pdf)]);
    expect(upload.mock.calls[0][2].upsert).toBe(false);
  });

  it('gives two same-named attachments distinct objects', async () => {
    const { client, upload } = fakeClient();
    await storeEmailAttachments(client, 'imp/msg', [att('a.pdf', pdf), att('a.pdf', pdf)]);
    expect(upload.mock.calls[0][0]).not.toBe(upload.mock.calls[1][0]);
  });

  it('skips oversized attachments without uploading', async () => {
    const { client, upload } = fakeClient();
    const big = Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]);
    const { stored, skipped } = await storeEmailAttachments(client, 'imp/msg', [att('big.pdf', big)]);
    expect(upload).not.toHaveBeenCalled();
    expect(stored).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/exceeds/);
  });

  it('skips a file declared as PDF whose bytes are not a PDF', async () => {
    const { client, upload } = fakeClient();
    const { skipped } = await storeEmailAttachments(client, 'imp/msg', [
      att('invoice.pdf', Buffer.from('<html><script>alert(1)</script>')),
    ]);
    expect(upload).not.toHaveBeenCalled();
    expect(skipped).toHaveLength(1);
  });

  it('stores the sniffed content type, not the declared one', async () => {
    const { client, upload } = fakeClient();
    const { stored } = await storeEmailAttachments(client, 'imp/msg', [
      att('a.pdf', pdf, 'text/html'),
    ]);
    expect(upload.mock.calls[0][2].contentType).toBe('application/pdf');
    expect(stored[0].mimeType).toBe('application/pdf');
  });

  it('records storage errors as skipped', async () => {
    const { client } = fakeClient({ message: 'boom' });
    const { stored, skipped } = await storeEmailAttachments(client, 'imp/msg', [att('a.pdf', pdf)]);
    expect(stored).toHaveLength(0);
    expect(skipped[0].reason).toBe('boom');
  });

  it('rejects a traversal base path', async () => {
    const { client, upload } = fakeClient();
    const { skipped } = await storeEmailAttachments(client, 'imp/../msg', [att('a.pdf', pdf)]);
    expect(upload).not.toHaveBeenCalled();
    expect(skipped).toHaveLength(1);
  });
});
