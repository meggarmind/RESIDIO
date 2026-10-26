import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #530: the receipt route must gate staff access on the catalog permission
 * `payments.view`, not the non-existent `manage_payments` / `view_payments`.
 */

const RESIDENT_ID = 'res-owner';
let permissionNames: string[] = [];
let profileResidentId: string | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'u1', role_id: 'role1', resident_id: profileResidentId },
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({ data: permissionNames.map((name) => ({ permission: { name } })) }),
        }),
      };
    },
  }),
}));

vi.mock('@/actions/billing/get-invoices', () => ({
  getInvoiceById: async () => ({
    data: { id: 'inv1', invoice_number: 'INV-1', resident: { id: RESIDENT_ID } },
    error: null,
  }),
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: async () => 'Estate' }));
vi.mock('@/lib/branding/estate-logo-server', () => ({ getEstateLogoUrl: async () => undefined }));
vi.mock('@/lib/pdf/invoice-receipt', () => ({ InvoiceReceiptPDF: () => null }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async () => Buffer.from('%PDF') }));

import { GET } from '../route';

async function get(): Promise<Response> {
  return GET(new NextRequest('https://residio.test/api/receipts/inv1'), {
    params: Promise.resolve({ id: 'inv1' }),
  });
}

describe('GET /api/receipts/[id] permission gate (#530)', () => {
  beforeEach(() => {
    permissionNames = [];
    profileResidentId = null;
  });

  it('allows a non-owner holding payments.view', async () => {
    permissionNames = ['payments.view'];
    expect((await get()).status).toBe(200);
  });

  it('refuses a non-owner holding only the legacy names', async () => {
    permissionNames = ['manage_payments', 'view_payments'];
    expect((await get()).status).toBe(403);
  });

  it('refuses a non-owner with no payment permission', async () => {
    permissionNames = ['payments.create'];
    expect((await get()).status).toBe(403);
  });

  it('still allows the invoice owner with no permissions', async () => {
    profileResidentId = RESIDENT_ID;
    expect((await get()).status).toBe(200);
  });
});
