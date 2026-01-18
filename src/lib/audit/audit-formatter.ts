import { formatDistanceToNow } from 'date-fns';

export interface AuditLogEntry {
    id: string;
    action: string;
    entity_type: string;
    entity_display?: string;
    description: string;
    created_at: string;
    new_values?: any;
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
};

export function formatAuditLog(log: AuditLogEntry): FormattedAuditLog {
    // Determine the type for the icon
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

    // Format the Action
    const humanAction = ACTION_MAPPINGS[log.action] || log.action;

    // Format the Entity Name
    const humanEntity = ENTITY_MAPPINGS[log.entity_type] || log.entity_type.replace(/_/g, ' ');

    // Construct a human-readable description
    let description = log.description;

    // If the description is just the default "ACTION entity_type", improve it
    if (!description || description === `${log.action} ${log.entity_type}`) {
        // Try to distinguish based on context using new_values if available
        if (log.entity_type === 'bank_statement_imports' && log.new_values?.month) {
            description = `${humanAction} ${humanEntity} for ${log.new_values.month}`;
        } else if (log.action === 'CREATE' && log.entity_type === 'estate_bank_account_passwords') {
            description = `Added new ${humanEntity}`;
        } else {
            description = `${humanAction} ${humanEntity}`;
        }

        // Add specific entity identifier if available and not too long
        if (log.entity_display) {
            description += `: ${log.entity_display}`;
        }
    }

    // Special case for "CREATE estate_bank_account_passwords" specifically mentioned by user
    if (log.entity_type === 'estate_bank_account_passwords' && log.action === 'CREATE') {
        description = 'Added new banking password';
    }

    return {
        id: log.id,
        type,
        action: humanAction.toUpperCase(), // Pulse UI expects uppercase action often, or we can keep it standard
        description,
        timestamp: log.created_at,
        actorName: log.actor?.full_name,
        entityName: log.entity_display,
        amount: log.new_values?.amount ? Number(log.new_values.amount) : undefined
    };
}
