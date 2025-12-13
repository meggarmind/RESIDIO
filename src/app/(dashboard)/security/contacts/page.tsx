'use client';

import { Button } from '@/components/ui/button';
import { Plus, Shield, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { SecurityContactsTable } from '@/components/security/security-contacts-table';
import { useCurrentUserSecurityPermissions, useExportSecurityContactsCSV } from '@/hooks/use-security';
import { toast } from 'sonner';

export default function SecurityContactsPage() {
  const { data: permissionsData } = useCurrentUserSecurityPermissions();
  const exportMutation = useExportSecurityContactsCSV();

  const canRegisterContacts = permissionsData?.permissions?.register_contacts || false;
  const canExportContacts = permissionsData?.permissions?.export_contacts || false;

  const handleExport = async () => {
    try {
      const csvData = await exportMutation.mutateAsync({});
      if (csvData) {
        // Create blob and trigger download
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `security-contacts-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Security contacts exported successfully');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export contacts');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Security Contacts
          </h1>
          <p className="text-muted-foreground">
            Manage authorized visitors and staff for residents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExportContacts && (
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
            </Button>
          )}
          {canRegisterContacts && (
            <Button asChild>
              <Link href="/security/contacts/new">
                <Plus className="mr-2 h-4 w-4" />
                Register Contact
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Contacts Table */}
      <SecurityContactsTable />
    </div>
  );
}
