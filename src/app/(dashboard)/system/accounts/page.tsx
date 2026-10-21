'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RoleAssignmentSection } from '@/components/admin/role-assignment-section';
import { OrphanedAccountsList } from '@/components/admin/orphaned-accounts-list';
import { CurrentAdminsList } from '@/components/admin/current-admins-list';
import { PendingAccountsList } from '@/components/admin/pending-accounts-list';
import { RolesList } from '@/components/admin/roles-list';
import { RoleTitlesManager } from '@/components/admin/role-titles-manager';
import { RoleAssignmentRulesEditor } from '@/components/admin/role-assignment-rules';
import { Users, Ghost, UserCheck, Shield, Settings, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

// Values from before #912 still work in old bookmarks and links.
const TAB_ALIASES: Record<string, string> = { assignments: 'administrators', orphaned: 'unlinked' };
const OPEN_TABS = ['administrators', 'pending', 'unlinked'];
const MANAGE_TABS = ['roles', 'rules'];

function AccountsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  // The route admits system.assign_roles; the Roles and Rules tabs also need
  // system.manage_roles, which every read and write behind them enforces server-side.
  const canManageRoles = hasPermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);

  const requested = searchParams.get('tab') ?? '';
  const wanted = TAB_ALIASES[requested] ?? requested;
  const allowed = canManageRoles ? [...OPEN_TABS, ...MANAGE_TABS] : OPEN_TABS;
  const tab = allowed.includes(wanted) ? wanted : 'administrators';
  const roleFilter = searchParams.get('role') || undefined;

  const onTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    // The role filter belongs to the Administrators tab only.
    if (value !== 'administrators') params.delete('role');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const clearRoleHref = `${pathname}?tab=administrators`;

  return (
    <div className="space-y-6">
      <AccountsHeading />

      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        {/* Scrolls inside the bar so five tabs never widen the page at phone width. */}
        <div className="overflow-x-auto">
          <TabsList className="w-max min-w-full justify-start">
            <TabsTrigger value="administrators" className="gap-2">
              <Users className="h-4 w-4" />
              Administrators
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <UserCheck className="h-4 w-4" />
              Pending sign-ups
            </TabsTrigger>
            <TabsTrigger value="unlinked" className="gap-2">
              <Ghost className="h-4 w-4" />
              Unlinked logins
            </TabsTrigger>
            {canManageRoles && (
              <TabsTrigger value="roles" className="gap-2">
                <Shield className="h-4 w-4" />
                Roles
              </TabsTrigger>
            )}
            {canManageRoles && (
              <TabsTrigger value="rules" className="gap-2">
                <Settings className="h-4 w-4" />
                Who can hold each role
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="administrators" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Administrators</CardTitle>
              <CardDescription>
                Everyone currently assigned to an administrative role, whether or not they
                live on the estate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentAdminsList roleFilter={roleFilter} clearFilterHref={clearRoleHref} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assign Roles</CardTitle>
              <CardDescription>
                Search residents, or search accounts to reach staff who have a login but no
                resident record. The roles you can pick are defined on the Roles tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoleAssignmentSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Sign-ups</CardTitle>
              <CardDescription>
                People who have signed up and are waiting to be let in. Until you approve one,
                the account can sign in but has no access to any estate data. Approving it
                assigns the role it will hold.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PendingAccountsList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unlinked" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Unlinked logins</CardTitle>
              <CardDescription>
                Logins that exist but are not linked to any resident. These may be from failed
                registrations or account migrations. Link them to existing residents to enable
                portal access. A login that already holds an administrative role is marked.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrphanedAccountsList />
            </CardContent>
          </Card>
        </TabsContent>

        {canManageRoles && (
          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardDescription>
                  Create, edit, or remove roles. System roles (Super Administrator, Resident)
                  cannot be deleted but their permissions can be customized.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RolesList />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Titles</CardTitle>
                <CardDescription>
                  Add, rename or resize the titles people can hold under each role.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RoleTitlesManager />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageRoles && (
          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Who can hold each role</CardTitle>
                <CardDescription>
                  Configure which resident types are allowed to be assigned each executive role.
                  This helps enforce organizational policies about role eligibility.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RoleAssignmentRulesEditor />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AccountsHeading() {
  return (
    <div>
      <h3 className="text-lg font-medium">Roles & Access</h3>
      <p className="text-sm text-muted-foreground">
        Define roles, choose who holds them, review new sign-ups waiting for approval, and
        reconcile logins that are not linked to a resident.
      </p>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <AccountsHeading />
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AccountsContent />
    </Suspense>
  );
}
