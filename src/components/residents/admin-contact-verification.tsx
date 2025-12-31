'use client';

import { Mail, Phone, Check, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  useVerificationStatus,
  useAdminVerifyContact,
} from '@/hooks/use-verification';
import type { VerificationType } from '@/types/database';

interface AdminContactVerificationProps {
  residentId: string;
  email?: string | null;
  phone: string;
}

export function AdminContactVerification({
  residentId,
  email,
  phone,
}: AdminContactVerificationProps) {
  const { data: status, isLoading } = useVerificationStatus(residentId);
  const adminVerify = useAdminVerifyContact();

  const handleAdminVerify = async (contactType: VerificationType) => {
    try {
      await adminVerify.mutateAsync({ residentId, contactType });
      toast.success(
        `${contactType === 'email' ? 'Email' : 'Phone'} has been manually verified.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to verify contact'
      );
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const emailVerified = status?.email?.verified;
  const phoneVerified = status?.phone?.verified;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Contact Verification
        </CardTitle>
        <CardDescription>
          Manage contact verification status for this resident
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email Verification */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${emailVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium text-sm">Email</p>
              <p className="text-xs text-muted-foreground">
                {email || 'No email address'}
              </p>
              {emailVerified && status?.email?.verified_at && (
                <p className="text-xs text-green-600 mt-0.5">
                  Verified on {formatDate(status.email.verified_at)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {emailVerified ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                <Check className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            ) : email ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={adminVerify.isPending}
                  >
                    {adminVerify.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Admin Verify
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Verify Email Manually?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the email address as verified without requiring the resident to complete the OTP verification process. This action will be logged for audit purposes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleAdminVerify('email')}>
                      Verify Email
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not set
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Phone Verification */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${phoneVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium text-sm">Phone</p>
              <p className="text-xs text-muted-foreground">{phone}</p>
              {phoneVerified && status?.phone?.verified_at && (
                <p className="text-xs text-green-600 mt-0.5">
                  Verified on {formatDate(status.phone.verified_at)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {phoneVerified ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                <Check className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={adminVerify.isPending}
                  >
                    {adminVerify.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Admin Verify
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Verify Phone Manually?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the phone number as verified without requiring the resident to complete the SMS verification process. This action will be logged for audit purposes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleAdminVerify('phone')}>
                      Verify Phone
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Info note for unverified contacts */}
        {(!emailVerified || !phoneVerified) && (
          <>
            <Separator />
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                Contacts can be verified by the resident via OTP, or manually by an admin with the appropriate permission.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
