'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { PayerOptions } from '@/actions/collections/collections';

const NEW_PAYER = 'new';

export interface PayerState {
  kind: 'resident' | 'non_resident';
  residentId: string;
  nonResidentId: string;
  nonResident: { full_name: string; phone: string; email: string };
}

export const EMPTY_PAYER: PayerState = {
  kind: 'resident',
  residentId: '',
  nonResidentId: NEW_PAYER,
  nonResident: { full_name: '', phone: '', email: '' },
};

/** The payer as the collection actions take it, or null when no resident is chosen yet. */
export function toPayerInput(state: PayerState, options: PayerOptions | null) {
  if (state.kind === 'resident') return state.residentId ? { kind: 'resident' as const, resident_id: state.residentId } : null;
  const existing = options?.nonResidents.find((payer) => payer.id === state.nonResidentId);
  return existing
    ? { kind: 'non_resident' as const, full_name: existing.full_name, phone: existing.phone, email: existing.email }
    : { kind: 'non_resident' as const, ...state.nonResident };
}

/** Resident or non-resident payer of a collection payment (#1194). */
export function PayerFields({ idPrefix, options, value, onChange }: {
  idPrefix: string;
  options: PayerOptions | null;
  value: PayerState;
  onChange: (value: PayerState) => void;
}) {
  const set = (changes: Partial<PayerState>) => onChange({ ...value, ...changes });
  return (
    <div className="space-y-3">
      <RadioGroup value={value.kind} onValueChange={(kind) => set({ kind: kind as PayerState['kind'] })} className="grid grid-cols-2 gap-2">
        <Label htmlFor={`${idPrefix}-resident`} className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 font-normal">
          <RadioGroupItem id={`${idPrefix}-resident`} value="resident" /> Resident
        </Label>
        <Label htmlFor={`${idPrefix}-non-resident`} className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 font-normal">
          <RadioGroupItem id={`${idPrefix}-non-resident`} value="non_resident" /> Non-resident
        </Label>
      </RadioGroup>

      {value.kind === 'resident' ? (
        <div className="space-y-2">
          <Label>Resident</Label>
          <SearchableSelect
            options={(options?.residents ?? []).map((resident) => ({ value: resident.id, label: resident.name, description: resident.detail }))}
            value={value.residentId}
            onValueChange={(residentId) => set({ residentId })}
            placeholder={options ? 'Choose a resident' : 'Loading…'}
            searchPlaceholder="Search residents"
            disabled={!options}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Payer</Label>
            <SearchableSelect
              options={[
                { value: NEW_PAYER, label: 'New payer' },
                ...(options?.nonResidents ?? []).map((payer) => ({ value: payer.id, label: payer.full_name, description: payer.phone ?? payer.email ?? undefined })),
              ]}
              value={value.nonResidentId}
              onValueChange={(nonResidentId) => set({ nonResidentId })}
              searchPlaceholder="Search earlier payers"
            />
          </div>
          {value.nonResidentId === NEW_PAYER && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={`${idPrefix}-name`}>Name</Label>
                <Input id={`${idPrefix}-name`} value={value.nonResident.full_name} onChange={(e) => set({ nonResident: { ...value.nonResident, full_name: e.target.value } })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-phone`}>Phone</Label>
                <Input id={`${idPrefix}-phone`} type="tel" value={value.nonResident.phone} onChange={(e) => set({ nonResident: { ...value.nonResident, phone: e.target.value } })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-email`}>Email</Label>
                <Input id={`${idPrefix}-email`} type="email" value={value.nonResident.email} onChange={(e) => set({ nonResident: { ...value.nonResident, email: e.target.value } })} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
