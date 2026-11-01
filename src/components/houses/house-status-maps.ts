import { AlertTriangle, Clock, DoorClosed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, type StatusState } from '@/components/dashboard/status-colors';
import type { EstateMapStatus } from '@/types/estate-map';

export type HouseStatusMeta = { label: string; icon: React.ElementType | null; cell: string; cue: string };

const flagged = (label: string, icon: React.ElementType, state: StatusState): HouseStatusMeta => ({
  label,
  icon,
  cell: cn('border-2 bg-card text-foreground', STATUS_COLORS[state].border),
  cue: STATUS_COLORS[state].text,
});
const plain = (label: string): HouseStatusMeta => ({ label, icon: null, cell: 'bg-muted text-foreground', cue: '' });

/** Only exceptions are marked: a status-hue 2px border and icon. Paid up and No invoice are plain neutral cells (#782). */
export const PAYMENT_STATUS_META: Record<EstateMapStatus, HouseStatusMeta> = {
  overdue: flagged('Overdue', AlertTriangle, 'overdue'),
  outstanding: flagged('Outstanding', Clock, 'attention'),
  paid_up: plain('Paid up'),
  no_invoice: plain('No invoice'),
};
export type PaymentStatusKey = keyof typeof PAYMENT_STATUS_META;

/** Same principle (#782): Empty is the exception, owner and tenant occupied are plain cells. */
export const OCCUPANCY_STATUS_META = {
  owner_occupied: plain('Owner occupied'),
  tenant_occupied: plain('Tenant occupied'),
  empty: flagged('Empty', DoorClosed, 'attention'),
} satisfies Record<string, HouseStatusMeta>;
export type OccupancyStatusKey = keyof typeof OCCUPANCY_STATUS_META;
