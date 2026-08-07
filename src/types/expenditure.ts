// Option-row shapes passed to expenditure dialogs/lists (selectors, payee pickers).
// These mirror the fields the UI consumes from server-passed arrays.

export interface VendorOption {
    id: string;
    name: string;
}

export interface CategoryOption {
    id: string;
    name: string;
}

export interface ProjectOption {
    id: string;
    name: string;
}

export interface PettyCashOption {
    id: string;
    name: string;
    current_balance: number;
}

export interface ResidentOption {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
}

export interface StaffOption {
    id: string;
    full_name: string;
    role: string;
}
