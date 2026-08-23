import { describe, expect, it } from 'vitest';
import { formatAuditLog, type AuditLogEntry } from '@/lib/audit/audit-formatter';

function auditLog(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'audit-id',
    action: 'CREATE',
    entity_type: 'residents',
    description: 'CREATE residents',
    created_at: '2026-08-22T12:00:00.000Z',
    ...overrides,
  };
}

describe('formatAuditLog', () => {
  it('combines the action and entity into a meaningful label', () => {
    const formatted = formatAuditLog(auditLog({ entity_display: 'Ada Okafor' }));

    expect(formatted.action).toBe('Created Resident');
    expect(formatted.description).toBe('Resident: Ada Okafor');
  });

  it('humanizes unknown actions and entity types', () => {
    const formatted = formatAuditLog(auditLog({
      action: 'BULK_ARCHIVE',
      entity_type: 'visitor_pass_requests',
      description: 'BULK_ARCHIVE visitor_pass_requests',
    }));

    expect(formatted.action).toBe('Bulk Archive Visitor Pass Requests');
    expect(formatted.description).toBe('Visitor Pass Requests');
  });

  it('normalizes raw uppercase descriptions without changing mixed-case copy', () => {
    expect(formatAuditLog(auditLog({
      action: 'UPDATE',
      description: 'PAYMENT REFERENCE TXN_ABC_123 WAS RECONCILED',
    })).description).toBe('Payment reference TXN_ABC_123 was reconciled');

    expect(formatAuditLog(auditLog({
      action: 'UPDATE',
      description: 'Payment reference TXN_ABC_123 was reconciled',
    })).description).toBe('Payment reference TXN_ABC_123 was reconciled');
  });

  it('provides a specific summary for banking password creation', () => {
    const formatted = formatAuditLog(auditLog({
      entity_type: 'estate_bank_account_passwords',
      description: '',
    }));

    expect(formatted.action).toBe('Created Banking Password');
    expect(formatted.description).toBe('A new banking password was added');
  });
});
