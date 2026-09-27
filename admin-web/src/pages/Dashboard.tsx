import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchBreakdown, fetchSummary, unwrap, useSettings, type ReportFilter } from '../lib/api';
import { ALL_METHODS, addDays, dateTime, isoDate, methodName, number, rupiah, statusLabel, today } from '../lib/format';
import type { OrderRow } from '../lib/types';
import { AnimatedNumber, Badge, Card, EmptyState, ErrorState, Segmented, Skeleton, StatCard, Tabs } from '../components/ui';
import BarChart, { HBars, Sparkline } from '../components/BarChart';
import Icon from '../components/Icon';

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';
type Gran = 'day' | 'week' | 'month';

function mondayOf(d: Date) {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** Membuat deret bucket kosong agar hari/minggu/bulan tanpa penjualan tetap tampil sebagai 0. */
function buildBuckets(gran: Gran): { from: string; to: string; keys: { key: string; label: string; detail: string }[] } {
  const now = new Date();
  const keys: { key: string; label: string; detail: string }[] = [];
  if (gran === 'day') {
    for (let i = 29; i >= 0; i--) {
      const d = addDays(now, -i);
      keys.push({
        key: isoDate(d),
        label: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        detail: d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }),
      });
    }
    return { from: keys[0].key, to: keys[keys.length - 1].key, keys };
  }
  if (gran === 'week') {
    const start = mondayOf(now);
    for (let i = 11; i >= 0; i--) {
      const d = addDays(start, -7 * i);
      keys.push({
        key: isoDate(d),
        label: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        detail: `Minggu mulai ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}`,
      });
    }
    return { from: keys[0].key, to: isoDate(now), keys };
  }
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
      detail: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    });
  }
  const first = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { from: isoDate(first), to: isoDate(now), keys };
}

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  if (p === 'today') return { from: today(), to: today() };
  if (p === '7d') return { from: isoDate(addDays(now, -6)), to: today() };
  if (p === '30d') return { from: isoDate(addDays(now, -29)), to: today() };
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today() };
}

const DAY_MS = 86_400_000;
function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY_MS) + 1;
}

/** Perubahan persen; null bila periode pembanding kosong (tidak bisa dibandingkan). */
function pct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const rangeLabel = (r: { from: string; to: string }) => {
  const f = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
};

