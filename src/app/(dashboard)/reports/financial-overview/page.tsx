import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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

  // RBAC Check - Only admin, chairman, and financial_secretary can view reports
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const allowedRoles = ['admin', 'chairman', 'financial_secretary'];
  if (!profile || !allowedRoles.includes(profile.role)) {
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
