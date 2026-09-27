import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { affected, unwrap } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { dateTime, number } from '../lib/format';
import type { Ingredient, InventoryItem } from '../lib/types';
import { Badge, Button, DataTable, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner, Tabs, Toggle, useDebounced, useToast } from '../components/ui';

const UNITS = ['gram', 'kg', 'ml', 'liter', 'porsi', 'botol', 'pcs', 'bungkus'];

type MoveType = 'in' | 'out' | 'adjustment' | 'min';
const moveLabel: Record<string, string> = {
  in: 'Stok masuk',
  out: 'Stok keluar',
  adjustment: 'Penyesuaian',
  sale: 'Penjualan',
  void_return: 'Pengembalian (batal/refund)',
  min: 'Batas minimum',
};

export default function InventoryPage() {
  const { outletId, outlets, can } = useAuth();
  const canManage = can('inventory.manage');
  const [tab, setTab] = useState<'stock' | 'history' | 'ingredients'>('stock');
  const outlet = outlets.find((o) => o.id === outletId);

  return (
    <>
      <PageHeader title="Bahan & Stok" subtitle={outlet ? `Stok cabang ${outlet.name}` : 'Stok dicatat per cabang. Pilih cabang di bagian atas.'} />
      {!canManage && <Notice tone="info">Anda hanya dapat melihat stok. Hubungi owner untuk izin mengelola stok.</Notice>}
      <div className="mt">
        <Tabs
          tabs={[
            { key: 'stock', label: 'Stok' },
            { key: 'history', label: 'Riwayat perubahan' },
            { key: 'ingredients', label: 'Daftar bahan' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'ingredients' ? (
        <IngredientsTab canManage={canManage} />
      ) : !outletId ? (
        <div className="card">
          <EmptyState title="Pilih cabang terlebih dahulu" hint="Gunakan pilihan “Cabang” di bagian atas halaman untuk melihat stok satu cabang." />
        </div>
      ) : tab === 'stock' ? (
        <StockTab outletId={outletId} canManage={canManage} />
      ) : (
        <HistoryTab outletId={outletId} canManage={canManage} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Stok
function StockTab({ outletId, canManage }: { outletId: string; canManage: boolean }) {
  const [search, setSearch] = useState('');
  const dSearch = useDebounced(search);
  const [onlyLow, setOnlyLow] = useState(false);
  const [action, setAction] = useState<{ type: MoveType; ingredient: Ingredient; item: InventoryItem | null } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const ingredients = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => unwrap(await supabase.from('ingredients').select('*').order('name')) as Ingredient[],
  });
  const items = useQuery({
    queryKey: ['inventory-items', outletId],
    queryFn: async () => unwrap(await supabase.from('inventory_items').select('*').eq('outlet_id', outletId)) as InventoryItem[],
  });

  const rows = useMemo(() => {
    const map = new Map((items.data ?? []).map((i) => [i.ingredient_id, i]));
    return (ingredients.data ?? [])
      .filter((g) => g.is_active)
      .map((g) => ({ ingredient: g, item: map.get(g.id) ?? null }))
      .filter((r) => r.ingredient.name.toLowerCase().includes(dSearch.toLowerCase()))
      .filter((r) => !onlyLow || (r.item && Number(r.item.current_stock) <= Number(r.item.min_stock)));
  }, [ingredients.data, items.data, dSearch, onlyLow]);

  const status = (i: InventoryItem | null) => {
    if (!i) return <Badge>Belum dicatat</Badge>;
    if (Number(i.current_stock) <= 0) return <Badge tone="danger">Habis</Badge>;
    if (Number(i.current_stock) <= Number(i.min_stock)) return <Badge tone="warning">Menipis</Badge>;
    return <Badge tone="success">Aman</Badge>;
  };

  const done = async (msg: string) => {
    setAction(null);
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: ['inventory-items', outletId] });
    await qc.invalidateQueries({ queryKey: ['inventory-history', outletId] });
    await qc.invalidateQueries({ queryKey: ['dash-low'] });
  };

  return (
    <>
      <div className="filters">
        <Field label="Cari bahan" >
          <input type="search" placeholder="Nama bahan…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <div className="field">
          <span className="field-label">Tampilkan</span>
          <Toggle checked={onlyLow} onChange={setOnlyLow} label="Hanya stok menipis" />
        </div>
      </div>
      <div className="card">
        {ingredients.isLoading || items.isLoading ? (
          <Spinner />
        ) : ingredients.isError || items.isError ? (
          <ErrorState error={ingredients.error ?? items.error} retry={() => { void ingredients.refetch(); void items.refetch(); }} />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.ingredient.id}
            empty={<EmptyState title="Tidak ada bahan" hint="Tambahkan bahan di tab “Daftar bahan”." />}
            columns={[
              { header: 'Bahan', cell: (r) => <strong>{r.ingredient.name}</strong> },
              { header: 'Stok', align: 'right', cell: (r) => <span className="mono">{number(r.item?.current_stock ?? 0)} {r.ingredient.unit}</span> },
              { header: 'Minimum', align: 'right', cell: (r) => <span className="mono">{number(r.item?.min_stock ?? 0)} {r.ingredient.unit}</span> },
              { header: 'Status', cell: (r) => status(r.item) },
              {
                header: 'Aksi',
                align: 'right',
                cell: (r) =>
                  canManage ? (
                    <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => setAction({ type: 'in', ...r })}>+ Masuk</Button>
                      <Button size="sm" onClick={() => setAction({ type: 'out', ...r })}>− Keluar</Button>
                      <Button size="sm" onClick={() => setAction({ type: 'adjustment', ...r })}>Sesuaikan</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAction({ type: 'min', ...r })}>Minimum</Button>
                    </div>
                  ) : null,
              },
            ]}
          />
        )}
      </div>
      {action && <MovementModal outletId={outletId} {...action} onClose={() => setAction(null)} onDone={done} />}
    </>
  );
}

