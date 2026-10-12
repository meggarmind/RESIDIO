import { describe, expect, it } from 'vitest';
import {
  buildStorageFilename,
  buildStoragePath,
  checkSizeCap,
  matchesAllowedType,
  sanitizeFilename,
  sniffFileType,
} from '@/lib/uploads';

describe('sanitizeFilename', () => {
  it.each([
    ['../../x', 'x'],
    ['..\\..\\windows\\system32\\evil.pdf', 'evil.pdf'],
    ['/etc/passwd', 'passwd'],
    ['C:\\temp\\a.pdf', 'a.pdf'],
    ['a/b/c/statement.pdf', 'statement.pdf'],
  ])('strips path components from %s', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('never returns separators or traversal', () => {
    for (const n of ['..', '.', '../', '....//', '%2e%2e/x', 'a/../../b']) {
      const out = sanitizeFilename(n);
      expect(out).not.toMatch(/[\\/]/);
      expect(out).not.toContain('..');
      expect(out.startsWith('.')).toBe(false);
    }
  });

  it('removes null bytes and control characters', () => {
    const out = sanitizeFilename('bad\0name\r\n.pdf');
    expect(out).toBe('bad_name__.pdf');
    expect(out).not.toMatch(/[\0\r\n]/);
  });

  it('collapses double extensions to the final one', () => {
    expect(sanitizeFilename('evil.php.png')).toBe('evil_php.png');
  });

  it('reduces unicode to the safe charset', () => {
    expect(sanitizeFilename('résumé 日本.pdf')).toMatch(/^[a-zA-Z0-9._-]+\.pdf$/);
  });

  it('caps length', () => {
    const out = sanitizeFilename('a'.repeat(500) + '.' + 'b'.repeat(100));
    expect(out.length).toBeLessThanOrEqual(80 + 1 + 10);
  });

  it('falls back for empty input', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename(null)).toBe('file');
    expect(sanitizeFilename('///')).toBe('file');
  });
});

describe('buildStorageFilename / buildStoragePath', () => {
  it('adds a unique server-generated prefix', () => {
    const a = buildStorageFilename('x.pdf');
    const b = buildStorageFilename('x.pdf');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}-x\.pdf$/);
  });

  it('keeps hostile names inside the prefix', () => {
    const p = buildStoragePath('imp/msg/attachments', '../../other/secret.pdf');
    expect(p.startsWith('imp/msg/attachments/')).toBe(true);
    expect(p.split('/')).toHaveLength(4);
    expect(p).not.toContain('..');
  });

  it('rejects an unsafe prefix', () => {
    expect(() => buildStoragePath('a/../b', 'x.pdf')).toThrow();
    expect(() => buildStoragePath('a\\b', 'x.pdf')).toThrow();
  });
});

describe('checkSizeCap', () => {
  it('accepts at the limit, rejects above and empty', () => {
    expect(checkSizeCap(100, 100)).toBeNull();
    expect(checkSizeCap(101, 100)).toMatch(/exceeds/);
    expect(checkSizeCap(0, 100)).toMatch(/empty/);
    expect(checkSizeCap(NaN, 100)).toMatch(/empty/);
  });
});

describe('sniffFileType', () => {
  it('recognises magic bytes', () => {
    expect(sniffFileType(Buffer.from('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFileType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(sniffFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe('xlsx');
  });

  it('rejects SVG, HTML and empty content', () => {
    expect(sniffFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffFileType(Buffer.from('<html>'))).toBeNull();
    expect(sniffFileType(Buffer.alloc(0))).toBeNull();
  });

  it('matchesAllowedType enforces the allowlist', () => {
    expect(matchesAllowedType(Buffer.from('%PDF-1.4'), ['pdf'])).toBe('pdf');
    expect(matchesAllowedType(Buffer.from('%PDF-1.4'), ['png'])).toBeNull();
  });
});
