import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RolesList } from '@/components/admin/roles-list';
import { RoleAssignmentRulesEditor } from '@/components/admin/role-assignment-rules';

export default function RolesSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Roles & Permissions</h3>
        <p className="text-sm text-muted-foreground">
          Manage admin roles and their permissions for the estate.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Role Management</CardTitle>
          <CardDescription>
            Create, edit, or remove roles. System roles cannot be deleted but their
            permissions can be customized.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RolesList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role Assignment Rules</CardTitle>
          <CardDescription>
            Configure which resident types are allowed to be assigned each executive role.
            This helps enforce organizational policies about role eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleAssignmentRulesEditor />
        </CardContent>
      </Card>
    </div>
  );
}
