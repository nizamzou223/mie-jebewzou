import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { affected, unwrap, useSettings } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ALL_METHODS, methodLabel } from '../lib/format';
import { PERMISSIONS } from '../lib/permissions';
import type { BusinessSettings, DayHours, Discount } from '../lib/types';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner, Tabs, Toggle, useToast } from '../components/ui';
import HoursEditor, { normalizeHours } from '../components/HoursEditor';
import ImageUpload from '../components/ImageUpload';
import Receipt from '../components/Receipt';

type Tab = 'business' | 'receipt' | 'payment' | 'discounts' | 'permissions';

export default function SettingsPage() {
  const { isOwner } = useAuth();
  const [tab, setTab] = useState<Tab>(isOwner ? 'business' : 'discounts');
  const tabs: { key: Tab; label: string }[] = isOwner
    ? [
        { key: 'business', label: 'Usaha' },
        { key: 'receipt', label: 'Struk' },
        { key: 'payment', label: 'Pembayaran & pajak' },
        { key: 'discounts', label: 'Diskon' },
        { key: 'permissions', label: 'Hak akses role' },
      ]
    : [{ key: 'discounts', label: 'Diskon' }];

  return (
    <>
      <PageHeader title="Pengaturan" subtitle={isOwner ? 'Pengaturan usaha yang berlaku untuk seluruh cabang.' : 'Kelola diskon untuk cabang Anda.'} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'business' && <BusinessTab />}
      {tab === 'receipt' && <ReceiptTab />}
      {tab === 'payment' && <PaymentTab />}
      {tab === 'discounts' && <DiscountsTab />}
      {tab === 'permissions' && <PermissionsTab />}
    </>
  );
}

/** Menyimpan sebagian kolom business_settings (satu baris, id = true). */
function useSaveSettings(okMsg: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (patch: Partial<BusinessSettings>) => affected(await supabase.from('business_settings').update(patch).eq('id', true).select('id')),
    onSuccess: async () => {
      toast.success(okMsg);
      await qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(e),
  });
}

function SettingsLoader({ children }: { children: (s: BusinessSettings) => React.ReactNode }) {
  const q = useSettings();
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <EmptyState title="Pengaturan belum tersedia" hint="Jalankan migration database terlebih dahulu." />;
  return <>{children(q.data)}</>;
}

// ------------------------------------------------------------------ Usaha
function BusinessTab() {
  return <SettingsLoader>{(s) => <BusinessForm s={s} />}</SettingsLoader>;
}

const TIMEZONES = [
  ['Asia/Jakarta', 'WIB — Asia/Jakarta'],
  ['Asia/Makassar', 'WITA — Asia/Makassar'],
  ['Asia/Jayapura', 'WIT — Asia/Jayapura'],
];

