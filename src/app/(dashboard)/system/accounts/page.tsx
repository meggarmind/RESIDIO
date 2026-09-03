'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RoleAssignmentSection } from '@/components/admin/role-assignment-section';
import { OrphanedAccountsList } from '@/components/admin/orphaned-accounts-list';
import { CurrentAdminsList } from '@/components/admin/current-admins-list';
import { PendingAccountsList } from '@/components/admin/pending-accounts-list';
import { Users, Ghost, UserCheck, Loader2 } from 'lucide-react';

function AccountsContent() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const validTabs = ['assignments', 'pending', 'orphaned'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'assignments';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Accounts</h3>
        <p className="text-sm text-muted-foreground">
          Manage who holds an administrative role, review new sign-ups waiting for approval,
          and reconcile authentication accounts that are not linked to a resident.
        </p>
      </div>

      <Tabs key={initialTab} defaultValue={initialTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assignments" className="gap-2">
            <Users className="h-4 w-4" />
            Role Assignments
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <UserCheck className="h-4 w-4" />
            Pending Accounts
          </TabsTrigger>
          <TabsTrigger value="orphaned" className="gap-2">
            <Ghost className="h-4 w-4" />
            Orphaned Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Administrators</CardTitle>
              <CardDescription>
                Everyone currently assigned to an administrative role, whether or not they
                live on the estate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentAdminsList />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assign Roles</CardTitle>
              <CardDescription>
                Search residents, or search accounts to reach staff who have a login but no
                resident record. Role assignment is part of the Settings module, so it sits
                with the Super Administrator.
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
              <CardTitle>Pending Accounts</CardTitle>
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

        <TabsContent value="orphaned" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Orphaned Auth Accounts</CardTitle>
              <CardDescription>
                Auth accounts that exist in Supabase but are not linked to any resident.
                These may be from failed registrations or account migrations. Link them to
                existing residents to enable portal access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrphanedAccountsList />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Accounts</h3>
        <p className="text-sm text-muted-foreground">
          Manage who holds an administrative role, review new sign-ups waiting for approval,
          and reconcile authentication accounts that are not linked to a resident.
        </p>
      </div>
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
