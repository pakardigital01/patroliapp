import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AuthUser, Profile, Role } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signUp: (input: { fullName: string; npk: string; email: string; password: string }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (session: Session | null): Promise<AuthUser | null> => {
    if (!session) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) return null;
    const profile = data as Profile | null;
    const role = (session.user.app_metadata?.role as Role) ?? 'petugas';
    if (profile?.status === 'pending') {
      await supabase.auth.signOut();
      return null;
    }
    if (profile?.status === 'rejected' || profile?.status === 'inactive') {
      await supabase.auth.signOut();
      return null;
    }
    if (!profile) {
      await supabase.auth.signOut();
      return null;
    }
    return { id: session.user.id, email: session.user.email ?? '', role, profile };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = await loadProfile(data.session);
      if (mounted) {
        setUser(u);
        setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        const u = await loadProfile(session);
        if (mounted) setUser(u);
      })();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const isEmail = identifier.includes('@');
    const { error } = await supabase.auth.signInWithPassword({
      email: isEmail ? identifier : `${identifier}@patroli.local`,
      password,
    });
    if (error) {
      return { error: translateAuthError(error.message) };
    }
    return { error: null };
  }, []);

  const signUp = useCallback(
    async (input: { fullName: string; npk: string; email: string; password: string }) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { full_name: input.fullName, npk: input.npk } },
      });
      if (error) return { error: translateAuthError(error.message) };
      if (!data.user) return { error: 'Pendaftaran gagal. Coba lagi.' };
      const { error: pErr } = await supabase.from('profiles').insert({
        id: data.user.id,
        role: 'petugas',
        full_name: input.fullName,
        npk: input.npk,
        status: 'pending',
      });
      if (pErr) {
        return { error: 'Akun dibuat tetapi profil gagal disimpan: ' + pErr.message };
      }
      await supabase.auth.signOut();
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const u = await loadProfile(data.session);
    setUser(u);
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus di dalam AuthProvider');
  return ctx;
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'NPK/email atau password salah.';
  if (m.includes('not confirmed')) return 'Email belum dikonfirmasi.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Email sudah terdaftar.';
  if (m.includes('user already')) return 'Pengguna sudah terdaftar.';
  if (m.includes('password')) return 'Password tidak valid.';
  if (m.includes('rate limit')) return 'Terlalu banyak percobaan. Coba lagi nanti.';
  return 'Gagal masuk. Periksa kredensial Anda.';
}
