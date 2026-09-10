import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Verify2FAForm } from './verify-2fa-form';

export const dynamic = 'force-dynamic';

export default async function Verify2FAPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Verify2FAForm />
    </Suspense>
  );
}
