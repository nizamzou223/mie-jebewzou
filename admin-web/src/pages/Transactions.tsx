import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { unwrap, useSettings } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ALL_METHODS, addDays, dateTime, isoDate, methodName, nextDay, rupiah, statusLabel, today, zonedDayStart } from '../lib/format';
import { downloadFile } from '../lib/csv';
import type { BusinessSettings, OrderRow, Profile, ReceiptData } from '../lib/types';
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, Spinner, useDebounced, useToast } from '../components/ui';
import Receipt, { receiptText } from '../components/Receipt';

const PAGE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const statusTone = (s: string) => (s === 'completed' ? 'success' : s === 'void' ? 'neutral' : 'warning');

export default function TransactionsPage() {
  const { outletId, setOutletId, outlets } = useAuth();
  const settings = useSettings();
  const tz = settings.data?.timezone ?? 'Asia/Jakarta';
  const [params, setParams] = useSearchParams();

  // Filter awal dapat berasal dari tautan laporan (?from=&to=&outlet=&cashier=&method=&product=&category=)
  const [from, setFrom] = useState(params.get('from') ?? isoDate(addDays(new Date(), -6)));
  const [to, setTo] = useState(params.get('to') ?? today());
  const [cashier, setCashier] = useState(params.get('cashier') ?? '');
  const [method, setMethod] = useState(params.get('method') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [product, setProduct] = useState(params.get('product') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const dSearch = useDebounced(search);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const o = params.get('outlet');
    if (o && outlets.some((x) => x.id === o)) setOutletId(o);
    // hanya dijalankan sekali saat halaman dibuka dari tautan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setPage(0), [from, to, cashier, method, status, product, category, dSearch, outletId]);

  const users = useQuery({
    queryKey: ['tx-users'],
    queryFn: async () => unwrap(await supabase.from('profiles').select('id, full_name, role').order('full_name')) as Pick<Profile, 'id' | 'full_name' | 'role'>[],
  });

  const linked = product || category;
  const q = useQuery({
    queryKey: ['transactions', from, to, outletId, cashier, method, status, product, category, dSearch, page, tz],
    queryFn: async () => {
      let req = supabase
        .from('orders')
        .select(linked ? '*, order_items!inner(product_id, product_name, category_name)' : '*', { count: 'exact' })
        .gte('created_at', zonedDayStart(from, tz))
        .lt('created_at', zonedDayStart(nextDay(to), tz))
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (outletId) req = req.eq('outlet_id', outletId);
      if (cashier) req = req.eq('cashier_id', cashier);
      if (method) req = req.eq('payment_method', method);
      if (status) req = req.eq('status', status);
      if (dSearch.trim()) req = req.ilike('order_number', `%${dSearch.trim()}%`);
      if (product) req = UUID.test(product) ? req.eq('order_items.product_id', product) : req.eq('order_items.product_name', product);
      if (category) req = req.eq('order_items.category_name', category);
      const { data, error, count } = await req;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as unknown as OrderRow[], count: count ?? 0 };
    },
  });

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? '-';
  const clearLink = () => {
    setProduct('');
    setCategory('');
    setParams({}, { replace: true });
  };
  const methods = settings.data?.payment_methods ?? ALL_METHODS;
  const invalidRange = from > to;

  const totals = useMemo(() => (q.data?.rows ?? []).filter((r) => r.status === 'completed').reduce((a, r) => a + Number(r.total), 0), [q.data]);

  return (
    <>
      <PageHeader title="Transaksi" subtitle="Semua transaksi sesuai hak akses Anda. Klik baris untuk melihat detail, mencetak struk, atau membatalkan." />

      {linked && (
        <div className="row gap-sm wrap" style={{ marginBottom: 12 }}>
          <span className="muted small">Difilter dari laporan:</span>
          {product && <Badge tone="brand">Produk: {UUID.test(product) ? 'dipilih' : product}</Badge>}
          {category && <Badge tone="brand">Kategori: {category}</Badge>}
          <Button size="sm" variant="ghost" onClick={clearLink}>
            Hapus filter ✕
          </Button>
        </div>
      )}

      <div className="filters">
        <Field label="Dari tanggal">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Sampai tanggal">
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Kasir">
          <select value={cashier} onChange={(e) => setCashier(e.target.value)}>
            <option value="">Semua kasir</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Metode">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Semua metode</option>
            {[...new Set([...methods, ...ALL_METHODS])].map((m) => (
              <option key={m} value={m}>
                {methodName(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            {Object.entries(statusLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="No. transaksi">
          <input type="search" placeholder="mis. JBA-2026…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
      </div>

      {invalidRange && <Notice tone="warning">Tanggal awal tidak boleh setelah tanggal akhir.</Notice>}

      <div className="card mt">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : (
          <>
            <DataTable
              rows={q.data?.rows ?? []}
              rowKey={(o) => o.id}
              onRowClick={(o) => setOpenId(o.id)}
              empty={<EmptyState title="Tidak ada transaksi" hint="Coba ubah rentang tanggal atau filter lainnya." />}
              columns={[
                { header: 'No. transaksi', cell: (o) => <span className="mono">{o.order_number}</span> },
                { header: 'Waktu', cell: (o) => <span className="nowrap">{dateTime(o.created_at)}</span> },
                ...(!outletId ? [{ header: 'Cabang', cell: (o: OrderRow) => outletName(o.outlet_id) }] : []),
                { header: 'Kasir', cell: (o) => o.cashier_name },
                { header: 'Metode', cell: (o) => methodName(o.payment_method) },
                {
                  header: 'Status',
                  cell: (o) => (
                    <>
                      <Badge tone={statusTone(o.status)}>{statusLabel[o.status]}</Badge>
                      {o.is_offline && <span className="muted small"> offline</span>}
                    </>
                  ),
                },
                { header: 'Total', align: 'right', cell: (o) => <strong className="mono">{rupiah(o.total)}</strong> },
              ]}
            />
            <Pagination page={page} pageSize={PAGE} total={q.data?.count ?? 0} onChange={setPage} />
            {(q.data?.rows.length ?? 0) > 0 && (
              <div className="pagination">
                <span className="muted small">Total halaman ini (transaksi selesai)</span>
                <strong className="mono">{rupiah(totals)}</strong>
              </div>
            )}
          </>
        )}
      </div>

      {openId && <OrderDetail id={openId} settings={settings.data ?? null} onClose={() => setOpenId(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ Detail
interface OrderFull extends OrderRow {
  outlets: { name: string; code: string; address: string | null; phone: string | null };
  order_items: {
    id: string; line_no: number; product_name: string; variant_name: string | null; quantity: number; unit_price: number; line_total: number; note: string | null;
    order_item_modifiers: { group_name: string; modifier_name: string; price_delta: number }[];
  }[];
  payments: { method: string; amount: number; received: number; change_amount: number }[];
}

function toReceipt(o: OrderFull): ReceiptData {
  const p = o.payments[0];
  return {
    order_number: o.order_number,
    status: o.status,
    created_at: o.created_at,
    cashier_name: o.cashier_name,
    outlet: o.outlets,
    subtotal: o.subtotal,
    discount_name: o.discount_name,
    discount_total: o.discount_total,
    tax_name: o.tax_name,
    tax_rate: o.tax_rate,
    tax_total: o.tax_total,
    total: o.total,
    payment_method: o.payment_method,
    payment: p ? { method: p.method, amount: p.amount, received: p.received, change: p.change_amount } : null,
    note: o.note,
    items: [...o.order_items]
      .sort((a, b) => a.line_no - b.line_no)
      .map((i) => ({
        product_name: i.product_name,
        variant_name: i.variant_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        line_total: i.line_total,
        note: i.note,
        modifiers: i.order_item_modifiers.map((m) => ({ group_name: m.group_name, name: m.modifier_name, price_delta: m.price_delta })),
      })),
  };
}

function OrderDetail({ id, settings, onClose }: { id: string; settings: BusinessSettings | null; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<'void' | 'refund' | null>(null);

  const q = useQuery({
    queryKey: ['order-detail', id],
    staleTime: 0,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('orders')
          .select('*, outlets(name, code, address, phone), order_items(*, order_item_modifiers(*)), payments(*)')
          .eq('id', id)
          .single(),
      ) as unknown as OrderFull,
  });

  const o = q.data;
  const receipt = o ? toReceipt(o) : null;

  return (
    <>
      <Modal
        title={o ? `Transaksi ${o.order_number}` : 'Detail transaksi'}
        size="lg"
        onClose={onClose}
        footer={
          o && (
            <>
              {o.status === 'completed' && can('order.void') && (
                <Button variant="danger" onClick={() => setAction('void')}>
                  Batalkan
                </Button>
              )}
              {o.status === 'completed' && can('order.refund') && <Button onClick={() => setAction('refund')}>Refund</Button>}
              <Button onClick={() => downloadFile(`struk-${o.order_number}.txt`, receiptText(receipt!, settings), 'text/plain;charset=utf-8')}>Unduh struk</Button>
              <Button variant="primary" onClick={() => window.print()}>
                Cetak struk
              </Button>
            </>
          )
        }
      >
        {q.isLoading ? (
          <Spinner />
        ) : q.isError || !o || !receipt ? (
          <ErrorState error={q.error ?? new Error('Transaksi tidak ditemukan')} retry={() => void q.refetch()} />
        ) : (
          <div className="grid-eq">
            <div className="stack">
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <Badge tone={statusTone(o.status)}>{statusLabel[o.status]}</Badge> {o.is_offline && <Badge tone="info">Dicatat offline</Badge>}
                </dd>
                <dt>Cabang</dt>
                <dd>{o.outlets.name}</dd>
                <dt>Kasir</dt>
                <dd>{o.cashier_name}</dd>
                <dt>Waktu</dt>
                <dd>{dateTime(o.created_at)}</dd>
                <dt>Pembayaran</dt>
                <dd>{methodName(o.payment_method)}</dd>
                <dt>Total</dt>
                <dd>
                  <strong>{rupiah(o.total)}</strong>
                </dd>
                {o.payments[0] && o.payments[0].method === 'cash' && (
                  <>
                    <dt>Diterima / kembali</dt>
                    <dd>
                      {rupiah(o.payments[0].received)} / {rupiah(o.payments[0].change_amount)}
                    </dd>
                  </>
                )}
                {o.note && (
                  <>
                    <dt>Catatan</dt>
                    <dd>{o.note}</dd>
                  </>
                )}
              </dl>
              {o.status !== 'completed' && (
                <Notice tone="warning">
                  <strong>{o.status === 'void' ? 'Dibatalkan' : 'Di-refund'}</strong> oleh {o.voided_by_name ?? '-'} pada {dateTime(o.voided_at)}.
                  <br />
                  Alasan: {o.void_reason}
                </Notice>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="right">Jumlah</th>
                    <th className="right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        {it.product_name}
                        {it.variant_name ? ` (${it.variant_name})` : ''}
                        {it.modifiers.length > 0 && <div className="muted small">{it.modifiers.map((m) => m.name).join(', ')}</div>}
                        {it.note && <div className="muted small">Catatan: {it.note}</div>}
                      </td>
                      <td className="right mono">
                        {it.quantity} × {rupiah(it.unit_price)}
                      </td>
                      <td className="right mono">{rupiah(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="print-area">
              <Receipt data={receipt} settings={settings} />
            </div>
          </div>
        )}
      </Modal>

      {action && o && (
        <ConfirmDialog
          title={action === 'void' ? 'Batalkan transaksi?' : 'Refund transaksi?'}
          message={
            <>
              Transaksi <strong>{o.order_number}</strong> senilai <strong>{rupiah(o.total)}</strong> akan {action === 'void' ? 'dibatalkan' : 'di-refund'}. Stok bahan dikembalikan dan tindakan ini tercatat di audit log.
            </>
          }
          danger
          askReason
          confirmLabel={action === 'void' ? 'Ya, batalkan' : 'Ya, refund'}
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            unwrap(await supabase.rpc('void_order', { p_order_id: id, p_reason: reason, p_kind: action }));
            toast.success(action === 'void' ? 'Transaksi dibatalkan' : 'Transaksi di-refund');
            await qc.invalidateQueries({ queryKey: ['transactions'] });
            await qc.invalidateQueries({ queryKey: ['order-detail', id] });
            await qc.invalidateQueries({ queryKey: ['dash-recent'] });
          }}
        />
      )}
    </>
  );
}
