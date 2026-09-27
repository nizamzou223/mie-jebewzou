import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button, Notice } from '../components/ui';
import Icon from '../components/Icon';
import AuthShell from '../components/AuthShell';
import { PasswordInput } from '../components/PasswordFields';
import { friendlyError } from '../lib/errors';

const EMAIL_KEY = 'mj_email';

function savedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function LoginPage() {
  const { signIn, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState(savedEmail);
  const [remember, setRemember] = useState(() => savedEmail() !== '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(0), 450);
    return () => clearTimeout(t);
  }, [shake]);

  function remember_(e: string) {
    try {
      if (remember) localStorage.setItem(EMAIL_KEY, e.trim());
      else localStorage.removeItem(EMAIL_KEY);
    } catch {
      /* abaikan */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        remember_(email);
      } else {
        await sendPasswordReset(email);
        setSent(true);
      }
    } catch (err) {
      setError(friendlyError(err));
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const forgot = mode === 'forgot';

  return (
    <AuthShell>
      <form className={`auth-card stack ${shake ? 'shake' : ''}`} onSubmit={submit} noValidate={false}>
        <div>
          <h2>{forgot ? 'Lupa password?' : 'Selamat datang 👋'}</h2>
          <p className="sub">
            {forgot ? 'Masukkan email akun Anda. Kami kirimkan tautan untuk membuat password baru.' : 'Masuk untuk mengelola usaha Anda.'}
          </p>
        </div>

        {error && <Notice tone="danger">{error}</Notice>}
        {sent && <Notice tone="success">Jika email terdaftar, tautan pemulihan sudah dikirim. Periksa kotak masuk dan folder spam.</Notice>}

        <label className="field">
          <span className="field-label">Email</span>
          <span className="input-icon">
            <Icon name="mail" />
            <input
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </span>
        </label>

        {!forgot && <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" required placeholder="Masukkan password" />}

        {!forgot && (
          <div className="auth-row">
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Ingat email saya
            </label>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setSent(false);
              }}
            >
              Lupa password?
            </button>
          </div>
        )}

        <Button variant="primary" className="btn-lg" type="submit" loading={busy} disabled={forgot && sent}>
          {forgot ? 'Kirim tautan pemulihan' : 'Masuk'}
          {!busy && <Icon name="arrowRight" />}
        </Button>

        {forgot ? (
          <button
            type="button"
            className="link-btn"
            style={{ alignSelf: 'center' }}
            onClick={() => {
              setMode('login');
              setError(null);
              setSent(false);
            }}
          >
            ← Kembali ke halaman masuk
          </button>
        ) : (
          <>
            <div className="divider-text">Khusus owner &amp; admin cabang</div>
            <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
              Kasir masuk melalui aplikasi kasir. Belum punya akun? Minta owner membuatkannya di menu Pengguna.
            </p>
          </>
        )}
      </form>
    </AuthShell>
  );
}
