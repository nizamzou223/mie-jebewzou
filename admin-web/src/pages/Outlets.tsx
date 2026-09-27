import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { affected, unwrap } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { hoursSummary, roleLabel } from '../lib/format';
import type { DayHours, Outlet, Profile } from '../lib/types';
import { Badge, Button, ConfirmDialog, DataTable, ErrorState, Field, Modal, Notice, PageHeader, Spinner, Toggle, useToast } from '../components/ui';
import HoursEditor, { normalizeHours } from '../components/HoursEditor';

type OutletWithUsers = Outlet & { user_outlets: { user_id: string }[] };

export default function OutletsPage() {
  const qc = useQueryClient();
  const auth = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState<OutletWithUsers | 'new' | null>(null);
  const [toggling, setToggling] = useState<OutletWithUsers | null>(null);

  const q = useQuery({
    queryKey: ['outlets-admin'],
    queryFn: async () => unwrap(await supabase.from('outlets').select('*, user_outlets(user_id)').order('name')) as OutletWithUsers[],
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['outlets-admin'] });
    await auth.reload();
  };

  return (
    <>
      <PageHeader
        title="Cabang"
        subtitle="Kelola cabang, jam operasional, dan siapa saja yang boleh mengakses masing-masing cabang."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Tambah cabang
          </Button>
        }
      />
      <div className="card">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : (
          <DataTable
            rows={q.data ?? []}
            rowKey={(o) => o.id}
            onRowClick={(o) => setEditing(o)}
            columns={[
              { header: 'Kode', cell: (o) => <strong className="mono">{o.code}</strong>, width: '90px' },
              {
                header: 'Cabang',
                cell: (o) => (
                  <>
                    <strong>{o.name}</strong>
                    <div className="muted small">{o.address || 'Alamat belum diisi'}</div>
                  </>
                ),
              },
              { header: 'Telepon', cell: (o) => o.phone || '-' },
              { header: 'Jam operasional', cell: (o) => hoursSummary(o.opening_hours) },
              { header: 'Pengguna', cell: (o) => `${o.user_outlets.length} akun`, align: 'right' },
              { header: 'Status', cell: (o) => <Badge tone={o.is_active ? 'success' : 'neutral'}>{o.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
              {
                header: '',
                width: '110px',
                cell: (o) => (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" onClick={() => setToggling(o)}>
                      {o.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </span>
                ),
              },
            ]}
            empty={<div className="state"><strong>Belum ada cabang</strong><span className="muted">Tambahkan cabang pertama Jebewsizou Anda.</span></div>}
          />
        )}
      </div>

      {editing && (
        <OutletForm
          outlet={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success('Cabang disimpan');
            await refresh();
          }}
        />
      )}
      {toggling && (
        <ConfirmDialog
          title={toggling.is_active ? 'Nonaktifkan cabang?' : 'Aktifkan cabang?'}
          message={
            toggling.is_active
              ? `Cabang "${toggling.name}" tidak dapat lagi dipakai untuk transaksi baru. Data lama tetap tersimpan.`
              : `Cabang "${toggling.name}" akan dapat dipakai kembali.`
          }
          danger={toggling.is_active}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            affected(await supabase.from('outlets').update({ is_active: !toggling.is_active }).eq('id', toggling.id).select('id'));
            await refresh();
            toast.success('Status cabang diperbarui');
          }}
        />
      )}
    </>
  );
}

