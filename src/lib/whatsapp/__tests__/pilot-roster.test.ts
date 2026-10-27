import { describe, expect, it } from 'vitest';
import { buildPilotRoster, maskPhone, pilotMembers, rosterToOptions, type PilotRosterResident, type ResidentRow } from '@/lib/whatsapp/pilot-roster';

function resident(id: string, streetIds: string[]): PilotRosterResident {
  return { id, name: id, code: '', houses: streetIds.map((streetId) => ({ label: `1 ${streetId}`, streetId, role: 'Renter' })), optIn: 'none', phone: null };
}

describe('pilot roster (#801)', () => {
  it('masks all but the first 4 and last 3 digits', () => {
    expect(maskPhone('+2348031234567')).toBe('+234****567');
    expect(maskPhone('12345')).toBe('12345');
  });

  it('prefers a live opt-in over a newer opt-out, and marks residents with no consent row', () => {
    const rows: ResidentRow[] = [
      { id: 'a', first_name: 'Ada', last_name: null, resident_code: null, resident_houses: [] },
      { id: 'b', first_name: null, last_name: null, resident_code: null, resident_houses: null },
    ];
    const roster = buildPilotRoster(rows, [
      { resident_id: 'a', phone_number: '+2348000000001', opted_in: false },
      { resident_id: 'a', phone_number: '+2348000000002', opted_in: true, deactivated_at: null },
    ]);
    expect(roster[0]).toMatchObject({ optIn: 'opted_in', phone: '+234****002' });
    expect(roster[1]).toMatchObject({ name: 'Unnamed resident', optIn: 'none', phone: null });
  });

  it('reads a deactivated consent row as deactivated', () => {
    const roster = buildPilotRoster(
      [{ id: 'a', first_name: 'Ada', last_name: null, resident_code: null, resident_houses: [] }],
      [{ resident_id: 'a', phone_number: '+2348000000001', opted_in: true, deactivated_at: '2026-10-01' }],
    );
    expect(roster[0].optIn).toBe('deactivated');
  });

  it('lists chosen residents, then street members, and keeps unknown IDs', () => {
    const roster = [resident('chosen', ['other']), resident('both', ['pilot']), resident('street', ['pilot']), resident('outside', ['other'])];
    expect(pilotMembers(roster, ['chosen', 'both', 'gone'], 'pilot').map(({ id, byName, byStreet, resident: r }) => [id, byName, byStreet, !!r])).toEqual([
      ['chosen', true, false, true],
      ['both', true, true, true],
      ['gone', true, false, false],
      ['street', false, true, true],
    ]);
  });

  it('adds no street members when no pilot street is set', () => {
    expect(pilotMembers([resident('street', ['pilot'])], [], '')).toEqual([]);
  });

  it('builds picker options without contact data', () => {
    const [option] = rosterToOptions([{ ...resident('a', ['x']), code: 'RES1', phone: '+234****567' }]);
    expect(option).toEqual({ id: 'a', name: 'a', detail: 'RES1 · 1 x' });
  });
});
