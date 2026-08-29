'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { extractRoleName, isAdminRoleName } from '@/lib/auth/action-roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

// Google is the only social provider enabled. Each additional provider means a
// separate app registration, its own review process and its own identity-linking
// edge cases, for close to no return on an estate admin dashboard.
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// Messages for the error codes the OAuth callback and middleware redirect with.
const CALLBACK_ERRORS: Record<string, string> = {
  account_rejected: 'This account was not approved. Please contact your estate administrator.',
  account_suspended: 'This account has been suspended. Please contact your estate administrator.',
  oauth_cancelled: 'Google sign-in was cancelled.',
  auth_failed: 'We could not complete sign-in. Please try again.',
  unauthorized: 'You do not have permission to view that page.',
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = CALLBACK_ERRORS[searchParams.get('error') ?? ''] ?? null;
  const [error, setError] = useState<string | null>(null);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  });

  const rememberMe = watch('rememberMe');

  const onSubmit = async (data: LoginFormData) => {
    setLoginState('loading');
    setError(null);

    const supabase = createClient();

    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoginState('idle');
      return;
    }

    // Get user profile with role in a single query (PERFORMANCE: eliminates 2nd query)
    if (authData.user) {
      // Using nested select to join profiles + app_roles in one roundtrip
      const { data: profileWithRole } = await supabase
        .from('profiles')
        .select(`
          role_id,
          resident_id,
          approval_status,
          app_roles!profiles_role_id_fkey (name)
        `)
        .eq('id', authData.user.id)
        .single();

      const roleName = extractRoleName(profileWithRole?.app_roles);
      const status = profileWithRole?.approval_status;

      // Approval status decides before role does. An account that has not been
      // approved holds no permissions at the database level either, so sending
      // it to the dashboard would only show an empty shell.
      if (status === 'rejected' || status === 'suspended') {
        await supabase.auth.signOut();
        setError(
          status === 'rejected'
            ? 'This account was not approved. Please contact your estate administrator.'
            : 'This account has been suspended. Please contact your estate administrator.'
        );
        setLoginState('idle');
        return;
      }

      // Show success state before navigation
      setLoginState('success');
      await new Promise(resolve => setTimeout(resolve, 600));

      if (status !== 'active') {
        router.push('/pending-approval');
      } else if (isAdminRoleName(roleName)) {
        router.push('/dashboard');
      } else if (roleName === 'resident' || profileWithRole?.resident_id) {
        router.push('/portal');
      } else {
        // Approved but with no role — nothing to show, so explain rather than
        // dropping them on an empty dashboard.
        router.push('/pending-approval');
      }
    } else {
      setLoginState('success');
      await new Promise(resolve => setTimeout(resolve, 600));
      router.push('/dashboard');
    }

    router.refresh();
  };

  const handleGoogleLogin = async () => {
    setOauthLoading('google');
    setError(null);

    const supabase = createClient();

    // The app origin is only allowed here if it is listed under Supabase's
    // Redirect URLs; the Google side always points at Supabase, not at us.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setOauthLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {(error || callbackError) && (
            <Alert variant="destructive">
              <AlertDescription>{error ?? callbackError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              {...register('email')}
              disabled={loginState !== 'idle'}
              className="h-12 rounded-xl input-tactile"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              {...register('password')}
              disabled={loginState !== 'idle'}
              className="h-12 rounded-xl input-tactile"
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setValue('rememberMe', checked === true)}
              disabled={loginState !== 'idle'}
            />
            <Label
              htmlFor="rememberMe"
              className="text-sm font-normal leading-tight cursor-pointer"
            >
              Keep me logged in on this computer
            </Label>
          </div>

          <Button
            type="submit"
            className={cn(
              "w-full h-12 relative overflow-hidden transition-all duration-300",
              loginState === 'success' && "btn-success-state success-glow"
            )}
            disabled={loginState !== 'idle'}
          >
            <AnimatePresence mode="wait">
              {loginState === 'loading' && (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </motion.span>
              )}
              {loginState === 'success' && (
                <motion.span
                  key="success"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Success
                </motion.span>
              )}
              {loginState === 'idle' && (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  Login
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </form>

        {/* Forgot password link */}
        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-primary hover:underline"
          >
            I forgot my password
          </Link>
        </div>

        {/* Register button */}
        <Button
          variant="outline"
          className="w-full h-11"
          onClick={() => router.push('/register')}
        >
          Register
        </Button>
      </div>

      {/* OAuth Section */}
      <div className="space-y-4">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          className="h-12 w-full rounded-xl hover-lift gap-3"
          onClick={handleGoogleLogin}
          disabled={loginState !== 'idle' || oauthLoading !== null}
        >
          {oauthLoading === 'google' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <LoginForm />
    </Suspense>
  );
}