function OutletForm({ outlet, onClose, onSaved }: { outlet: OutletWithUsers | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(outlet?.code ?? '');
  const [name, setName] = useState(outlet?.name ?? '');
  const [address, setAddress] = useState(outlet?.address ?? '');
  const [phone, setPhone] = useState(outlet?.phone ?? '');
  const [active, setActive] = useState(outlet?.is_active ?? true);
  const [format, setFormat] = useState(outlet?.order_number_format ?? '{CODE}-{YYYYMMDD}-{SEQ}');
  const [hours, setHours] = useState<Record<string, DayHours>>(normalizeHours(outlet?.opening_hours));
  const [assigned, setAssigned] = useState<Set<string>>(new Set(outlet?.user_outlets.map((u) => u.user_id) ?? []));
  const [userSearch, setUserSearch] = useState('');

  const users = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () =>
      unwrap(await supabase.from('profiles').select('id, full_name, email, role, is_active').neq('role', 'owner').order('full_name')) as Pick<
        Profile,
        'id' | 'full_name' | 'email' | 'role' | 'is_active'
      >[],
  });

  const formatError =
    !format.includes('{CODE}') || !format.includes('{SEQ}') ? 'Format harus memuat {CODE} dan {SEQ}' : undefined;
  const preview = format
    .replace('{CODE}', code || 'KODE')
    .replace('{YYYYMMDD}', '20260926')
    .replace('{YYMMDD}', '260926')
    .replace('{SEQ}', '0001');
  const codeError = code && !/^[A-Z0-9]{2,10}$/.test(code) ? 'Kode 2–10 karakter huruf besar/angka' : undefined;
  const valid = name.trim() && /^[A-Z0-9]{2,10}$/.test(code) && !formatError;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code,
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        is_active: active,
        order_number_format: format,
        opening_hours: hours,
      };
      let id = outlet?.id;
      if (id) {
        affected(await supabase.from('outlets').update(payload).eq('id', id).select('id'));
      } else {
        id = (unwrap(await supabase.from('outlets').insert(payload).select('id').single()) as { id: string }).id;
      }
      const before = new Set(outlet?.user_outlets.map((u) => u.user_id) ?? []);
      const add = [...assigned].filter((u) => !before.has(u));
      const remove = [...before].filter((u) => !assigned.has(u));
      if (add.length) unwrap(await supabase.from('user_outlets').insert(add.map((user_id) => ({ user_id, outlet_id: id! }))).select('user_id'));
      if (remove.length) affected(await supabase.from('user_outlets').delete().eq('outlet_id', id).in('user_id', remove).select('user_id'));
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(e),
  });

  const list = (users.data ?? []).filter((u) => `${u.full_name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase()));

  return (
    <Modal
      title={outlet ? `Ubah cabang ${outlet.name}` : 'Tambah cabang'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Kode cabang" hint="Dipakai pada nomor transaksi. Tidak dapat diubah setelah dibuat." error={codeError}>
          <input type="text" value={code} disabled={!!outlet} maxLength={10} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="mis. JBA" />
        </Field>
        <Field label="Nama cabang">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Jebewsizou Kemang" />
        </Field>
        <Field label="Alamat">
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Nomor telepon">
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Format nomor transaksi" hint={`Token: {CODE} {YYYYMMDD} {YYMMDD} {SEQ}. Contoh hasil: ${preview}`} error={formatError}>
          <input type="text" value={format} onChange={(e) => setFormat(e.target.value)} />
        </Field>
        <div className="field">
          <span className="field-label">Status</span>
          <Toggle checked={active} onChange={setActive} label={active ? 'Aktif' : 'Nonaktif'} />
        </div>

        <div className="full">
          <h3 style={{ marginBottom: 8 }}>Jam operasional</h3>
          <HoursEditor value={hours} onChange={setHours} />
        </div>

        <div className="full">
          <h3 style={{ marginBottom: 4 }}>Pengguna yang dapat mengakses cabang ini</h3>
          <p className="muted small">Owner otomatis dapat mengakses semua cabang. Pengguna dapat ditugaskan ke lebih dari satu cabang.</p>
          {users.isLoading ? (
            <Spinner />
          ) : users.isError ? (
            <ErrorState error={users.error} />
          ) : (users.data ?? []).length === 0 ? (
            <Notice tone="info">Belum ada akun admin/kasir. Buat lewat menu Pengguna.</Notice>
          ) : (
            <>
              <input type="search" placeholder="Cari pengguna…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} style={{ marginBottom: 8 }} />
              <div className="list-check">
                {list.map((u) => (
                  <label className="check" key={u.id}>
                    <input
                      type="checkbox"
                      checked={assigned.has(u.id)}
                      onChange={(e) => {
                        const n = new Set(assigned);
                        if (e.target.checked) n.add(u.id);
                        else n.delete(u.id);
                        setAssigned(n);
                      }}
                    />
                    <span className="grow">
                      {u.full_name} <span className="muted small">{u.email}</span>
                    </span>
                    <Badge tone={u.role === 'admin' ? 'info' : 'neutral'}>{roleLabel[u.role]}</Badge>
                    {!u.is_active && <Badge tone="danger">Nonaktif</Badge>}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
