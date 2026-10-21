import { describe, expect, it, vi } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { ClearanceCertificatePDF } from '@/lib/pdf/clearance-certificate';
import type { ClearanceCertificate } from '@/actions/residents/move-out-renter';

vi.mock('@/actions/residents/move-out-renter', () => ({}));

const certificate: ClearanceCertificate = {
  id: 'cert-1',
  residentId: 'resident-1',
  residentName: 'Ada Example',
  residentCode: 'RES001',
  houseId: 'house-1',
  houseAddress: '12 Palm Close',
  clearanceDate: '2026-10-12',
  validUntil: '2026-10-19',
  validityDays: 7,
  destination: 'leaving_estate',
  certificateNumber: 'CLR-202610-3F9A1C',
  status: 'confirmed',
  createdBy: 'admin-1',
  createdAt: '2026-10-12T10:00:00Z',
};

describe('ClearanceCertificatePDF', () => {
  it('renders the move-out certificate and the shorter financial one (#816)', async () => {
    const moveOut = await renderToBuffer(ClearanceCertificatePDF({ certificate }));
    const financial = await renderToBuffer(ClearanceCertificatePDF({ certificate, variant: 'financial' }));
    const owner = await renderToBuffer(ClearanceCertificatePDF({ certificate, destinationText: 'The resident remains the property owner.' }));

    for (const pdf of [moveOut, financial, owner]) expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // No validity box, destination or CSO lines: the financial certificate is smaller.
    expect(financial.length).toBeLessThan(moveOut.length);
  });
});
