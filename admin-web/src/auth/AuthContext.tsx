import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Outlet, Profile } from '../lib/types';

type Status = 'loading' | 'signed_out' | 'ready' | 'blocked';

interface AuthState {
  status: Status;
  blockReason: string | null;
  profile: Profile | null;
  /** Cabang yang boleh diakses pengguna ini (sudah difilter RLS). */
  outlets: Outlet[];
  /** Cabang aktif untuk filter halaman; null = semua cabang yang boleh diakses. */
  outletId: string | null;
  setOutletId: (id: string | null) => void;
  isOwner: boolean;
  can: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  /** Mengirim email tautan pemulihan password. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Mengganti password akun yang sedang login (atau yang membuka tautan pemulihan). */
  updatePassword: (password: string) => Promise<void>;
  /** true setelah pengguna membuka tautan pemulihan dari email. */
  recovery: boolean;
  finishRecovery: () => void;
}

const Ctx = createContext<AuthState | null>(null);
const OUTLET_KEY = 'mj_outlet';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState<Status>('loading');
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [outletId, setOutletState] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    // Jangan memanggil supabase di dalam callback ini (bisa deadlock); cukup simpan sesi.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setStatus('loading');
    const { data: p, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error || !p) {
      setBlockReason('Profil akun tidak ditemukan. Hubungi owner.');
      setStatus('blocked');
      return;
    }
    const prof = p as Profile;
    if (!prof.is_active) {
      setBlockReason('Akun Anda dinonaktifkan. Hubungi owner.');
      setStatus('blocked');
      return;
    }
    if (prof.role === 'cashier') {
      setBlockReason('Akun kasir hanya dapat digunakan pada aplikasi kasir.');
      setStatus('blocked');
      return;
    }
    const [{ data: o }, { data: rp }] = await Promise.all([
      supabase.from('outlets').select('*').order('name'),
      supabase.from('role_permissions').select('permission').eq('role', prof.role),
    ]);
    const list = (o ?? []) as Outlet[];
    setProfile(prof);
    setOutlets(list);
    setPerms(new Set((rp ?? []).map((r) => r.permission as string)));

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(OUTLET_KEY);
    } catch {
      /* penyimpanan lokal tidak tersedia */
    }
    if (list.length === 1) setOutletState(list[0].id);
    else setOutletState(saved && list.some((x) => x.id === saved) ? saved : null);
    setBlockReason(null);
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    if (booting) return;
    if (!userId) {
      setProfile(null);
      setOutlets([]);
      setStatus('signed_out');
      return;
    }
    void load();
  }, [booting, userId, load]);

  const setOutletId = useCallback((id: string | null) => {
    setOutletState(id);
    try {
      if (id) localStorage.setItem(OUTLET_KEY, id);
      else localStorage.removeItem(OUTLET_KEY);
    } catch {
      /* abaikan */
    }
  }, []);

  const value = useMemo<AuthState>(() => {
    const isOwner = profile?.role === 'owner';
    return {
      status,
      blockReason,
      profile,
      outlets,
      outletId,
      setOutletId,
      isOwner,
      can: (perm) => isOwner || perms.has(perm),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      reload: load,
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },
      recovery,
      finishRecovery: () => setRecovery(false),
    };
  }, [status, blockReason, profile, outlets, outletId, perms, setOutletId, load, recovery]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return v;
}
