import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { unwrap } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { addDays, dateTime, isoDate, nextDay, today, zonedDayStart } from '../lib/format';
import { ACTION_LABELS, actionLabel } from '../lib/permissions';
import type { AuditLog, Profile } from '../lib/types';
import { useSettings } from '../lib/api';
import { Badge, Card, DataTable, EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner } from '../components/ui';

const PAGE = 30;

type Change = { old: unknown; new: unknown };
const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Ringkasan satu baris yang mudah dibaca dari isi `details` audit log. */
function summarize(l: AuditLog): string {
  const d = l.details as Record<string, unknown>;
  if (l.action === 'order.void' || l.action === 'order.refund') return `${d.order_number} · alasan: ${d.reason}`;
  if (l.action === 'shift.close') return `Selisih kas: ${show(d.difference)}`;
  const changes = d.changes as Record<string, Change> | undefined;
  if (changes) {
    return Object.entries(changes)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${show(v.old)} → ${show(v.new)}`)
      .join(' · ');
  }
  const n = (d.new ?? d.old) as Record<string, unknown> | undefined;
  if (n && typeof n.name === 'string') return n.name;
  if (n && typeof n.sku === 'string') return `${n.sku}`;
  if (typeof d.email === 'string') return `${d.email} (${show(d.role)})`;
  return '';
}

export default function ActivityPage() {
  const { outletId, outlets } = useAuth();
  const settings = useSettings();
  const tz = settings.data?.timezone ?? 'Asia/Jakarta';
  const [from, setFrom] = useState(isoDate(addDays(new Date(), -6)));
  const [to, setTo] = useState(today());
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setPage(0), [from, to, user, action, outletId]);

  const users = useQuery({
    queryKey: ['audit-users'],
    queryFn: async () => unwrap(await supabase.from('profiles').select('id, full_name').order('full_name')) as Pick<Profile, 'id' | 'full_name'>[],
  });

  const q = useQuery({
    queryKey: ['audit', from, to, user, action, outletId, page, tz],
    queryFn: async () => {
      let req = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .gte('created_at', zonedDayStart(from, tz))
        .lt('created_at', zonedDayStart(nextDay(to), tz))
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (outletId) req = req.eq('outlet_id', outletId);
      if (user) req = req.eq('user_id', user);
      if (action) req = req.eq('action', action);
      const { data, error, count } = await req;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as AuditLog[], count: count ?? 0 };
    },
  });

  const outletName = (id: string | null) => outlets.find((o) => o.id === id)?.name ?? '';

  return (
    <>
      <PageHeader title="Riwayat Aktivitas" subtitle="Catatan perubahan penting: harga, produk, stok, role, cabang, refund, dan pembatalan. Catatan tidak dapat diubah atau dihapus." />
      <div className="filters">
        <Field label="Dari">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Sampai">
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Pengguna">
          <select value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">Semua</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jenis aktivitas">
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Card flush>
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : (
          <>
            <DataTable
              rows={q.data?.rows ?? []}
              rowKey={(l) => String(l.id)}
              onRowClick={(l) => setOpen(open === l.id ? null : l.id)}
              empty={<EmptyState title="Tidak ada aktivitas" hint="Belum ada catatan pada filter ini." />}
              columns={[
                { header: 'Waktu', cell: (l) => <span className="nowrap">{dateTime(l.created_at)}</span> },
                { header: 'Pengguna', cell: (l) => l.user_name ?? <span className="muted">Sistem</span> },
                { header: 'Aktivitas', cell: (l) => <Badge tone={l.action.startsWith('order.') ? 'warning' : 'neutral'}>{actionLabel(l.action)}</Badge> },
                { header: 'Cabang', cell: (l) => outletName(l.outlet_id) || '—' },
                {
                  header: 'Rincian',
                  cell: (l) => (
                    <div>
                      <span className="small">{summarize(l)}</span>
                      {open === l.id && <pre className="mono small" style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>{JSON.stringify(l.details, null, 2)}</pre>}
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={page} pageSize={PAGE} total={q.data?.count ?? 0} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
