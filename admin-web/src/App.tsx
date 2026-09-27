import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth/AuthContext';
import { isConfigured, supabase } from './lib/supabase';
import { unwrap } from './lib/api';
import { useTheme } from './lib/theme';
import { Button, EmptyState, Notice, Spinner } from './components/ui';
import Icon, { type IconName } from './components/Icon';
import CommandPalette from './components/CommandPalette';
import ChangePasswordDialog from './components/ChangePasswordDialog';
import LoginSuccessOverlay from './components/LoginSuccessOverlay';
import { number, roleLabel } from './lib/format';

const LoginPage = lazy(() => import('./pages/Login'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const OutletsPage = lazy(() => import('./pages/Outlets'));
const UsersPage = lazy(() => import('./pages/Users'));
const ProductsPage = lazy(() => import('./pages/Products'));
const CategoriesPage = lazy(() => import('./pages/Categories'));
const ModifiersPage = lazy(() => import('./pages/Modifiers'));
const InventoryPage = lazy(() => import('./pages/Inventory'));
const TransactionsPage = lazy(() => import('./pages/Transactions'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const ActivityPage = lazy(() => import('./pages/Activity'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const ProfilePage = lazy(() => import('./pages/Profile'));

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  show: (can: (p: string) => boolean, isOwner: boolean) => boolean;
  group: string;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', group: 'Ringkasan', show: (can) => can('report.view') },
  { to: '/transaksi', label: 'Transaksi', icon: 'receipt', group: 'Ringkasan', show: () => true },
  { to: '/laporan', label: 'Laporan', icon: 'chart', group: 'Ringkasan', show: (can) => can('report.view') },
  { to: '/produk', label: 'Produk & Menu', icon: 'bowl', group: 'Katalog', show: () => true },
  { to: '/kategori', label: 'Kategori', icon: 'tag', group: 'Katalog', show: () => true },
  { to: '/variasi', label: 'Variasi & Tambahan', icon: 'sliders', group: 'Katalog', show: () => true },
  { to: '/stok', label: 'Bahan & Stok', icon: 'package', group: 'Operasional', show: () => true },
  { to: '/cabang', label: 'Cabang', icon: 'store', group: 'Pengelolaan', show: (_c, o) => o },
  { to: '/pengguna', label: 'Pengguna', icon: 'users', group: 'Pengelolaan', show: (can) => can('user.manage') },
  { to: '/aktivitas', label: 'Riwayat Aktivitas', icon: 'history', group: 'Pengelolaan', show: (can) => can('audit.view') },
  { to: '/pengaturan', label: 'Pengaturan', icon: 'settings', group: 'Pengelolaan', show: (can, o) => o || can('discount.manage') },
];

export function Guard({ allow, children }: { allow: boolean; children: ReactNode }) {
  if (!allow) {
    return <EmptyState icon="lock" title="Akses ditolak" hint="Akun Anda tidak memiliki izin untuk membuka halaman ini." />;
  }
  return <>{children}</>;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  return ref;
}

/** Lonceng peringatan stok menipis (memakai data yang sama dengan dashboard). */
function StockBell() {
  const { outletId, can } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const q = useQuery({
    queryKey: ['dash-low', outletId],
    queryFn: async () =>
      unwrap(await supabase.rpc('low_stock_items', { p_outlet: outletId })) as {
        outlet_id: string; outlet_name: string; ingredient_name: string; unit: string; current_stock: number; min_stock: number;
      }[],
    staleTime: 60_000,
    enabled: can('inventory.manage') || can('report.view'),
  });
  const items = q.data ?? [];
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label={`Notifikasi stok${items.length ? `, ${items.length} peringatan` : ''}`} aria-expanded={open}>
        <Icon name="bell" style={{ width: 20, height: 20 }} />
        {items.length > 0 && <span className="dot">{items.length > 9 ? '9+' : items.length}</span>}
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Notifikasi stok">
          <div className="pop-head">
            <strong>Peringatan stok</strong>
            <div className="muted small">{items.length === 0 ? 'Semua stok aman' : `${items.length} bahan perlu diisi ulang`}</div>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {items.slice(0, 8).map((r) => (
              <Link key={r.outlet_id + r.ingredient_name} to="/stok" className="pop-item" onClick={close}>
                <Icon name="alert" style={{ color: Number(r.current_stock) <= 0 ? 'var(--danger)' : 'var(--warning)' }} />
                <span className="grow">
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>{r.ingredient_name}</strong>
                  <span className="muted small">
                    {!outletId ? `${r.outlet_name} · ` : ''}
                    sisa {number(r.current_stock)} {r.unit}
                  </span>
                </span>
              </Link>
            ))}
            {items.length === 0 && <div className="state muted">Tidak ada peringatan.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onChangePassword }: { onChangePassword: () => void }) {
  const { profile, signOut } = useAuth();
  const qc = useQueryClient();
  const { resolved, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  if (!profile) return null;
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="avatar avatar-sm" style={{ border: 0, cursor: 'pointer', overflow: 'hidden' }} onClick={() => setOpen((v) => !v)} aria-label="Menu akun" aria-expanded={open}>
        {profile.avatar_url ? <img className="avatar-img" src={profile.avatar_url} alt="" /> : initials(profile.full_name)}
      </button>
      {open && (
        <div className="pop" style={{ minWidth: 270 }} role="menu">
          <div className="pop-head">
            <strong>{profile.full_name}</strong>
            <div className="muted small">{profile.email}</div>
            <div className="small" style={{ marginTop: 4, color: 'var(--brand-ink)', fontWeight: 700 }}>{roleLabel[profile.role]}</div>
          </div>
          <Link to="/profil" className="pop-item" role="menuitem" onClick={close}>
            <Icon name="user" /> Profil saya
          </Link>
          <button className="pop-item" role="menuitem" onClick={() => { close(); onChangePassword(); }}>
            <Icon name="key" /> Ganti password
          </button>
          <button className="pop-item" role="menuitem" onClick={toggle}>
            <Icon name={resolved === 'dark' ? 'sun' : 'moon'} /> {resolved === 'dark' ? 'Tema terang' : 'Tema gelap'}
          </button>
          <button
            className="pop-item danger"
            role="menuitem"
            onClick={async () => {
              close();
              await signOut();
              qc.clear();
            }}
          >
            <Icon name="logout" /> Keluar
          </button>
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { profile, outlets, outletId, setOutletId, can, isOwner, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('mj_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const qc = useQueryClient();
  const { resolved, toggle } = useTheme();
  const loc = useLocation();
  const items = NAV.filter((n) => n.show(can, isOwner));
  const groups = [...new Set(items.map((i) => i.group))];
  const home = can('report.view') ? '/' : '/transaksi';
  const current = items.find((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(i.to)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleCollapse = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('mj_collapsed', c ? '0' : '1');
      } catch {
        /* abaikan */
      }
      return !c;
    });

  const paletteActions = useMemo(
    () => [
      { label: resolved === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap', icon: (resolved === 'dark' ? 'sun' : 'moon') as IconName, run: toggle },
      { label: 'Ganti password', icon: 'key' as IconName, run: () => setPwOpen(true) },
      {
        label: 'Keluar',
        icon: 'logout' as IconName,
        run: async () => {
          await signOut();
          qc.clear();
        },
      },
    ],
    [resolved, toggle, signOut, qc],
  );

  return (
    <div className={collapsed ? 'shell collapsed' : 'shell'}>
      <aside className={open ? 'sidebar open' : 'sidebar'} onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="brand-mark">
            <Icon name="bowl" />
          </div>
          <div>
            <strong>Jebewsizou</strong>
            <span>Admin Panel</span>
          </div>
        </div>
        <nav className="nav" aria-label="Menu utama">
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-label">{g}</div>
              {items
                .filter((i) => i.group === g)
                .map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} title={collapsed ? i.label : undefined} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <Icon name={i.icon} />
                    <span className="lbl">{i.label}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="usercard">
            <span className="avatar" style={{ overflow: 'hidden' }}>
              {profile?.avatar_url ? <img className="avatar-img" src={profile.avatar_url} alt="" /> : initials(profile?.full_name ?? '')}
            </span>
            <Link to="/profil" className="who" style={{ textDecoration: 'none', color: 'inherit' }} onClick={(e) => e.stopPropagation()}>
              <strong>{profile?.full_name}</strong>
              <span>{profile ? roleLabel[profile.role] : ''}</span>
            </Link>
            <button
              className="icon-btn"
              aria-label="Keluar"
              title="Keluar"
              onClick={async (e) => {
                e.stopPropagation();
                await signOut();
                qc.clear();
              }}
            >
              <Icon name="logout" />
            </button>
          </div>
          <button className="icon-btn collapse-btn" onClick={(e) => { e.stopPropagation(); toggleCollapse(); }} aria-label={collapsed ? 'Perluas menu' : 'Ciutkan menu'}>
            <Icon name="chevronsLeft" />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Icon name="menu" />
          </button>
          <span className="crumb">{current?.label ?? 'Jebewsizou'}</span>

          {outlets.length > 1 ? (
            <select value={outletId ?? ''} onChange={(e) => setOutletId(e.target.value || null)} aria-label="Pilih cabang">
              <option value="">Semua cabang</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.is_active ? '' : ' (nonaktif)'}
                </option>
              ))}
            </select>
          ) : (
            <span className="outlet-pill">
              <Icon name="pin" />
              <strong>{outlets[0]?.name ?? (isOwner ? 'Belum ada cabang' : 'Belum ditugaskan')}</strong>
            </span>
          )}

          <button className="searchbtn" onClick={() => setPalette(true)} aria-label="Pencarian cepat">
            <Icon name="search" />
            <span>Cari…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <StockBell />
          <button className="icon-btn" onClick={toggle} aria-label={resolved === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}>
            <Icon name={resolved === 'dark' ? 'sun' : 'moon'} style={{ width: 20, height: 20 }} />
          </button>
          <UserMenu onChangePassword={() => setPwOpen(true)} />
        </header>
        <main className="content" key={loc.pathname}>
          {outlets.length === 0 && !isOwner && (
            <Notice tone="warning">Anda belum ditugaskan ke cabang mana pun. Hubungi owner untuk mendapatkan akses.</Notice>
          )}
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={can('report.view') ? <DashboardPage /> : <Navigate to={home} replace />} />
              <Route path="/transaksi" element={<TransactionsPage />} />
              <Route path="/laporan" element={<Guard allow={can('report.view')}><ReportsPage /></Guard>} />
              <Route path="/produk" element={<ProductsPage />} />
              <Route path="/kategori" element={<CategoriesPage />} />
              <Route path="/variasi" element={<ModifiersPage />} />
              <Route path="/stok" element={<InventoryPage />} />
              <Route path="/cabang" element={<Guard allow={isOwner}><OutletsPage /></Guard>} />
              <Route path="/pengguna" element={<Guard allow={can('user.manage')}><UsersPage /></Guard>} />
              <Route path="/aktivitas" element={<Guard allow={can('audit.view')}><ActivityPage /></Guard>} />
              <Route path="/pengaturan" element={<Guard allow={isOwner || can('discount.manage')}><SettingsPage /></Guard>} />
              <Route path="/profil" element={<ProfilePage />} />
              <Route path="*" element={<Navigate to={home} replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {palette && (
        <CommandPalette
          pages={items.map((i) => ({ to: i.to, label: i.label, icon: i.icon }))}
          actions={paletteActions}
          onClose={() => setPalette(false)}
        />
      )}
      {pwOpen && <ChangePasswordDialog onClose={() => setPwOpen(false)} />}
    </div>
  );
}

export default function App() {
  const { status, blockReason, signOut, recovery } = useAuth();

  let content: ReactNode;
  if (!isConfigured) {
    content = (
      <div className="auth-panel" style={{ minHeight: '100%' }}>
        <div className="auth-card stack">
          <h2>Konfigurasi belum lengkap</h2>
          <Notice tone="warning">
            File <code>.env</code> belum diisi. Salin <code>.env.example</code> menjadi <code>.env</code>, isi
            <code> VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>, lalu jalankan ulang <code>npm run dev</code>.
          </Notice>
        </div>
      </div>
    );
  } else if (recovery) {
    content = (
      <Suspense fallback={<Spinner />}>
        <ResetPasswordPage />
      </Suspense>
    );
  } else if (status === 'loading') {
    content = <Spinner label="Menyiapkan…" />;
  } else if (status === 'signed_out') {
    content = (
      <Suspense fallback={<Spinner />}>
        <LoginPage />
      </Suspense>
    );
  } else if (status === 'blocked') {
    content = (
      <div className="auth-panel" style={{ minHeight: '100%' }}>
        <div className="auth-card stack">
          <h2>Tidak dapat masuk</h2>
          <Notice tone="danger">{blockReason}</Notice>
          <Button onClick={() => void signOut()}>Kembali ke halaman login</Button>
        </div>
      </div>
    );
  } else {
    content = <Shell />;
  }

  // Dirender sebagai saudara (bukan di dalam salah satu cabang di atas) agar animasi berhasil
  // login tetap tuntas diputar walau `content` sudah berganti dari LoginPage ke Shell.
  return (
    <>
      {content}
      {isConfigured && <LoginSuccessOverlay />}
    </>
  );
}
