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

// ============================================
// Hook: useContactVerification
// ============================================

interface UseContactVerificationProps {
  residentId: string;
}

interface UseContactVerificationReturn {
  // Verification status
  emailVerified: boolean;
  phoneVerified: boolean;
  isLoading: boolean;
  // Send verification
  handleSendVerification: (type: VerificationType) => Promise<void>;
  isSendingEmail: boolean;
  isSendingPhone: boolean;
  // Verify code
  handleVerifyCode: () => Promise<void>;
  isVerifyingEmail: boolean;
  isVerifyingPhone: boolean;
  // OTP dialog state
  otpDialogOpen: boolean;
  setOtpDialogOpen: (open: boolean) => void;
  otpValue: string;
  setOtpValue: (value: string) => void;
  activeVerificationType: VerificationType | null;
  expiresAt: string | null;
  getTimeRemaining: () => string | null;
  handleResendCode: () => Promise<void>;
}

/**
 * Hook for contact verification logic
 *
 * Extracts all verification state and handlers for reuse across components.
 */
export function useContactVerification({
  residentId,
}: UseContactVerificationProps): UseContactVerificationReturn {
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [activeVerificationType, setActiveVerificationType] = useState<VerificationType | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  // Queries and mutations
  const { data: status, isLoading } = useVerificationStatus(residentId);
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

  const getTimeRemaining = () => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return 'Expired';
    const minutes = Math.floor(remaining / 60000);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
  };

  return {
    emailVerified: status?.email?.verified ?? false,
    phoneVerified: status?.phone?.verified ?? false,
    isLoading,
    handleSendVerification,
    isSendingEmail: sendEmail.isPending,
    isSendingPhone: sendPhone.isPending,
    handleVerifyCode,
    isVerifyingEmail: verifyEmail.isPending,
    isVerifyingPhone: verifyPhone.isPending,
    otpDialogOpen,
    setOtpDialogOpen,
    otpValue,
    setOtpValue,
    activeVerificationType,
    expiresAt,
    getTimeRemaining,
    handleResendCode,
  };
}

// ============================================
// Component: OTPVerificationDialog
// ============================================

interface OTPVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otpValue: string;
  onOtpChange: (value: string) => void;
  verificationType: VerificationType | null;
  expiresAt: string | null;
  getTimeRemaining: () => string | null;
  onResend: () => void;
  onVerify: () => void;
  isResending: boolean;
  isVerifying: boolean;
}

/**
 * Standalone OTP Verification Dialog
 *
 * Can be used anywhere verification is needed.
 */
export function OTPVerificationDialog({
  open,
  onOpenChange,
  otpValue,
  onOtpChange,
  verificationType,
  expiresAt,
  getTimeRemaining,
  onResend,
  onVerify,
  isResending,
  isVerifying,
}: OTPVerificationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Verification Code</DialogTitle>
          <DialogDescription>
            We sent a 6-digit code to your {verificationType === 'email' ? 'email address' : 'phone number'}.
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
            onChange={onOtpChange}
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
              onClick={onResend}
              disabled={isResending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Resend
            </Button>
            <Button
              className="flex-1"
              onClick={onVerify}
              disabled={otpValue.length !== 6 || isVerifying}
            >
              {isVerifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Component: VerificationBadge (inline use)
// ============================================

interface VerificationBadgeProps {
  verified: boolean;
  onVerify?: () => void;
  isLoading?: boolean;
  hasValue?: boolean;
}

/**
 * Inline verification badge with optional verify button
 *
 * Shows verified badge or verify button based on status.
 */
export function VerificationBadge({
  verified,
  onVerify,
  isLoading = false,
  hasValue = true,
}: VerificationBadgeProps) {
  if (verified) {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
        <Check className="h-3 w-3 mr-1" />
        Verified
      </Badge>
    );
  }

  if (!hasValue) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Not set
      </Badge>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onVerify}
      disabled={isLoading}
    >
      {isLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      Verify
    </Button>
  );
}

// ============================================
// Original Component: ContactVerificationCard
// ============================================

interface ContactVerificationCardProps {
  residentId: string;
  email?: string | null;
  phone: string;
}

/**
 * Full Contact Verification Card
 *
 * Standalone card with verification UI.
 * For consolidated view, use useContactVerification hook directly.
 */
export function ContactVerificationCard({
  residentId,
  email,
  phone,
}: ContactVerificationCardProps) {
  const verification = useContactVerification({ residentId });

  if (verification.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

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
              <div className={`p-2 rounded-full ${verification.emailVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Email</p>
                <p className="text-xs text-muted-foreground">
                  {email || 'No email address'}
                </p>
              </div>
            </div>
            <VerificationBadge
              verified={verification.emailVerified}
              onVerify={() => verification.handleSendVerification('email')}
              isLoading={verification.isSendingEmail}
              hasValue={!!email}
            />
          </div>

          {/* Phone Verification */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${verification.phoneVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Phone</p>
                <p className="text-xs text-muted-foreground">{phone}</p>
              </div>
            </div>
            <VerificationBadge
              verified={verification.phoneVerified}
              onVerify={() => verification.handleSendVerification('phone')}
              isLoading={verification.isSendingPhone}
            />
          </div>

          {/* Info note */}
          {(!verification.emailVerified || !verification.phoneVerified) && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                Verifying your contact information helps secure your account and enables access to all estate features.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OTP Dialog */}
      <OTPVerificationDialog
        open={verification.otpDialogOpen}
        onOpenChange={verification.setOtpDialogOpen}
        otpValue={verification.otpValue}
        onOtpChange={verification.setOtpValue}
        verificationType={verification.activeVerificationType}
        expiresAt={verification.expiresAt}
        getTimeRemaining={verification.getTimeRemaining}
        onResend={verification.handleResendCode}
        onVerify={verification.handleVerifyCode}
        isResending={verification.isSendingEmail || verification.isSendingPhone}
        isVerifying={verification.isVerifyingEmail || verification.isVerifyingPhone}
      />
    </>
  );
}
