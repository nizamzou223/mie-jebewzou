-- =====================================================================
-- Migration 0005: foto profil pengguna, dan izin agar setiap pengguna dapat
-- memperbarui profilnya sendiri (nama & foto) — sebelumnya hanya owner yang bisa
-- mengubah profil siapa pun, dan admin cabang hanya bisa mengubah akun KASIR
-- di cabangnya, tidak termasuk dirinya sendiri.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

alter table public.profiles add column if not exists avatar_url text;

-- Kolom is_active sudah bisa ditulis klien sejak awal (dipakai saat admin mengubah baris
-- pengguna LAIN), tapi sebelum ini baris milik sendiri sama sekali tidak bisa diubah oleh
-- non-owner sehingga celah ini tidak pernah aktif. Karena migrasi ini mengizinkan setiap
-- pengguna memperbarui baris miliknya sendiri (untuk nama & foto), tambahkan penjagaan
-- eksplisit: non-owner tidak boleh menonaktifkan akunnya sendiri lewat jalur ini.
-- Menonaktifkan akun tetap lewat Edge Function admin-users (service role), bukan tabel langsung.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id then
    raise exception 'ID profil tidak boleh diubah' using errcode = '42501';
  end if;
  -- auth.uid() null = dijalankan dari SQL editor / service role (dipercaya)
  if auth.uid() is not null and not public.is_owner() then
    if new.role <> old.role then
      raise exception 'Hanya owner yang dapat mengubah role' using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Email tidak dapat diubah dari sini' using errcode = '42501';
    end if;
    if new.id = auth.uid() and new.is_active <> old.is_active then
      raise exception 'Tidak dapat mengubah status aktif akun sendiri' using errcode = '42501';
    end if;
  end if;
  if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active) then
    if not exists (select 1 from public.profiles where role = 'owner' and is_active and id <> old.id) then
      raise exception 'Harus ada minimal satu owner aktif' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Setiap pengguna boleh mengubah profilnya sendiri (kolom dibatasi lewat GRANT di bawah:
-- hanya full_name & avatar_url yang benar-benar berguna diubah sendiri). Perubahan role/email
-- tetap diblokir oleh trigger guard_profile_update terlepas dari izin baris di sini, dan
-- owner aktif terakhir tetap tidak bisa menonaktifkan dirinya sendiri (trigger yang sama).
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_manage_user(id))
  with check (id = auth.uid() or public.can_manage_user(id));

grant update (avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Storage: setiap pengguna boleh mengunggah/mengganti/menghapus foto profilnya
-- sendiri di bucket "media", khusus di dalam folder avatars/<user id milik sendiri>/.
-- Kebijakan media_* yang sudah ada (khusus product.manage_global) tetap berlaku
-- untuk folder lain seperti products/ dan branding/.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists media_avatar_insert on storage.objects;
    drop policy if exists media_avatar_update on storage.objects;
    drop policy if exists media_avatar_delete on storage.objects;
    create policy media_avatar_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
    create policy media_avatar_update on storage.objects for update to authenticated
      using (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
    create policy media_avatar_delete on storage.objects for delete to authenticated
      using (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end $$;
