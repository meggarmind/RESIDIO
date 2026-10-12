/**
 * Shared upload hardening helpers (#467).
 *
 * Client- and email-supplied file names, MIME types and sizes are untrusted.
 * Use these helpers to build storage object names, cap sizes and check that
 * content matches the type it claims.
 */

// ============================================================
// Size caps
// ============================================================

export const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_PDF_STATEMENT_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_XLSX_STATEMENT_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_IMPORT_ROWS = 5000;
export const PDF_PARSE_TIMEOUT_MS = 30_000;

export function checkSizeCap(
  size: number,
  maxBytes: number,
  label = 'File'
): string | null {
  if (!Number.isFinite(size) || size <= 0) return `${label} is empty`;
  if (size > maxBytes) {
    return `${label} exceeds the maximum allowed size (${Math.round(maxBytes / 1024 / 1024)}MB)`;
  }
  return null;
}

// ============================================================
// Safe storage names
// ============================================================

const MAX_BASE_LENGTH = 80;
const MAX_EXT_LENGTH = 10;

/**
 * Reduce an untrusted filename to a safe `base[.ext]` string: no path
 * separators, no traversal, no control or null characters, safe charset
 * only, length-capped. Only the final extension is kept.
 */
export function sanitizeFilename(name: string | null | undefined): string {
  let value = String(name ?? '');
  // Drop everything up to the last separator (also catches absolute paths).
  value = value.split(/[\\/]/).pop() ?? '';
  value = value.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Remove anything outside the safe charset (null bytes, control chars, unicode).
  value = value.replace(/[^a-zA-Z0-9._-]/g, '_');

  const lastDot = value.lastIndexOf('.');
  let base = lastDot > 0 ? value.slice(0, lastDot) : value;
  let ext = lastDot > 0 ? value.slice(lastDot + 1) : '';

  // Double extensions (evil.php.png): collapse dots in the base.
  base = base.replace(/\.+/g, '_').replace(/^[_.-]+/, '').slice(0, MAX_BASE_LENGTH);
  ext = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, MAX_EXT_LENGTH);

  if (!base) base = 'file';
  return ext ? `${base}.${ext}` : base;
}

/**
 * Build a storage object name. The unique prefix is server-generated and the
 * sanitized original name is only a human-readable suffix. Never use the
 * original name as a path segment on its own.
 */
export function buildStorageFilename(originalName: string | null | undefined): string {
  return `${globalThis.crypto.randomUUID()}-${sanitizeFilename(originalName)}`;
}

/** Join a trusted prefix with a generated filename. Throws on unsafe prefix. */
export function buildStoragePath(prefix: string, originalName: string | null | undefined): string {
  const segments = prefix.split('/').filter(Boolean);
  if (segments.some((s) => s === '.' || s === '..' || /[\\\0]/.test(s))) {
    throw new Error('Unsafe storage path prefix');
  }
  return [...segments, buildStorageFilename(originalName)].join('/');
}

// ============================================================
// Magic-byte sniffing
// ============================================================

export type SniffedType = 'pdf' | 'png' | 'jpeg' | 'webp' | 'xlsx';

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

export function sniffFileType(buf: Uint8Array): SniffedType | null {
  // %PDF- may be preceded by a little junk; the spec allows 1024 bytes.
  const head = Buffer.from(buf.subarray(0, 1024));
  if (head.includes(Buffer.from('%PDF-'))) return 'pdf';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  // xlsx is a zip container (PK\x03\x04)
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'xlsx';
  return null;
}

export const SNIFFED_MIME: Record<SniffedType, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Returns the sniffed type when the content is one of the allowed types, else null. */
export function matchesAllowedType(
  buf: Uint8Array,
  allowed: ReadonlyArray<SniffedType>
): SniffedType | null {
  const sniffed = sniffFileType(buf);
  return sniffed && allowed.includes(sniffed) ? sniffed : null;
}
