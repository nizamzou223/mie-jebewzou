-- =====================================================================
-- Migration 0002: fungsi keamanan, trigger audit, dan Row Level Security.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Izin bawaan (owner otomatis memiliki semuanya)
-- ---------------------------------------------------------------------
-- product.manage_global : ubah data produk/varian/resep global (semua cabang)
-- product.manage_outlet : ubah harga khusus & ketersediaan produk di cabangnya
-- category.manage       : kelola kategori & grup variasi/tambahan
-- inventory.manage      : kelola bahan, stok masuk/keluar/penyesuaian di cabangnya
-- user.manage           : kelola akun kasir di cabangnya
-- order.view_outlet     : melihat semua transaksi di cabangnya (kasir hanya miliknya)
-- order.void            : membatalkan transaksi
-- order.refund          : refund transaksi
-- discount.apply        : memberi diskon saat transaksi
-- discount.manage       : kelola diskon cabang
-- report.view           : melihat laporan & dashboard
-- audit.view            : melihat riwayat aktivitas cabangnya
insert into public.role_permissions (role, permission) values
  ('admin', 'product.manage_outlet'),
  ('admin', 'inventory.manage'),
  ('admin', 'user.manage'),
  ('admin', 'order.view_outlet'),
  ('admin', 'order.void'),
  ('admin', 'order.refund'),
  ('admin', 'discount.apply'),
  ('admin', 'discount.manage'),
  ('admin', 'report.view'),
  ('admin', 'audit.view')
on conflict do nothing;

insert into public.business_settings (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Fungsi bantu (SECURITY DEFINER agar tidak terkena RLS saat dipakai di policy)
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from public.profiles where id = auth.uid() and is_active), false)
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

create or replace function public.has_outlet_access(p_outlet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1
    from public.user_outlets uo
    join public.profiles p on p.id = uo.user_id
    where uo.user_id = auth.uid() and uo.outlet_id = p_outlet and p.is_active
  )
$$;

create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1
    from public.role_permissions rp
    where rp.role = public.current_role_name() and rp.permission = p_permission
  )
$$;

-- Apakah pengguna saat ini berbagi minimal satu cabang dengan pengguna target?
create or replace function public.shares_outlet_with(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_outlets a
    join public.user_outlets b on b.outlet_id = a.outlet_id
    where a.user_id = auth.uid() and b.user_id = p_target
  )
$$;

-- Boleh mengelola akun target? Owner: semua. Admin ber-izin user.manage: hanya kasir di cabang yang sama.
create or replace function public.can_manage_user(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or (
    public.has_permission('user.manage')
    and p_target <> auth.uid()
    and (select role from public.profiles where id = p_target) = 'cashier'
    and public.shares_outlet_with(p_target)
  )
$$;

-- Boleh menugaskan/mencabut target pada cabang tertentu?
-- Admin hanya untuk kasir di cabangnya, dan hanya kasir yang sudah berbagi cabang dengannya
-- atau yang belum punya cabang sama sekali (agar tidak menarik kasir cabang lain).
create or replace function public.can_assign_outlet(p_target uuid, p_outlet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or (
    public.has_permission('user.manage')
    and public.has_outlet_access(p_outlet)
    and (select role from public.profiles where id = p_target) = 'cashier'
    and (
      public.shares_outlet_with(p_target)
      or not exists (select 1 from public.user_outlets where user_id = p_target)
    )
  )
$$;

-- Zona waktu bisnis (untuk penomoran & laporan harian)
create or replace function public._biz_tz()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from public.business_settings limit 1), 'Asia/Jakarta')
$$;

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create or replace function public._audit(
  p_action text, p_entity text, p_entity_id text, p_outlet uuid, p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (user_id, user_name, outlet_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    (select full_name from public.profiles where id = auth.uid()),
    p_outlet, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb)
  );
end $$;

