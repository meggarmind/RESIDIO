import { Wrench, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

async function getMaintenanceMessage(): Promise<string> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'maintenance_message')
    .single();

  if (data?.value) {
    // Handle both string and JSON values
    const value = data.value;
    if (typeof value === 'string') {
      return value.replace(/^"|"$/g, ''); // Remove surrounding quotes if present
    }
    return String(value);
  }

  return 'The system is currently under maintenance. Please try again later.';
}

async function checkMaintenanceMode(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'maintenance_mode')
    .single();

  return data?.value === true;
}

export default async function MaintenancePage() {
  // Check if maintenance mode is actually enabled
  const isMaintenanceMode = await checkMaintenanceMode();

  // If maintenance is not enabled, redirect to dashboard
  if (!isMaintenanceMode) {
    redirect('/dashboard');
  }

  const message = await getMaintenanceMessage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <Card className="max-w-lg w-full shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Wrench className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-2xl">Under Maintenance</CardTitle>
          <CardDescription>
            We&apos;re working to improve your experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {message}
              </p>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>If you need immediate assistance, please contact the estate administration.</p>
          </div>

          <div className="flex justify-center pt-2">
            <a
              href="/login"
              className="text-sm text-primary hover:underline"
            >
              Return to Login
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
