
import { formatAuditLog } from '../src/lib/audit/audit-formatter';

const mockLogs = [
    {
        id: '1',
        action: 'CREATE',
        entity_type: 'estate_bank_account_passwords',
        description: 'CREATE estate_bank_account_passwords',
        created_at: '2023-10-27T10:00:00Z',
        new_values: { some: 'data' }
    },
    {
        id: '2',
        action: 'CREATE',
        entity_type: 'bank_statement_imports',
        description: 'CREATE bank_statement_imports',
        created_at: '2023-10-27T11:00:00Z',
        new_values: { month: 'January 2026' }
    },
    {
        id: '3',
        action: 'UPDATE',
        entity_type: 'residents',
        entity_display: 'John Doe',
        description: 'UPDATE residents',
        created_at: '2023-10-27T12:00:00Z'
    }
];

console.log('--- Testing Audit Log Formatter ---');
mockLogs.forEach(log => {
    const formatted = formatAuditLog(log as any);
    console.log(`Original: ${log.description}`);
    console.log(`Formatted: ${formatted.description}`);
    console.log(`Type: ${formatted.type}`);
    console.log('---');
});
