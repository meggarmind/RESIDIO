export type EstateMapStatus = 'paid_up' | 'outstanding' | 'overdue' | 'no_invoice';

export interface EstateMapHouse {
  id: string;
  houseNumber: string;
  streetId: string | null;
  streetName: string | null;
  status: EstateMapStatus;
}

export interface EstateMapSnapshot {
  houses: EstateMapHouse[];
  counts: Record<EstateMapStatus, number>;
  asOf: string;
}
