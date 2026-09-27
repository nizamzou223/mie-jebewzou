import { useId, useState } from 'react';

export interface BarDatum {
  label: string;
  value: number;
  detail?: string;
}

/** Nilai ringkas untuk sumbu: 1,2 jt / 350 rb. */
export function compactRupiah(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return String(Math.round(n));
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/**
 * Diagram batang satu seri. Batang ramping berujung membulat dengan gradasi, garis grid tipis,
 * sorotan kolom + tooltip saat hover/fokus, dan label sumbu-x yang dijarangkan bila padat.
 */
export default function BarChart({
  data,
  format,
  ariaLabel,
  height = 260,
  axisFormat = compactRupiah,
}: {
  data: BarDatum[];
  format: (v: number) => string;
  ariaLabel: string;
  height?: number;
  axisFormat?: (v: number) => string;
}) {
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const m = { top: 14, right: 12, bottom: 30, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const slot = iw / Math.max(data.length, 1);
  const bw = Math.min(30, Math.max(4, slot * 0.62));
  const every = Math.ceil(data.length / 10);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f2884a" />
            <stop offset="100%" stopColor="#e0503c" />
          </linearGradient>
          <linearGradient id={`h${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7a05e" />
            <stop offset="100%" stopColor="#c23a29" />
          </linearGradient>
        </defs>
        {ticks.map((t) => {
          const y = m.top + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={m.left} x2={W - m.right} y1={y} y2={y} style={{ stroke: 'var(--line)' }} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={m.left - 10} y={y + 4} textAnchor="end" fontSize={11} style={{ fill: 'var(--muted)' }}>
                {axisFormat(t)}
              </text>
            </g>
          );
        })}
        {hover !== null && <rect x={m.left + slot * hover} y={m.top} width={slot} height={ih} rx={8} style={{ fill: 'var(--brand)' }} opacity={0.07} />}
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * ih);
          const x = m.left + slot * i + (slot - bw) / 2;
          const y = m.top + ih - h;
          const r = Math.min(6, bw / 2, h);
          return (
            <g key={d.label + i}>
              <rect
                x={m.left + slot * i}
                y={m.top}
                width={slot}
                height={ih}
                fill="transparent"
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.label}: ${format(d.value)}`}
              />
              {h > 0 && (
                <path
                  d={`M${x},${m.top + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${m.top + ih} Z`}
                  fill={`url(#${hover === i ? 'h' : 'g'}${gid})`}
                  pointerEvents="none"
                />
              )}
              {i % every === 0 && (
                <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize={11} style={{ fill: 'var(--muted)' }}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="chart-tip"
          style={{
            left: `${((m.left + slot * hover + slot / 2) / W) * 100}%`,
            top: `${((m.top + ih - (data[hover].value / max) * ih) / H) * 100}%`,
          }}
        >
          <div style={{ opacity: 0.75, fontSize: '0.78rem' }}>{data[hover].detail ?? data[hover].label}</div>
          <strong>{format(data[hover].value)}</strong>
        </div>
      )}
    </div>
  );
}

/** Garis mini tanpa sumbu untuk kartu statistik. */
export function Sparkline({ values, height = 38 }: { values: number[]; height?: number }) {
  const gid = useId().replace(/:/g, '');
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const W = 200;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, pad + (1 - (v - min) / span) * (height - pad * 2)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${W},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }} aria-hidden>
      <defs>
        <linearGradient id={`s${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0503c" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#e0503c" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#s${gid})`} />
      <path d={line} fill="none" stroke="#e0503c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Batang horizontal untuk peringkat (mis. produk terlaris). */
export function HBars({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      {rows.map((r, i) => (
        <div className="hbar" key={r.label}>
          <span className="rank">{i + 1}</span>
          <span className="hb-label" title={r.label}>
            {r.label}
          </span>
          <div className="hbar-track" aria-hidden>
            <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="mono nowrap hb-val">
            {format(r.value)}
            {r.sub && <span className="muted small"> · {r.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
