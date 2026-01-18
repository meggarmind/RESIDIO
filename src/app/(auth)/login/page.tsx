'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
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

// OAuth provider configuration
const oauthProviders = [
  {
    id: 'google',
    name: 'Google',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  {
    id: 'twitter',
    name: 'X',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'linkedin_oidc',
    name: 'LinkedIn',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
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
          app_roles!profiles_role_id_fkey (name)
        `)
        .eq('id', authData.user.id)
        .single();

      // Extract role name from joined result
      // app_roles can be an array or single object depending on the relation type
      const appRoles = profileWithRole?.app_roles;
      let roleName: string | null = null;
      if (appRoles) {
        if (Array.isArray(appRoles)) {
          roleName = appRoles[0]?.name || null;
        } else if (typeof appRoles === 'object' && 'name' in appRoles) {
          roleName = (appRoles as { name: string }).name;
        }
      }

      // Role-based routing
      // Admin roles route to dashboard, resident-only users route to portal
      const adminRoles = ['super_admin', 'chairman', 'vice_chairman', 'financial_officer', 'security_officer', 'secretary', 'project_manager'];

      // Show success state before navigation
      setLoginState('success');
      await new Promise(resolve => setTimeout(resolve, 600));

      if (roleName && adminRoles.includes(roleName)) {
        router.push('/dashboard');
      } else if (roleName === 'resident' || profileWithRole?.resident_id) {
        router.push('/portal');
      } else {
        // No role assigned yet - could be a pending account claim
        router.push('/portal');
      }
    } else {
      setLoginState('success');
      await new Promise(resolve => setTimeout(resolve, 600));
      router.push('/dashboard');
    }

    router.refresh();
  };

  const handleOAuthLogin = async (providerId: string) => {
    setOauthLoading(providerId);
    setError(null);

    const supabase = createClient();

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: providerId as 'google' | 'twitter' | 'linkedin_oidc' | 'facebook',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
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

        <div className="grid grid-cols-4 gap-3">
          {oauthProviders.map((provider) => (
            <Button
              key={provider.id}
              variant="outline"
              className="h-12 rounded-xl hover-lift"
              onClick={() => handleOAuthLogin(provider.id)}
              disabled={loginState !== 'idle' || oauthLoading !== null}
              title={`Sign in with ${provider.name}`}
            >
              {oauthLoading === provider.id ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                provider.icon
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
