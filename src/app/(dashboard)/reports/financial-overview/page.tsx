import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { FinancialOverview } from '@/components/reports/financial-overview';

export const metadata: Metadata = {
  title: 'Financial Overview',
  description: 'View financial summary and transaction breakdown by category',
};

export default async function FinancialOverviewPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Permission check (migrated from legacy authorizeAction)
  const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
  if (!auth.authorized) {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Financial Overview</h3>
        <p className="text-sm text-muted-foreground">
          View financial summary and transaction breakdown from imported bank statements.
        </p>
      </div>
      <FinancialOverview />
    </div>
  );
}
