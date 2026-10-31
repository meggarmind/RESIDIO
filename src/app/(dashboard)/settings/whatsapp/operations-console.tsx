'use client';

// Shared row types and formatters for the WhatsApp monitoring pages under /system.
export type Person = { first_name: string; last_name: string; resident_code: string } | null;
export type Property = { house_number: string; street: { name: string } | null } | null;
export type OptIn = { resident_id: string; phone_number: string; opted_in: boolean; source: string; opted_in_at: string | null; opted_out_at: string | null; deactivated_at?: string | null; updated_at: string; resident: Person };

export function consentState(row: OptIn) { return row.deactivated_at ? 'deactivated' : row.opted_in ? 'opted_in' : 'opted_out'; }
export type Pending = { phone_number: string; status: string; source: string; first_seen_at: string; last_seen_at: string; resident: Person };
export type Session = { phone_number: string; current_node: string; pin_authenticated: boolean; selected_house_id: string | null; expires_at: string; updated_at: string; resident: Person; house: Property };
export type Disclosure = { phone_number: string; menu_item: string; channel?: string; pin_authenticated: boolean; created_at: string; resident: Person; house: Property };

export function maskPhone(phone: string) { return phone.length < 7 ? phone : `${phone.slice(0, 4)}****${phone.slice(-3)}`; }
export function personName(person: Person) { return person ? `${person.first_name} ${person.last_name}` : 'Unknown'; }
export function propertyName(property: Property) { return property ? `${property.house_number}${property.street ? `, ${property.street.name}` : ''}` : 'Estate-wide'; }
export function formatDate(value: string) { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
