import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StreetsList } from '@/components/admin/streets-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Streets | Settings',
  description: 'Manage street reference data',
};

export default async function StreetsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // RBAC Check
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
        <h3 className="text-lg font-medium">Streets</h3>
        <p className="text-sm text-muted-foreground">
          Manage the list of streets in the estate.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Streets Management</CardTitle>
          <CardDescription>
            Add, edit, or remove streets used throughout the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StreetsList />
        </CardContent>
      </Card>
    </div>
  );
}
