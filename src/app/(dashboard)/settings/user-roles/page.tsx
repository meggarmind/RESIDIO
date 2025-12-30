import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserRolesTable } from '@/components/admin/user-roles-table';

export default function UserRolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">User Role Assignments</h3>
        <p className="text-sm text-muted-foreground">
          Assign administrative roles to users. Role assignments determine what features each user
          can access.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Users & Roles</CardTitle>
          <CardDescription>
            Select a role from the dropdown to assign it to a user. Changes take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserRolesTable />
        </CardContent>
      </Card>
    </div>
  );
}
