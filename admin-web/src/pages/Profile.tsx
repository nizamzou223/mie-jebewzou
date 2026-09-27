import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { affected, unwrap } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { dateOnly, roleLabel } from '../lib/format';
import { PERMISSIONS } from '../lib/permissions';
import { Badge, Button, Card, PageHeader, Spinner, useToast } from '../components/ui';
import AvatarUpload from '../components/AvatarUpload';
import Icon from '../components/Icon';
import ChangePasswordDialog from '../components/ChangePasswordDialog';
import ChangeEmailDialog from '../components/ChangeEmailDialog';

/** Halaman profil pribadi: setiap pengguna login (owner maupun admin cabang) mengelola
 * profilnya sendiri di sini — nama, foto, keamanan akun, dan ringkasan akses miliknya. */
export default function ProfilePage() {
  const { profile, isOwner, outlets, reload } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [pwOpen, setPwOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const dirty = name.trim() !== (profile?.full_name ?? '') && name.trim().length > 0;

  const perms = useQuery({
    queryKey: ['role-permissions', profile?.role],
    enabled: !!profile && !isOwner,
    queryFn: async () => unwrap(await supabase.from('role_permissions').select('permission').eq('role', profile!.role)) as { permission: string }[],
  });
  const heldPermissions = new Set((perms.data ?? []).map((p) => p.permission));

  const saveName = useMutation({
    mutationFn: async () => affected(await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id).select('id')),
    onSuccess: async () => {
      toast.success('Nama profil disimpan');
      await reload();
    },
    onError: (e) => toast.error(e),
  });

  const saveAvatar = useMutation({
    mutationFn: async (url: string) => affected(await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile!.id).select('id')),
    onSuccess: async () => {
      toast.success('Foto profil diperbarui');
      await reload();
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(e),
  });

  if (!profile) return <Spinner />;

  return (
    <>
      <PageHeader title="Profil Saya" subtitle="Kelola nama, foto, dan keamanan akun Anda." />

      <div className="stack">
        <Card>
          <div className="profile-head">
            <AvatarUpload userId={profile.id} value={profile.avatar_url} name={profile.full_name} size={84} onChange={(url) => saveAvatar.mutate(url)} />
            <div className="grow">
              <div className="row gap-sm wrap" style={{ marginBottom: 6 }}>
                <Badge tone={isOwner ? 'brand' : 'info'}>{roleLabel[profile.role]}</Badge>
                <Badge tone={profile.is_active ? 'success' : 'neutral'}>{profile.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
              </div>
              <div className="row gap-sm" style={{ maxWidth: 380 }}>
                <input
                  aria-label="Nama lengkap"
                  className="grow"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ fontSize: '1.05rem', fontWeight: 700 }}
                />
                <Button size="sm" variant="primary" disabled={!dirty} loading={saveName.isPending} onClick={() => saveName.mutate()}>
                  Simpan
                </Button>
              </div>
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                {profile.email} · Bergabung sejak {dateOnly(profile.created_at)}
              </p>
            </div>
          </div>
        </Card>

        <Card title="Keamanan akun">
          <div className="stack" style={{ gap: 10 }}>
            <div className="subtle-box row between wrap gap-sm">
              <div>
                <strong>Password</strong>
                <div className="muted small">Ganti berkala agar akun tetap aman.</div>
              </div>
              <Button size="sm" onClick={() => setPwOpen(true)}>
                <Icon name="key" /> Ganti password
              </Button>
            </div>
            <div className="subtle-box row between wrap gap-sm">
              <div>
                <strong>Email login</strong>
                <div className="muted small">{profile.email}</div>
              </div>
              <Button size="sm" onClick={() => setEmailOpen(true)}>
                <Icon name="mail" /> Ubah email
              </Button>
            </div>
          </div>
        </Card>

        <Card title={isOwner ? 'Akses Anda' : 'Cabang & akses Anda'}>
          {isOwner ? (
            <p className="muted" style={{ margin: 0 }}>
              Sebagai <strong>Owner</strong>, Anda memiliki akses penuh ke semua cabang, pengaturan usaha, dan seluruh fitur sistem.
            </p>
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <span className="field-label">Cabang yang ditugaskan</span>
                <div className="chips mt" style={{ marginTop: 8 }}>
                  {outlets.length === 0 ? (
                    <span className="muted small">Belum ada cabang ditugaskan.</span>
                  ) : (
                    outlets.map((o) => (
                      <Badge key={o.id} tone="brand">
                        <Icon name="building" style={{ width: 13, height: 13 }} /> {o.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div>
                <span className="field-label">Yang dapat Anda lakukan</span>
                {perms.isLoading ? (
                  <Spinner />
                ) : (
                  <div className="table-wrap mt" style={{ marginTop: 8 }}>
                    <table className="table">
                      <tbody>
                        {PERMISSIONS.map((p) => (
                          <tr key={p.key}>
                            <td>
                              {p.label}
                              {p.hint && <div className="muted small">{p.hint}</div>}
                            </td>
                            <td align="right">
                              {heldPermissions.has(p.key) ? (
                                <Badge tone="success" dot>
                                  <Icon name="check" style={{ width: 12, height: 12 }} /> Diizinkan
                                </Badge>
                              ) : (
                                <span className="muted small">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="field-hint" style={{ marginTop: 8 }}>
                  Izin ini berlaku sama untuk semua pengguna dengan role {roleLabel[profile.role]}, diatur oleh owner di Pengaturan → Hak akses role.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {pwOpen && <ChangePasswordDialog onClose={() => setPwOpen(false)} />}
      {emailOpen && <ChangeEmailDialog currentEmail={profile.email} onClose={() => setEmailOpen(false)} />}
    </>
  );
}
