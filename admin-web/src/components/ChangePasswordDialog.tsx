import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button, Modal, useToast } from './ui';
import { PasswordInput, PasswordStrength, passwordScore } from './PasswordFields';

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { updatePassword } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = pw.length >= 8 && passwordScore(pw) >= 2 && pw === pw2;

  return (
    <Modal
      title="Ganti password"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ok}
            onClick={async () => {
              setBusy(true);
              try {
                await updatePassword(pw);
                toast.success('Password berhasil diganti');
                onClose();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Simpan password
          </Button>
        </>
      }
    >
      <div className="stack">
        <PasswordInput label="Password baru" value={pw} onChange={setPw} autoComplete="new-password" autoFocus />
        <PasswordStrength value={pw} />
        <PasswordInput label="Ulangi password baru" value={pw2} onChange={setPw2} autoComplete="new-password" />
        {pw2 !== '' && pw !== pw2 && <span className="field-error">Password tidak sama.</span>}
      </div>
    </Modal>
  );
}
