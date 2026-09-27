import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { fetchBreakdown, fetchSummary, useSettings, type ReportFilter } from '../lib/api';
import { ALL_METHODS, addDays, isoDate, methodName, number, rupiah, today } from '../lib/format';
import { downloadFile, toCsv } from '../lib/csv';
import type { BreakdownRow } from '../lib/types';
import { Button, Card, DataTable, EmptyState, ErrorState, Field, Notice, PageHeader, Spinner, StatCard, Tabs } from '../components/ui';

type Tab = 'summary' | 'day' | 'week' | 'month' | 'hour' | 'product' | 'category' | 'cashier' | 'outlet' | 'method';
type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Ringkasan' },
  { key: 'day', label: 'Harian' },
  { key: 'week', label: 'Mingguan' },
  { key: 'month', label: 'Bulanan' },
  { key: 'hour', label: 'Per jam' },
  { key: 'product', label: 'Per produk' },
  { key: 'category', label: 'Per kategori' },
  { key: 'cashier', label: 'Per kasir' },
  { key: 'outlet', label: 'Per cabang' },
  { key: 'method', label: 'Per metode bayar' },
];

const KEY_HEADER: Record<string, string> = {
  day: 'Tanggal', week: 'Minggu mulai', month: 'Bulan', hour: 'Jam', product: 'Produk', category: 'Kategori', cashier: 'Kasir', outlet: 'Cabang', method: 'Metode',
};

function presetRange(p: Preset) {
  const now = new Date();
  if (p === 'today') return { from: today(), to: today() };
  if (p === '7d') return { from: isoDate(addDays(now, -6)), to: today() };
  if (p === '30d') return { from: isoDate(addDays(now, -29)), to: today() };
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today() };
}

/** Rentang tanggal transaksi yang mewakili satu baris laporan (untuk penelusuran ke transaksi sumber). */
function drillRange(tab: Tab, key: string, fallback: { from: string; to: string }) {
  if (tab === 'day') return { from: key, to: key };
  if (tab === 'week') return { from: key, to: isoDate(addDays(new Date(`${key}T12:00:00`), 6)) };
  if (tab === 'month') {
    const [y, m] = key.split('-').map(Number);
    return { from: `${key}-01`, to: isoDate(new Date(y, m, 0)) };
  }
  return fallback;
}

