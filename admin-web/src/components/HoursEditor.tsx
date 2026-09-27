import { DAYS } from '../lib/format';
import type { DayHours } from '../lib/types';

export const defaultHours = (): Record<string, DayHours> =>
  Object.fromEntries(DAYS.map((d) => [d.key, { open: '09:00', close: '21:00', closed: false }]));

/** Menormalkan data lama/kosong menjadi tujuh hari lengkap. */
export function normalizeHours(h: Record<string, DayHours> | null | undefined): Record<string, DayHours> {
  const base = defaultHours();
  if (!h || Object.keys(h).length === 0) return base;
  for (const d of DAYS) if (h[d.key]) base[d.key] = { ...base[d.key], ...h[d.key] };
  return base;
}

export default function HoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, DayHours>;
  onChange: (v: Record<string, DayHours>) => void;
  disabled?: boolean;
}) {
  const set = (key: string, patch: Partial<DayHours>) => onChange({ ...value, [key]: { ...value[key], ...patch } });
  return (
    <div className="stack" style={{ gap: 8 }}>
      {DAYS.map((d) => {
        const h = value[d.key];
        return (
          <div key={d.key} className="row gap-sm wrap">
            <span style={{ width: 70 }}>{d.label}</span>
            <input
              type="time"
              className="inline-input"
              style={{ width: 120 }}
              value={h.open}
              disabled={disabled || h.closed}
              onChange={(e) => set(d.key, { open: e.target.value })}
              aria-label={`${d.label} buka`}
            />
            <span>–</span>
            <input
              type="time"
              className="inline-input"
              style={{ width: 120 }}
              value={h.close}
              disabled={disabled || h.closed}
              onChange={(e) => set(d.key, { close: e.target.value })}
              aria-label={`${d.label} tutup`}
            />
            <label className="check small">
              <input type="checkbox" checked={h.closed} disabled={disabled} onChange={(e) => set(d.key, { closed: e.target.checked })} />
              Tutup
            </label>
          </div>
        );
      })}
    </div>
  );
}
