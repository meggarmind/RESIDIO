import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  MAX_XLSX_FILE_SIZE_BYTES,
  parseXLSXBuffer,
  parseXLSXFile,
  getXLSXSheetNames,
} from '@/lib/parsers/xlsx-parser';

function buildWorkbookBuffer(): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Date', 'Narration', 'Credit', 'Debit'],
    ['2026-01-05', 'Dues payment', 5000, ''],
    ['2026-01-06', 'Bank charge', '', 50],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Statement');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('xlsx parser size cap', () => {
  it('rejects buffers over the limit with a clear error and does not parse', async () => {
    const result = await parseXLSXBuffer(new ArrayBuffer(MAX_XLSX_FILE_SIZE_BYTES + 1));
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/too large.*10 MB/);
  });

  it('rejects File objects over the limit without reading them', async () => {
    const file = {
      size: MAX_XLSX_FILE_SIZE_BYTES + 1,
      arrayBuffer: () => {
        throw new Error('should not be read');
      },
    } as unknown as File;
    const result = await parseXLSXFile(file);
    expect(result.errors[0]).toMatch(/too large/);
    expect(await getXLSXSheetNames(file)).toEqual([]);
  });

  it('parseXLSXFile on an oversize File returns the error and never reads the file', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(8));
    const file = { size: MAX_XLSX_FILE_SIZE_BYTES + 1, arrayBuffer } as unknown as File;
    const result = await parseXLSXFile(file);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/too large/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('getXLSXSheetNames on an oversize File returns [] and never reads the file', async () => {
    const arrayBuffer = vi.fn(async () => buildWorkbookBuffer());
    const file = { size: MAX_XLSX_FILE_SIZE_BYTES + 1, arrayBuffer } as unknown as File;
    expect(await getXLSXSheetNames(file)).toEqual([]);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('getXLSXSheetNames on a File at the limit does read it', async () => {
    const arrayBuffer = vi.fn(async () => buildWorkbookBuffer());
    const file = { size: MAX_XLSX_FILE_SIZE_BYTES, arrayBuffer } as unknown as File;
    expect(await getXLSXSheetNames(file)).toEqual(['Statement']);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('accepts a buffer exactly at the limit (reaches the parser, not the size error)', async () => {
    const result = await parseXLSXBuffer(new ArrayBuffer(MAX_XLSX_FILE_SIZE_BYTES));
    expect(result.errors.join(' ')).not.toMatch(/too large/);
  });
});

describe('xlsx parser behaviour on SheetJS 0.20', () => {
  it('parses a normal workbook', async () => {
    const result = await parseXLSXBuffer(buildWorkbookBuffer(), {
      columnMapping: { date: 'Date', description: 'Narration', credit: 'Credit', debit: 'Debit', reference: 'Reference' },
    });
    expect(result.sheetNames).toEqual(['Statement']);
    expect(result.errors).toEqual([]);
    expect(result.rawData).toHaveLength(2);
    expect(result.totalCredits).toBe(5000);
    expect(result.totalDebits).toBe(50);
  });
});
