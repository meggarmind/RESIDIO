'use client';

import { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types/database';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return;
  }
  setProfile(data);
}, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    // Force full page reload to clear all client state and redirect to login
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, isLoading, signOut }}>
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
