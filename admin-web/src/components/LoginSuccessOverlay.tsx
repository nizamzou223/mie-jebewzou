import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * Animasi selebrasi sesaat setelah login berhasil. Dipasang SEKALI di akar aplikasi
 * (bukan di dalam LoginPage) karena begitu status sesi menjadi "ready", LoginPage bisa
 * langsung diganti oleh App — kalau animasinya ditaruh di dalam LoginPage, ia akan
 * kepotong/hilang sebelum sempat tampil. Komponen ini memantau transisi status
 * "signed_out" -> "ready" sendiri, sehingga tetap tampil penuh di atas apa pun yang
 * sedang dirender App di baliknya, lalu memudar dan hilang otomatis.
 *
 * Tidak terpicu saat memuat ulang halaman (status boot langsung ke "ready" tanpa
 * pernah melewati "signed_out"), maupun setelah alur pemulihan password.
 */
export default function LoginSuccessOverlay() {
  const { status, profile } = useAuth();
  const sawSignedOut = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'show' | 'hide'>('idle');
  const [name, setName] = useState('');

  useEffect(() => {
    if (status === 'signed_out') sawSignedOut.current = true;
    else if (status === 'blocked') sawSignedOut.current = false;
    else if (status === 'ready' && sawSignedOut.current) {
      sawSignedOut.current = false;
      setName(profile?.full_name?.trim().split(/\s+/)[0] ?? '');
      setPhase('show');
      const t1 = setTimeout(() => setPhase('hide'), 1500);
      const t2 = setTimeout(() => setPhase('idle'), 1900);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [status, profile]);

  if (phase === 'idle') return null;

  return (
    <div className={`lso ${phase === 'hide' ? 'lso-hide' : ''}`} role="status" aria-live="polite">
      <div className="lso-ring">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path className="lso-check" d="M4 12.5 9.5 18 20 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={100} />
        </svg>
      </div>
      <h2 className="lso-title">{name ? `Selamat datang, ${name}!` : 'Berhasil masuk!'}</h2>
      <p className="lso-sub">Menyiapkan dashboard Anda…</p>
    </div>
  );
}
