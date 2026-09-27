import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { affected, callAdminUsers, unwrap } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { dateTime, roleLabel } from '../lib/format';
import { actionLabel } from '../lib/permissions';
import type { AuditLog, Profile, Role } from '../lib/types';
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner, Tabs, Toggle, useDebounced, useToast } from '../components/ui';

type UserRow = Profile & { user_outlets: { outlet_id: string }[] };

function randomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default function UsersPage() {
  const { profile, outlets, isOwner } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);

  const q = useQuery({
    queryKey: ['users'],
    queryFn: async () => unwrap(await supabase.from('profiles').select('*, user_outlets(outlet_id)').order('full_name')) as UserRow[],
  });

  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (u) =>
          (!role || u.role === role) &&
          (!status || (status === 'active') === u.is_active) &&
          `${u.full_name} ${u.email ?? ''}`.toLowerCase().includes(debounced.toLowerCase()),
      ),
    [q.data, role, status, debounced],
  );

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader
        title="Pengguna & Hak Akses"
        subtitle={isOwner ? 'Buat akun admin dan kasir, lalu tentukan cabang yang boleh mereka akses.' : 'Kelola akun kasir di cabang Anda.'}
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Tambah pengguna
          </Button>
        }
      />
      <div className="filters">
        <Field label="Cari">
          <input type="search" placeholder="Nama atau email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Semua role</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin Cabang</option>
            <option value="cashier">Kasir</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </Field>
      </div>
      <div className="card">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(u) => u.id}
            onRowClick={(u) => setEditing(u)}
            empty={<EmptyState title="Tidak ada pengguna" hint="Ubah filter atau tambahkan pengguna baru." />}
            columns={[
              {
                header: 'Nama',
                cell: (u) => (
                  <div className="row gap-sm">
                    <span className={'avatar avatar-sm tone-' + ((u.full_name.length % 4) + 1)} style={{ overflow: 'hidden' }}>
                      {u.avatar_url ? <img className="avatar-img" src={u.avatar_url} alt="" /> : (u.full_name.trim()[0] ?? '?').toUpperCase()}
                    </span>
                    <div>
                      <strong>{u.full_name}</strong>
                      {u.id === profile?.id && <span className="muted small"> (Anda)</span>}
                      <div className="muted small">{u.email}</div>
                    </div>
                  </div>
                ),
              },
              { header: 'Role', cell: (u) => <Badge tone={u.role === 'owner' ? 'brand' : u.role === 'admin' ? 'info' : 'neutral'}>{roleLabel[u.role]}</Badge> },
              {
                header: 'Cabang',
                cell: (u) =>
                  u.role === 'owner' ? (
                    <span className="muted">Semua cabang</span>
                  ) : u.user_outlets.length === 0 ? (
                    <span className="muted">Belum ditugaskan</span>
                  ) : (
                    <div className="chips">
                      {u.user_outlets.map((o) => (
                        <Badge key={o.outlet_id}>{outletName(o.outlet_id)}</Badge>
                      ))}
                    </div>
                  ),
              },
              { header: 'Status', cell: (u) => <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
            ]}
          />
        )}
      </div>
      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            toast.success(msg);
            await qc.invalidateQueries({ queryKey: ['users'] });
            await qc.invalidateQueries({ queryKey: ['outlets-admin'] });
          }}
        />
      )}
    </>
  );
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const { profile, outlets, isOwner } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'data' | 'activity'>('data');
  const isNew = !user;
  const isSelf = user?.id === profile?.id;
  // Admin hanya boleh mengelola kasir; owner boleh semuanya.
  const canEditTarget = isOwner || (isNew ? true : user.role === 'cashier' && !isSelf);

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState(isNew ? randomPassword() : '');
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'cashier');
  const [active, setActive] = useState(user?.is_active ?? true);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(user?.user_outlets.map((o) => o.outlet_id) ?? []));
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmActive, setConfirmActive] = useState(false);

  const scopeIds = new Set(outlets.map((o) => o.id)); // cabang yang boleh diatur oleh pengguna ini
  const needsOutlets = role !== 'owner';
  const valid = fullName.trim() && (!isNew || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 8)) && (!needsOutlets || assigned.size > 0);

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        await callAdminUsers({ action: 'create', email, password, full_name: fullName.trim(), role, outlet_ids: [...assigned] });
        return 'Akun dibuat. Berikan email & password kepada pengguna.';
      }
      const patch: Record<string, unknown> = { full_name: fullName.trim() };
      if (isOwner && !isSelf) patch.role = role;
      affected(await supabase.from('profiles').update(patch).eq('id', user.id).select('id'));

      // Diff penugasan cabang hanya pada cabang yang berada dalam cakupan pengubah
      const before = new Set(user.user_outlets.map((o) => o.outlet_id));
      const add = [...assigned].filter((o) => !before.has(o) && scopeIds.has(o));
      const remove = [...before].filter((o) => !assigned.has(o) && scopeIds.has(o));
      if (add.length) unwrap(await supabase.from('user_outlets').insert(add.map((outlet_id) => ({ user_id: user.id, outlet_id }))).select('user_id'));
      for (const o of remove) affected(await supabase.from('user_outlets').delete().eq('user_id', user.id).eq('outlet_id', o).select('user_id'));
      return 'Pengguna diperbarui';
    },
    onSuccess: (msg) => onSaved(msg),
    onError: (e) => toast.error(e),
  });

  const reset = useMutation({
    mutationFn: () => callAdminUsers({ action: 'set_password', user_id: user!.id, password: newPassword }),
    onSuccess: () => {
      toast.success('Password diganti. Berikan password baru kepada pengguna.');
      setResetOpen(false);
      setNewPassword('');
    },
    onError: (e) => toast.error(e),
  });

  const roleOptions: Role[] = isOwner ? ['owner', 'admin', 'cashier'] : ['cashier'];

  return (
    <>
      <Modal
        title={isNew ? 'Tambah pengguna' : user.full_name}
        size="md"
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Tutup</Button>
            {tab === 'data' && canEditTarget && (
              <Button variant="primary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
                {isNew ? 'Buat akun' : 'Simpan'}
              </Button>
            )}
          </>
        }
      >
        {!isNew && <Tabs tabs={[{ key: 'data', label: 'Data' }, { key: 'activity', label: 'Riwayat aktivitas' }]} value={tab} onChange={setTab} />}
        {tab === 'activity' && user ? (
          <UserActivity userId={user.id} />
        ) : (
          <div className="stack">
            {!canEditTarget && <Notice tone="info">Anda hanya dapat melihat akun ini. Admin hanya dapat mengelola akun kasir di cabangnya.</Notice>}
            <div className="form-grid">
              <Field label="Nama lengkap">
                <input type="text" value={fullName} disabled={!canEditTarget} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="Email (untuk login)" hint={isNew ? undefined : 'Email tidak dapat diubah.'}>
                <input type="email" value={email} disabled={!isNew} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              {isNew && (
                <Field label="Password awal" hint="Minimal 8 karakter. Catat dan berikan kepada pengguna.">
                  <div className="row gap-sm">
                    <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <Button size="sm" onClick={() => setPassword(randomPassword())}>
                      Acak
                    </Button>
                  </div>
                </Field>
              )}
              <Field label="Role" hint={role === 'owner' ? 'Owner dapat mengakses seluruh cabang.' : undefined}>
                <select value={role} disabled={!canEditTarget || (!isNew && (!isOwner || isSelf))} onChange={(e) => setRole(e.target.value as Role)}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel[r]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {needsOutlets && (
              <div>
                <span className="field-label">Cabang yang boleh diakses</span>
                {outlets.length === 0 ? (
                  <Notice tone="warning">Belum ada cabang.</Notice>
                ) : (
                  <div className="list-check" style={{ marginTop: 6 }}>
                    {outlets.map((o) => (
                      <label className="check" key={o.id}>
                        <input
                          type="checkbox"
                          checked={assigned.has(o.id)}
                          disabled={!canEditTarget}
                          onChange={(e) => {
                            const n = new Set(assigned);
                            if (e.target.checked) n.add(o.id);
                            else n.delete(o.id);
                            setAssigned(n);
                          }}
                        />
                        <span>{o.name}</span>
                        <span className="muted small mono">{o.code}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="field-hint">Pilih satu atau lebih cabang. Pengguna dapat memilih cabang aktif setelah login.</p>
              </div>
            )}

            {!isNew && canEditTarget && (
              <div className="subtle-box stack" style={{ gap: 10 }}>
                <div className="row between wrap gap-sm">
                  <div>
                    <strong>Status akun</strong>
                    <div className="muted small">Akun nonaktif tidak dapat login maupun mengakses data.</div>
                  </div>
                  <Toggle checked={active} disabled={isSelf} onChange={() => setConfirmActive(true)} label={active ? 'Aktif' : 'Nonaktif'} />
                </div>
                <div className="row between wrap gap-sm">
                  <div>
                    <strong>Password</strong>
                    <div className="muted small">Atur password baru bila pengguna lupa.</div>
                  </div>
                  <Button size="sm" onClick={() => setResetOpen(true)}>
                    Reset password
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {confirmActive && user && (
        <ConfirmDialog
          title={active ? 'Nonaktifkan akun?' : 'Aktifkan akun?'}
          message={active ? `${user.full_name} tidak akan dapat login lagi sampai diaktifkan kembali.` : `${user.full_name} akan dapat login kembali.`}
          danger={active}
          onClose={() => setConfirmActive(false)}
          onConfirm={async () => {
            await callAdminUsers({ action: 'set_active', user_id: user.id, is_active: !active });
            setActive(!active);
            toast.success(active ? 'Akun dinonaktifkan' : 'Akun diaktifkan');
            onSaved('Status akun diperbarui');
          }}
        />
      )}

      {resetOpen && (
        <Modal
          title="Reset password"
          size="sm"
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <Button onClick={() => setResetOpen(false)}>Batal</Button>
              <Button variant="primary" loading={reset.isPending} disabled={newPassword.length < 8} onClick={() => reset.mutate()}>
                Ganti password
              </Button>
            </>
          }
        >
          <Field label="Password baru" hint="Minimal 8 karakter.">
            <div className="row gap-sm">
              <input type="text" autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Button size="sm" onClick={() => setNewPassword(randomPassword())}>
                Acak
              </Button>
            </div>
          </Field>
        </Modal>
      )}
    </>
  );
}

function UserActivity({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ['user-activity', userId],
    queryFn: async () =>
      unwrap(await supabase.from('audit_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)) as AuditLog[],
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} />;
  if ((q.data ?? []).length === 0) return <EmptyState title="Belum ada aktivitas tercatat" hint="Hanya aktivitas yang dapat Anda lihat yang ditampilkan." />;
  return (
    <table className="table">
      <tbody>
        {(q.data ?? []).map((l) => (
          <tr key={l.id}>
            <td className="nowrap small">{dateTime(l.created_at)}</td>
            <td>{actionLabel(l.action)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
