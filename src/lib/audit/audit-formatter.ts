export interface AuditLogEntry {
    id: string;
    action: string;
    entity_type: string;
    entity_display?: string;
    description: string;
    created_at: string;
    new_values?: {
        month?: string;
        amount?: string | number;
        [key: string]: unknown;
    };
    actor?: {
        full_name: string;
    };
}

export interface FormattedAuditLog {
    id: string;
    action: string;
    description: string;
    timestamp: string;
    type: 'payment' | 'resident' | 'invoice' | 'security' | 'import' | 'approval';
    actorName?: string;
    entityName?: string;
    amount?: number;
}

const ENTITY_MAPPINGS: Record<string, string> = {
    'estate_bank_account_passwords': 'Banking Password',
    'bank_statement_imports': 'Bank Statement',
    'invoices': 'Invoice',
    'residents': 'Resident',
    'houses': 'House',
    'security_contacts': 'Security Contact',
    'access_codes': 'Access Code',
    'payment_records': 'Payment',
    'approval_requests': 'Approval Request',
    'development_levies': 'Development Levy',
    'roles': 'User Role',
    'profiles': 'User Profile'
};

const ACTION_MAPPINGS: Record<string, string> = {
    'CREATE': 'Created',
    'UPDATE': 'Updated',
    'DELETE': 'Deleted',
    'RESTORE': 'Restored',
    'APPROVE': 'Approved',
    'REJECT': 'Rejected',
    'IMPORT': 'Imported',
    'EXPORT': 'Exported',
};

function toTitleCase(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/(^|[\s_-])\p{L}/gu, (character) => character.toUpperCase())
        .replace(/[_-]+/g, ' ');
}

function humanizeAction(action: string): string {
    return ACTION_MAPPINGS[action.toUpperCase()] || toTitleCase(action);
}

function humanizeEntity(entityType: string): string {
    return ENTITY_MAPPINGS[entityType] || toTitleCase(entityType);
}

function isGenericDescription(log: AuditLogEntry): boolean {
    if (!log.description?.trim()) {
        return true;
    }

    const normalizedDescription = log.description.trim().toLowerCase().replace(/[_-]+/g, ' ');
    const normalizedAction = log.action.trim().toLowerCase().replace(/[_-]+/g, ' ');
    const normalizedEntity = log.entity_type.trim().toLowerCase().replace(/[_-]+/g, ' ');

    return normalizedDescription === `${normalizedAction} ${normalizedEntity}`;
}

function normalizeDescription(description: string): string {
    const trimmedDescription = description.trim().replace(/\s+/g, ' ');

    if (/^[A-Z\d\s_:/.-]+$/.test(trimmedDescription)) {
        const identifiers = new Map<string, string>();
        const protectedDescription = trimmedDescription.replace(/\b[A-Z\d]+(?:_[A-Z\d]+)+\b/g, (identifier) => {
            const placeholder = `§${identifiers.size}§`;
            identifiers.set(placeholder, identifier);
            return placeholder;
        });
        const normalizedDescription = protectedDescription
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/(^|[.!?]\s+)\p{L}/gu, (character) => character.toUpperCase());

        return Array.from(identifiers).reduce(
            (value, [placeholder, identifier]) => value.replace(placeholder, identifier),
            normalizedDescription
        );
    }

    return trimmedDescription;
}

export function formatAuditLog(log: AuditLogEntry): FormattedAuditLog {
    let type: FormattedAuditLog['type'] = 'resident';

    switch (log.entity_type) {
        case 'payment_records':
        case 'payments':
            type = 'payment';
            break;
        case 'invoices':
        case 'development_levies':
            type = 'invoice';
            break;
        case 'security_contacts':
        case 'access_codes':
            type = 'security';
            break;
        case 'bank_statement_imports':
        case 'estate_bank_account_passwords':
            type = 'import';
            break;
        case 'approval_requests':
            type = 'approval';
            break;
    }

    const humanAction = humanizeAction(log.action);
    const humanEntity = humanizeEntity(log.entity_type);
    const entityDisplay = log.entity_display?.trim();
    let description = normalizeDescription(log.description || '');

    if (isGenericDescription(log)) {
        if (log.entity_type === 'bank_statement_imports' && log.new_values?.month) {
            description = `${humanEntity} for ${log.new_values.month}`;
        } else if (log.entity_type === 'estate_bank_account_passwords' && log.action.toUpperCase() === 'CREATE') {
            description = 'A new banking password was added';
        } else {
            description = entityDisplay ? `${humanEntity}: ${entityDisplay}` : humanEntity;
        }
    }

    return {
        id: log.id,
        type,
        action: `${humanAction} ${humanEntity}`,
        description,
        timestamp: log.created_at,
        actorName: log.actor?.full_name,
        entityName: entityDisplay,
        amount: log.new_values?.amount ? Number(log.new_values.amount) : undefined
    };
}
