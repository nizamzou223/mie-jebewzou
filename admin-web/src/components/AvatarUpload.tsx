import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icon';
import { useToast } from './ui';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Foto profil bulat dengan tombol kamera di sudut. Diunggah ke bucket "media", folder
 * avatars/<id pengguna>/ — sengaja folder terpisah dari gambar produk (yang butuh izin
 * khusus) karena RLS mengizinkan tiap pengguna mengunggah ke folder miliknya sendiri saja.
 */
export default function AvatarUpload({
  userId,
  value,
  name,
  onChange,
  size = 84,
}: {
  userId: string;
  value: string | null;
  name: string;
  onChange: (url: string) => void;
  size?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error('Format foto harus PNG, JPG, atau WEBP.');
    if (file.size > MAX_BYTES) return toast.error('Ukuran foto maksimal 5 MB.');
    setBusy(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `avatars/${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange(supabase.storage.from('media').getPublicUrl(path).data.publicUrl);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const initials = (name.trim()[0] ?? '?').toUpperCase();

  return (
    <div className="avatar-upload" style={{ width: size, height: size }}>
      {value ? (
        <img src={value} alt="" className="avatar-upload-img" />
      ) : (
        <div className="avatar-upload-ph" style={{ fontSize: size * 0.4 }}>
          {initials}
        </div>
      )}
      <input ref={input} type="file" accept={TYPES.join(',')} hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <button
        type="button"
        className="avatar-upload-btn"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label="Ganti foto profil"
        title="Ganti foto profil"
      >
        {busy ? <span className="spinner spinner-sm" /> : <Icon name="camera" />}
      </button>
    </div>
  );
}
