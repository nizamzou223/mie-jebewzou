import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import { supabase } from '../lib/supabase';
import { affected, unwrap, useCategories } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { rupiah } from '../lib/format';
import type { Ingredient, ModifierGroup, OutletProduct, Product, Variant } from '../lib/types';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner, Tabs, Toggle, useDebounced, useToast,
} from '../components/ui';
import ImageUpload from '../components/ImageUpload';

export default function ProductsPage() {
  const { can, outletId, outlets } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const canGlobal = can('product.manage_global');
  const canOutlet = can('product.manage_outlet');
  const cats = useCategories();

  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const dSearch = useDebounced(search);
  const [view, setViewState] = useState<'list' | 'grid'>(() => {
    try {
      return localStorage.getItem('mj_product_view') === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  const setView = (v: 'list' | 'grid') => {
    setViewState(v);
    try {
      localStorage.setItem('mj_product_view', v);
    } catch {
      /* abaikan */
    }
  };
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('name');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () => unwrap(await supabase.from('products').select('*').order('name')) as Product[],
  });
  const overrides = useQuery({
    queryKey: ['outlet-products', outletId],
    enabled: !!outletId,
    queryFn: async () => unwrap(await supabase.from('outlet_products').select('*').eq('outlet_id', outletId!)) as OutletProduct[],
  });
  const ovMap = useMemo(() => new Map((overrides.data ?? []).map((o) => [o.product_id, o])), [overrides.data]);
  const catName = (id: string | null) => cats.data?.find((c) => c.id === id)?.name ?? '—';
  const outletName = outlets.find((o) => o.id === outletId)?.name;

  const rows = useMemo(() => {
    let list = (products.data ?? []).filter(
      (p) =>
        (!cat || p.category_id === cat) &&
        (status === 'all' || (status === 'active') === p.is_active) &&
        `${p.name} ${p.sku}`.toLowerCase().includes(dSearch.toLowerCase()),
    );
    const price = (p: Product) => Number(ovMap.get(p.id)?.price_override ?? p.base_price);
    list = [...list].sort((a, b) => {
      if (sort === 'price_asc') return price(a) - price(b);
      if (sort === 'price_desc') return price(b) - price(a);
      if (sort === 'newest') return b.created_at.localeCompare(a.created_at);
      if (sort === 'sku') return a.sku.localeCompare(b.sku);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [products.data, cat, status, dSearch, sort, ovMap]);

  const setOutletFlag = useMutation({
    mutationFn: async ({ productId, patch }: { productId: string; patch: Partial<OutletProduct> }) =>
      affected(
        await supabase
          .from('outlet_products')
          .upsert({ outlet_id: outletId!, product_id: productId, ...patch }, { onConflict: 'outlet_id,product_id' })
          .select('product_id'),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlet-products', outletId] }),
    onError: (e) => toast.error(e),
  });

  const toggleActive = useMutation({
    mutationFn: async (p: Product) => affected(await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        title="Produk & Menu"
        subtitle={outletId ? `Menampilkan pengaturan cabang ${outletName}. Pilih "Semua cabang" di atas untuk melihat harga global.` : 'Harga di sini adalah harga global untuk semua cabang.'}
        actions={
          canGlobal && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              + Tambah produk
            </Button>
          )
        }
      />
      {!canGlobal && (
        <Notice tone="info">
          {canOutlet
            ? 'Anda dapat mengatur harga khusus dan ketersediaan produk di cabang Anda. Data produk global hanya dapat diubah oleh owner.'
            : 'Anda hanya dapat melihat daftar produk.'}
        </Notice>
      )}

      <div className="filters mt">
        <Field label="Cari">
          <input type="search" placeholder="Nama atau SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Kategori">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Semua kategori</option>
            {(cats.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
            <option value="all">Semua</option>
          </select>
        </Field>
        <Field label="Urutkan">
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Nama A–Z</option>
            <option value="sku">SKU</option>
            <option value="price_asc">Harga termurah</option>
            <option value="price_desc">Harga termahal</option>
            <option value="newest">Terbaru</option>
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Tampilan</span>
          <div className="seg" role="group" aria-label="Tampilan produk">
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <Icon name="list" style={{ verticalAlign: '-3px', marginRight: 6 }} />
              Daftar
            </button>
            <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              <Icon name="grid" style={{ verticalAlign: '-3px', marginRight: 6 }} />
              Kartu
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' && products.data ? (
        rows.length === 0 ? (
          <div className="card">
            <EmptyState title="Produk tidak ditemukan" hint="Ubah filter pencarian atau tambahkan produk baru." />
          </div>
        ) : (
          <div className="pgrid">
            {rows.map((p) => {
              const ov = ovMap.get(p.id);
              const price = ov?.price_override != null ? Number(ov.price_override) : Number(p.base_price);
              const unavailable = outletId && ov && (!ov.is_available || !ov.is_listed);
              return (
                <button key={p.id} type="button" className="pcard" onClick={() => setEditing(p)} aria-label={`Buka ${p.name}`}>
                  <div className="pcard-img">
                    {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="ph"><Icon name="bowl" /></span>}
                    {!p.is_active ? <Badge tone="neutral">Nonaktif</Badge> : unavailable ? <Badge tone="warning">{ov && !ov.is_listed ? 'Tidak dijual' : 'Habis'}</Badge> : null}
                  </div>
                  <div className="pcard-body">
                    <strong>{p.name}</strong>
                    <span className="muted small mono">{p.sku} · {catName(p.category_id)}</span>
                    <span className="pcard-price">
                      {rupiah(price)}
                      {ov?.price_override != null && <span className="muted small" style={{ fontWeight: 500 }}> (harga cabang)</span>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
      <div className="card">
        {products.isLoading ? (
          <Spinner />
        ) : products.isError ? (
          <ErrorState error={products.error} retry={() => void products.refetch()} />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(p) => p.id}
            onRowClick={(p) => setEditing(p)}
            empty={<EmptyState title="Produk tidak ditemukan" hint="Ubah filter pencarian atau tambahkan produk baru." />}
            columns={[
              {
                header: '',
                width: '60px',
                cell: (p) => (p.image_url ? <img className="thumb" src={p.image_url} alt="" loading="lazy" /> : <div className="thumb-ph">{p.name.slice(0, 1)}</div>),
              },
              {
                header: 'Produk',
                cell: (p) => (
                  <>
                    <strong>{p.name}</strong>
                    <div className="muted small mono">{p.sku}</div>
                  </>
                ),
              },
              { header: 'Kategori', cell: (p) => catName(p.category_id) },
              {
                header: outletId ? 'Harga global' : 'Harga',
                align: 'right',
                cell: (p) => <span className="mono">{rupiah(p.base_price)}</span>,
              },
              ...(outletId
                ? [
                    {
                      header: 'Harga cabang',
                      align: 'right' as const,
                      cell: (p: Product) => {
                        const o = ovMap.get(p.id);
                        return o?.price_override != null ? <strong className="mono">{rupiah(o.price_override)}</strong> : <span className="muted">Ikut global</span>;
                      },
                    },
                    {
                      header: 'Tersedia',
                      align: 'center' as const,
                      cell: (p: Product) => (
                        <span onClick={(e) => e.stopPropagation()}>
                          <Toggle
                            checked={ovMap.get(p.id)?.is_available ?? true}
                            disabled={!canOutlet || setOutletFlag.isPending}
                            onChange={(v) => setOutletFlag.mutate({ productId: p.id, patch: { is_available: v } })}
                          />
                        </span>
                      ),
                    },
                    {
                      header: 'Dijual',
                      align: 'center' as const,
                      cell: (p: Product) => (
                        <span onClick={(e) => e.stopPropagation()}>
                          <Toggle
                            checked={ovMap.get(p.id)?.is_listed ?? true}
                            disabled={!canOutlet || setOutletFlag.isPending}
                            onChange={(v) => setOutletFlag.mutate({ productId: p.id, patch: { is_listed: v } })}
                          />
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                header: 'Status',
                cell: (p) => (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Toggle checked={p.is_active} disabled={!canGlobal || toggleActive.isPending} onChange={() => toggleActive.mutate(p)} label={p.is_active ? 'Aktif' : 'Nonaktif'} />
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
      )}

      {editing && (
        <ProductModal
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success('Produk disimpan');
            await qc.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Modal

interface Details {
  variants: Variant[];
  groupIds: string[];
  recipe: { ingredient_id: string; quantity: number }[];
}

function ProductModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const q = useQuery({
    queryKey: ['product-details', product?.id],
    enabled: !!product,
    staleTime: 0,
    queryFn: async (): Promise<Details> => {
      const [v, g, r] = await Promise.all([
        supabase.from('product_variants').select('*').eq('product_id', product!.id).order('sort_order'),
        supabase.from('product_modifier_groups').select('group_id').eq('product_id', product!.id),
        supabase.from('recipes').select('ingredient_id, quantity').eq('product_id', product!.id),
      ]);
      return {
        variants: unwrap(v) as Variant[],
        groupIds: (unwrap(g) as { group_id: string }[]).map((x) => x.group_id),
        recipe: unwrap(r) as { ingredient_id: string; quantity: number }[],
      };
    },
  });

  if (product && q.isLoading) {
    return (
      <Modal title={product.name} onClose={onClose}>
        <Spinner />
      </Modal>
    );
  }
  if (product && q.isError) {
    return (
      <Modal title={product.name} onClose={onClose}>
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      </Modal>
    );
  }
  return <ProductForm product={product} details={q.data ?? { variants: [], groupIds: [], recipe: [] }} onClose={onClose} onSaved={onSaved} />;
}

interface VariantDraft {
  id?: string;
  name: string;
  delta: string;
  active: boolean;
}

function ProductForm({ product, details, onClose, onSaved }: { product: Product | null; details: Details; onClose: () => void; onSaved: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const canGlobal = can('product.manage_global');
  const canOutlet = can('product.manage_outlet');
  const cats = useCategories();
  const [tab, setTab] = useState<'general' | 'variants' | 'modifiers' | 'recipe' | 'outlets'>('general');

  const [sku, setSku] = useState(product?.sku ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(String(product?.base_price ?? ''));
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [active, setActive] = useState(product?.is_active ?? true);
  const [variants, setVariants] = useState<VariantDraft[]>(
    details.variants.map((v) => ({ id: v.id, name: v.name, delta: String(v.price_delta), active: v.is_active })),
  );
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set(details.groupIds));
  const [recipe, setRecipe] = useState<{ ingredient_id: string; quantity: string }[]>(
    details.recipe.map((r) => ({ ingredient_id: r.ingredient_id, quantity: String(r.quantity) })),
  );

  const groups = useQuery({
    queryKey: ['modifier-groups-lite'],
    queryFn: async () => unwrap(await supabase.from('modifier_groups').select('id, name, is_required, is_active').order('sort_order')) as Pick<ModifierGroup, 'id' | 'name' | 'is_required' | 'is_active'>[],
  });
  const ingredients = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => unwrap(await supabase.from('ingredients').select('*').order('name')) as Ingredient[],
  });

  const priceN = Number(price);
  const valid =
    sku.trim() && name.trim() && price !== '' && priceN >= 0 &&
    variants.every((v) => v.name.trim()) &&
    recipe.every((r) => r.ingredient_id && Number(r.quantity) > 0) &&
    new Set(recipe.map((r) => r.ingredient_id)).size === recipe.length;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: sku.trim(),
        name: name.trim(),
        category_id: categoryId || null,
        description: description.trim() || null,
        base_price: priceN,
        image_url: imageUrl,
        is_active: active,
      };
      let id = product?.id;
      if (id) affected(await supabase.from('products').update(payload).eq('id', id).select('id'));
      else id = (unwrap(await supabase.from('products').insert(payload).select('id').single()) as { id: string }).id;

      // Variasi
      const keepV = new Set(variants.filter((v) => v.id).map((v) => v.id!));
      for (const old of details.variants) {
        if (!keepV.has(old.id)) unwrap(await supabase.from('product_variants').delete().eq('id', old.id).select('id'));
      }
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const row = { product_id: id!, name: v.name.trim(), price_delta: Number(v.delta) || 0, is_active: v.active, sort_order: i + 1 };
        if (v.id) affected(await supabase.from('product_variants').update(row).eq('id', v.id).select('id'));
        else unwrap(await supabase.from('product_variants').insert(row).select('id'));
      }

      // Grup tambahan
      const before = new Set(details.groupIds);
      for (const g of before) {
        if (!groupIds.has(g)) unwrap(await supabase.from('product_modifier_groups').delete().eq('product_id', id).eq('group_id', g).select('group_id'));
      }
      const addG = [...groupIds].filter((g) => !before.has(g));
      if (addG.length) unwrap(await supabase.from('product_modifier_groups').insert(addG.map((group_id, i) => ({ product_id: id!, group_id, sort_order: i + 1 }))).select('group_id'));

      // Resep
      const keepR = new Set(recipe.map((r) => r.ingredient_id));
      for (const old of details.recipe) {
        if (!keepR.has(old.ingredient_id)) unwrap(await supabase.from('recipes').delete().eq('product_id', id).eq('ingredient_id', old.ingredient_id).select('ingredient_id'));
      }
      if (recipe.length) {
        unwrap(
          await supabase
            .from('recipes')
            .upsert(recipe.map((r) => ({ product_id: id!, ingredient_id: r.ingredient_id, quantity: Number(r.quantity) })), { onConflict: 'product_id,ingredient_id' })
            .select('product_id'),
        );
      }
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(e),
  });

  const tabs = [
    { key: 'general' as const, label: 'Umum' },
    { key: 'variants' as const, label: `Variasi${variants.length ? ` (${variants.length})` : ''}` },
    { key: 'modifiers' as const, label: `Tambahan${groupIds.size ? ` (${groupIds.size})` : ''}` },
    { key: 'recipe' as const, label: 'Resep' },
    ...(product ? [{ key: 'outlets' as const, label: 'Cabang' }] : []),
  ];
  const globalTab = tab !== 'outlets';

  return (
    <Modal
      title={product ? product.name : 'Tambah produk'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{globalTab && canGlobal ? 'Batal' : 'Tutup'}</Button>
          {globalTab && canGlobal && (
            <Button variant="primary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
              Simpan produk
            </Button>
          )}
        </>
      }
    >
      {!canGlobal && globalTab && <Notice tone="info">Data produk global hanya dapat diubah oleh pengguna yang berizin. Gunakan tab “Cabang” untuk harga & ketersediaan di cabang Anda.</Notice>}
      <div className="mt">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'general' && (
        <div className="form-grid">
          <Field label="Nama produk">
            <input type="text" value={name} disabled={!canGlobal} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="SKU / kode" hint="Harus unik">
            <input type="text" value={sku} disabled={!canGlobal} onChange={(e) => setSku(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Kategori">
            <select value={categoryId} disabled={!canGlobal} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Tanpa kategori</option>
              {(cats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Harga global (Rp)" hint="Berlaku di semua cabang kecuali diberi harga khusus di tab Cabang">
            <input type="number" min={0} step={500} value={price} disabled={!canGlobal} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <div className="full">
            <Field label="Deskripsi">
              <textarea rows={3} value={description} disabled={!canGlobal} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Gambar</span>
            <ImageUpload value={imageUrl} onChange={setImageUrl} folder="products" disabled={!canGlobal} />
          </div>
          <div className="field">
            <span className="field-label">Status</span>
            <Toggle checked={active} disabled={!canGlobal} onChange={setActive} label={active ? 'Aktif (tampil di kasir)' : 'Nonaktif'} />
          </div>
        </div>
      )}

      {tab === 'variants' && (
        <div className="stack">
          <p className="muted small">
            Variasi utama produk, mis. ukuran Reguler / Large. Bila ada variasi aktif, kasir wajib memilih salah satunya. Tambahan harga 0 berarti harga dasar.
          </p>
          {variants.length === 0 && <EmptyState title="Belum ada variasi" hint="Produk ini dijual dengan satu harga." />}
          {variants.map((v, i) => (
            <div className="row gap-sm" key={v.id ?? `n${i}`}>
              <input
                type="text"
                className="inline-input grow"
                placeholder="Nama variasi (mis. Large)"
                value={v.name}
                disabled={!canGlobal}
                onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                type="number"
                className="inline-input"
                style={{ width: 130 }}
                placeholder="+ Harga"
                value={v.delta}
                disabled={!canGlobal}
                onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, delta: e.target.value } : x)))}
                aria-label="Selisih harga"
              />
              <Toggle checked={v.active} disabled={!canGlobal} onChange={(a) => setVariants(variants.map((x, j) => (j === i ? { ...x, active: a } : x)))} />
              <Button size="sm" variant="ghost" disabled={!canGlobal} onClick={() => setVariants(variants.filter((_, j) => j !== i))} aria-label="Hapus variasi">
                ✕
              </Button>
            </div>
          ))}
          {canGlobal && (
            <div>
              <Button size="sm" onClick={() => setVariants([...variants, { name: '', delta: '0', active: true }])}>
                + Tambah variasi
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'modifiers' && (
        <div className="stack">
          <p className="muted small">Pilih grup pilihan yang muncul saat produk ini dipilih di kasir (tingkat pedas, topping, tambahan). Kelola grup di menu “Variasi & Tambahan”.</p>
          {groups.isLoading ? (
            <Spinner />
          ) : (groups.data ?? []).length === 0 ? (
            <EmptyState title="Belum ada grup pilihan" hint="Buat dulu di menu Variasi & Tambahan." />
          ) : (
            <div className="list-check">
              {(groups.data ?? []).map((g) => (
                <label className="check" key={g.id}>
                  <input
                    type="checkbox"
                    checked={groupIds.has(g.id)}
                    disabled={!canGlobal}
                    onChange={(e) => {
                      const n = new Set(groupIds);
                      if (e.target.checked) n.add(g.id);
                      else n.delete(g.id);
                      setGroupIds(n);
                    }}
                  />
                  <span className="grow">{g.name}</span>
                  <Badge tone={g.is_required ? 'danger' : 'neutral'}>{g.is_required ? 'Wajib' : 'Opsional'}</Badge>
                  {!g.is_active && <Badge>Nonaktif</Badge>}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'recipe' && (
        <div className="stack">
          <p className="muted small">Bahan yang berkurang otomatis dari stok cabang setiap satu porsi produk ini terjual. Kosongkan bila stok tidak dilacak per resep.</p>
          {recipe.map((r, i) => {
            const ing = (ingredients.data ?? []).find((x) => x.id === r.ingredient_id);
            return (
              <div className="row gap-sm" key={i}>
                <select
                  className="inline-input grow"
                  value={r.ingredient_id}
                  disabled={!canGlobal}
                  onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, ingredient_id: e.target.value } : x)))}
                >
                  <option value="">Pilih bahan…</option>
                  {(ingredients.data ?? []).filter((x) => x.is_active || x.id === r.ingredient_id).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="inline-input"
                  style={{ width: 110 }}
                  value={r.quantity}
                  disabled={!canGlobal}
                  onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                  aria-label="Jumlah per porsi"
                />
                <span className="muted small" style={{ width: 50 }}>
                  {ing?.unit ?? ''}
                </span>
                <Button size="sm" variant="ghost" disabled={!canGlobal} onClick={() => setRecipe(recipe.filter((_, j) => j !== i))} aria-label="Hapus bahan">
                  ✕
                </Button>
              </div>
            );
          })}
          {canGlobal && (
            <div>
              <Button size="sm" onClick={() => setRecipe([...recipe, { ingredient_id: '', quantity: '1' }])}>
                + Tambah bahan
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'outlets' && product && <OutletSettings product={product} canEdit={canOutlet} />}
    </Modal>
  );
}

// -------------------------------------------------- Pengaturan per cabang

function OutletSettings({ product, canEdit }: { product: Product; canEdit: boolean }) {
  const { outlets } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['product-outlets', product.id],
    staleTime: 0,
    queryFn: async () => unwrap(await supabase.from('outlet_products').select('*').eq('product_id', product.id)) as OutletProduct[],
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (outlets.length === 0) return <EmptyState title="Belum ada cabang" />;

  return (
    <div className="stack">
      <p className="muted small">
        Tanpa pengaturan khusus, produk tampil di semua cabang dengan harga global ({rupiah(product.base_price)}). Isi harga khusus untuk mengganti harga di satu cabang.
      </p>
      {!canEdit && <Notice tone="info">Anda tidak memiliki izin mengubah pengaturan cabang.</Notice>}
      {outlets.map((o) => (
        <OutletRow
          key={o.id + (q.dataUpdatedAt || 0)}
          outletName={o.name}
          outletActive={o.is_active}
          base={product.base_price}
          initial={(q.data ?? []).find((x) => x.outlet_id === o.id) ?? null}
          canEdit={canEdit}
          onSave={async (v) => {
            try {
              affected(
                await supabase
                  .from('outlet_products')
                  .upsert({ outlet_id: o.id, product_id: product.id, ...v }, { onConflict: 'outlet_id,product_id' })
                  .select('product_id'),
              );
              toast.success(`Pengaturan ${o.name} disimpan`);
              await qc.invalidateQueries({ queryKey: ['product-outlets', product.id] });
              await qc.invalidateQueries({ queryKey: ['outlet-products'] });
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      ))}
    </div>
  );
}

function OutletRow({
  outletName, outletActive, base, initial, canEdit, onSave,
}: {
  outletName: string;
  outletActive: boolean;
  base: number;
  initial: OutletProduct | null;
  canEdit: boolean;
  onSave: (v: { price_override: number | null; is_listed: boolean; is_available: boolean }) => Promise<void>;
}) {
  const [override, setOverride] = useState(initial?.price_override != null ? String(initial.price_override) : '');
  const [listed, setListed] = useState(initial?.is_listed ?? true);
  const [available, setAvailable] = useState(initial?.is_available ?? true);
  const [busy, setBusy] = useState(false);
  const dirty =
    override !== (initial?.price_override != null ? String(initial.price_override) : '') ||
    listed !== (initial?.is_listed ?? true) ||
    available !== (initial?.is_available ?? true);
  return (
    <div className="subtle-box row gap wrap">
      <div style={{ minWidth: 170 }} className="grow">
        <strong>{outletName}</strong> {!outletActive && <Badge>Nonaktif</Badge>}
        <div className="muted small">Harga efektif: {rupiah(override !== '' ? Number(override) : base)}</div>
      </div>
      <Field label="Harga khusus (Rp)">
        <input type="number" min={0} step={500} placeholder={`Ikut global`} style={{ width: 140 }} value={override} disabled={!canEdit} onChange={(e) => setOverride(e.target.value)} />
      </Field>
      <Toggle checked={listed} disabled={!canEdit} onChange={setListed} label="Dijual" />
      <Toggle checked={available} disabled={!canEdit} onChange={setAvailable} label="Tersedia" />
      <Button
        size="sm"
        variant="primary"
        disabled={!canEdit || !dirty}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await onSave({ price_override: override === '' ? null : Number(override), is_listed: listed, is_available: available });
          setBusy(false);
        }}
      >
        Simpan
      </Button>
    </div>
  );
}
