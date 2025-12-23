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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        // eslint-disable-next-line react-hooks/immutability
        await fetchProfile(initialSession.user.id);
      }

      isInitialized.current = true;
      setIsLoading(false);
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

    // Fetch role details if role_id exists
    let appRole: { name: string; display_name: string } | null = null;
    if (profileData?.role_id) {
      const { data: roleData } = await supabase
        .from('app_roles')
        .select('name, display_name')
        .eq('id', profileData.role_id)
        .single();
      appRole = roleData;
    }

    // Fetch user's permissions
    let permissions: string[] = [];
    if (profileData?.role_id) {
      // First get permission IDs for this role
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', profileData.role_id);

      const permissionIds = rolePerms?.map((rp) => rp.permission_id) || [];

      if (permissionIds.length > 0) {
        // Then get permission names
        const { data: permsData } = await supabase
          .from('app_permissions')
          .select('name')
          .in('id', permissionIds);

        permissions = permsData?.map((p) => p.name) || [];
      }
    }

    setProfile({
      id: profileData.id,
      email: profileData.email,
      full_name: profileData.full_name,
      role: profileData.role as UserRole,
      role_id: profileData.role_id,
      role_name: appRole?.name as AppRoleName | null,
      role_display_name: appRole?.display_name || null,
      permissions,
      resident_id: profileData.resident_id,
    });
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    // Force full page reload to clear all client state and redirect to login
    window.location.href = '/login';
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
