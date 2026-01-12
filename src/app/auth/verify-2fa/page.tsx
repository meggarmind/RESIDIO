'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { Shield, Smartphone, Mail, Key, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type TwoFactorMethod = 'sms' | 'authenticator' | 'email';

export default function Verify2FAPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [method, setMethod] = useState<TwoFactorMethod | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const redirectTo = searchParams.get('next') || '/dashboard';

  useEffect(() => {
    // Check if we have a pending 2FA verification
    const check2FAStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // No session, redirect to login
        router.push('/login');
        return;
      }

      // Check if user has 2FA and needs verification
      // This is stored in a custom claim or needs to be fetched
      setUserId(session.user.id);

      // Fetch 2FA method from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('two_factor_enabled, two_factor_method')
        .eq('id', session.user.id)
        .single();

      if (!profile?.two_factor_enabled) {
        // No 2FA required, redirect to destination
        router.push(redirectTo);
        return;
      }

      setMethod(profile.two_factor_method as TwoFactorMethod);

      // For SMS/email, send code automatically
      if (profile.two_factor_method !== 'authenticator') {
        await sendVerificationCode(profile.two_factor_method as TwoFactorMethod);
      }
    };

    check2FAStatus();
  }, [supabase, router, redirectTo]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const sendVerificationCode = async (methodToUse: TwoFactorMethod) => {
    if (!userId) return;

    setIsSendingCode(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/2fa/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, method: methodToUse }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.message);
      } else {
        setCodeSent(true);
        setResendCooldown(60); // 60 second cooldown
      }
    } catch {
      setError('Failed to send verification code');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerify = async () => {
    if (!userId || code.length !== (useBackupCode ? 8 : 6)) return;

    setIsLoading(true);
    setError(null);

    try {
      const endpoint = useBackupCode
        ? '/api/auth/2fa/verify-backup'
        : '/api/auth/2fa/verify';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.message);
        setCode('');
      } else {
        // Verification successful, redirect
        router.push(redirectTo);
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getMethodIcon = () => {
    switch (method) {
      case 'sms':
        return <Smartphone className="h-8 w-8 text-primary" />;
      case 'email':
        return <Mail className="h-8 w-8 text-primary" />;
      case 'authenticator':
        return <Shield className="h-8 w-8 text-primary" />;
      default:
        return <Shield className="h-8 w-8 text-primary" />;
    }
  };

  const getMethodDescription = () => {
    if (useBackupCode) {
      return 'Enter one of your backup codes to sign in.';
    }
    switch (method) {
      case 'sms':
        return 'Enter the 6-digit code sent to your phone.';
      case 'email':
        return 'Enter the 6-digit code sent to your email.';
      case 'authenticator':
        return 'Enter the 6-digit code from your authenticator app.';
      default:
        return 'Enter your verification code.';
    }
  };

  if (!method) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {useBackupCode ? (
              <Key className="h-8 w-8 text-primary" />
            ) : (
              getMethodIcon()
            )}
          </div>
          <CardTitle className="text-2xl">
            {useBackupCode ? 'Enter Backup Code' : 'Two-Factor Authentication'}
          </CardTitle>
          <CardDescription>{getMethodDescription()}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-center">
            {useBackupCode ? (
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                maxLength={8}
                className="text-center text-2xl tracking-[0.5em] font-mono w-full max-w-[200px] border rounded-md p-2"
              />
            ) : (
              <InputOTP
                value={code}
                onChange={setCode}
                maxLength={6}
                disabled={isLoading}
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
            )}
          </div>

          <Button
            onClick={handleVerify}
            disabled={isLoading || code.length < (useBackupCode ? 8 : 6)}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </Button>

          {/* Resend code option for SMS/email */}
          {!useBackupCode && method !== 'authenticator' && (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sendVerificationCode(method)}
                disabled={isSendingCode || resendCooldown > 0}
              >
                {isSendingCode ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : resendCooldown > 0 ? (
                  `Resend in ${resendCooldown}s`
                ) : (
                  'Resend Code'
                )}
              </Button>
            </div>
          )}

          {/* Toggle backup code option */}
          <div className="text-center border-t pt-4">
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setCode('');
                setError(null);
              }}
            >
              {useBackupCode ? (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Use {method === 'authenticator' ? 'Authenticator' : 'Verification Code'}
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Use Backup Code
                </>
              )}
            </Button>
          </div>

          {/* Cancel option */}
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/login');
              }}
            >
              Cancel and Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