-- Trigger generik: mencatat insert/update/delete beserta perubahan kolomnya.
create or replace function public._audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entity  text := tg_argv[0];
  v_row     jsonb;
  v_details jsonb;
  v_outlet  uuid;
  v_id      text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_details := jsonb_build_object('old', v_row);
  elsif tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_details := jsonb_build_object('new', v_row);
  else
    v_row := to_jsonb(new);
    select jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      into v_details
    from jsonb_each(to_jsonb(new)) n
    left join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key <> 'updated_at';
    if v_details is null then
      return new;   -- tidak ada perubahan bermakna
    end if;
    v_details := jsonb_build_object('changes', v_details);
  end if;

  v_outlet := case
    when v_entity = 'outlet' then (v_row ->> 'id')::uuid
    else nullif(v_row ->> 'outlet_id', '')::uuid
  end;
  v_id := coalesce(
    v_row ->> 'id',
    v_row ->> 'permission',
    concat_ws(':', v_row ->> 'user_id', v_row ->> 'outlet_id', v_row ->> 'product_id', v_row ->> 'group_id')
  );

  perform public._audit(v_entity || '.' || lower(tg_op), v_entity, v_id, v_outlet, v_details);
  return coalesce(new, old);
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('outlets', 'outlet'), ('profiles', 'user'), ('user_outlets', 'user_outlet'),
    ('role_permissions', 'permission'), ('business_settings', 'settings'),
    ('categories', 'category'), ('products', 'product'), ('product_variants', 'variant'),
    ('modifier_groups', 'modifier_group'), ('modifiers', 'modifier'),
    ('product_modifier_groups', 'product_modifier_group'),
    ('outlet_products', 'outlet_product'), ('discounts', 'discount'),
    ('ingredients', 'ingredient'), ('recipes', 'recipe')
  ) as t(tbl, entity) loop
    execute format('drop trigger if exists trg_audit_%s on public.%I', r.tbl, r.tbl);
    execute format('create trigger trg_audit_%s after insert or update or delete on public.%I
                    for each row execute function public._audit_row(%L)', r.tbl, r.tbl, r.entity);
  end loop;
end $$;

-- Perubahan stok manual (bukan penjualan) juga dicatat.
drop trigger if exists trg_audit_inventory_movements on public.inventory_movements;
create trigger trg_audit_inventory_movements after insert on public.inventory_movements
  for each row when (new.type in ('in', 'out', 'adjustment'))
  execute function public._audit_row('stock');

-- ---------------------------------------------------------------------
-- Pembuatan profil otomatis saat akun Auth dibuat.
-- role & nama diambil dari app_metadata (hanya bisa diisi lewat Admin API/service role).
-- Akun pertama di sistem otomatis menjadi owner. Pendaftaran mandiri tanpa metadata
-- menghasilkan akun kasir NONAKTIF tanpa cabang (matikan sign-up publik di Supabase).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first boolean := not exists (select 1 from public.profiles);
  v_role  text := new.raw_app_meta_data ->> 'role';
begin
  if v_first then
    v_role := 'owner';
  elsif v_role is null or v_role not in ('owner', 'admin', 'cashier') then
    v_role := 'cashier';
  end if;

  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(nullif(new.raw_app_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    v_role,
    v_first or (new.raw_app_meta_data ->> 'role') is not null
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Menjaga integritas profil: admin tidak boleh mengubah role/identitas, dan sistem
-- tidak boleh kehilangan owner aktif terakhir.
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
  end if;
  if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active) then
    if not exists (select 1 from public.profiles where role = 'owner' and is_active and id <> old.id) then
      raise exception 'Harus ada minimal satu owner aktif' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
create or replace function public._reset_policies(p_table regclass)
returns void language plpgsql as $$
declare r record;
begin
  for r in select polname from pg_policy where polrelid = p_table loop
    execute format('drop policy %I on %s', r.polname, p_table);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'outlets', 'profiles', 'user_outlets', 'role_permissions', 'business_settings',
    'categories', 'products', 'product_variants', 'modifier_groups', 'modifiers',
    'product_modifier_groups', 'outlet_products', 'discounts', 'ingredients',
    'inventory_items', 'inventory_movements', 'recipes', 'shifts', 'outlet_order_counters',
    'orders', 'order_items', 'order_item_modifiers', 'payments', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    perform public._reset_policies(format('public.%I', t)::regclass);
  end loop;
end $$;

-- outlets: pengguna melihat cabangnya; hanya owner yang menulis (tanpa delete: gunakan nonaktifkan)
create policy outlets_select on public.outlets for select to authenticated
  using (public.has_outlet_access(id));
create policy outlets_insert on public.outlets for insert to authenticated
  with check (public.is_owner());
create policy outlets_update on public.outlets for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid() or public.is_owner()
    or (public.has_permission('user.manage') and public.shares_outlet_with(id))
  );
create policy profiles_update on public.profiles for update to authenticated
  using (public.can_manage_user(id)) with check (public.can_manage_user(id));

-- user_outlets
create policy user_outlets_select on public.user_outlets for select to authenticated
  using (
    user_id = auth.uid() or public.is_owner()
    or (public.has_permission('user.manage') and public.has_outlet_access(outlet_id))
  );
create policy user_outlets_insert on public.user_outlets for insert to authenticated
  with check (public.can_assign_outlet(user_id, outlet_id));
create policy user_outlets_delete on public.user_outlets for delete to authenticated
  using (public.can_assign_outlet(user_id, outlet_id));

-- role_permissions: semua pengguna aktif boleh membaca (aplikasi butuh untuk menampilkan menu); owner menulis
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (public.is_active_user());
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- business_settings
create policy business_settings_select on public.business_settings for select to authenticated
  using (public.is_active_user());
create policy business_settings_update on public.business_settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Katalog global: semua pengguna aktif membaca; penulisan sesuai izin
create policy categories_select on public.categories for select to authenticated using (public.is_active_user());
create policy categories_insert on public.categories for insert to authenticated with check (public.has_permission('category.manage'));
create policy categories_update on public.categories for update to authenticated
  using (public.has_permission('category.manage')) with check (public.has_permission('category.manage'));

create policy products_select on public.products for select to authenticated using (public.is_active_user());
create policy products_insert on public.products for insert to authenticated with check (public.has_permission('product.manage_global'));
create policy products_update on public.products for update to authenticated
  using (public.has_permission('product.manage_global')) with check (public.has_permission('product.manage_global'));

create policy product_variants_select on public.product_variants for select to authenticated using (public.is_active_user());
create policy product_variants_write on public.product_variants for all to authenticated
  using (public.has_permission('product.manage_global')) with check (public.has_permission('product.manage_global'));

create policy recipes_select on public.recipes for select to authenticated using (public.is_active_user());
create policy recipes_write on public.recipes for all to authenticated
  using (public.has_permission('product.manage_global')) with check (public.has_permission('product.manage_global'));

create policy modifier_groups_select on public.modifier_groups for select to authenticated using (public.is_active_user());
create policy modifier_groups_write on public.modifier_groups for all to authenticated
  using (public.has_permission('category.manage')) with check (public.has_permission('category.manage'));

create policy modifiers_select on public.modifiers for select to authenticated using (public.is_active_user());
create policy modifiers_write on public.modifiers for all to authenticated
  using (public.has_permission('category.manage')) with check (public.has_permission('category.manage'));

create policy product_modifier_groups_select on public.product_modifier_groups for select to authenticated using (public.is_active_user());
create policy product_modifier_groups_write on public.product_modifier_groups for all to authenticated
  using (public.has_permission('product.manage_global')) with check (public.has_permission('product.manage_global'));

create policy ingredients_select on public.ingredients for select to authenticated using (public.is_active_user());
create policy ingredients_write on public.ingredients for all to authenticated
  using (public.has_permission('inventory.manage')) with check (public.has_permission('inventory.manage'));

-- Pengaturan produk per cabang
create policy outlet_products_select on public.outlet_products for select to authenticated
  using (public.has_outlet_access(outlet_id));
create policy outlet_products_write on public.outlet_products for all to authenticated
  using (public.has_permission('product.manage_outlet') and public.has_outlet_access(outlet_id))
  with check (public.has_permission('product.manage_outlet') and public.has_outlet_access(outlet_id));

-- Diskon: global (outlet_id null) hanya owner; diskon cabang oleh pemilik izin di cabangnya
create policy discounts_select on public.discounts for select to authenticated
  using (public.is_active_user() and (outlet_id is null or public.has_outlet_access(outlet_id)));
create policy discounts_write on public.discounts for all to authenticated
  using (
    public.is_owner()
    or (outlet_id is not null and public.has_permission('discount.manage') and public.has_outlet_access(outlet_id))
  )
  with check (
    public.is_owner()
    or (outlet_id is not null and public.has_permission('discount.manage') and public.has_outlet_access(outlet_id))
  );

-- Stok per cabang. Perubahan jumlah stok HANYA lewat RPC (kolom current_stock tidak dapat ditulis klien).
create policy inventory_items_select on public.inventory_items for select to authenticated
  using (public.has_outlet_access(outlet_id));
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (public.has_permission('inventory.manage') and public.has_outlet_access(outlet_id))
  with check (public.has_permission('inventory.manage') and public.has_outlet_access(outlet_id));

create policy inventory_movements_select on public.inventory_movements for select to authenticated
  using (public.has_outlet_access(outlet_id) and public.has_permission('inventory.manage'));

-- Shift
create policy shifts_select on public.shifts for select to authenticated
  using (
    public.is_owner()
    or (public.has_outlet_access(outlet_id) and (cashier_id = auth.uid() or public.has_permission('order.view_outlet')))
  );

-- Transaksi (baca saja; tulis lewat RPC)
create policy orders_select on public.orders for select to authenticated
  using (
    public.is_owner()
    or (public.has_outlet_access(outlet_id) and (cashier_id = auth.uid() or public.has_permission('order.view_outlet')))
  );
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_item_modifiers_select on public.order_item_modifiers for select to authenticated
  using (exists (select 1 from public.order_items i where i.id = order_item_id));
create policy payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- Audit log: owner semua; pemilik izin audit.view hanya cabangnya
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    public.is_owner()
    or (public.has_permission('audit.view') and outlet_id is not null and public.has_outlet_access(outlet_id))
  );

