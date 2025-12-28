import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getInvoiceById } from '@/actions/billing/get-invoices';
import { getSettingValue } from '@/actions/settings/get-settings';
import { InvoiceReceiptPDF } from '@/lib/pdf/invoice-receipt';

/**
 * GET /api/receipts/[id]
 *
 * Generates a PDF receipt for a given invoice ID.
 * Only accessible to authenticated users who own the invoice.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    // Check authentication
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's profile, role, and permissions using new RBAC system
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role_id, resident_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Check permissions using new RBAC system
    let hasManagePaymentsPermission = false;
    if (profile.role_id) {
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('permission:app_permissions!inner(name)')
        .eq('role_id', profile.role_id);

      const permissions = (rolePerms as unknown as { permission: { name: string } }[] ?? [])
        .map((rp) => rp.permission?.name)
        .filter((name): name is string => name != null);

      // Users with manage_payments or view_payments can access receipts
      hasManagePaymentsPermission = permissions.includes('manage_payments') ||
        permissions.includes('view_payments');
    }

    // Fetch the invoice
    const { data: invoice, error: invoiceError } = await getInvoiceById(id);

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: invoiceError || 'Invoice not found' },
        { status: 404 }
      );
    }

    // Authorization: User must own the invoice OR have payment permissions
    const isOwner = profile.resident_id && invoice.resident?.id === profile.resident_id;

    if (!hasManagePaymentsPermission && !isOwner) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have access to this receipt' },
        { status: 403 }
      );
    }

    // Get estate name from settings
    const estateName = await getSettingValue('estate_name') || 'Residio Estate';

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      InvoiceReceiptPDF({ invoice, estateName })
    );

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const pdfBytes = new Uint8Array(pdfBuffer);

    // Create filename
    const receiptNumber = `RCP-${invoice.invoice_number?.replace('INV-', '') || id.slice(0, 8).toUpperCase()}`;
    const filename = `${receiptNumber}.pdf`;

    // Return PDF response
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
