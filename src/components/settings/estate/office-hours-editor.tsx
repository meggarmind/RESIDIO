'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseOfficeHours, type OfficeDayHours, type OfficeHours } from '@/lib/whatsapp/assistant-format';

// Monday first on screen; the stored array is indexed from Sunday (Date#getDay).
const DAYS: Array<{ index: number; name: string }> = [
  { index: 1, name: 'Monday' },
  { index: 2, name: 'Tuesday' },
  { index: 3, name: 'Wednesday' },
  { index: 4, name: 'Thursday' },
  { index: 5, name: 'Friday' },
  { index: 6, name: 'Saturday' },
  { index: 0, name: 'Sunday' },
];

const CLOSED_WEEK: OfficeHours = Array.from({ length: 7 }, () => ({ mode: 'closed' as const }));

/** The stored `estate_office_hours` value is a JSON array of 7 days, or '' when every day is closed. */
export function officeHoursError(value: string): string | undefined {
  if (!value) return undefined;
  return parseOfficeHours(value) ? undefined : 'Each day with hours needs a start time before its end time.';
}

/** Reads the editor's working copy, keeping half-entered days that parseOfficeHours would reject. */
function readWorkingHours(value: string): OfficeHours {
  try {
    const raw = JSON.parse(value);
    if (Array.isArray(raw) && raw.length === 7) {
      return raw.map((day) => (day?.mode === 'hours' || day?.mode === 'all_day' ? day : { mode: 'closed' })) as OfficeHours;
    }
  } catch {
    // An empty or malformed value starts from a closed week.
  }
  return CLOSED_WEEK;
}

export function OfficeHoursEditor({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const hours = readWorkingHours(value);

  const setDay = (index: number, day: OfficeDayHours) => {
    const next = hours.map((current, position) => (position === index ? day : current));
    // Keep half-entered hours in the working copy; officeHoursError blocks saving them.
    onChange(next.every((entry) => entry.mode === 'closed') ? '' : JSON.stringify(next));
  };

  return (
    <div className="space-y-3">
      {DAYS.map(({ index, name }) => {
        const day = hours[index];
        return (
          <div key={name} className="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[8rem_10rem_minmax(0,1fr)]">
            <Label htmlFor={`office-hours-${index}`}>{name}</Label>
            <Select
              value={day.mode}
              onValueChange={(mode) =>
                setDay(index, mode === 'hours' ? { mode: 'hours', from: '09:00', to: '17:00' } : { mode: mode as 'closed' | 'all_day' })
              }
            >
              <SelectTrigger id={`office-hours-${index}`} aria-label={`${name} office hours`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="all_day">All day</SelectItem>
                <SelectItem value="hours">From and to</SelectItem>
              </SelectContent>
            </Select>
            {day.mode === 'hours' ? (
              <div className="flex min-w-0 items-center gap-2">
                <Input type="time" aria-label={`${name} opens at`} value={day.from} onChange={(e) => setDay(index, { ...day, from: e.target.value })} />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="time" aria-label={`${name} closes at`} value={day.to} onChange={(e) => setDay(index, { ...day, to: e.target.value })} />
              </div>
            ) : <div />}
          </div>
        );
      })}
      {error ? <p id="office-hours-error" role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
