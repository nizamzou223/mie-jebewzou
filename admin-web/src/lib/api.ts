import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { BreakdownRow, BusinessSettings, Category, Summary } from './types';

/** Melempar error bila query Supabase gagal, sehingga react-query dapat menampilkan state error. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/**
 * Untuk update/delete: RLS yang memblokir baris tidak menghasilkan error, hanya 0 baris terdampak.
 * Fungsi ini menganggap 0 baris sebagai penolakan agar pengguna tidak melihat "berhasil" palsu.
 */
export function affected<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  const rows = unwrap(res) ?? [];
  if (rows.length === 0) throw new Error('permission denied: perubahan tidak diterapkan (tidak berizin atau data tidak ditemukan)');
  return rows;
}

/** Memanggil Edge Function `admin-users` (pembuatan akun, reset password, nonaktifkan akun). */
export async function callAdminUsers<T = { ok?: boolean; id?: string }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      } catch {
        /* pakai pesan bawaan */
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => unwrap(await supabase.from('business_settings').select('*').maybeSingle()) as BusinessSettings | null,
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => unwrap(await supabase.from('categories').select('*').order('sort_order').order('name')) as Category[],
  });
}

export interface ReportFilter {
  from: string;
  to: string;
  outletId: string | null;
  method: string | null;
}

export async function fetchSummary(f: ReportFilter): Promise<Summary> {
  const rows = unwrap(
    await supabase.rpc('report_summary', { p_from: f.from, p_to: f.to, p_outlet: f.outletId, p_method: f.method }),
  ) as Summary[];
  return (
    rows?.[0] ?? {
      orders_count: 0, gross: 0, discount: 0, tax: 0, net_sales: 0, avg_order: 0,
      refund_count: 0, refund_total: 0, void_count: 0, void_total: 0,
    }
  );
}

export async function fetchBreakdown(dimension: string, f: ReportFilter): Promise<BreakdownRow[]> {
  const rows = unwrap(
    await supabase.rpc('report_breakdown', {
      p_dimension: dimension, p_from: f.from, p_to: f.to, p_outlet: f.outletId, p_method: f.method,
    }),
  ) as BreakdownRow[];
  return (rows ?? []).map((r) => ({
    ...r,
    orders_count: Number(r.orders_count),
    quantity: Number(r.quantity),
    gross: Number(r.gross),
    discount: Number(r.discount),
    net: Number(r.net),
  }));
}
