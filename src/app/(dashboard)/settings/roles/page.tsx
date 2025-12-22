import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RolesList } from '@/components/admin/roles-list';

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
    </div>
  );
}
