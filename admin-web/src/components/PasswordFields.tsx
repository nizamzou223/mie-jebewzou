import { useState } from 'react';
import Icon from './Icon';

export function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, pw.length < 8 ? Math.min(s, 1) : s);
}

const LEVELS = [
  { label: 'Terlalu pendek', color: '#b3261e' },
  { label: 'Lemah', color: '#d9622b' },
  { label: 'Cukup', color: '#e0a21a' },
  { label: 'Kuat', color: '#3d9a63' },
  { label: 'Sangat kuat', color: '#23794a' },
];

export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const sc = passwordScore(value);
  return (
    <div aria-live="polite">
      <div className="pw-meter">
        <i style={{ width: `${((sc + 1) / 5) * 100}%`, background: LEVELS[sc].color }} />
      </div>
      <span className="field-hint">Kekuatan: {LEVELS[sc].label}</span>
    </div>
  );
}

/** Input password dengan tombol tampil/sembunyi dan peringatan Caps Lock. */
export function PasswordInput({
  value,
  onChange,
  label,
  autoComplete,
  autoFocus,
  required,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoComplete: string;
  autoFocus?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-icon has-action">
        <Icon name="lock" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
          onKeyDown={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
          onBlur={() => setCaps(false)}
        />
        {caps && (
          <span className="caps-badge" role="status">
            Caps Lock aktif
          </span>
        )}
        <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}>
          <Icon name={show ? 'eyeOff' : 'eye'} />
        </button>
      </span>
    </label>
  );
}
