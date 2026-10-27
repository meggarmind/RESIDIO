import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_FILE_EXTENSIONS,
  DOCUMENT_MIME_TYPE_LABELS,
} from '@/types/database';

/**
 * #1247: images are allowed documents, and Upload is reachable on an empty library.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('allowed document types (#1247)', () => {
  it('includes JPEG, PNG and WebP', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(ALLOWED_DOCUMENT_MIME_TYPES).toContain(t);
    }
  });

  it('gives every allowed type a label and an extension', () => {
    for (const t of ALLOWED_DOCUMENT_MIME_TYPES) {
      expect(DOCUMENT_MIME_TYPE_LABELS[t], t).toBeTruthy();
      expect(DOCUMENT_FILE_EXTENSIONS[t], t).toMatch(/^\.[a-z]+$/);
    }
  });
});

describe('documents storage bucket matches the app list (#1247)', () => {
  it('latest migration that sets the bucket types lists exactly ALLOWED_DOCUMENT_MIME_TYPES', () => {
    const dir = join(root, 'supabase/migrations');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => {
        const sql = readFileSync(join(dir, f), 'utf8');
        return /allowed_mime_types/.test(sql) && /'documents'/.test(sql);
      });
    expect(files.length).toBeGreaterThan(0);
    const latest = readFileSync(join(dir, files[files.length - 1]), 'utf8');
    // Ignore commented lines such as the rollback statement.
    const live = latest
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    const array = live.match(/allowed_mime_types\s*=\s*ARRAY\[([^\]]*)\]/);
    expect(array).not.toBeNull();
    const types = [...array![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...types].sort()).toEqual([...ALLOWED_DOCUMENT_MIME_TYPES].sort());
  });
});

describe('documents page empty state (#1247)', () => {
  const page = read('src/app/(dashboard)/documents/page.tsx');

  it('always renders DocumentsTable and has no separate empty state', () => {
    expect(page).toContain('<DocumentsTable');
    expect(page).not.toContain('ModernDocumentsEmptyState');
    expect(page).not.toMatch(/totalDocs\s*===\s*0/);
  });

  it('table shows the Upload First Document block before the grid branch', () => {
    const table = read('src/components/documents/documents-table.tsx');
    const empty = table.indexOf(') : documents.length === 0 ? (');
    const grid = table.indexOf(") : viewMode === 'grid' ? (");
    expect(empty).toBeGreaterThan(-1);
    expect(empty).toBeLessThan(grid);
    expect(table).toContain('Upload First Document');
  });
});
