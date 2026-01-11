import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAccountStatement } from '@/actions/billing/get-account-statement';
import { getSettingValue } from '@/actions/settings/get-settings';
import { AccountStatementPDF } from '@/lib/pdf/account-statement';
import { format } from 'date-fns';

/**
 * GET /api/statements
 *
 * Generates a PDF account statement for a resident.
 *
 * Query parameters:
 * - residentId: Required - the resident ID to generate statement for
 * - houseId: Optional - filter by specific property
 * - fromDate: Required - start date (YYYY-MM-DD)
 * - toDate: Required - end date (YYYY-MM-DD)
 *
 * Authorization:
 * - Admin users with billing.view permission can generate for any resident
 * - Residents can only generate their own statements
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const residentId = searchParams.get('residentId');
    const houseId = searchParams.get('houseId');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    // Validate required parameters
    if (!residentId) {
      return NextResponse.json(
        { error: 'Resident ID is required' },
        { status: 400 }
      );
    }

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: 'Both fromDate and toDate are required' },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      return NextResponse.json(
        { error: 'Dates must be in YYYY-MM-DD format' },
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

    // Get user's profile and linked resident
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Get linked resident for the current user
    const { data: linkedResident } = await supabase
      .from('residents')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    // Check permissions using RBAC system
    let hasBillingPermission = false;
    if (profile.role_id) {
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('permission:app_permissions!inner(name)')
        .eq('role_id', profile.role_id);

      const permissions = (rolePerms as unknown as { permission: { name: string } }[] ?? [])
        .map((rp) => rp.permission?.name)
        .filter((name): name is string => name != null);

      // Users with billing.view permission can access any statement
      hasBillingPermission = permissions.includes('billing.view');
    }

    // Authorization: User must be the resident OR have billing permissions
    const isOwnStatement = linkedResident?.id === residentId;

    if (!hasBillingPermission && !isOwnStatement) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have access to this statement' },
        { status: 403 }
      );
    }

    // Generate statement data
    const { data: statementData, error: statementError } = await getAccountStatement({
      residentId,
      houseId: houseId || undefined,
      fromDate,
      toDate,
    });

    if (statementError || !statementData) {
      return NextResponse.json(
        { error: statementError || 'Failed to generate statement data' },
        { status: 500 }
      );
    }

    // Get estate name from settings
    const estateName = await getSettingValue('estate_name') || 'Residio Estate';

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      AccountStatementPDF({ data: statementData, estateName })
    );

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const pdfBytes = new Uint8Array(pdfBuffer);

    // Create filename
    const residentCode = statementData.resident.resident_code;
    const periodFrom = format(new Date(fromDate), 'yyyyMMdd');
    const periodTo = format(new Date(toDate), 'yyyyMMdd');
    const filename = `Statement_${residentCode}_${periodFrom}-${periodTo}.pdf`;

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
    console.error('Statement PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate statement PDF' },
      { status: 500 }
    );
  }
}
