'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { SecurityContactForm } from '@/components/security/security-contact-form';
import { useCurrentUserSecurityPermissions } from '@/hooks/use-security';
import { Loader2 } from 'lucide-react';

export default function NewSecurityContactPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const residentId = searchParams.get('resident_id');
  const { data: permissionsData, isLoading } = useCurrentUserSecurityPermissions();

  const canRegisterContacts = permissionsData?.permissions?.register_contacts || false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!canRegisterContacts) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost">
          <Link href="/security/contacts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Contacts
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Permission Denied</CardTitle>
            <CardDescription>
              You do not have permission to register security contacts.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button asChild variant="ghost">
        <Link href="/security/contacts">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Contacts
        </Link>
      </Button>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Register New Security Contact
          </CardTitle>
          <CardDescription>
            Add a new authorized visitor or staff member for a resident. They will receive an access code after registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecurityContactForm
            preselectedResidentId={residentId || undefined}
            onSuccess={() => {
              if (residentId) {
                router.push(`/residents/${residentId}?tab=security`);
              } else {
                router.push('/security/contacts');
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
