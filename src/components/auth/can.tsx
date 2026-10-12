'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';

/**
 * Whether the signed-in user holds `permission`. False while auth state is
 * still loading, so gated controls never flash and then disappear.
 */
export function useCan(permission: string): boolean {
  const { hasPermission, isLoading } = useAuth();
  return !isLoading && hasPermission(permission);
}

interface CanProps {
  /** A constant from `PERMISSIONS` -- the one the matching server action enforces. */
  permission: string;
  children: ReactNode;
  /** Rendered when the user lacks the permission. Defaults to nothing. */
  fallback?: ReactNode;
}

/**
 * Renders `children` only for users holding `permission` (CORE.md section 6:
 * gate on the action, not the page). Renders nothing while auth is loading.
 * This is presentation only; the server action remains the authority.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const allowed = useCan(permission);
  return <>{allowed ? children : fallback}</>;
}
