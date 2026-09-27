import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { affected, unwrap, useCategories } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import type { Category } from '../lib/types';
import { Badge, Button, DataTable, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner, Toggle, useToast } from '../components/ui';

export default function CategoriesPage() {
  const { can } = useAuth();
  const canEdit = can('category.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const q = useCategories();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });

  const toggle = useMutation({
    mutationFn: async (c: Category) => affected(await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id).select('id')),
    onSuccess: refresh,
    onError: (e) => toast.error(e),
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = [...(q.data ?? [])];
      const j = index + dir;
      if (j < 0 || j >= list.length) return;
      [list[index], list[j]] = [list[j], list[index]];
      // Tulis ulang urutan 1..n agar konsisten
      for (let i = 0; i < list.length; i++) {
        if (list[i].sort_order !== i + 1) {
          affected(await supabase.from('categories').update({ sort_order: i + 1 }).eq('id', list[i].id).select('id'));
        }
      }
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        title="Kategori"
        subtitle="Kelompok menu yang tampil di aplikasi kasir. Urutan di sini menentukan urutan tab kategori."
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              + Tambah kategori
            </Button>
          )
        }
      />
      {!canEdit && <Notice tone="info">Anda hanya dapat melihat kategori. Hubungi owner untuk mengubahnya.</Notice>}
      <div className="card mt">
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : (
          <DataTable
            rows={q.data ?? []}
            rowKey={(c) => c.id}
            empty={<EmptyState title="Belum ada kategori" hint="Contoh: Mie, Minuman, Topping, Paket, Tambahan." />}
            columns={[
              { header: '#', cell: (c) => c.sort_order, width: '50px' },
              { header: 'Nama kategori', cell: (c) => <strong>{c.name}</strong> },
              { header: 'Status', cell: (c) => <Badge tone={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
              {
                header: 'Aksi',
                align: 'right',
                cell: (c) => {
                  const i = (q.data ?? []).findIndex((x) => x.id === c.id);
                  return (
                    <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" disabled={!canEdit || i === 0 || move.isPending} onClick={() => move.mutate({ index: i, dir: -1 })} aria-label="Naikkan">
                        ↑
                      </Button>
                      <Button size="sm" disabled={!canEdit || i === (q.data ?? []).length - 1 || move.isPending} onClick={() => move.mutate({ index: i, dir: 1 })} aria-label="Turunkan">
                        ↓
                      </Button>
                      <Button size="sm" disabled={!canEdit} onClick={() => setEditing(c)}>
                        Ubah
                      </Button>
                      <Toggle checked={c.is_active} disabled={!canEdit} onChange={() => toggle.mutate(c)} />
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </div>
      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          nextOrder={(q.data ?? []).length + 1}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success('Kategori disimpan');
            await refresh();
          }}
        />
      )}
    </>
  );
}

function CategoryForm({ category, nextOrder, onClose, onSaved }: { category: Category | null; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const save = useMutation({
    mutationFn: async () => {
      if (category) affected(await supabase.from('categories').update({ name: name.trim() }).eq('id', category.id).select('id'));
      else unwrap(await supabase.from('categories').insert({ name: name.trim(), sort_order: nextOrder }).select('id'));
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(e),
  });
  return (
    <Modal
      title={category ? 'Ubah kategori' : 'Tambah kategori'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <Field label="Nama kategori">
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && save.mutate()} />
      </Field>
    </Modal>
  );
}
