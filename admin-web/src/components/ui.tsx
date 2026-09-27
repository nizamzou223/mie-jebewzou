import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { friendlyError } from '../lib/errors';
import Icon, { type IconName } from './Icon';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={`btn btn-${variant} btn-${size} ${rest.className ?? ''}`}
    >
      {loading && <span className="spinner spinner-sm" aria-hidden />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Feedback
export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action, icon = 'inbox' }: { title: string; hint?: string; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="state empty">
      <div className="empty-icon" aria-hidden>
        <Icon name={icon} />
      </div>
      <strong>{title}</strong>
      {hint && <span className="muted">{hint}</span>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <strong>Data gagal dimuat</strong>
      <span>{friendlyError(error)}</span>
      {retry && <Button onClick={retry}>Coba lagi</Button>}
    </div>
  );
}

const NOTICE_ICON: Record<string, IconName> = { info: 'info', warning: 'alert', danger: 'alert', success: 'checkCircle' };
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>
      <Icon name={NOTICE_ICON[tone]} />
      <div>{children}</div>
    </div>
  );
}

export function Badge({ tone = 'neutral', dot, children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'; dot?: boolean; children: ReactNode }) {
  return <span className={`badge badge-${tone} ${dot ? 'dotted' : ''}`}>{children}</span>;
}

// ---------------------------------------------------------------- Toast
type Tone = 'success' | 'danger' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}
const ToastCtx = createContext<{ push: (tone: Tone, text: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: Tone, text: string) => {
    const id = ++seq.current;
    setItems((s) => [...s, { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === 'danger' ? 7000 : 3500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'danger' ? 'alert' : 'status'}>
            <Icon name={t.tone === 'success' ? 'checkCircle' : t.tone === 'danger' ? 'alert' : 'info'} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast harus dipakai di dalam ToastProvider');
  return {
    success: (t: string) => v.push('success', t),
    error: (e: unknown) => v.push('danger', friendlyError(e)),
    info: (t: string) => v.push('info', t),
  };
}

// ---------------------------------------------------------------- Modal
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Dialog konfirmasi; bila `askReason` aktif, alasan wajib diisi (min. 3 karakter). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  danger,
  askReason,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  askReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const invalid = askReason && reason.trim().length < 3;
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={invalid}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                onClose();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
      {askReason && (
        <Field label="Alasan (wajib)">
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tulis alasan singkat…" />
        </Field>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Layout bits
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, flush }: { title?: string; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions}
        </div>
      )}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
    </section>
  );
}

export function StatCard({
  label, value, hint, tone, icon = 'wallet', delta, spark,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'brand' | 'warning' | 'danger';
  icon?: IconName;
  /** Perubahan dibanding periode sebelumnya (persen); null = tidak ada pembanding. */
  delta?: number | null;
  spark?: ReactNode;
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-top">
        <span className="stat-ico">
          <Icon name={icon} />
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-hint">
        {delta !== undefined && <Delta value={delta} />}
        {hint}
      </span>
      {spark && <div className="spark">{spark}</div>}
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="delta flat">baru</span>;
  const r = Math.round(value * 10) / 10;
  if (r === 0) return <span className="delta flat">0%</span>;
  return (
    <span className={`delta ${r > 0 ? 'up' : 'down'}`}>
      <Icon name={r > 0 ? 'trendUp' : 'trendDown'} />
      {Math.abs(r).toLocaleString('id-ID')}%
    </span>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Angka yang "berhitung" naik saat nilai berubah; mengikuti preferensi kurangi-animasi. */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from.current === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(a + (value - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(Math.round(shown))}</>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === value} className={t.key === value ? 'tab active' : 'tab'} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Table
export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'right' | 'center';
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Belum ada data" />}</>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} style={{ width: c.width, textAlign: c.align }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((c) => (
                <td key={c.header} style={{ textAlign: c.align }}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="pagination">
      <span className="muted">
        Halaman {page + 1} dari {pages} · {total} data
      </span>
      <div className="row gap-sm">
        <Button size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
          Sebelumnya
        </Button>
        <Button size="sm" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
