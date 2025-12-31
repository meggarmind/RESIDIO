'use client';

import { useState } from 'react';
import { Mail, Phone, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from '@/components/ui/input-otp';
import { toast } from 'sonner';
import {
  useVerificationStatus,
  useSendEmailVerification,
  useSendPhoneVerification,
  useVerifyEmail,
  useVerifyPhone,
} from '@/hooks/use-verification';
import type { VerificationType } from '@/types/database';

interface ContactVerificationCardProps {
  residentId: string;
  email?: string | null;
  phone: string;
}

export function ContactVerificationCard({
  residentId,
  email,
  phone,
}: ContactVerificationCardProps) {
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [activeVerificationType, setActiveVerificationType] = useState<VerificationType | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  // Queries and mutations
  const { data: status, isLoading: statusLoading } = useVerificationStatus(residentId);
  const sendEmail = useSendEmailVerification();
  const sendPhone = useSendPhoneVerification();
  const verifyEmail = useVerifyEmail();
  const verifyPhone = useVerifyPhone();

  const handleSendVerification = async (type: VerificationType) => {
    try {
      const mutation = type === 'email' ? sendEmail : sendPhone;
      const result = await mutation.mutateAsync(residentId);

      setActiveVerificationType(type);
      setExpiresAt(result.expiresAt || null);
      setOtpValue('');
      setOtpDialogOpen(true);

      toast.success('Verification code sent', {
        description: result.message,
      });
    } catch (error) {
      toast.error('Failed to send code', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleVerifyCode = async () => {
    if (otpValue.length !== 6 || !activeVerificationType) return;

    try {
      const mutation = activeVerificationType === 'email' ? verifyEmail : verifyPhone;
      await mutation.mutateAsync({ residentId, token: otpValue });

      setOtpDialogOpen(false);
      setOtpValue('');
      setActiveVerificationType(null);

      toast.success('Verified!', {
        description: `Your ${activeVerificationType} has been verified successfully.`,
      });
    } catch (error) {
      toast.error('Verification failed', {
        description: error instanceof Error ? error.message : 'Invalid or expired code',
      });
    }
  };

  const handleResendCode = async () => {
    if (!activeVerificationType) return;
    await handleSendVerification(activeVerificationType);
  };

  // Calculate time remaining for OTP
  const getTimeRemaining = () => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return 'Expired';
    const minutes = Math.floor(remaining / 60000);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
  };

  if (statusLoading) {
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact Verification</CardTitle>
          <CardDescription>
            Verify your contact information to unlock all features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email Verification */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${emailVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Email</p>
                <p className="text-xs text-muted-foreground">
                  {email || 'No email address'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {emailVerified ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                  <Check className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              ) : email ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSendVerification('email')}
                  disabled={sendEmail.isPending}
                >
                  {sendEmail.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Verify
                </Button>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not set
                </Badge>
              )}
            </div>
          </div>

          {/* Phone Verification */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${phoneVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Phone</p>
                <p className="text-xs text-muted-foreground">{phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phoneVerified ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                  <Check className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSendVerification('phone')}
                  disabled={sendPhone.isPending}
                >
                  {sendPhone.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Verify
                </Button>
              )}
            </div>
          </div>

          {/* Info note */}
          {(!emailVerified || !phoneVerified) && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                Verifying your contact information helps secure your account and enables access to all estate features.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OTP Dialog */}
      <Dialog open={otpDialogOpen} onOpenChange={setOtpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Enter Verification Code
            </DialogTitle>
            <DialogDescription>
              We sent a 6-digit code to your {activeVerificationType === 'email' ? 'email address' : 'phone number'}.
              {expiresAt && (
                <span className="block mt-1 text-amber-600">
                  {getTimeRemaining()}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-6 py-4">
            <InputOTP
              maxLength={6}
              value={otpValue}
              onChange={setOtpValue}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>

            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleResendCode}
                disabled={sendEmail.isPending || sendPhone.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Resend
              </Button>
              <Button
                className="flex-1"
                onClick={handleVerifyCode}
                disabled={otpValue.length !== 6 || verifyEmail.isPending || verifyPhone.isPending}
              >
                {(verifyEmail.isPending || verifyPhone.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Verify
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