function BusinessForm({ s }: { s: BusinessSettings }) {
  const save = useSaveSettings('Pengaturan usaha disimpan');
  const [name, setName] = useState(s.business_name);
  const [logo, setLogo] = useState(s.logo_url);
  const [address, setAddress] = useState(s.address ?? '');
  const [phone, setPhone] = useState(s.phone ?? '');
  const [tz, setTz] = useState(s.timezone);
  const [hours, setHours] = useState<Record<string, DayHours>>(normalizeHours(s.opening_hours));
  const [block, setBlock] = useState(s.block_negative_stock);
  return (
    <Card
      title="Profil usaha"
      actions={
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={!name.trim()}
          onClick={() =>
            save.mutate({ business_name: name.trim(), logo_url: logo, address: address.trim() || null, phone: phone.trim() || null, timezone: tz, opening_hours: hours, block_negative_stock: block })
          }
        >
          Simpan
        </Button>
      }
    >
      <div className="form-grid">
        <Field label="Nama usaha">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="field">
          <span className="field-label">Logo</span>
          <ImageUpload value={logo} onChange={setLogo} folder="branding" placeholder="Logo" />
        </div>
        <Field label="Alamat kantor / pusat">
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Kontak (telepon/WhatsApp)">
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Zona waktu" hint="Menentukan batas hari untuk laporan dan penomoran transaksi harian.">
          <select value={tz} onChange={(e) => setTz(e.target.value)}>
            {TIMEZONES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Stok bahan tidak cukup</span>
          <Toggle checked={block} onChange={setBlock} label={block ? 'Tolak penjualan bila stok kurang' : 'Izinkan penjualan (stok boleh minus)'} />
          <span className="field-hint">Transaksi yang dicatat saat offline tidak pernah ditolak.</span>
        </div>
        <div className="full">
          <h3 style={{ marginBottom: 8 }}>Jam operasional usaha</h3>
          <p className="muted small">Jam khusus tiap cabang diatur di menu Cabang.</p>
          <HoursEditor value={hours} onChange={setHours} />
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ Struk
function ReceiptTab() {
  return <SettingsLoader>{(s) => <ReceiptForm s={s} />}</SettingsLoader>;
}

function ReceiptForm({ s }: { s: BusinessSettings }) {
  const save = useSaveSettings('Format struk disimpan');
  const [header, setHeader] = useState(s.receipt_header ?? '');
  const [footer, setFooter] = useState(s.receipt_footer);
  const draft = { ...s, receipt_header: header, receipt_footer: footer };
  return (
    <div className="grid-eq">
      <Card
        title="Format struk"
        actions={
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ receipt_header: header.trim() || null, receipt_footer: footer.trim() })}>
            Simpan
          </Button>
        }
      >
        <div className="stack">
          <Field label="Teks di atas struk" hint="mis. slogan atau nomor izin usaha">
            <textarea rows={2} value={header} onChange={(e) => setHeader(e.target.value)} />
          </Field>
          <Field label="Teks di bawah struk">
            <textarea rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
          </Field>
          <p className="muted small">Nama, alamat, dan telepon pada struk mengikuti data masing-masing cabang. Logo diambil dari tab Usaha.</p>
        </div>
      </Card>
      <Card title="Contoh tampilan">
        <Receipt
          settings={draft}
          data={{
            order_number: 'KODE-20260101-0001',
            status: 'completed',
            created_at: new Date().toISOString(),
            cashier_name: 'Nama Kasir',
            outlet: { name: 'Nama Cabang', code: 'KODE', address: 'Alamat cabang', phone: '021-000000' },
            subtotal: 38000,
            discount_name: null,
            discount_total: 0,
            tax_name: null,
            tax_rate: 0,
            tax_total: 0,
            total: 38000,
            payment_method: 'cash',
            payment: { method: 'cash', amount: 38000, received: 50000, change: 12000 },
            note: null,
            items: [{ product_name: 'Contoh Produk', variant_name: null, quantity: 2, unit_price: 19000, line_total: 38000, note: null, modifiers: [{ group_name: 'Pedas', name: 'Level 2', price_delta: 0 }] }],
          }}
        />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Pembayaran & pajak
function PaymentTab() {
  return <SettingsLoader>{(s) => <PaymentForm s={s} />}</SettingsLoader>;
}

function PaymentForm({ s }: { s: BusinessSettings }) {
  const save = useSaveSettings('Pengaturan pembayaran & pajak disimpan');
  const [methods, setMethods] = useState<string[]>(s.payment_methods);
  const [taxOn, setTaxOn] = useState(s.tax_enabled);
  const [taxName, setTaxName] = useState(s.tax_name);
  const [rate, setRate] = useState(String(s.tax_rate));
  const rateN = Number(rate);
  const valid = methods.length > 0 && (!taxOn || (taxName.trim() && rateN > 0 && rateN <= 100));
  return (
    <div className="stack">
      <Card
        title="Metode pembayaran yang diaktifkan"
        actions={
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!valid}
            onClick={() => save.mutate({ payment_methods: methods, tax_enabled: taxOn, tax_name: taxName.trim() || 'PPN', tax_rate: taxOn ? rateN : Number(rate) || 0 })}
          >
            Simpan
          </Button>
        }
      >
        <div className="chips" style={{ gap: 16 }}>
          {ALL_METHODS.map((m) => (
            <label className="check" key={m}>
              <input type="checkbox" checked={methods.includes(m)} onChange={(e) => setMethods(e.target.checked ? [...methods, m] : methods.filter((x) => x !== m))} />
              {methodLabel[m]}
            </label>
          ))}
        </div>
        {methods.length === 0 && <Notice tone="warning">Aktifkan minimal satu metode pembayaran.</Notice>}
        <p className="muted small mt">QRIS, debit, dan transfer dicatat sebagai metode pembayaran saja; sistem tidak terhubung ke penyedia pembayaran.</p>
      </Card>
      <Card title="Pajak">
        <div className="stack">
          <Notice tone="info">Pajak tidak diterapkan otomatis. Aktifkan hanya bila usaha Anda memang memungut pajak; tarif dihitung dari total setelah diskon dan ditambahkan di atas harga.</Notice>
          <Toggle checked={taxOn} onChange={setTaxOn} label={taxOn ? 'Pajak diterapkan pada semua transaksi baru' : 'Pajak tidak diterapkan'} />
          <div className="form-grid">
            <Field label="Nama pajak">
              <input type="text" value={taxName} disabled={!taxOn} onChange={(e) => setTaxName(e.target.value)} />
            </Field>
            <Field label="Tarif (%)" error={taxOn && !(rateN > 0 && rateN <= 100) ? 'Isi tarif antara 0,01 dan 100' : undefined}>
              <input type="number" min={0} max={100} step="0.01" value={rate} disabled={!taxOn} onChange={(e) => setRate(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Diskon
function DiscountsTab() {
  const { outlets, isOwner, can, outletId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const canManage = can('discount.manage');
  const [editing, setEditing] = useState<Discount | 'new' | null>(null);
  const [removing, setRemoving] = useState<Discount | null>(null);

  const q = useQuery({
    queryKey: ['discounts'],
    queryFn: async () => unwrap(await supabase.from('discounts').select('*').order('name')) as Discount[],
  });
  const scopeName = (d: Discount) => (d.outlet_id ? outlets.find((o) => o.id === d.outlet_id)?.name ?? 'Cabang' : 'Semua cabang');
  const canEditRow = (d: Discount) => canManage && (isOwner || d.outlet_id !== null);
  const shown = (q.data ?? []).filter((d) => !outletId || d.outlet_id === null || d.outlet_id === outletId);

  const toggle = useMutation({
    mutationFn: async (d: Discount) => affected(await supabase.from('discounts').update({ is_active: !d.is_active }).eq('id', d.id).select('id')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discounts'] }),
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <div className="row between wrap gap" style={{ marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          Diskon yang tersedia untuk kasir yang berizin. Diskon “Semua cabang” hanya dapat dikelola owner.
        </p>
        {canManage && (
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Tambah diskon
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
            rows={shown}
            rowKey={(d) => d.id}
            empty={<EmptyState title="Belum ada diskon" />}
            columns={[
              { header: 'Nama', cell: (d) => <strong>{d.name}</strong> },
              { header: 'Nilai', cell: (d) => (d.type === 'percent' ? `${Number(d.value)}%` : `Rp ${Number(d.value).toLocaleString('id-ID')}`) },
              { header: 'Berlaku di', cell: (d) => <Badge tone={d.outlet_id ? 'info' : 'brand'}>{scopeName(d)}</Badge> },
              {
                header: 'Status',
                cell: (d) => <Toggle checked={d.is_active} disabled={!canEditRow(d) || toggle.isPending} onChange={() => toggle.mutate(d)} label={d.is_active ? 'Aktif' : 'Nonaktif'} />,
              },
              {
                header: '',
                align: 'right',
                cell: (d) =>
                  canEditRow(d) && (
                    <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => setEditing(d)}>Ubah</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(d)}>Hapus</Button>
                    </div>
                  ),
              },
            ]}
          />
        )}
      </div>
      {editing && (
        <DiscountForm
          discount={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success('Diskon disimpan');
            await qc.invalidateQueries({ queryKey: ['discounts'] });
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Hapus diskon?"
          message={`Diskon "${removing.name}" akan dihapus. Transaksi lama tidak berubah. Untuk menyembunyikan sementara, cukup nonaktifkan.`}
          danger
          confirmLabel="Hapus"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            affected(await supabase.from('discounts').delete().eq('id', removing.id).select('id'));
            toast.success('Diskon dihapus');
            await qc.invalidateQueries({ queryKey: ['discounts'] });
          }}
        />
      )}
    </>
  );
}

function DiscountForm({ discount, onClose, onSaved }: { discount: Discount | null; onClose: () => void; onSaved: () => void }) {
  const { outlets, isOwner, outletId } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(discount?.name ?? '');
  const [type, setType] = useState<'percent' | 'fixed'>(discount?.type ?? 'percent');
  const [value, setValue] = useState(discount ? String(discount.value) : '');
  const [scope, setScope] = useState<string>(discount ? discount.outlet_id ?? '' : isOwner ? '' : outletId ?? outlets[0]?.id ?? '');
  const v = Number(value);
  useEffect(() => {
    if (type === 'percent' && v > 100) setValue('100');
  }, [type, v]);
  const valid = name.trim() && v > 0 && (type !== 'percent' || v <= 100) && (isOwner || scope);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), type, value: v, outlet_id: scope || null };
      if (discount) affected(await supabase.from('discounts').update(payload).eq('id', discount.id).select('id'));
      else unwrap(await supabase.from('discounts').insert(payload).select('id'));
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      title={discount ? 'Ubah diskon' : 'Tambah diskon'}
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
        <Field label="Nama diskon">
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Promo Akhir Pekan" />
        </Field>
        <div className="form-grid">
          <Field label="Jenis">
            <select value={type} onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}>
              <option value="percent">Persen (%)</option>
              <option value="fixed">Potongan (Rp)</option>
            </select>
          </Field>
          <Field label={type === 'percent' ? 'Persentase' : 'Nominal (Rp)'}>
            <input type="number" min={0} step={type === 'percent' ? 1 : 500} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
        <Field label="Berlaku di">
          <select value={scope} disabled={!!discount && !isOwner} onChange={(e) => setScope(e.target.value)}>
            {isOwner && <option value="">Semua cabang</option>}
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Hak akses
function PermissionsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => unwrap(await supabase.from('role_permissions').select('*')) as { role: 'admin' | 'cashier'; permission: string }[],
  });
  const has = (role: string, perm: string) => (q.data ?? []).some((r) => r.role === role && r.permission === perm);

  const toggle = useMutation({
    mutationFn: async ({ role, perm, on }: { role: 'admin' | 'cashier'; perm: string; on: boolean }) => {
      if (on) unwrap(await supabase.from('role_permissions').insert({ role, permission: perm }).select('role'));
      else affected(await supabase.from('role_permissions').delete().eq('role', role).eq('permission', perm).select('role'));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['role-permissions'] });
      toast.success('Hak akses diperbarui. Berlaku saat pengguna membuka ulang aplikasi/halaman.');
    },
    onError: (e) => toast.error(e),
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;

  return (
    <div className="stack">
      <Notice tone="info">
        Owner selalu memiliki semua izin. Pengelolaan cabang dan pengaturan usaha hanya untuk owner. Admin Cabang dan Kasir selalu dibatasi pada cabang yang ditugaskan, apa pun izinnya.
      </Notice>
      <div className="card">
        <DataTable
          rows={PERMISSIONS}
          rowKey={(p) => p.key}
          columns={[
            {
              header: 'Izin',
              cell: (p) => (
                <>
                  <strong>{p.label}</strong>
                  {p.hint && <div className="muted small">{p.hint}</div>}
                </>
              ),
            },
            {
              header: 'Admin Cabang',
              align: 'center',
              width: '140px',
              cell: (p) => <input type="checkbox" checked={has('admin', p.key)} disabled={toggle.isPending} onChange={(e) => toggle.mutate({ role: 'admin', perm: p.key, on: e.target.checked })} aria-label={`${p.label} untuk Admin Cabang`} />,
            },
            {
              header: 'Kasir',
              align: 'center',
              width: '120px',
              cell: (p) => <input type="checkbox" checked={has('cashier', p.key)} disabled={toggle.isPending} onChange={(e) => toggle.mutate({ role: 'cashier', perm: p.key, on: e.target.checked })} aria-label={`${p.label} untuk Kasir`} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
