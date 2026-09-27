import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Field, Modal, Notice, useToast } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mengubah email login. Supabase mengirim tautan konfirmasi ke email BARU (dan, tergantung
 * pengaturan project, juga ke email lama) — perubahan baru berlaku setelah tautan itu dibuka,
 * bukan seketika di sini.
 */
export default function ChangeEmailDialog({ currentEmail, onClose }: { currentEmail: string | null; onClose: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const valid = EMAIL_RE.test(email) && email.trim().toLowerCase() !== (currentEmail ?? '').toLowerCase();

  return (
    <Modal
      title="Ubah email login"
      size="sm"
      onClose={onClose}
      footer={
        sent ? (
          <Button variant="primary" onClick={onClose}>
            Tutup
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Batal</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!valid}
              onClick={async () => {
                setBusy(true);
                try {
                  const { error } = await supabase.auth.updateUser({ email: email.trim() });
                  if (error) throw error;
                  setSent(true);
                } catch (e) {
                  toast.error(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Kirim tautan konfirmasi
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <Notice tone="success">
          Tautan konfirmasi sudah dikirim ke <strong>{email}</strong>. Email login baru berlaku setelah tautan itu dibuka.
        </Notice>
      ) : (
        <div className="stack">
          <Notice tone="info">
            Email saat ini: <strong>{currentEmail ?? '-'}</strong>
          </Notice>
          <Field label="Email baru">
            <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama-baru@email.com" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
