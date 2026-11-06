'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { safeNextPath } from '@/lib/auth/safe-next-path';
import { useAuth } from '@/lib/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { Shield, Smartphone, Mail, Key, AlertCircle, Loader2, MessageCircle, Monitor } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type TwoFactorMethod = 'sms' | 'authenticator' | 'email';

// After a correct code, access can take a moment to become readable, so the
// load is tried a few times before the error and Retry are shown (#1341).
const ACCESS_LOAD_ATTEMPTS = 3;
const ACCESS_RETRY_DELAY_MS = 1000;

// WhatsApp approval (#1389): the page asks for the answer every 2 seconds.
const WHATSAPP_POLL_INTERVAL_MS = 2000;

type WhatsAppState = 'starting' | 'pending' | 'expired' | 'denied' | 'failed';

interface WhatsAppRequest {
  code: string;
  expiresAt: string;
  message: string;
}

/** m:ss for the countdown. */
function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Verify2FAForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { refreshProfile } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [method, setMethod] = useState<TwoFactorMethod | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [accessState, setAccessState] = useState<'idle' | 'loading' | 'failed'>('idle');
  // "Remember this computer for 30 days?" (#1390): asked once the second factor is done.
  const [askRemember, setAskRemember] = useState(false);
  const [isRemembering, setIsRemembering] = useState(false);
  // WhatsApp approval (#1389): offered when the start route says the account uses it.
  const [whatsAppAvailable, setWhatsAppAvailable] = useState(false);
  const [mode, setMode] = useState<'whatsapp' | 'code'>('code');
  const [whatsAppState, setWhatsAppState] = useState<WhatsAppState>('starting');
  const [whatsAppRequest, setWhatsAppRequest] = useState<WhatsAppRequest | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // The first WhatsApp start, shared by every run of the check below, so a re-run sends no second request.
  const firstWhatsAppStart = useRef<Promise<boolean> | null>(null);

  // Strict same-origin allow-list; anything else becomes /dashboard (#455).
  const redirectTo = safeNextPath(
    searchParams.get('next'),
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  );

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

      // A remembered computer of this user skips the second factor (#1390).
      if (await tryRememberedComputer()) {
        await loadAccessAndEnter();
        return;
      }

      setMethod(profile.two_factor_method as TwoFactorMethod);

      // WhatsApp approval first, when the account uses it (#1389). Otherwise the code entry as before.
      firstWhatsAppStart.current ??= startWhatsAppApproval();
      if (await firstWhatsAppStart.current) return;

      // For SMS/email, send code automatically
      if (profile.two_factor_method !== 'authenticator') {
        await sendVerificationCode(profile.two_factor_method as TwoFactorMethod);
      }
    };

    check2FAStatus();
  }, [supabase, router, redirectTo]);

  // WhatsApp approval: ask for the answer every 2 seconds while it is open.
  useEffect(() => {
    if (mode !== 'whatsapp' || whatsAppState !== 'pending') return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/2fa/whatsapp/status', { cache: 'no-store' });
        const result = await response.json();
        if (stopped) return;
        if (result.status === 'approved') {
          stopped = true;
          clearInterval(timer);
          setAskRemember(true);
        } else if (result.status === 'denied') {
          stopped = true;
          clearInterval(timer);
          setWhatsAppState('denied');
          await supabase.auth.signOut();
        } else if (result.status === 'expired') {
          setWhatsAppState('expired');
        } else if (result.status === 'used') {
          setWhatsAppState('failed');
          setError(result.message);
        }
      } catch {
        // A missed check is tried again on the next tick.
      }
    }, WHATSAPP_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the request changes
  }, [mode, whatsAppState, whatsAppRequest]);

  // WhatsApp approval: the 2-minute countdown.
  useEffect(() => {
    if (mode !== 'whatsapp' || whatsAppState !== 'pending' || !whatsAppRequest) return;
    const tick = () => setSecondsLeft(Math.ceil((Date.parse(whatsAppRequest.expiresAt) - Date.now()) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [mode, whatsAppState, whatsAppRequest]);

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
        body: JSON.stringify({ method: methodToUse }),
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

  /** Asks the server for a WhatsApp approval. False when the account does not use it. */
  const startWhatsAppApproval = async (): Promise<boolean> => {
    setError(null);
    setWhatsAppState('starting');
    try {
      const response = await fetch('/api/auth/2fa/whatsapp/start', { method: 'POST' });
      const result = await response.json();
      if (result?.available !== true) return false;
      setWhatsAppAvailable(true);
      setMode('whatsapp');
      if (result.success && typeof result.code === 'string') {
        setWhatsAppRequest({ code: result.code, expiresAt: result.expiresAt, message: result.message });
        setSecondsLeft(Math.ceil((Date.parse(result.expiresAt) - Date.now()) / 1000));
        setWhatsAppState('pending');
      } else {
        setWhatsAppRequest(null);
        setWhatsAppState('failed');
        setError(result.message || 'Could not send the WhatsApp message.');
      }
      return true;
    } catch {
      return false;
    }
  };

  /** True when the server found a remembered computer of this user and set the marker (#1390). */
  const tryRememberedComputer = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/2fa/trusted-device/use', { method: 'POST' });
      const result = await response.json();
      return result?.trusted === true;
    } catch {
      return false;
    }
  };

  /** The answer to "Remember this computer for 30 days?". Either way, then enter the app. */
  const answerRemember = async (remember: boolean) => {
    if (remember) {
      setIsRemembering(true);
      // A failure only means the next sign-in asks again, so it does not stop this one.
      await fetch('/api/auth/2fa/trusted-device/remember', { method: 'POST' }).catch(() => undefined);
      setIsRemembering(false);
    }
    setAskRemember(false);
    await loadAccessAndEnter();
  };

  // Enter the app only once the access rows have loaded, so the sidebar never
  // renders from an empty pre-2FA profile (#1341).
  const loadAccessAndEnter = async () => {
    setAccessState('loading');
    for (let attempt = 1; attempt <= ACCESS_LOAD_ATTEMPTS; attempt++) {
      if (await refreshProfile()) {
        router.push(redirectTo);
        return;
      }
      if (attempt < ACCESS_LOAD_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, ACCESS_RETRY_DELAY_MS * attempt));
      }
    }
    setAccessState('failed');
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
        body: JSON.stringify({ code }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.message);
        setCode('');
      } else {
        setAskRemember(true);
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

  if (accessState !== 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          {accessState === 'loading' ? (
            <CardContent className="flex flex-col items-center justify-center gap-3 py-8" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading your access</p>
            </CardContent>
          ) : (
            <CardContent className="space-y-4 py-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Your code was accepted, but we could not load your access. Try again.
                </AlertDescription>
              </Alert>
              <Button onClick={loadAccessAndEnter} className="w-full">
                Retry
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  if (askRemember) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Monitor className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Remember this computer for 30 days?</CardTitle>
            <CardDescription>Choose No on a shared or public computer.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={() => answerRemember(true)} disabled={isRemembering}>
              {isRemembering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, remember it
            </Button>
            <Button variant="outline" onClick={() => answerRemember(false)} disabled={isRemembering}>
              No, ask me each time
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const cancelAndSignOut = async () => {
    if (whatsAppAvailable) {
      // Close the open WhatsApp request first, while the session still exists (#1389).
      await fetch('/api/auth/2fa/whatsapp/cancel', { method: 'POST' }).catch(() => undefined);
    }
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (mode === 'whatsapp' && whatsAppState === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Sign-in blocked</CardTitle>
            <CardDescription>
              This sign-in was refused on WhatsApp. You are signed out. If this was not you, change your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push('/login')}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'whatsapp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Approve on WhatsApp</CardTitle>
            <CardDescription>We sent a message to your WhatsApp.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {whatsAppState === 'starting' && (
              <div className="flex justify-center py-6" role="status">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {whatsAppState === 'pending' && whatsAppRequest && (
              <div className="space-y-4 text-center">
                <p className="text-6xl font-bold tracking-widest" aria-label="Number to tap">
                  {whatsAppRequest.code}
                </p>
                <p className="text-sm">{whatsAppRequest.message}</p>
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for your answer. {formatCountdown(secondsLeft)} left.
                </p>
              </div>
            )}

            {whatsAppState === 'expired' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>The request has expired. Send the WhatsApp message again.</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col items-center gap-1 border-t pt-4">
              <Button variant="link" size="sm" onClick={() => startWhatsAppApproval()}>
                Send the WhatsApp message again
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setMode('code');
                  setUseBackupCode(false);
                  setCode('');
                  setError(null);
                }}
              >
                <Shield className="mr-2 h-4 w-4" />
                Use my authenticator code
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setMode('code');
                  setUseBackupCode(true);
                  setCode('');
                  setError(null);
                }}
              >
                <Key className="mr-2 h-4 w-4" />
                Use a backup code
              </Button>
            </div>

            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={cancelAndSignOut}>
                Cancel and Sign Out
              </Button>
            </div>
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

          {whatsAppAvailable && (
            <div className="text-center">
              <Button variant="link" size="sm" onClick={() => startWhatsAppApproval()}>
                <MessageCircle className="mr-2 h-4 w-4" />
                Approve on WhatsApp instead
              </Button>
            </div>
          )}

          {/* Cancel option */}
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelAndSignOut}
            >
              Cancel and Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
