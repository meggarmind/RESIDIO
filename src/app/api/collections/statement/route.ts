import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { getEstateLogoUrl } from '@/lib/branding/estate-logo-server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveAccess, toAccessClient } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getSettingValue } from '@/actions/settings/get-settings';
import { loadCollectionsStatement } from '@/lib/collections/statement-data';
import { CollectionsStatementPDF } from '@/lib/pdf/account-statement';

/**
 * GET /api/collections/statement?payerId=&fromDate=&toDate=
 *
 * The PDF statement of one collection payer, resident or not (#1196). Needs collections.view.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const payerId = searchParams.get('payerId');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    if (!payerId) return NextResponse.json({ error: 'Payer ID is required' }, { status: 400 });
    if (!fromDate || !toDate) return NextResponse.json({ error: 'Both fromDate and toDate are required' }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await resolveAccess(toAccessClient(supabase), { userId: user.id });
    if (access.status === 'lookup-failed') {
      console.error('[collections-statement] access lookup failed', { userId: user.id, error: access.error });
    }
    // A failed lookup fails closed.
    if (access.status !== 'resolved' || !access.permissions.includes(PERMISSIONS.COLLECTIONS_VIEW)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await loadCollectionsStatement(supabase as never, { payerId, fromDate, toDate });
    if (error || !data) {
      const status = error === 'Payer not found' ? 404 : error === 'Dates must be in YYYY-MM-DD format' ? 400 : 500;
      return NextResponse.json({ error: error || 'Failed to build the statement' }, { status });
    }

    const estateNameSetting = await getSettingValue('estate_name');
    const estateAddressSetting = await getSettingValue('estate_address');
    const pdf = await renderToBuffer(
      CollectionsStatementPDF({
        data,
        estateName: typeof estateNameSetting === 'string' ? estateNameSetting : 'Residio Estate',
        estateAddress: typeof estateAddressSetting === 'string' ? estateAddressSetting.trim() : '',
        estateLogoUrl: await getEstateLogoUrl(),
      })
    );
    const bytes = new Uint8Array(pdf);
    const filename = `Collections_${format(new Date(fromDate), 'yyyyMMdd')}-${format(new Date(toDate), 'yyyyMMdd')}_${data.payer.id.slice(0, 8)}.pdf`;
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': bytes.length.toString(),
      },
    });
  } catch (error) {
    console.error('Collections statement PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate statement PDF' }, { status: 500 });
  }
}