function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={18} w={`${90 - i * 12}%`} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { outletId, outlets, profile } = useAuth();
  const settings = useSettings();
  const [preset, setPreset] = useState<Preset>('7d');
  const [custom, setCustom] = useState(presetRange('7d'));
  const [method, setMethod] = useState('');
  const [gran, setGran] = useState<Gran>('day');
  const [showTable, setShowTable] = useState(false);

  const range = preset === 'custom' ? custom : presetRange(preset);
  const validRange = range.from <= range.to;
  const filter: ReportFilter = { ...range, outletId, method: method || null };
  const len = validRange ? daysBetween(range.from, range.to) : 1;
  const prevTo = isoDate(addDays(new Date(`${range.from}T12:00:00`), -1));
  const prevFrom = isoDate(addDays(new Date(`${prevTo}T12:00:00`), -(len - 1)));
  const prevFilter: ReportFilter = { ...filter, from: prevFrom, to: prevTo };
  const fk = [filter.from, filter.to, filter.outletId, filter.method];
  const methods = settings.data?.payment_methods ?? ALL_METHODS;
  const showOutletSplit = !outletId && outlets.length > 1;
  const on = { enabled: validRange };

  const summary = useQuery({ queryKey: ['dash-summary', ...fk], queryFn: () => fetchSummary(filter), ...on });
  const prev = useQuery({ queryKey: ['dash-prev', prevFrom, prevTo, outletId, method], queryFn: () => fetchSummary(prevFilter), ...on });
  const daily = useQuery({ queryKey: ['dash-daily', ...fk], queryFn: () => fetchBreakdown('day', filter), enabled: validRange && len <= 92 });
  const hours = useQuery({ queryKey: ['dash-hours', ...fk], queryFn: () => fetchBreakdown('hour', filter), ...on });
  const top = useQuery({ queryKey: ['dash-top', ...fk], queryFn: () => fetchBreakdown('product', filter), ...on });
  const cashiers = useQuery({ queryKey: ['dash-cashiers', ...fk], queryFn: () => fetchBreakdown('cashier', filter), ...on });
  const byMethod = useQuery({ queryKey: ['dash-method', ...fk], queryFn: () => fetchBreakdown('method', filter), ...on });
  const byOutlet = useQuery({ queryKey: ['dash-outlet', ...fk], queryFn: () => fetchBreakdown('outlet', filter), enabled: validRange && showOutletSplit });

  const buckets = useMemo(() => buildBuckets(gran), [gran]);
  const series = useQuery({
    queryKey: ['dash-series', gran, outletId, method],
    queryFn: async () => {
      const rows = await fetchBreakdown(gran, { from: buckets.from, to: buckets.to, outletId, method: method || null });
      const map = new Map(rows.map((r) => [r.key, r.net]));
      return buckets.keys.map((b) => ({ label: b.label, detail: b.detail, value: map.get(b.key) ?? 0 }));
    },
  });

  const lowStock = useQuery({
    queryKey: ['dash-low', outletId],
    queryFn: async () =>
      unwrap(await supabase.rpc('low_stock_items', { p_outlet: outletId })) as {
        outlet_id: string; outlet_name: string; ingredient_name: string; unit: string; current_stock: number; min_stock: number;
      }[],
  });

  const recent = useQuery({
    queryKey: ['dash-recent', outletId],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select('id, order_number, created_at, total, status, cashier_name, payment_method, outlet_id')
        .order('created_at', { ascending: false })
        .limit(8);
      if (outletId) q = q.eq('outlet_id', outletId);
      return unwrap(await q) as Pick<OrderRow, 'id' | 'order_number' | 'created_at' | 'total' | 'status' | 'cashier_name' | 'payment_method' | 'outlet_id'>[];
    },
  });

  // Deret harian untuk sparkline (hari tanpa penjualan = 0)
  const dailyValues = useMemo(() => {
    if (!daily.data || !validRange) return { net: [] as number[], orders: [] as number[] };
    const map = new Map(daily.data.map((r) => [r.key, r]));
    const net: number[] = [];
    const orders: number[] = [];
    for (let i = 0; i < len; i++) {
      const k = isoDate(addDays(new Date(`${range.from}T12:00:00`), i));
      net.push(map.get(k)?.net ?? 0);
      orders.push(map.get(k)?.orders_count ?? 0);
    }
    return { net, orders };
  }, [daily.data, len, range.from, validRange]);

  const hourSeries = useMemo(() => {
    const map = new Map((hours.data ?? []).map((r) => [r.key, r]));
    return Array.from({ length: 24 }, (_, h) => {
      const k = String(h).padStart(2, '0');
      const r = map.get(k);
      return { label: k, detail: `Pukul ${k}.00–${k}.59 · ${r?.orders_count ?? 0} transaksi`, value: r?.net ?? 0 };
    });
  }, [hours.data]);
  const peak = hourSeries.reduce((a, b) => (b.value > a.value ? b : a), hourSeries[0]);

  const s = summary.data;
  const p = prev.data;
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? '';
  const first = (profile?.full_name ?? '').split(' ')[0];
  const compareHint = 'vs periode sebelumnya';

  return (
    <>
      <section className="hero">
        <div>
          <h1>
            {greeting()}
            {first ? `, ${first}` : ''}!
          </h1>
          <p>
            {outletId ? `Cabang ${outletName(outletId)}` : outlets.length > 1 ? 'Gabungan semua cabang Anda' : 'Ringkasan usaha Anda'} · {rangeLabel(range)}
          </p>
        </div>
        <div className="hero-ctrl">
          <Segmented<Preset>
            label="Periode"
            value={preset}
            onChange={setPreset}
            options={[
              { key: 'today', label: 'Hari ini' },
              { key: '7d', label: '7 hari' },
              { key: '30d', label: '30 hari' },
              { key: 'month', label: 'Bulan ini' },
              { key: 'custom', label: 'Kustom' },
            ]}
          />
          {preset === 'custom' && (
            <>
              <input type="date" aria-label="Dari tanggal" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <input type="date" aria-label="Sampai tanggal" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </>
          )}
          <select aria-label="Metode pembayaran" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Semua metode</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {methodName(m)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {summary.isLoading ? (
        <div className="stats">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="stat" key={i}>
              <Skeleton h={38} w={38} r={12} />
              <Skeleton h={30} w="70%" />
              <Skeleton h={14} w="50%" />
            </div>
          ))}
        </div>
      ) : summary.isError ? (
        <ErrorState error={summary.error} retry={() => void summary.refetch()} />
      ) : (
        s && (
          <div className="stats">
            <StatCard
              label="Omzet"
              icon="wallet"
              tone="brand"
              value={<AnimatedNumber value={s.net_sales} format={rupiah} />}
              delta={p ? pct(s.net_sales, p.net_sales) : undefined}
              hint={compareHint}
              spark={<Sparkline values={dailyValues.net} />}
            />
            <StatCard
              label="Jumlah transaksi"
              icon="receipt"
              value={<AnimatedNumber value={s.orders_count} format={number} />}
              delta={p ? pct(s.orders_count, p.orders_count) : undefined}
              hint={compareHint}
              spark={<Sparkline values={dailyValues.orders} />}
            />
            <StatCard
              label="Rata-rata per transaksi"
              icon="bag"
              value={<AnimatedNumber value={s.avg_order} format={rupiah} />}
              delta={p ? pct(s.avg_order, p.avg_order) : undefined}
              hint={compareHint}
            />
            <StatCard
              label="Diskon diberikan"
              icon="percent"
              value={<AnimatedNumber value={s.discount} format={rupiah} />}
              hint={`Sebelum diskon ${rupiah(s.gross)}`}
            />
            <StatCard
              label="Refund / batal"
              icon="alert"
              tone={s.refund_count + s.void_count > 0 ? 'warning' : undefined}
              value={`${number(s.refund_count)} / ${number(s.void_count)}`}
              hint={`${rupiah(s.refund_total)} refund`}
            />
          </div>
        )
      )}

      <div className="grid-2 mt">
        <Card
          title="Penjualan"
          actions={
            <Tabs<Gran>
              tabs={[
                { key: 'day', label: '30 hari' },
                { key: 'week', label: '12 minggu' },
                { key: 'month', label: '12 bulan' },
              ]}
              value={gran}
              onChange={setGran}
            />
          }
        >
          {series.isLoading ? (
            <Skeleton h={230} r={14} />
          ) : series.isError ? (
            <ErrorState error={series.error} retry={() => void series.refetch()} />
          ) : (
            series.data && (
              <>
                <BarChart
                  data={series.data}
                  format={rupiah}
                  ariaLabel={`Omzet ${gran === 'day' ? 'harian' : gran === 'week' ? 'mingguan' : 'bulanan'}`}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)}>
                  {showTable ? 'Sembunyikan tabel' : 'Lihat sebagai tabel'}
                </button>
                {showTable && (
                  <table className="table">
                    <tbody>
                      {series.data.map((d) => (
                        <tr key={d.label}>
                          <td>{d.detail}</td>
                          <td className="right mono">{rupiah(d.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )
          )}
        </Card>

        <Card title="Produk terlaris">
          {top.isLoading ? (
            <CardSkeleton rows={5} />
          ) : top.isError ? (
            <ErrorState error={top.error} />
          ) : (top.data ?? []).length === 0 ? (
            <EmptyState icon="bowl" title="Belum ada penjualan" hint="pada periode ini" />
          ) : (
            <HBars rows={(top.data ?? []).slice(0, 6).map((r) => ({ label: r.label, value: r.net, sub: `${number(r.quantity)}x` }))} format={rupiah} />
          )}
        </Card>
      </div>

      <div className="grid-eq mt">
        <Card
          title="Jam ramai"
          actions={peak && peak.value > 0 ? <Badge tone="brand" dot>Puncak pukul {peak.label}.00</Badge> : undefined}
        >
          {hours.isLoading ? (
            <Skeleton h={190} r={14} />
          ) : hours.isError ? (
            <ErrorState error={hours.error} />
          ) : (
            <BarChart data={hourSeries} format={rupiah} ariaLabel="Omzet per jam" height={210} />
          )}
        </Card>

        <Card title={showOutletSplit ? 'Omzet per cabang' : 'Kasir terbaik'}>
          {(showOutletSplit ? byOutlet : cashiers).isLoading ? (
            <CardSkeleton rows={4} />
          ) : ((showOutletSplit ? byOutlet.data : cashiers.data) ?? []).length === 0 ? (
            <EmptyState icon="users" title="Belum ada data" />
          ) : (
            <HBars
              rows={((showOutletSplit ? byOutlet.data : cashiers.data) ?? []).slice(0, 6).map((r) => ({
                label: r.label,
                value: r.net,
                sub: `${number(r.orders_count)} trx`,
              }))}
              format={rupiah}
            />
          )}
        </Card>
      </div>

      <div className="grid-eq mt">
        <Card title="Metode pembayaran">
          {byMethod.isLoading ? (
            <CardSkeleton rows={3} />
          ) : (byMethod.data ?? []).length === 0 ? (
            <EmptyState icon="wallet" title="Belum ada data" />
          ) : (
            <HBars
              rows={(byMethod.data ?? []).map((r) => ({
                label: methodName(r.label),
                value: r.net,
                sub: `${s && s.net_sales > 0 ? Math.round((r.net / s.net_sales) * 100) : 0}%`,
              }))}
              format={rupiah}
            />
          )}
        </Card>

        <Card title="Stok menipis" actions={<Link to="/stok">Kelola stok</Link>}>
          {lowStock.isLoading ? (
            <CardSkeleton rows={4} />
          ) : lowStock.isError ? (
            <ErrorState error={lowStock.error} />
          ) : (lowStock.data ?? []).length === 0 ? (
            <EmptyState icon="checkCircle" title="Semua stok aman" />
          ) : (
            <table className="table">
              <tbody>
                {(lowStock.data ?? []).slice(0, 6).map((r) => (
                  <tr key={r.outlet_id + r.ingredient_name}>
                    <td>
                      <strong>{r.ingredient_name}</strong>
                      {!outletId && <div className="muted small">{r.outlet_name}</div>}
                    </td>
                    <td className="right mono">
                      {number(r.current_stock)} {r.unit}
                    </td>
                    <td className="right">
                      <Badge tone={Number(r.current_stock) <= 0 ? 'danger' : 'warning'} dot>
                        {Number(r.current_stock) <= 0 ? 'Habis' : 'Menipis'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt">
        <Card title="Transaksi terbaru" actions={<Link to="/transaksi">Lihat semua <Icon name="arrowRight" style={{ verticalAlign: '-2px' }} /></Link>} flush>
          {recent.isLoading ? (
            <div className="card-body">
              <CardSkeleton rows={5} />
            </div>
          ) : recent.isError ? (
            <ErrorState error={recent.error} />
          ) : (recent.data ?? []).length === 0 ? (
            <EmptyState icon="receipt" title="Belum ada transaksi" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {(recent.data ?? []).map((o) => (
                    <tr key={o.id}>
                      <td className="mono">{o.order_number}</td>
                      <td>{dateTime(o.created_at)}</td>
                      <td>{o.cashier_name}</td>
                      <td>{methodName(o.payment_method)}</td>
                      <td>
                        <Badge tone={o.status === 'completed' ? 'success' : o.status === 'void' ? 'neutral' : 'warning'} dot>
                          {statusLabel[o.status]}
                        </Badge>
                      </td>
                      <td className="right mono">
                        <strong>{rupiah(o.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
