'use client';

import { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { AppRoleName } from '@/types/database';
import { getServerSession } from '@/actions/auth/get-server-session';
import { clearAdminReadCache } from '@/lib/offline/admin-read-cache';

// Profile as the app sees it. The legacy `role` column is gone (#193):
// every role and permission decision reads role_id -> app_roles ->
// role_permissions, surfaced here as role_name/role_display_name/permissions.
interface Profile {
  id: string;
  email: string;
  full_name: string;
  // RBAC fields
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
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isInitialized = useRef(false);

  // Memoize the Supabase client to prevent recreation on re-renders
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // The login page owns the sign-in client. Avoid starting a competing
    // session bootstrap here, because Supabase browser clients coordinate
    // through a shared storage lock and a stalled bootstrap can block the
    // login request indefinitely. Session initialization resumes after the
    // successful redirect into the application.
    if (pathname === '/login') {
      setIsLoading(false);
      return;
    }

    // Listen for auth changes early to catch initial session if getSession hangs
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log(`[AuthProvider] onAuthStateChange event: ${event}`, !!newSession);

        // If we get an initial session or sign-in event, and we aren't initialized,
        // use this to satisfy the loading state.
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && newSession) {
          setSession(newSession);
          setUser(newSession.user);
          if (!isInitialized.current) {
            console.log('[AuthProvider] Satisfying initialization via onAuthStateChange');
            isInitialized.current = true;
            fetchProfile(newSession.user.id).finally(() => setIsLoading(false));
          } else if (event === 'SIGNED_IN') {
            // Race guard: the app can boot while logged out (Guest path sets
            // isInitialized=true), then the user signs in on a later page.
            // The guard above would skip the profile fetch entirely, leaving
            // profile=null and permission-filtered UI (sidebar nav) empty until
            // a manual reload. Always refresh the profile on a real sign-in.
            console.log('[AuthProvider] Sign-in after guest init - fetching profile');
            fetchProfile(newSession.user.id).finally(() => setIsLoading(false));
          }
        } else if (event === 'SIGNED_OUT') {
          void clearAdminReadCache();
          setSession(null);
          setUser(null);
          setProfile(null);
          setCachedProfile(null);
          setIsLoading(false);
        }
      }
    );

    // Get initial session
    const getInitialSession = async (retries = 1) => {
      console.log(`[AuthProvider] getInitialSession start (Attempt ${2 - retries})`);

      // If already initialized by onAuthStateChange, skip
      if (isInitialized.current) {
        console.log('[AuthProvider] Already initialized by events, skipping getSession');
        setIsLoading(false);
        return;
      }

      // PERFORMANCE: Use cached profile for instant UI while fetching fresh data
      const cachedProfile = getCachedProfile();
      if (cachedProfile) {
        console.log('[AuthProvider] Using cached profile');
        setProfile(cachedProfile);
      }

      try {
        console.log('[AuthProvider] Calling getSession()...');
        // Use a race to avoid hanging the entire app
        const initialResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 10000))
        ]).catch(async (err) => {
          console.warn('[AuthProvider] getSession timed out/failed, trying getUser()...');
          return await Promise.race([
            supabase.auth.getUser(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getUser timeout')), 10000))
          ]);
        });

        if (isInitialized.current) return;

        // Normalize across getSession() ({ data: { session } }) and getUser() ({ data: { user } })
        const authData = initialResult as { data?: { session?: Session | null; user?: User | null } };
        const initialSession = authData.data?.session ?? null;
        const user = authData.data?.user ?? initialSession?.user ?? null;

        if (user) {
          setSession(initialSession);
          setUser(user);
          console.log('[AuthProvider] Identity retrieved on client:', !!user);

          isInitialized.current = true;
          await fetchProfile(user.id).catch(e => console.error('[AuthProvider] fetchProfile failed:', e));
          setIsLoading(false);
          return;
        }

        // No client session found - continue to server rescue
      } catch (err) {
        console.error('[AuthProvider] Client-side auth failed, trying server-side rescue...', err);
      }

      // Server-side rescue
      try {
        const { session: serverSession, error: serverError } = await getServerSession();

        if (isInitialized.current) return;

        if (serverSession?.user) {
          console.log('[AuthProvider] Rescuing session from server action!');
          setUser(serverSession.user);
          // If server returned profile, use it immediately
          if (serverSession.profile) {
            await fetchProfile(serverSession.user.id);
          } else {
            await fetchProfile(serverSession.user.id);
          }
          isInitialized.current = true;
          setIsLoading(false);
          return;
        }
      } catch (rescueErr) {
        console.error('[AuthProvider] Server-side rescue failed:', rescueErr);
      }

      if (retries > 0 && !isInitialized.current) {
        console.log('[AuthProvider] Retrying getInitialSession...');
        return getInitialSession(retries - 1);
      }

      if (isInitialized.current) return;

      console.log('[AuthProvider] No session found - initializing as Guest');
      isInitialized.current = true;
      setIsLoading(false);
    };

    getInitialSession();

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, supabase]);

  const fetchProfile = useCallback(async (userId: string) => {
    // Fetch profile including resident_id for portal access
    const { data: profileDataRaw, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role_id, resident_id')
      .eq('id', userId)
      .single();
    let profileData = profileDataRaw;

    if (profileError) {
      console.error('Error fetching profile:', profileError);

      // Fallback: Try to construct profile from user metadata if DB fails.
      // Do NOT return early here - continue into the shared role/RBAC resolution
      // below so users without a profiles row (or with a transient fetch error)
      // still get their role permissions resolved.
      console.log('[AuthProvider] Attempting value fallback from user metadata...');
      const { data: { user } } = await supabase.auth.getUser();

      if (user && user.id === userId) {
        const metadata = user.user_metadata || {};
        const fallbackProfile: Profile = {
          id: user.id,
          email: user.email || '',
          full_name: metadata.full_name || metadata.name || user.email?.split('@')[0] || 'User',
          role_id: null,
          role_name: null,
          role_display_name: null,
          permissions: [],
          resident_id: null,
        };

        console.warn('[AuthProvider] Using fallback profile:', fallbackProfile);
        setProfile(fallbackProfile);
        setCachedProfile(fallbackProfile);
        profileData = fallbackProfile;
      } else {
        return;
      }
    }

    // Guard: after the fallback branch we must have a usable profile to resolve
    // role/RBAC against; bail out otherwise rather than crashing.
    if (!profileData) return;

    // Fetch role details and permissions
    let appRole: { id: string; name: string; display_name: string } | null = null;
    let permissions: string[] = [];
    // No legacy reverse lookup here any more (#193). It resolved a role by
    // name from the deprecated profiles.role column when role_id was absent;
    // #192 reconciled every profile and proved against live data that no row
    // is in that state, and #193 renamed the column out from under it.
    const effectiveRoleId = profileData.role_id;

    if (effectiveRoleId) {
      console.log('[AuthProvider] Fetching role/permissions for:', effectiveRoleId);
      // Run both queries in parallel since they only depend on role_id
      try {
        const [roleResult, permissionsResult] = await Promise.race([
          Promise.all([
            // Fetch role details
            supabase
              .from('app_roles')
              .select('id, name, display_name')
              .eq('id', effectiveRoleId)
              .single(),
            // Fetch permissions with nested select (combines 2 queries into 1)
            supabase
              .from('role_permissions')
              .select('permission:app_permissions!inner(name)')
              .eq('role_id', effectiveRoleId),
          ]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('RBAC fetch timeout')), 15000))
        ]);

        appRole = roleResult.data;
        // Extract permission names from nested result
        permissions = (permissionsResult.data ?? [])
          .map((rp) => {
            // Supabase types the to-one embed as an array; normalize for both shapes
            const perm = Array.isArray(rp.permission) ? rp.permission[0] : rp.permission;
            return perm?.name;
          })
          .filter((name): name is string => name != null);
      } catch (err) {
        console.error('[AuthProvider] RBAC fetch failed or timed out:', err);
      }
    }

    const newProfile: Profile = {
      id: profileData.id,
      email: profileData.email,
      full_name: profileData.full_name,
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
