'use client';

import { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { UserRole, AppRoleName } from '@/types/database';

// Profile with both legacy and new RBAC fields
interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole; // Legacy role
  // New RBAC fields
  role_id: string | null;
  role_name: AppRoleName | null;
  role_display_name: string | null;
  permissions: string[];
  // Resident portal fields
  resident_id: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isSigningOut: boolean;
  signOut: () => Promise<void>;
  // New RBAC helpers
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  // Resident portal helpers
  isResident: boolean;
  residentId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// PERFORMANCE: Session storage caching for faster initial loads
const PROFILE_CACHE_KEY = 'residio_profile_cache';
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedProfile(): Profile | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (cached) {
      const { profile, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < PROFILE_CACHE_TTL) {
        return profile;
      }
      // Cache expired, remove it
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

function setCachedProfile(profile: Profile | null) {
  if (typeof window === 'undefined') return;
  try {
    if (profile) {
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
        profile,
        timestamp: Date.now()
      }));
    } else {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isInitialized = useRef(false);

  // Memoize the Supabase client to prevent recreation on re-renders
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      // Skip re-initialization if we already have valid session data
      if (isInitialized.current) {
        setIsLoading(false);
        return;
      }

      // PERFORMANCE: Use cached profile for instant UI while fetching fresh data
      const cachedProfile = getCachedProfile();
      if (cachedProfile) {
        setProfile(cachedProfile);
      }

      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      isInitialized.current = true;

      // Release loading state early if we have cached profile (optimistic UI)
      if (cachedProfile && initialSession?.user) {
        setIsLoading(false);
        // Fetch fresh profile in background (non-blocking)
        fetchProfile(initialSession.user.id);
      } else if (initialSession?.user) {
        // No cache - must wait for profile before releasing loading state
        // eslint-disable-next-line react-hooks/immutability
        await fetchProfile(initialSession.user.id);
        setIsLoading(false);
      } else {
        // No user - clear any stale cache
        setCachedProfile(null);
        setIsLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }

        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const fetchProfile = useCallback(async (userId: string) => {
    // Fetch profile including resident_id for portal access
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, role_id, resident_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return;
    }

    // Fetch role details and permissions in parallel (3x faster than sequential)
    let appRole: { name: string; display_name: string } | null = null;
    let permissions: string[] = [];

    if (profileData?.role_id) {
      // Run both queries in parallel since they only depend on role_id
      const [roleResult, permissionsResult] = await Promise.all([
        // Fetch role details
        supabase
          .from('app_roles')
          .select('name, display_name')
          .eq('id', profileData.role_id)
          .single(),
        // Fetch permissions with nested select (combines 2 queries into 1)
        supabase
          .from('role_permissions')
          .select('permission:app_permissions!inner(name)')
          .eq('role_id', profileData.role_id),
      ]);

      appRole = roleResult.data;
      // Extract permission names from nested result
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      permissions = (permissionsResult.data as any[] ?? [])
        .map((rp) => rp.permission?.name)
        .filter((name): name is string => name != null);
    }

    const newProfile: Profile = {
      id: profileData.id,
      email: profileData.email,
      full_name: profileData.full_name,
      role: profileData.role as UserRole,
      role_id: profileData.role_id,
      role_name: appRole?.name as AppRoleName | null,
      role_display_name: appRole?.display_name || null,
      permissions,
      resident_id: profileData.resident_id,
    };

    setProfile(newProfile);
    // PERFORMANCE: Cache profile for faster subsequent page loads
    setCachedProfile(newProfile);
  }, [supabase]);

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('Sign out error:', error);
        // Continue with cleanup even if server-side signout fails
      }

      // Clear local state and cache
      setUser(null);
      setProfile(null);
      setSession(null);
      setCachedProfile(null); // Clear cached profile on sign out

      // Force full page reload to clear all client state and redirect to login
      window.location.href = '/login';
    } catch (error) {
      console.error('Unexpected sign out error:', error);
      // Fallback: still redirect to login to prevent user from being stuck
      window.location.href = '/login';
    }
    // Note: Don't reset isSigningOut after redirect (component unmounts)
  };

  // Permission check helpers
  const hasPermission = useCallback((permission: string): boolean => {
    return profile?.permissions?.includes(permission) ?? false;
  }, [profile?.permissions]);

  const hasAnyPermission = useCallback((permissions: string[]): boolean => {
    if (!profile?.permissions) return false;
    return permissions.some(p => profile.permissions.includes(p));
  }, [profile?.permissions]);

  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    if (!profile?.permissions) return false;
    return permissions.every(p => profile.permissions.includes(p));
  }, [profile?.permissions]);

  // Resident portal helpers - derived from profile
  const isResident = useMemo(() => {
    return profile?.resident_id != null;
  }, [profile?.resident_id]);

  const residentId = useMemo(() => {
    return profile?.resident_id ?? null;
  }, [profile?.resident_id]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      isLoading,
      isSigningOut,
      signOut,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      isResident,
      residentId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
