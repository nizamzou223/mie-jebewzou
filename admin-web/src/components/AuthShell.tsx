import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { useTheme } from '../lib/theme';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'store', title: 'Semua cabang, satu layar', text: 'Pantau omzet, stok, dan kasir tiap cabang.' },
  { icon: 'chart', title: 'Laporan yang jelas', text: 'Harian sampai bulanan, ekspor CSV.' },
  { icon: 'shield', title: 'Akses per cabang', text: 'Setiap akun hanya melihat data cabangnya.' },
  { icon: 'smartphone', title: 'Kasir tetap jalan', text: 'Aplikasi kasir mendukung mode offline.' },
];

/** Ilustrasi mangkuk mie pedas (dekoratif). */
function Bowl() {
  return (
    <svg className="auth-bowl" viewBox="0 0 400 330" aria-hidden="true">
      <defs>
        <linearGradient id="bowl-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8ee" />
          <stop offset="1" stopColor="#f0d6b4" />
        </linearGradient>
        <linearGradient id="bowl-broth" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0682a" />
          <stop offset="1" stopColor="#c2331a" />
        </linearGradient>
      </defs>
      {/* uap */}
      <g fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="6" strokeLinecap="round">
        <path d="M150 105c-14-20 12-30 2-56" />
        <path d="M200 100c-14-22 12-34 2-62" />
        <path d="M250 105c-14-20 12-30 2-56" />
      </g>
      {/* sumpit */}
      <g stroke="#d4954f" strokeWidth="7" strokeLinecap="round">
        <path d="M318 26 232 150" />
        <path d="M340 44 258 160" />
      </g>
      {/* badan mangkuk */}
      <path d="M34 168h332c0 84-64 134-166 134S34 252 34 168z" fill="url(#bowl-body)" />
      <path d="M40 204c40 14 280 14 320 0l-6 22c-46 16-262 16-308 0z" fill="#c23a29" />
      <path d="M150 300h100l8 14H142z" fill="#e9c99f" />
      {/* bibir mangkuk & kuah */}
      <ellipse cx="200" cy="168" rx="166" ry="28" fill="#f8e7cf" />
      <ellipse cx="200" cy="170" rx="150" ry="21" fill="url(#bowl-broth)" />
      {/* mie */}
      <g fill="none" stroke="#f7d066" strokeWidth="11" strokeLinecap="round">
        <path d="M68 166c34-58 74 22 112-30s78-30 150 26" />
        <path d="M84 170c40-46 70 14 110-26s70-24 116 20" />
        <path d="M110 172c34-30 62 6 96-14s52-12 84 12" />
      </g>
      {/* topping */}
      <ellipse cx="146" cy="150" rx="34" ry="24" fill="#fff" />
      <circle cx="146" cy="150" r="12" fill="#f5a623" />
      <circle cx="262" cy="148" r="22" fill="#8b4a2b" />
      <circle cx="255" cy="141" r="6" fill="#b06a44" opacity="0.6" />
      <g fill="#e3301a">
        <circle cx="204" cy="132" r="7" />
        <circle cx="222" cy="160" r="6" />
        <circle cx="106" cy="168" r="6" />
      </g>
      <g fill="#5fbf5f">
        <ellipse cx="190" cy="150" rx="8" ry="4" transform="rotate(-25 190 150)" />
        <ellipse cx="300" cy="160" rx="8" ry="4" transform="rotate(20 300 160)" />
        <ellipse cx="180" cy="176" rx="7" ry="3.5" transform="rotate(10 180 176)" />
      </g>
    </svg>
  );
}

/** Kerangka halaman masuk / pemulihan: hero merek di kiri, formulir di kanan. */
export default function AuthShell({ children }: { children: ReactNode }) {
  const { resolved, toggle } = useTheme();
  return (
    <div className="auth">
      <aside className="auth-hero">
        <div className="auth-brand">
          <span className="brand-mark">
            <Icon name="bowl" />
          </span>
          Jebewsizou
        </div>
        <div>
          <h1>Kelola seluruh cabang Jebewsizou dalam satu tempat.</h1>
          <p className="lead">Produk, stok, kasir, dan laporan penjualan — rapi, cepat, dan aman untuk semua cabang.</p>
          <div className="auth-feats">
            {FEATURES.map((f) => (
              <div className="auth-feat" key={f.title}>
                <Icon name={f.icon} />
                <div>
                  <b>{f.title}</b>
                  {f.text}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="auth-foot">© {new Date().getFullYear()} Jebewsizou · Panel admin</div>
        <Bowl />
      </aside>
      <main className="auth-panel">
        <button className="icon-btn auth-theme" onClick={toggle} aria-label={resolved === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}>
          <Icon name={resolved === 'dark' ? 'sun' : 'moon'} />
        </button>
        {children}
      </main>
    </div>
  );
}