export default function ReportsPage() {
  const { outletId, outlets } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('summary');
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState(presetRange('30d'));
  const [method, setMethod] = useState('');

  const range = preset === 'custom' ? custom : presetRange(preset);
  const invalid = range.from > range.to;
  const filter: ReportFilter = { ...range, outletId, method: method || null };
  const fk = [range.from, range.to, outletId, method];
  const methods = settings.data?.payment_methods ?? ALL_METHODS;

  const summary = useQuery({ queryKey: ['rep-summary', ...fk], queryFn: () => fetchSummary(filter), enabled: !invalid });
  const breakdown = useQuery({
    queryKey: ['rep-breakdown', tab, ...fk],
    queryFn: () => fetchBreakdown(tab, filter),
    enabled: tab !== 'summary' && !invalid,
  });

  const label = (r: BreakdownRow) => (tab === 'method' ? methodName(r.label) : tab === 'hour' ? `${r.label}.00–${r.label}.59` : r.label);

  function drill(r: BreakdownRow) {
    const d = drillRange(tab, r.key, range);
    const p = new URLSearchParams({ from: d.from, to: d.to });
    if (outletId) p.set('outlet', outletId);
    if (method) p.set('method', method);
    if (tab === 'outlet') p.set('outlet', r.key);
    if (tab === 'method') p.set('method', r.key);
    if (tab === 'cashier' && /^[0-9a-f-]{36}$/i.test(r.key)) p.set('cashier', r.key);
    if (tab === 'product') p.set('product', r.key);
    if (tab === 'category' && r.key !== '-') p.set('category', r.key);
    navigate(`/transaksi?${p.toString()}`);
  }

  function exportCsv() {
    if (tab === 'summary' && summary.data) {
      const s = summary.data;
      const rows = [
        ['Omzet', s.net_sales], ['Sebelum diskon', s.gross], ['Diskon', s.discount], ['Pajak', s.tax], ['Jumlah transaksi', s.orders_count],
        ['Rata-rata per transaksi', s.avg_order], ['Jumlah refund', s.refund_count], ['Nilai refund', s.refund_total], ['Jumlah batal', s.void_count], ['Nilai batal', s.void_total],
      ] as [string, number][];
      downloadFile(`laporan-ringkasan-${range.from}_${range.to}.csv`, toCsv(rows, [{ header: 'Keterangan', value: (r) => r[0] }, { header: 'Nilai', value: (r) => r[1] }]));
      return;
    }
    const isSeries = tab === 'day' || tab === 'week' || tab === 'month' || tab === 'hour';
    downloadFile(
      `laporan-${tab}-${range.from}_${range.to}.csv`,
      toCsv(breakdown.data ?? [], [
        { header: KEY_HEADER[tab], value: (r) => label(r) },
        { header: 'Jumlah transaksi', value: (r) => r.orders_count },
        { header: 'Jumlah item', value: (r) => r.quantity },
        { header: tab === 'product' || tab === 'category' ? 'Penjualan (sebelum diskon transaksi)' : 'Penjualan sebelum diskon', value: (r) => r.gross },
        { header: 'Diskon', value: (r) => (isSeries || tab === 'cashier' || tab === 'outlet' || tab === 'method' ? r.discount : '') },
        { header: 'Omzet', value: (r) => r.net },
      ]),
    );
  }

  const data = breakdown.data ?? [];
  const totals = data.reduce(
    (a, r) => ({ orders: a.orders + r.orders_count, qty: a.qty + r.quantity, gross: a.gross + r.gross, disc: a.disc + r.discount, net: a.net + r.net }),
    { orders: 0, qty: 0, gross: 0, disc: 0, net: 0 },
  );
  const itemLevel = tab === 'product' || tab === 'category';

  return (
    <>
      <PageHeader
        title="Laporan"
        subtitle={outletId ? `Cabang ${outlets.find((o) => o.id === outletId)?.name}` : 'Gabungan seluruh cabang yang dapat Anda akses. Pilih cabang di atas untuk laporan per cabang.'}
        actions={
          <Button onClick={exportCsv} disabled={invalid || (tab === 'summary' ? !summary.data : data.length === 0)}>
            ⬇ Ekspor CSV
          </Button>
        }
      />

      <div className="filters">
        <Field label="Periode">
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="today">Hari ini</option>
            <option value="7d">7 hari terakhir</option>
            <option value="30d">30 hari terakhir</option>
            <option value="month">Bulan ini</option>
            <option value="custom">Rentang tanggal…</option>
          </select>
        </Field>
        {preset === 'custom' && (
          <>
            <Field label="Dari">
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            </Field>
            <Field label="Sampai">
              <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Metode pembayaran">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Semua metode</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {methodName(m)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {invalid && <Notice tone="warning">Tanggal awal tidak boleh setelah tanggal akhir.</Notice>}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'summary' ? (
        summary.isLoading ? (
          <Spinner />
        ) : summary.isError ? (
          <ErrorState error={summary.error} retry={() => void summary.refetch()} />
        ) : (
          summary.data && (
            <div className="stack">
              <div className="stats">
                <StatCard label="Omzet" value={rupiah(summary.data.net_sales)} tone="brand" hint="Total transaksi selesai setelah diskon" />
                <StatCard label="Jumlah transaksi" value={number(summary.data.orders_count)} />
                <StatCard label="Rata-rata per transaksi" value={rupiah(summary.data.avg_order)} />
                <StatCard label="Penjualan sebelum diskon" value={rupiah(summary.data.gross)} />
                <StatCard label="Diskon" value={rupiah(summary.data.discount)} />
                <StatCard label="Pajak" value={rupiah(summary.data.tax)} />
                <StatCard label="Refund" value={rupiah(summary.data.refund_total)} tone={summary.data.refund_count ? 'warning' : undefined} hint={`${number(summary.data.refund_count)} transaksi`} />
                <StatCard label="Dibatalkan" value={rupiah(summary.data.void_total)} hint={`${number(summary.data.void_count)} transaksi`} />
              </div>
              <Notice tone="info">
                Omzet hanya menghitung transaksi berstatus <strong>Selesai</strong>; refund dan pembatalan ditampilkan terpisah. Tanggal mengikuti zona waktu usaha ({settings.data?.timezone ?? 'Asia/Jakarta'}). Buka tab lain lalu klik sebuah baris untuk menelusuri transaksi sumbernya.
              </Notice>
            </div>
          )
        )
      ) : (
        <Card flush>
          {breakdown.isLoading ? (
            <Spinner />
          ) : breakdown.isError ? (
            <ErrorState error={breakdown.error} retry={() => void breakdown.refetch()} />
          ) : (
            <>
              <DataTable
                rows={data}
                rowKey={(r) => r.key + r.label}
                onRowClick={drill}
                empty={<EmptyState title="Tidak ada penjualan" hint="Tidak ada transaksi selesai pada periode dan filter ini." />}
                columns={[
                  { header: KEY_HEADER[tab], cell: (r) => <strong>{label(r)}</strong> },
                  { header: 'Transaksi', align: 'right', cell: (r) => number(r.orders_count) },
                  { header: 'Item terjual', align: 'right', cell: (r) => number(r.quantity) },
                  { header: itemLevel ? 'Penjualan' : 'Sebelum diskon', align: 'right', cell: (r) => <span className="mono">{rupiah(r.gross)}</span> },
                  ...(itemLevel ? [] : [{ header: 'Diskon', align: 'right' as const, cell: (r: BreakdownRow) => <span className="mono">{rupiah(r.discount)}</span> }]),
                  ...(itemLevel ? [] : [{ header: 'Omzet', align: 'right' as const, cell: (r: BreakdownRow) => <strong className="mono">{rupiah(r.net)}</strong> }]),
                ]}
              />
              {data.length > 0 && (
                <div className="pagination">
                  <strong>Total</strong>
                  <span className="mono">
                    {itemLevel ? '' : `${number(totals.orders)} transaksi · `}
                    {number(totals.qty)} item · {rupiah(itemLevel ? totals.gross : totals.net)}
                  </span>
                </div>
              )}
              {itemLevel && data.length > 0 && (
                <div style={{ padding: '0 14px 14px' }}>
                  <span className="muted small">Angka per produk/kategori dihitung dari baris item sebelum diskon tingkat transaksi. Jumlah transaksi dapat tumpang tindih antar baris.</span>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </>
  );
}
