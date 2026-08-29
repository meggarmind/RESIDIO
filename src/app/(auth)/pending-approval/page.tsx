import { redirect } from 'next/navigation';
import { Clock, ShieldX, MailQuestion } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { extractRoleName, isAdminRoleName } from '@/lib/auth/action-roles';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignOutButton } from './sign-out-button';

/**
 * Holding page for accounts that have signed in but hold no access yet.
 *
 * New accounts — social or password — are provisioned as `pending` and are
 * denied by every RLS policy until an administrator approves them. Without this
 * page they would land on an empty dashboard with no explanation.
 */
export default async function PendingApprovalPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, approval_status, resident_id, rejection_reason, app_roles!profiles_role_id_fkey (name)')
    .eq('id', user.id)
    .single();

  // Approved while this tab was open — send them on rather than stranding them.
  if (profile?.approval_status === 'active') {
    const roleName = extractRoleName(profile.app_roles);

    if (isAdminRoleName(roleName)) redirect('/dashboard');
    if (roleName === 'resident' || profile.resident_id) redirect('/portal');
  }

  const isRejected = profile?.approval_status === 'rejected';
  const isSuspended = profile?.approval_status === 'suspended';
  const isDenied = isRejected || isSuspended;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            isDenied ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
          }`}
        >
          {isDenied ? <ShieldX className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">
            {isRejected
              ? 'Account not approved'
              : isSuspended
                ? 'Account suspended'
                : 'Waiting for approval'}
          </h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {isDenied ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isRejected
              ? 'Your request for access to this estate was declined.'
              : 'Your access to this estate has been suspended.'}{' '}
            If you believe this is a mistake, please contact your estate administrator.
          </p>

          {profile?.rejection_reason && (
            <Alert variant="destructive">
              <MailQuestion className="h-4 w-4" />
              <AlertDescription>{profile.rejection_reason}</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your account has been created and is waiting for an estate administrator to
            approve it and assign your role. You will be able to sign in normally once
            that happens — no further action is needed from you.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If this is taking longer than expected, contact your estate office and let them
            know you have registered.
          </p>
        </div>
      )}

      <SignOutButton />
    </div>
  );
}
