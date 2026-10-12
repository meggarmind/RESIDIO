import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  parseFirstBankPdf: vi.fn(),
  isPdfEncrypted: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: m.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: m.createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: m.logAudit }));
vi.mock('@/lib/email-imports/parsers/first-bank-pdf', () => ({
  parseFirstBankPdf: m.parseFirstBankPdf,
  isPdfEncrypted: m.isPdfEncrypted,
}));
vi.mock('@/actions/email-imports/bank-passwords', () => ({ getDecryptedPassword: vi.fn() }));
vi.mock('@/actions/reference/transaction-tags', () => ({ autoTagTransaction: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { parsePdfStatement } from '@/actions/imports/parse-pdf-statement';
import { uploadEstateLogo } from '@/actions/settings/upload-estate-logo';
import { createImport, createImportRows } from '@/actions/imports/create-import';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function makeFile(bytes: Buffer | string, name: string, type: string) {
  const data = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
  return new File([new Uint8Array(data)], name, { type });
}

beforeEach(() => {
  vi.resetAllMocks();
  m.authorizePermission.mockResolvedValue({ authorized: true });
});

describe('parsePdfStatement', () => {
  const form = (file: File) => {
    const f = new FormData();
    f.append('file', file);
    return f;
  };

  it('requires permission before touching the file', async () => {
    m.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    const r = await parsePdfStatement(form(makeFile('%PDF-1.4', 'a.pdf', 'application/pdf')));
    expect(r).toMatchObject({ success: false, error: 'nope' });
    expect(m.isPdfEncrypted).not.toHaveBeenCalled();
  });

  it('rejects a file named .pdf whose content is not a PDF', async () => {
    const r = await parsePdfStatement(form(makeFile('<html>', 'a.pdf', 'application/pdf')));
    expect(r.success).toBe(false);
    expect(m.parseFirstBankPdf).not.toHaveBeenCalled();
  });

  it('rejects oversized PDFs', async () => {
    const big = makeFile(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(11 * 1024 * 1024)]), 'a.pdf', 'application/pdf');
    const r = await parsePdfStatement(form(big));
    expect(r.error).toMatch(/exceeds/);
    expect(m.parseFirstBankPdf).not.toHaveBeenCalled();
  });

  it('returns a clean error when the parser throws', async () => {
    m.isPdfEncrypted.mockResolvedValue(false);
    m.parseFirstBankPdf.mockRejectedValue(new Error('internal pdfjs stack detail'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await parsePdfStatement(form(makeFile('%PDF-1.4', 'a.pdf', 'application/pdf')));
    spy.mockRestore();
    expect(r.success).toBe(false);
    expect(r.error).not.toContain('pdfjs');
  });

  it('times out a parser that never settles', async () => {
    vi.useFakeTimers();
    try {
      m.isPdfEncrypted.mockResolvedValue(false);
      m.parseFirstBankPdf.mockReturnValue(new Promise(() => {}));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const p = parsePdfStatement(form(makeFile('%PDF-1.4', 'a.pdf', 'application/pdf')));
      await vi.advanceTimersByTimeAsync(31_000);
      const r = await p;
      spy.mockRestore();
      expect(r.success).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects statements over the row cap', async () => {
    m.isPdfEncrypted.mockResolvedValue(false);
    m.parseFirstBankPdf.mockResolvedValue({
      transactions: Array.from({ length: 5001 }, () => ({
        transactionDate: '2026-01-01', description: 'x', amount: 1, transactionType: 'credit',
      })),
    });
    const r = await parsePdfStatement(form(makeFile('%PDF-1.4', 'a.pdf', 'application/pdf')));
    expect(r.error).toMatch(/5000/);
  });

  it('parses a valid PDF', async () => {
    m.isPdfEncrypted.mockResolvedValue(false);
    m.parseFirstBankPdf.mockResolvedValue({
      transactions: [{ transactionDate: '2026-01-01', description: 'x', amount: 5, transactionType: 'credit' }],
    });
    const r = await parsePdfStatement(form(makeFile('%PDF-1.4', 'a.pdf', 'application/pdf')));
    expect(r.success).toBe(true);
    expect(r.data?.rawData).toHaveLength(1);
  });
});

describe('uploadEstateLogo', () => {
  function setup() {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({ data: null });
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.single = single;
    chain.upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u' } }, error: null }) },
      from: vi.fn().mockReturnValue(chain),
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://x/logos/y' } }),
          remove: vi.fn(),
        }),
      },
    };
    m.createServerSupabaseClient.mockResolvedValue(supabase);
    return { upload };
  }
  const form = (file: File) => {
    const f = new FormData();
    f.append('file', file);
    return f;
  };

  it('rejects SVG even when it claims to be a PNG', async () => {
    const { upload } = setup();
    const r = await uploadEstateLogo(form(makeFile('<svg onload="alert(1)"/>', 'logo.png', 'image/png')));
    expect(r.error).toMatch(/not allowed/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects declared SVG type', async () => {
    const { upload } = setup();
    const r = await uploadEstateLogo(form(makeFile('<svg/>', 'logo.svg', 'image/svg+xml')));
    expect(r.error).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects oversized logos', async () => {
    const { upload } = setup();
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const r = await uploadEstateLogo(form(makeFile(big, 'logo.png', 'image/png')));
    expect(r.error).toMatch(/exceeds/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('names the object from sniffed type, ignores client name and type, no upsert', async () => {
    const { upload } = setup();
    const r = await uploadEstateLogo(form(makeFile(PNG, '../../evil.php', 'text/html')));
    expect(r.error).toBeNull();
    const [path, , opts] = upload.mock.calls[0];
    expect(path).toMatch(/^estate-logo-[0-9a-f-]{36}\.png$/);
    expect(opts).toMatchObject({ contentType: 'image/png', upsert: false });
  });
});

describe('createImport / createImportRows', () => {
  const baseParams = {
    file_name: 'a.csv', file_type: 'csv' as const, bank_account_id: 'b',
    column_mapping: {} as never,
  };
  const row = (n: number) => ({
    row_number: n, raw_data: {}, transaction_date: null, description: null,
    amount: null, transaction_type: null, reference: null,
  }) as never;

  it('createImport rejects total_rows over the cap before querying', async () => {
    const r = await createImport({ ...baseParams, total_rows: 5001 });
    expect(r.error).toMatch(/5000/);
    expect(m.createServerSupabaseClient).toHaveBeenCalled();
  });

  it('createImportRows rejects over the cap without inserting', async () => {
    const insert = vi.fn();
    m.createServerSupabaseClient.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) });
    const r = await createImportRows({ import_id: 'i', rows: Array.from({ length: 5001 }, (_, i) => row(i)) });
    expect(r.error).toMatch(/at most 5000/);
    expect(insert).not.toHaveBeenCalled();
  });

  it('createImportRows deletes already-inserted rows when a later batch fails', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const insert = vi.fn().mockImplementation(async () => {
        calls++;
        return { error: calls === 1 ? null : { message: 'db down' } };
      });
      const eq = vi.fn().mockResolvedValue({ error: null });
      const del = vi.fn().mockReturnValue({ eq });
      const from = vi.fn().mockReturnValue({ insert, delete: del });
      m.createServerSupabaseClient.mockResolvedValue({ from });
      const p = createImportRows({ import_id: 'imp-1', rows: Array.from({ length: 150 }, (_, i) => row(i)) });
      await vi.advanceTimersByTimeAsync(10_000);
      const r = await p;
      expect(r.count).toBe(0);
      expect(r.error).toMatch(/db down/);
      expect(del).toHaveBeenCalled();
      expect(eq).toHaveBeenCalledWith('import_id', 'imp-1');
    } finally {
      vi.useRealTimers();
    }
  });
});
