import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button, Notice } from '../components/ui';
import AuthShell from '../components/AuthShell';
import { PasswordInput, PasswordStrength, passwordScore } from '../components/PasswordFields';
import { friendlyError } from '../lib/errors';

/** Ditampilkan setelah pengguna membuka tautan pemulihan dari email. */
export default function ResetPasswordPage() {
  const { updatePassword, finishRecovery } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = pw2 !== '' && pw !== pw2;
  const ok = pw.length >= 8 && passwordScore(pw) >= 2 && pw === pw2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePassword(pw);
      finishRecovery();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form className="auth-card stack" onSubmit={submit}>
        <div>
          <h2>Buat password baru</h2>
          <p className="sub">Pilih password yang kuat, minimal 8 karakter.</p>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <PasswordInput label="Password baru" value={pw} onChange={setPw} autoComplete="new-password" autoFocus required />
        <PasswordStrength value={pw} />
        <PasswordInput label="Ulangi password" value={pw2} onChange={setPw2} autoComplete="new-password" required />
        {mismatch && <span className="field-error">Password tidak sama.</span>}
        <Button variant="primary" className="btn-lg" type="submit" loading={busy} disabled={!ok}>
          Simpan password
        </Button>
      </form>
    </AuthShell>
  );
}
