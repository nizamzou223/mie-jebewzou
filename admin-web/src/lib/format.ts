const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });

export const rupiah = (n: number | string | null | undefined) => idr.format(Number(n ?? 0));
export const number = (n: number | string | null | undefined) => num.format(Number(n ?? 0));

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function dateOnly(iso: string | null | undefined) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

/** YYYY-MM-DD menurut zona waktu perangkat. */
export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const today = () => isoDate(new Date());

export function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function tzOffsetMs(utcMs: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Awal hari (00:00) tanggal `YYYY-MM-DD` pada zona waktu usaha, dalam ISO UTC. Sama dengan basis laporan di server. */
export function zonedDayStart(date: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  let guess = target;
  for (let i = 0; i < 2; i++) guess = target - tzOffsetMs(guess, tz);
  return new Date(guess).toISOString();
}

export const nextDay = (date: string) => isoDate(addDays(new Date(`${date}T12:00:00`), 1));

export const roleLabel: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin Cabang',
  cashier: 'Kasir',
};

export const statusLabel: Record<string, string> = {
  completed: 'Selesai',
  void: 'Dibatalkan',
  refunded: 'Refund',
};

export const methodLabel: Record<string, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  debit: 'Kartu Debit',
  transfer: 'Transfer',
};
export const ALL_METHODS = ['cash', 'qris', 'debit', 'transfer'];

export const methodName = (m: string | null | undefined) => (m ? methodLabel[m] ?? m : '-');

export const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Senin' },
  { key: 'tue', label: 'Selasa' },
  { key: 'wed', label: 'Rabu' },
  { key: 'thu', label: 'Kamis' },
  { key: 'fri', label: 'Jumat' },
  { key: 'sat', label: 'Sabtu' },
  { key: 'sun', label: 'Minggu' },
];

export function hoursSummary(h: Record<string, { open: string; close: string; closed: boolean }> | null | undefined) {
  if (!h) return '-';
  const open = DAYS.filter((d) => h[d.key] && !h[d.key].closed);
  if (open.length === 0) return 'Belum diatur';
  const first = h[open[0].key];
  const same = open.every((d) => h[d.key].open === first.open && h[d.key].close === first.close);
  return same ? `${first.open}–${first.close}` + (open.length < 7 ? ` (${open.length} hari)` : '') : 'Bervariasi';
}