function MovementModal({
  outletId, type, ingredient, item, onClose, onDone,
}: {
  outletId: string;
  type: MoveType;
  ingredient: Ingredient;
  item: InventoryItem | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const toast = useToast();
  const current = Number(item?.current_stock ?? 0);
  const [qty, setQty] = useState(type === 'adjustment' ? String(current) : type === 'min' ? String(item?.min_stock ?? 0) : '');
  const [reason, setReason] = useState('');
  const n = Number(qty);
  const needsReason = type === 'out' || type === 'adjustment';
  const valid = qty !== '' && n >= 0 && (type === 'adjustment' || type === 'min' || n > 0) && (!needsReason || reason.trim().length >= 3) && (type !== 'out' || n <= current);

  const save = useMutation({
    mutationFn: async () => {
      if (type === 'min') {
        if (item) affected(await supabase.from('inventory_items').update({ min_stock: n }).eq('id', item.id).select('id'));
        else unwrap(await supabase.rpc('record_stock_movement', { p_outlet: outletId, p_ingredient: ingredient.id, p_type: 'adjustment', p_quantity: 0, p_reason: 'Inisialisasi stok', p_min_stock: n }));
        return;
      }
      unwrap(
        await supabase.rpc('record_stock_movement', {
          p_outlet: outletId,
          p_ingredient: ingredient.id,
          p_type: type,
          p_quantity: n,
          p_reason: reason.trim() || null,
          p_min_stock: null,
        }),
      );
    },
    onSuccess: () => onDone(type === 'min' ? 'Batas minimum disimpan' : 'Stok diperbarui'),
    onError: (e) => toast.error(e),
  });

  const after = type === 'in' ? current + n : type === 'out' ? current - n : n;

  return (
    <Modal
      title={`${moveLabel[type]} — ${ingredient.name}`}
      size="sm"
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
      <div className="stack">
        <p className="muted">
          Stok saat ini: <strong>{number(current)} {ingredient.unit}</strong>
        </p>
        <Field
          label={type === 'adjustment' ? `Jumlah stok sebenarnya (${ingredient.unit})` : type === 'min' ? `Batas minimum (${ingredient.unit})` : `Jumlah (${ingredient.unit})`}
          hint={type === 'adjustment' ? 'Isi hasil hitung fisik; sistem menghitung selisihnya.' : undefined}
          error={type === 'out' && n > current ? 'Melebihi stok yang tersedia' : undefined}
        >
          <input type="number" min={0} step="any" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        {type !== 'min' && (
          <>
            <Field label={needsReason ? 'Alasan (wajib)' : 'Keterangan'} hint={type === 'in' ? 'mis. Belanja pasar, kiriman supplier' : 'mis. Rusak, tumpah, stok opname'}>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {qty !== '' && <p className="small">Stok setelah perubahan: <strong>{number(after)} {ingredient.unit}</strong></p>}
          </>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Riwayat
interface MovementRow {
  id: number;
  type: string;
  quantity: number;
  stock_after: number;
  reason: string | null;
  created_by_name: string | null;
  created_at: string;
  ingredients: { name: string; unit: string } | null;
}

function HistoryTab({ outletId, canManage }: { outletId: string; canManage: boolean }) {
  const [type, setType] = useState('');
  const q = useQuery({
    queryKey: ['inventory-history', outletId, type],
    enabled: canManage,
    queryFn: async () => {
      let req = supabase
        .from('inventory_movements')
        .select('id, type, quantity, stock_after, reason, created_by_name, created_at, ingredients(name, unit)')
        .eq('outlet_id', outletId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (type) req = req.eq('type', type);
      return unwrap(await req) as unknown as MovementRow[];
    },
  });
  if (!canManage) return <Notice tone="info">Riwayat stok hanya tersedia bagi pengguna yang berizin mengelola stok.</Notice>;
  return (
    <>
      <div className="filters">
        <Field label="Jenis">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Semua</option>
            {['in', 'out', 'adjustment', 'sale', 'void_return'].map((t) => (
              <option key={t} value={t}>
                {moveLabel[t]}
              </option>
            ))}
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
            rows={q.data ?? []}
            rowKey={(m) => String(m.id)}
            empty={<EmptyState title="Belum ada perubahan stok" />}
            columns={[
              { header: 'Waktu', cell: (m) => <span className="nowrap">{dateTime(m.created_at)}</span> },
              { header: 'Bahan', cell: (m) => m.ingredients?.name ?? '-' },
              { header: 'Jenis', cell: (m) => <Badge tone={m.type === 'sale' ? 'neutral' : m.type === 'in' || m.type === 'void_return' ? 'success' : 'warning'}>{moveLabel[m.type] ?? m.type}</Badge> },
              {
                header: 'Perubahan',
                align: 'right',
                cell: (m) => (
                  <span className="mono" style={{ color: Number(m.quantity) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {Number(m.quantity) > 0 ? '+' : ''}
                    {number(m.quantity)} {m.ingredients?.unit}
                  </span>
                ),
              },
              { header: 'Stok akhir', align: 'right', cell: (m) => <span className="mono">{number(m.stock_after)}</span> },
              { header: 'Keterangan', cell: (m) => m.reason ?? '-' },
              { header: 'Oleh', cell: (m) => m.created_by_name ?? '-' },
            ]}
          />
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Master bahan
function IngredientsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);
  const q = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => unwrap(await supabase.from('ingredients').select('*').order('name')) as Ingredient[],
  });
  const toggle = useMutation({
    mutationFn: async (g: Ingredient) => affected(await supabase.from('ingredients').update({ is_active: !g.is_active }).eq('id', g.id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingredients'] }),
    onError: (e) => toast.error(e),
  });
  return (
    <>
      <div className="row between wrap gap mt" style={{ marginBottom: 12 }}>
        <p className="muted small" style={{ margin: 0 }}>Daftar bahan berlaku untuk semua cabang; jumlah stoknya dicatat per cabang.</p>
        {canManage && (
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Tambah bahan
          </Button>
        )}
      </div>
      <div className="card">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : (
          <DataTable
            rows={q.data ?? []}
            rowKey={(g) => g.id}
            empty={<EmptyState title="Belum ada bahan" hint="Contoh: Mie mentah (gram), Telur (pcs), Air mineral (botol)." />}
            columns={[
              { header: 'Bahan', cell: (g) => <strong>{g.name}</strong> },
              { header: 'Satuan', cell: (g) => g.unit },
              { header: 'Status', cell: (g) => <Badge tone={g.is_active ? 'success' : 'neutral'}>{g.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
              {
                header: '',
                align: 'right',
                cell: (g) =>
                  canManage && (
                    <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => setEditing(g)}>Ubah</Button>
                      <Toggle checked={g.is_active} onChange={() => toggle.mutate(g)} />
                    </div>
                  ),
              },
            ]}
          />
        )}
      </div>
      {editing && (
        <IngredientForm
          ingredient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success('Bahan disimpan');
            await qc.invalidateQueries({ queryKey: ['ingredients'] });
          }}
        />
      )}
    </>
  );
}

function IngredientForm({ ingredient, onClose, onSaved }: { ingredient: Ingredient | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? 'gram');
  const save = useMutation({
    mutationFn: async () => {
      if (ingredient) affected(await supabase.from('ingredients').update({ name: name.trim(), unit }).eq('id', ingredient.id).select('id'));
      else unwrap(await supabase.from('ingredients').insert({ name: name.trim(), unit }).select('id'));
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(e),
  });
  return (
    <Modal
      title={ingredient ? 'Ubah bahan' : 'Tambah bahan'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Nama bahan">
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Satuan" hint={ingredient ? 'Mengubah satuan tidak mengonversi angka stok yang sudah ada.' : undefined}>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {[...new Set([...UNITS, unit])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
