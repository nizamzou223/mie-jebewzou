import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, useToast } from './ui';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** Unggah gambar ke Supabase Storage (bucket publik "media") dan kembalikan URL publiknya. */
export default function ImageUpload({
  value,
  onChange,
  folder,
  disabled,
  placeholder = 'Belum ada gambar',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error('Format harus PNG, JPG, WEBP, atau SVG.');
    if (file.size > MAX_BYTES) return toast.error('Ukuran gambar maksimal 5 MB.');
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
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

  return (
    <div className="row gap">
      {value ? <img className="img-preview" src={value} alt="Pratinjau" /> : <div className="img-preview thumb-ph small">{placeholder}</div>}
      <div className="stack" style={{ gap: 8 }}>
        <input ref={input} type="file" accept={TYPES.join(',')} hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <Button size="sm" loading={busy} disabled={disabled} onClick={() => input.current?.click()}>
          {value ? 'Ganti gambar' : 'Unggah gambar'}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
            Hapus
          </Button>
        )}
      </div>
    </div>
  );
}
