import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ArchiveImpactSummary } from '@/components/residents/resident-archive-dialog';
import { usePayments } from '@/hooks/use-payments';
import { useNotes } from '@/hooks/use-notes';

vi.mock('@/hooks/use-payments', () => ({
  usePayments: vi.fn(),
}));

vi.mock('@/hooks/use-notes', () => ({
  useNotes: vi.fn(),
}));

const mockedUsePayments = vi.mocked(usePayments);
const mockedUseNotes = vi.mocked(useNotes);

function mockCounts({ pending, overdue, notes }: { pending: number; overdue: number; notes: number }) {
  mockedUsePayments.mockImplementation((params) => ({
    data: { data: [], count: params?.status === 'pending' ? pending : overdue },
    isLoading: false,
  }) as unknown as ReturnType<typeof usePayments>);
  mockedUseNotes.mockImplementation(() => ({
    data: { data: [], count: notes },
    isLoading: false,
  }) as unknown as ReturnType<typeof useNotes>);
}

describe('ArchiveImpactSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows affected houses, outstanding payments, and note counts', () => {
    mockCounts({ pending: 2, overdue: 1, notes: 4 });
    const markup = renderToStaticMarkup(
      <ArchiveImpactSummary residentId="r1" activeHouseCount={3} />
    );

    expect(markup).toContain('What will be affected');
    expect(markup).toContain('3 active assignments will be deactivated');
    expect(markup).toContain('3 outstanding payments will remain in payment history');
    expect(markup).toContain('4 notes will be retained on the archived record');
  });

  it('uses singular phrasing for single items', () => {
    mockCounts({ pending: 1, overdue: 0, notes: 1 });
    const markup = renderToStaticMarkup(
      <ArchiveImpactSummary residentId="r1" activeHouseCount={1} />
    );

    expect(markup).toContain('1 active assignment will be deactivated');
    expect(markup).toContain('1 outstanding payment will remain in payment history');
    expect(markup).toContain('1 note will be retained on the archived record');
  });

  it('renders explicit zero states', () => {
    mockCounts({ pending: 0, overdue: 0, notes: 0 });
    const markup = renderToStaticMarkup(
      <ArchiveImpactSummary residentId="r1" activeHouseCount={0} />
    );

    expect(markup).toContain('No active assignments');
    expect(markup).not.toContain('will be deactivated');
  });

  it('queries pending and overdue payments separately for the resident', () => {
    mockCounts({ pending: 1, overdue: 2, notes: 0 });
    renderToStaticMarkup(<ArchiveImpactSummary residentId="r1" activeHouseCount={0} />);

    const paymentParams = mockedUsePayments.mock.calls.map((call) => call[0]);
    expect(paymentParams).toEqual([
      expect.objectContaining({ resident_id: 'r1', status: 'pending' }),
      expect.objectContaining({ resident_id: 'r1', status: 'overdue' }),
    ]);
    expect(mockedUseNotes).toHaveBeenCalledWith(
      expect.objectContaining({ entity_type: 'resident', entity_id: 'r1' })
    );
  });
});

describe('resident archive wiring', () => {
  it('keeps the archive trigger and dialog behind RESIDENTS_DELETE', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(dashboard)/residents/[id]/page.tsx'),
      'utf8'
    );
    const trigger = source.match(
      /\{canDeleteResident && \(\s*<Button[\s\S]*?>[\s\S]*?Archive[\s\S]*?<\/Button>\s*\)\}/
    )?.[0];
    const dialog = source.match(
      /\{canDeleteResident && \(\s*<ResidentArchiveDialog[\s\S]*?\/>\s*\)\}/
    )?.[0];

    expect(source).toContain(
      'const canDeleteResident = hasPermission(PERMISSIONS.RESIDENTS_DELETE);'
    );
    expect(trigger).toBeDefined();
    expect(trigger).toContain('onClick={() => setIsArchiveDialogOpen(true)}');
    expect(trigger).not.toContain('confirm(');
    expect(dialog).toBeDefined();
    expect(dialog).toContain('onConfirm={handleDelete}');
  });

  it('keeps explicit cancel and destructive archive actions in the impact dialog', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/residents/resident-archive-dialog.tsx'),
      'utf8'
    );

    expect(source).toContain('<AlertDialogCancel>Cancel</AlertDialogCancel>');
    expect(source).toMatch(
      /<AlertDialogAction[\s\S]*?className="bg-destructive[\s\S]*?>\s*Archive Resident\s*<\/AlertDialogAction>/
    );
    expect(source).toContain(
      '<ArchiveImpactSummary residentId={residentId} activeHouseCount={activeHouseCount} />'
    );
  });
});