-- outlet_order_counters: RLS aktif tanpa policy = tidak dapat diakses klien sama sekali.

-- ---------------------------------------------------------------------
-- Hak akses tingkat tabel (lapisan kedua di atas RLS)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Tabel yang tidak boleh ditulis langsung oleh klien
revoke insert, update, delete on
  public.orders, public.order_items, public.order_item_modifiers, public.payments,
  public.shifts, public.inventory_movements, public.audit_logs, public.outlet_order_counters
from authenticated;
revoke select on public.outlet_order_counters from authenticated;
-- stok: klien hanya boleh mengubah batas minimum; jumlah stok lewat RPC
revoke insert, delete, update on public.inventory_items from authenticated;
grant update (min_stock) on public.inventory_items to authenticated;
revoke delete on public.outlets, public.categories, public.products, public.business_settings from authenticated;
revoke insert on public.business_settings from authenticated;
-- profil dibuat oleh trigger; klien hanya boleh mengubah kolom berikut
-- (perubahan role dibatasi lagi oleh RLS + trigger guard_profile_update: hanya owner)
revoke insert, delete, update on public.profiles from authenticated;
grant update (full_name, is_active, role) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket publik "media" untuk gambar produk & logo
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
    on conflict (id) do update set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

    drop policy if exists media_read on storage.objects;
    drop policy if exists media_insert on storage.objects;
    drop policy if exists media_update on storage.objects;
    drop policy if exists media_delete on storage.objects;
    create policy media_read on storage.objects for select using (bucket_id = 'media');
    create policy media_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and (public.is_owner() or public.has_permission('product.manage_global')));
    create policy media_update on storage.objects for update to authenticated
      using (bucket_id = 'media' and (public.is_owner() or public.has_permission('product.manage_global')));
    create policy media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'media' and (public.is_owner() or public.has_permission('product.manage_global')));
  end if;
end $$;
