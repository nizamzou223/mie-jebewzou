// Edge Function: manajemen akun pengguna.
// Membuat akun Auth, mengatur ulang password, dan menonaktifkan akun memerlukan service-role key,
// sehingga HANYA boleh dijalankan di server (fungsi ini). Kunci tidak pernah dikirim ke React/Flutter.
//
// Otorisasi (diperiksa di sini, di atas RLS):
//  - owner            : semua tindakan, semua role & cabang
//  - admin (user.manage): hanya akun KASIR, hanya pada cabang yang dimilikinya sendiri
//
// Deploy: supabase functions deploy admin-users
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY disediakan otomatis oleh Supabase.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metode tidak didukung');

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1) Identifikasi pemanggil dari JWT-nya
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) throw new HttpError(401, 'Sesi tidak valid, silakan login ulang');

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: me } = await admin
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', userData.user.id)
      .single();
    if (!me || !me.is_active) throw new HttpError(403, 'Akun tidak aktif');

    const isOwner = me.role === 'owner';
    if (!isOwner) {
      const { data: perm } = await admin
        .from('role_permissions')
        .select('permission')
        .eq('role', me.role)
        .eq('permission', 'user.manage')
        .maybeSingle();
      if (!perm) throw new HttpError(403, 'Anda tidak memiliki izin mengelola pengguna');
    }

    const { data: myOutletRows } = await admin.from('user_outlets').select('outlet_id').eq('user_id', me.id);
    const myOutlets = new Set((myOutletRows ?? []).map((r) => r.outlet_id as string));

    const body = await req.json();
    const action = String(body.action ?? '');

    // Admin hanya boleh menyentuh kasir yang berbagi cabang dengannya
    const assertCanManage = async (targetId: string) => {
      if (isOwner) return;
      if (targetId === me.id) throw new HttpError(403, 'Tidak dapat mengubah akun sendiri dari sini');
      const { data: target } = await admin.from('profiles').select('role').eq('id', targetId).single();
      if (!target || target.role !== 'cashier') throw new HttpError(403, 'Admin hanya dapat mengelola akun kasir');
      const { data: rows } = await admin.from('user_outlets').select('outlet_id').eq('user_id', targetId);
      if (!(rows ?? []).some((r) => myOutlets.has(r.outlet_id as string))) {
        throw new HttpError(403, 'Pengguna tersebut bukan bagian dari cabang Anda');
      }
    };

    const audit = (action: string, entityId: string, details: Record<string, unknown>, outletId: string | null = null) =>
      admin.from('audit_logs').insert({
        user_id: me.id,
        user_name: me.full_name,
        outlet_id: outletId,
        action,
        entity: 'user',
        entity_id: entityId,
        details,
      });

    // ------------------------------------------------------------------
    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const fullName = String(body.full_name ?? '').trim();
      const role = String(body.role ?? 'cashier');
      const outletIds: string[] = Array.isArray(body.outlet_ids) ? [...new Set<string>(body.outlet_ids)] : [];

      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email tidak valid');
      if (password.length < 8) throw new HttpError(400, 'Password minimal 8 karakter');
      if (!fullName) throw new HttpError(400, 'Nama wajib diisi');
      if (!['owner', 'admin', 'cashier'].includes(role)) throw new HttpError(400, 'Role tidak valid');
      if (!isOwner && role !== 'cashier') throw new HttpError(403, 'Admin hanya dapat membuat akun kasir');
      if (role !== 'owner' && outletIds.length === 0) throw new HttpError(400, 'Pilih minimal satu cabang');
      if (!isOwner && outletIds.some((id) => !myOutlets.has(id))) {
        throw new HttpError(403, 'Anda hanya dapat menugaskan ke cabang milik Anda');
      }

      if (outletIds.length) {
        const { data: found, error: foundErr } = await admin.from('outlets').select('id').in('id', outletIds);
        if (foundErr) throw new HttpError(400, `Gagal memeriksa cabang: ${foundErr.message}`);
        if ((found ?? []).length !== outletIds.length) throw new HttpError(400, 'Ada cabang yang tidak ditemukan');
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role, full_name: fullName }, // dibaca trigger handle_new_user
      });
      if (createErr || !created.user) throw new HttpError(400, createErr?.message ?? 'Gagal membuat akun');
      const newId = created.user.id;

      if (role !== 'owner' && outletIds.length) {
        const { error: uoErr } = await admin
          .from('user_outlets')
          .insert(outletIds.map((outlet_id) => ({ user_id: newId, outlet_id })));
        if (uoErr) {
          await admin.auth.admin.deleteUser(newId); // rollback
          throw new HttpError(400, `Gagal menugaskan cabang: ${uoErr.message}`);
        }
      }
      await audit('user.create', newId, { email, role, outlet_ids: outletIds });
      return json({ id: newId });
    }

    // ------------------------------------------------------------------
    if (action === 'set_password') {
      const userId = String(body.user_id ?? '');
      const password = String(body.password ?? '');
      if (password.length < 8) throw new HttpError(400, 'Password minimal 8 karakter');
      await assertCanManage(userId);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(400, error.message);
      await audit('user.set_password', userId, {});
      return json({ ok: true });
    }

    // ------------------------------------------------------------------
    if (action === 'set_active') {
      const userId = String(body.user_id ?? '');
      const isActive = Boolean(body.is_active);
      await assertCanManage(userId);
      if (userId === me.id && !isActive) throw new HttpError(400, 'Tidak dapat menonaktifkan akun sendiri');
      // Profil lebih dulu: trigger memastikan owner aktif terakhir tidak bisa dinonaktifkan
      const { error: pErr } = await admin.from('profiles').update({ is_active: isActive }).eq('id', userId);
      if (pErr) throw new HttpError(400, pErr.message);
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? 'none' : '876000h',
      });
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    throw new HttpError(400, 'Tindakan tidak dikenal');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Terjadi kesalahan pada server' }, 500);
  }
});
