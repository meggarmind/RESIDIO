'use client';

import { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * Sign-out for the holding page. Deliberately a hard navigation rather than a
 * router push, matching AuthProvider.signOut(), so no stale client state or
 * cached profile survives into the next session.
 */
export function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  return (
    <Button variant="outline" className="w-full" onClick={handleSignOut} disabled={signingOut}>
      {signingOut ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="mr-2 h-4 w-4" />
      )}
      Sign out
    </Button>
  );
}
