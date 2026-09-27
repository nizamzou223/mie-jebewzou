import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'mj_theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* penyimpanan lokal tidak tersedia */
  }
  return 'system';
}

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref;
}

export function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

/** Tema terang/gelap. Bawaan mengikuti sistem operasi; pilihan pengguna disimpan di perangkat. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(read);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(read()));

  useEffect(() => {
    applyTheme(pref);
    setResolved(resolveTheme(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      setResolved(resolveTheme('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* abaikan */
    }
  }, []);

  const toggle = useCallback(() => setPref(resolveTheme(pref) === 'dark' ? 'light' : 'dark'), [pref, setPref]);

  return { pref, resolved, setPref, toggle };
}
