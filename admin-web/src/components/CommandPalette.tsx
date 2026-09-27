import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import Icon, { type IconName } from './Icon';
import { useDebounced } from './ui';

export interface PaletteNav {
  to: string;
  label: string;
  icon: IconName;
}

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
}

/** Pencarian cepat (Ctrl/Cmd + K): pindah halaman, cari produk, cari nomor transaksi, jalankan perintah. */
export default function CommandPalette({
  pages,
  actions,
  onClose,
}: {
  pages: PaletteNav[];
  actions: { label: string; icon: IconName; run: () => void }[];
  onClose: () => void;
}) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const products = useQuery({
    queryKey: ['palette-products', dq],
    enabled: dq.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, sku').or(`name.ilike.%${dq.replace(/[%,()]/g, ' ')}%,sku.ilike.%${dq.replace(/[%,()]/g, ' ')}%`).limit(5);
      if (error) throw new Error(error.message);
      return data as { id: string; name: string; sku: string }[];
    },
  });

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const out: Item[] = [];
    // Awalan kata lebih relevan daripada sekadar mengandung (mis. "bahan" -> "Bahan & Stok", bukan "Tambahan").
    const score = (label: string) => {
      const l = label.toLowerCase();
      if (l.startsWith(term)) return 0;
      if (l.split(/[s&]+/).some((w) => w.startsWith(term))) return 1;
      return 2;
    };
    const ranked = pages.filter((p) => !term || p.label.toLowerCase().includes(term)).sort((a, b) => (term ? score(a.label) - score(b.label) : 0));
    for (const p of ranked) {
      out.push({ id: `p:${p.to}`, group: 'Halaman', label: p.label, icon: p.icon, run: () => nav(p.to) });
    }
    if (term.length >= 2) {
      for (const p of products.data ?? []) {
        out.push({ id: `pr:${p.id}`, group: 'Produk', label: p.name, hint: p.sku, icon: 'bowl', run: () => nav(`/produk?q=${encodeURIComponent(p.name)}`) });
      }
    }
    if (term.length >= 3) {
      out.push({ id: 'tx', group: 'Transaksi', label: `Cari nomor transaksi “${q.trim()}”`, icon: 'receipt', run: () => nav(`/transaksi?q=${encodeURIComponent(q.trim())}`) });
    }
    for (const a of actions.filter((a) => !term || a.label.toLowerCase().includes(term))) {
      out.push({ id: `a:${a.label}`, group: 'Perintah', label: a.label, icon: a.icon, run: a.run });
    }
    return out;
  }, [q, pages, actions, products.data, nav]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (it?: Item) => {
    if (!it) return;
    onClose();
    it.run();
  };

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[sel]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  let lastGroup = '';
  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Pencarian cepat" onKeyDown={onKey}>
        <div className="palette-input">
          <Icon name="search" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari halaman, produk, atau nomor transaksi…" aria-label="Kata kunci" />
          <span className="kbd-hint">Esc</span>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {items.length === 0 && <div className="state muted">Tidak ada hasil untuk “{q}”.</div>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head && <div className="palette-group">{it.group}</div>}
                <button className="palette-item" role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => run(it)}>
                  <span className="ico">
                    <Icon name={it.icon} />
                  </span>
                  <span className="grow">{it.label}</span>
                  {it.hint && <span className="muted small mono">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>↑↓ pilih</span>
          <span>↵ buka</span>
          <span>Esc tutup</span>
        </div>
      </div>
    </div>
  );
}
