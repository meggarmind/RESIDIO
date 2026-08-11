import { NextResponse } from 'next/server';
import { processDueSchedules } from '@/actions/reports/process-schedules';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await processDueSchedules();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    }, { status: 500 });
  }
}
