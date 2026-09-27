import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { affected, unwrap } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { rupiah } from '../lib/format';
import type { Modifier, ModifierGroup } from '../lib/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner, Toggle, useToast } from '../components/ui';

type GroupFull = ModifierGroup & { modifiers: Modifier[] };

export default function ModifiersPage() {
  const { can } = useAuth();
  const canEdit = can('category.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<GroupFull | 'new' | null>(null);

  const q = useQuery({
    queryKey: ['modifier-groups'],
    queryFn: async () => {
      const rows = unwrap(await supabase.from('modifier_groups').select('*, modifiers(*)').order('sort_order').order('name')) as GroupFull[];
      return rows.map((g) => ({ ...g, modifiers: [...g.modifiers].sort((a, b) => a.sort_order - b.sort_order) }));
    },
  });

  return (
    <>
      <PageHeader
        title="Variasi & Tambahan"
        subtitle="Grup pilihan yang dapat dipasang ke produk: tingkat pedas, topping, tambahan berbayar, dan sebagainya."
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              + Tambah grup
            </Button>
          )
        }
      />
      {!canEdit && <Notice tone="info">Anda hanya dapat melihat data ini. Hubungi owner untuk mengubahnya.</Notice>}
      <p className="muted small mt">
        Ukuran atau variasi harga khusus satu produk (mis. Reguler/Large) diatur langsung pada produk. Grup di sini dapat dipakai ulang oleh banyak produk.
      </p>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState title="Belum ada grup pilihan" hint="Contoh: Tingkat Pedas (wajib), Topping (opsional)." />
      ) : (
        <div className="grid-eq">
          {(q.data ?? []).map((g) => (
            <Card
              key={g.id}
              title={g.name}
              actions={
                <div className="row gap-sm">
                  <Badge tone={g.is_required ? 'danger' : 'neutral'}>{g.is_required ? 'Wajib' : 'Opsional'}</Badge>
                  {!g.is_active && <Badge>Nonaktif</Badge>}
                  <Button size="sm" disabled={!canEdit} onClick={() => setEditing(g)}>
                    Ubah
                  </Button>
                </div>
              }
            >
              <p className="muted small">
                Pilih {g.min_select}
                {g.max_select ? `–${g.max_select}` : ' atau lebih'} opsi
              </p>
              <div className="chips">
                {g.modifiers.map((m) => (
                  <Badge key={m.id} tone={m.is_active ? 'brand' : 'neutral'}>
                    {m.name}
                    {Number(m.price_delta) > 0 ? ` +${rupiah(m.price_delta)}` : ''}
                  </Badge>
                ))}
                {g.modifiers.length === 0 && <span className="muted small">Belum ada opsi</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <GroupForm
          group={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success('Grup pilihan disimpan');
            await qc.invalidateQueries({ queryKey: ['modifier-groups'] });
          }}
        />
      )}
    </>
  );
}

interface OptionDraft {
  id?: string;
  name: string;
  price: string;
  active: boolean;
}

function GroupForm({ group, onClose, onSaved }: { group: GroupFull | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? '');
  const [required, setRequired] = useState(group?.is_required ?? false);
  const [min, setMin] = useState(String(group?.min_select ?? 0));
  const [max, setMax] = useState(group?.max_select ? String(group.max_select) : '');
  const [active, setActive] = useState(group?.is_active ?? true);
  const [options, setOptions] = useState<OptionDraft[]>(
    group?.modifiers.map((m) => ({ id: m.id, name: m.name, price: String(m.price_delta), active: m.is_active })) ?? [],
  );

  const minN = Math.max(0, Number(min) || 0);
  const maxN = max === '' ? null : Math.max(1, Number(max) || 1);
  const rangeError = maxN !== null && maxN < minN ? 'Maksimal tidak boleh lebih kecil dari minimal' : undefined;
  const valid = name.trim() && !rangeError && options.every((o) => o.name.trim() && Number(o.price) >= 0);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        is_required: required,
        min_select: required ? Math.max(minN, 1) : minN,
        max_select: maxN,
        is_active: active,
      };
      let id = group?.id;
      if (id) affected(await supabase.from('modifier_groups').update(payload).eq('id', id).select('id'));
      else id = (unwrap(await supabase.from('modifier_groups').insert(payload).select('id').single()) as { id: string }).id;

      const keep = new Set(options.filter((o) => o.id).map((o) => o.id!));
      for (const old of group?.modifiers ?? []) {
        if (!keep.has(old.id)) affected(await supabase.from('modifiers').delete().eq('id', old.id).select('id'));
      }
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const row = { group_id: id!, name: o.name.trim(), price_delta: Number(o.price) || 0, is_active: o.active, sort_order: i + 1 };
        if (o.id) affected(await supabase.from('modifiers').update(row).eq('id', o.id).select('id'));
        else unwrap(await supabase.from('modifiers').insert(row).select('id'));
      }
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(e),
  });

  const setOpt = (i: number, patch: Partial<OptionDraft>) => setOptions(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <Modal
      title={group ? `Ubah grup: ${group.name}` : 'Tambah grup pilihan'}
      size="md"
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
        <Field label="Nama grup">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Tingkat Pedas" />
        </Field>
        <div className="field">
          <span className="field-label">Aturan pilihan</span>
          <Toggle checked={required} onChange={setRequired} label={required ? 'Wajib dipilih kasir' : 'Opsional'} />
        </div>
        <Field label="Minimal dipilih" hint={required ? 'Grup wajib minimal 1' : undefined}>
          <input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} />
        </Field>
        <Field label="Maksimal dipilih" hint="Kosongkan bila tanpa batas" error={rangeError}>
          <input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
        <div className="field full">
          <Toggle checked={active} onChange={setActive} label={active ? 'Grup aktif' : 'Grup nonaktif'} />
        </div>
        <div className="full">
          <h3 style={{ marginBottom: 8 }}>Opsi</h3>
          <div className="stack" style={{ gap: 8 }}>
            {options.map((o, i) => (
              <div className="row gap-sm" key={o.id ?? `new-${i}`}>
                <input type="text" className="inline-input grow" placeholder="Nama opsi" value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} />
                <input
                  type="number"
                  min={0}
                  className="inline-input"
                  style={{ width: 120 }}
                  placeholder="Harga +"
                  value={o.price}
                  onChange={(e) => setOpt(i, { price: e.target.value })}
                  aria-label="Tambahan harga"
                />
                <Toggle checked={o.active} onChange={(v) => setOpt(i, { active: v })} />
                <Button size="sm" variant="ghost" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Hapus opsi">
                  ✕
                </Button>
              </div>
            ))}
            <div>
              <Button size="sm" onClick={() => setOptions([...options, { name: '', price: '0', active: true }])}>
                + Tambah opsi
              </Button>
            </div>
          </div>
          <p className="field-hint">Harga tambahan 0 berarti gratis. Menghapus opsi tidak mengubah transaksi lama.</p>
        </div>
      </div>
    </Modal>
  );
}
