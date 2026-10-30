'use client';

import { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { User, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { AppRoleName } from '@/types/database';
import { getServerSession } from '@/actions/auth/get-server-session';
import { clearAdminReadCache } from '@/lib/offline/admin-read-cache';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { resolveAccess, toAccessClient } from '@/lib/auth/access';
import {
  canSeeImpersonationLink as canSeeImpersonationLinkRule,
  canSeeSelfPortalLinks as canSeeSelfPortalLinksRule,
  type PortalAccessOverride,
} from '@/lib/auth/portal-visibility';
import { fetchPortalAccessOverride, fetchResidentPortalEnabled } from '@/lib/auth/portal-visibility-fetch';
import type { ProfileLoadResult } from '@/lib/auth/access-load';

// Profile as the app sees it. The legacy `role` column is gone (#193):
// every role and permission decision reads role_id -> the Access module
// (get_my_access RPC, #536), surfaced here as role_name/role_display_name/permissions.
interface Profile {
  id: string;
  email: string;
  full_name: string;
  // RBAC fields
  role_id: string | null;
  role_name: AppRoleName | null;
  role_display_name: string | null;
  /** Title under the role, such as Vice Chairman (#827); display only. */
  title_name?: string | null;
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
  // Resident portal link visibility (#423)
  portalAccessOverride: PortalAccessOverride;
  residentPortalEnabled: boolean;
  canSeeSelfPortalLinks: boolean;
  /** Re-run the portal visibility fetches (after the switch or own override changes). */
  refreshPortalVisibility: () => void;
  canSeeImpersonationLink: boolean;
  /**
   * Loads the profile and permissions now, for the current session (#1341). The two-factor
   * screen awaits it before it opens the app. Shows no toast; the caller reports a failure.
   */
  refreshProfile: () => Promise<ProfileLoadResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// PERFORMANCE: Session storage caching for faster initial loads
const PROFILE_CACHE_KEY = 'residio_profile_cache';
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Routes where the provider does not load the session on its own (#1341). On the two-factor
// screen the database returns no permissions yet (#1029), so a load there makes an empty
// snapshot that the app would keep after the code is accepted. The screen calls
// refreshProfile() after a correct code instead.
const NO_BOOTSTRAP_PATHS = new Set(['/login', '/auth/verify-2fa']);

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

// A profile resolved while the RBAC (role/permissions) fetch failed or timed
// out is a known-degraded snapshot: permissions: [], role_name: null. It is
// fine to render that profile so the app doesn't hang, but it must never be
// written to the 5-minute session cache -- doing so turns one slow query
// into a five-minute outage where every navigation/reload re-serves the
// degraded profile instead of retrying. A legitimately zero-permission role
// (cacheUnsafe === false) is a different condition and must still cache.
// Exported so the decision can be unit tested without mounting the provider.
export function cacheProfileIfHealthy(profile: Profile, cacheUnsafe: boolean): void {
  if (cacheUnsafe) return;
  setCachedProfile(profile);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isInitialized = useRef(false);
  // #423: fetched separately from the profile and fail-closed; never gates isLoading.
  const [portalAccessOverride, setPortalAccessOverride] = useState<PortalAccessOverride>(null);
  const [residentPortalEnabled, setResidentPortalEnabled] = useState(false);

  // Memoize the Supabase client to prevent recreation on re-renders
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // The login page owns the sign-in client. Avoid starting a competing
    // session bootstrap here, because Supabase browser clients coordinate
    // through a shared storage lock and a stalled bootstrap can block the
    // login request indefinitely. Session initialization resumes after the
    // successful redirect into the application. See NO_BOOTSTRAP_PATHS for the
    // two-factor screen.
    if (NO_BOOTSTRAP_PATHS.has(pathname)) {
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

  const fetchProfile = useCallback(async (userId: string, { notify = true }: { notify?: boolean } = {}): Promise<ProfileLoadResult> => {
    // Fetch profile including resident_id for portal access
    const { data: profileDataRaw, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role_id, resident_id, admin_titles:title_id (name)')
      .eq('id', userId)
      .single();
    let profileData = profileDataRaw;
    // #256: the profiles-table read failing is a second, independent way to
    // end up with a degraded (zero-permission) snapshot -- the metadata
    // fallback below has role_id: null, so no role or permission can be
    // resolved for it at all. Tracked separately from the RBAC-fetch failure
    // because only the latter should raise the #113 toast; see below.
    let profileFetchFailed = false;
    // #256 part 2: which failure (if any) should raise a user-facing toast,
    // and with what copy. Kept as a single reason rather than two booleans
    // so the two causes can never both fire a toast for one fetchProfile()
    // call -- there is only ever one thing to tell the admin about here.
    let toastReason: 'profile' | 'rbac' | null = null;

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
        profileFetchFailed = true;
        // #256 part 2: this used to be a console.warn only -- no administrator
        // would ever see it. Surface it the same way #113 surfaces an RBAC
        // failure below: a dismissible toast with a retry action. The fallback
        // profile carries permissions: [], so controls genuinely will be
        // hidden; server-side authorizePermission() re-checks independently,
        // so real access has not changed, only what this session can see.
        toastReason = 'profile';
        // Render it -- the app must not go blank for a user in this state --
        // but never persist it (#256). Writing this zero-permission snapshot
        // to the 5-minute session cache turns one transient profiles-table
        // error into five minutes of the user seeing none of their own
        // permissions, on every navigation and reload.
        setProfile(fallbackProfile);
        cacheProfileIfHealthy(fallbackProfile, true);
        profileData = { ...fallbackProfile, admin_titles: [] };
      } else {
        return 'failed';
      }
    }

    // Guard: after the fallback branch we must have a usable profile to resolve
    // role/RBAC against; bail out otherwise rather than crashing.
    if (!profileData) return 'failed';

    // Fetch role details and permissions
    let roleName: string | null = null;
    let roleDisplayName: string | null = null;
    let permissions: string[] = [];
    // Gates whether this profile snapshot is safe to write to the 5-minute
    // session cache. Deliberately explicit rather than inferred from
    // permissions.length === 0 -- a role legitimately granted zero
    // permissions is a different condition and must not be treated as unsafe
    // (it should still cache normally).
    //
    // Seeded from profileFetchFailed (#256): when the profiles row could not
    // be read, the metadata fallback carries role_id: null, so the block below
    // never runs and `permissions` stays [] for a reason that has nothing to do
    // with the user's real role. Without this seed the degraded profile would
    // simply be cached 60 lines further down instead of at the fallback site.
    let cacheUnsafe = profileFetchFailed;
    // #1341: a role with no access rows. See ProfileLoadResult 'incomplete'.
    let accessIncomplete = false;
    // No legacy reverse lookup here any more (#193). It resolved a role by
    // name from the deprecated profiles.role column when role_id was absent;
    // #192 reconciled every profile and proved against live data that no row
    // is in that state, and #193 renamed the column out from under it.
    const effectiveRoleId = profileData.role_id;

    if (effectiveRoleId) {
      console.log('[AuthProvider] Fetching role/permissions for:', effectiveRoleId);
      // The Access module (#534/#536) resolves role and permissions in one
      // RPC; the display name is not in that RPC, so it is looked up in
      // parallel. Both race the same 15s timeout.
      try {
        const [access, displayResult] = await Promise.race([
          Promise.all([
            resolveAccess(toAccessClient(supabase), { userId }),
            supabase
              .from('app_roles')
              .select('display_name')
              .eq('id', effectiveRoleId)
              .maybeSingle(),
          ]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('RBAC fetch timeout')), 15000))
        ]);

        if (access.status === 'resolved') {
          permissions = access.permissions;
          roleName = access.roleName;
          if (displayResult.error) {
            // Cosmetic only: the permissions are good, so this is not unsafe.
            console.error('[AuthProvider] Role display name lookup failed:', displayResult.error);
          } else {
            roleDisplayName = displayResult.data?.display_name || null;
          }
        } else if (access.status === 'lookup-failed') {
          console.error('[AuthProvider] RBAC fetch failed:', access.error);
          toastReason = 'rbac';
          cacheUnsafe = true;
        } else if (access.status === 'no-access') {
          // A role with no rows: the second sign-in step is not done (#1029) or the
          // account is not approved. Render it, but never cache it (#1341).
          accessIncomplete = true;
          cacheUnsafe = true;
        }
      } catch (err) {
        console.error('[AuthProvider] RBAC fetch failed or timed out:', err);
        toastReason = 'rbac';
        cacheUnsafe = true;
      }
    }

    // One FK, so the embed comes back as a single object; tolerate an array all the same.
    const joinedTitle = (profileData as { admin_titles?: unknown }).admin_titles;
    const titleName =
      ((Array.isArray(joinedTitle) ? joinedTitle[0] : joinedTitle) as { name?: string } | null | undefined)?.name ?? null;

    const newProfile: Profile = {
      id: profileData.id,
      email: profileData.email,
      full_name: profileData.full_name,
      role_id: profileData.role_id,
      role_name: roleName as AppRoleName | null,
      role_display_name: roleDisplayName,
      title_name: titleName,
      permissions,
      resident_id: profileData.resident_id,
    };

    setProfile(newProfile);
    // PERFORMANCE: Cache profile for faster subsequent page loads -- but
    // never cache a profile built from a failed/timed-out RBAC fetch (#113).
    // A cached degraded profile survives for the full 5-minute TTL across
    // every navigation and reload, turning a transient blip into an outage.
    cacheProfileIfHealthy(newProfile, cacheUnsafe);

    if (toastReason && notify) {
      // #256 part 2: two distinct causes land here -- the profiles row could
      // not be read at all, or it was read fine but the RBAC (#113) fetch
      // failed/timed out. Distinct copy lets an admin debugging this tell
      // which one happened; both stay honest that only visibility, not real
      // server-side access (re-checked independently by authorizePermission()),
      // is affected.
      const { title, description } =
        toastReason === 'profile'
          ? {
              title: 'Could not load your profile',
              description: 'Showing a limited view until this is retried. Your access has not changed.',
            }
          : {
              title: 'Could not load your permissions',
              description: 'Some controls may be hidden until this is retried. Your access has not changed.',
            };

      toast.error(title, {
        description,
        action: {
          label: 'Retry',
          onClick: () => {
            void fetchProfile(userId);
          },
        },
        duration: 15000,
      });
    }

    if (toastReason) return 'failed';
    return accessIncomplete ? 'incomplete' : 'loaded';
  }, [supabase]);

  // #1341: an explicit load for the current session, awaited by the two-factor screen
  // before it opens the app. It also marks the provider initialized, so the first
  // dashboard render uses this profile instead of starting a second load.
  const refreshProfile = useCallback(async (): Promise<ProfileLoadResult> => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return 'failed';
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    setUser(currentUser);
    setSession(currentSession);
    isInitialized.current = true;
    try {
      return await fetchProfile(currentUser.id, { notify: false });
    } catch (err) {
      console.error('[AuthProvider] refreshProfile failed:', err);
      return 'failed';
    } finally {
      setIsLoading(false);
    }
  }, [supabase, fetchProfile]);

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

  // #423: load the portal visibility inputs once the profile id is known.
  // Independent of fetchProfile/isLoading; failures read as hidden/inherit.
  const profileId = profile?.id ?? null;
  const [portalRefreshTick, setPortalRefreshTick] = useState(0);
  const refreshPortalVisibility = useCallback(() => {
    setPortalRefreshTick((tick) => tick + 1);
  }, []);
  const lastPortalProfileId = useRef<string | null>(null);
  useEffect(() => {
    // A different account (or none) must never see the previous account's
    // values while its own fetch is pending. A refresh for the same account
    // keeps the current values until the new ones arrive.
    if (lastPortalProfileId.current !== profileId) {
      lastPortalProfileId.current = profileId;
      setPortalAccessOverride(null);
      setResidentPortalEnabled(false);
    }
    if (!profileId) return;
    let cancelled = false;
    void Promise.all([
      fetchPortalAccessOverride(supabase, profileId),
      fetchResidentPortalEnabled(supabase),
    ]).then(([override, enabled]) => {
      if (cancelled) return;
      setPortalAccessOverride(override);
      setResidentPortalEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId, supabase, portalRefreshTick]);

  const canSeeSelfPortalLinks = useMemo(
    () =>
      canSeeSelfPortalLinksRule({
        generalEnabled: residentPortalEnabled,
        override: portalAccessOverride,
        residentId,
      }),
    [residentPortalEnabled, portalAccessOverride, residentId]
  );

  const canSeeImpersonationLink = useMemo(
    () =>
      canSeeImpersonationLinkRule({
        generalEnabled: residentPortalEnabled,
        override: portalAccessOverride,
        hasImpersonationPermission: hasPermission(PERMISSIONS.IMPERSONATION_START_SESSION),
      }),
    [residentPortalEnabled, portalAccessOverride, hasPermission]
  );

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
      portalAccessOverride,
      residentPortalEnabled,
      canSeeSelfPortalLinks,
      refreshPortalVisibility,
      canSeeImpersonationLink,
      refreshProfile,
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
