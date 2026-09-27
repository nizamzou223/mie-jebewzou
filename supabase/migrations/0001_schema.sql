-- =====================================================================
-- Jebewsizou — Skema database (Supabase / PostgreSQL)
-- Migration 0001: tabel, index, trigger updated_at dan trigger audit.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitas
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Cabang & pengguna
-- ---------------------------------------------------------------------
create table if not exists public.outlets (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[A-Z0-9]{2,10}$'),
  name                text not null check (length(trim(name)) > 0),
  address             text,
  phone               text,
  is_active           boolean not null default true,
  -- {"mon":{"open":"09:00","close":"21:00","closed":false}, ...}
  opening_hours       jsonb not null default '{}'::jsonb,
  -- Token: {CODE} {YYYYMMDD} {YYMMDD} {SEQ}. {CODE} dan {SEQ} wajib agar nomor unik lintas cabang.
  order_number_format text not null default '{CODE}-{YYYYMMDD}-{SEQ}'
                      check (order_number_format like '%{CODE}%' and order_number_format like '%{SEQ}%'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Satu baris per pengguna Supabase Auth. Baris dibuat otomatis oleh trigger handle_new_user.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text,
  role       text not null default 'cashier' check (role in ('owner', 'admin', 'cashier')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Penugasan pengguna ke cabang (satu atau banyak).
create table if not exists public.user_outlets (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  outlet_id  uuid not null references public.outlets (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, outlet_id)
);
create index if not exists user_outlets_outlet_idx on public.user_outlets (outlet_id);

-- Izin per role. Owner selalu memiliki semua izin (tidak disimpan di sini).
create table if not exists public.role_permissions (
  role       text not null check (role in ('admin', 'cashier')),
  permission text not null,
  primary key (role, permission)
);

-- ---------------------------------------------------------------------
-- Pengaturan usaha (satu baris)
-- ---------------------------------------------------------------------
create table if not exists public.business_settings (
  id                   boolean primary key default true check (id),
  business_name        text not null default 'Jebewsizou',
  logo_url             text,
  address              text,
  phone                text,
  receipt_header       text,
  receipt_footer       text not null default 'Terima kasih sudah makan di Jebewsizou!',
  payment_methods      text[] not null default array['cash', 'qris', 'debit'],
  tax_enabled          boolean not null default false,
  tax_name             text not null default 'PPN',
  tax_rate             numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  timezone             text not null default 'Asia/Jakarta',
  opening_hours        jsonb not null default '{}'::jsonb,
  -- true: penjualan ditolak bila stok bahan tidak cukup (transaksi offline tidak pernah ditolak)
  block_negative_stock boolean not null default false,
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Katalog (data bersama untuk semua cabang)
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  sku         text not null unique check (length(trim(sku)) > 0),
  name        text not null check (length(trim(name)) > 0),
  category_id uuid references public.categories (id),
  description text,
  base_price  numeric(14, 2) not null check (base_price >= 0),
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category_id);

-- Variasi utama produk (mis. ukuran). Bila produk punya varian aktif, kasir wajib memilih satu.
create table if not exists public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  price_delta numeric(14, 2) not null default 0,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants (product_id);

-- Grup pilihan yang dipakai ulang lintas produk: "Tingkat Pedas" (wajib), "Topping" (opsional), dst.
create table if not exists public.modifier_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  is_required boolean not null default false,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer check (max_select is null or max_select >= 1),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_select is null or max_select >= min_select)
);

create table if not exists public.modifiers (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.modifier_groups (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  price_delta numeric(14, 2) not null default 0 check (price_delta >= 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists modifiers_group_idx on public.modifiers (group_id);

create table if not exists public.product_modifier_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id   uuid not null references public.modifier_groups (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, group_id)
);

-- Pengaturan produk per cabang. Tidak ada baris = tampil, tersedia, memakai harga global.
create table if not exists public.outlet_products (
  outlet_id      uuid not null references public.outlets (id) on delete cascade,
  product_id     uuid not null references public.products (id) on delete cascade,
  price_override numeric(14, 2) check (price_override is null or price_override >= 0),
  is_listed      boolean not null default true,   -- false: tidak dijual di cabang ini
  is_available   boolean not null default true,   -- false: habis sementara
  updated_at     timestamptz not null default now(),
  primary key (outlet_id, product_id)
);
create index if not exists outlet_products_product_idx on public.outlet_products (product_id);

-- Diskon. outlet_id null = berlaku untuk semua cabang (hanya owner yang mengelola).
create table if not exists public.discounts (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid references public.outlets (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  type       text not null check (type in ('percent', 'fixed')),
  value      numeric(14, 2) not null check (value > 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'percent' or value <= 100)
);

-- ---------------------------------------------------------------------
-- Bahan & stok (stok dicatat per cabang)
-- ---------------------------------------------------------------------
create table if not exists public.ingredients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  unit       text not null check (length(trim(unit)) > 0),  -- gram, kg, porsi, botol, pcs, ...
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  outlet_id     uuid not null references public.outlets (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  current_stock numeric(14, 3) not null default 0,
  min_stock     numeric(14, 3) not null default 0 check (min_stock >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (outlet_id, ingredient_id)
);

-- Buku besar stok: quantity bertanda (+ masuk, - keluar). Hanya ditulis lewat fungsi RPC.
create table if not exists public.inventory_movements (
  id              bigint generated always as identity primary key,
  outlet_id       uuid not null references public.outlets (id),
  ingredient_id   uuid not null references public.ingredients (id),
  type            text not null check (type in ('in', 'out', 'adjustment', 'sale', 'void_return')),
  quantity        numeric(14, 3) not null,
  stock_after     numeric(14, 3) not null,
  reason          text,
  order_id        uuid,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists inventory_movements_outlet_idx on public.inventory_movements (outlet_id, created_at desc);
create index if not exists inventory_movements_ingredient_idx on public.inventory_movements (ingredient_id);
create index if not exists inventory_movements_order_idx on public.inventory_movements (order_id);

-- Resep: bahan yang berkurang untuk satu porsi produk.
create table if not exists public.recipes (
  product_id    uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  quantity      numeric(14, 3) not null check (quantity > 0),
  primary key (product_id, ingredient_id)
);

-- ---------------------------------------------------------------------
-- Shift kasir
-- ---------------------------------------------------------------------
create table if not exists public.shifts (
  id                  uuid primary key default gen_random_uuid(),
  outlet_id           uuid not null references public.outlets (id),
  cashier_id          uuid not null references public.profiles (id),
  cashier_name        text not null default '',
  status              text not null default 'open' check (status in ('open', 'closed')),
  opened_at           timestamptz not null default now(),
  opening_cash        numeric(14, 2) not null check (opening_cash >= 0),
  closed_at           timestamptz,
  closing_cash_actual numeric(14, 2) check (closing_cash_actual is null or closing_cash_actual >= 0),
  expected_cash       numeric(14, 2),
  cash_difference     numeric(14, 2),
  note                text
);
create unique index if not exists shifts_one_open_per_cashier on public.shifts (cashier_id) where status = 'open';
create index if not exists shifts_outlet_idx on public.shifts (outlet_id, opened_at desc);

-- ---------------------------------------------------------------------
-- Transaksi. Ditulis hanya lewat RPC create_order / void_order.
-- ---------------------------------------------------------------------
create table if not exists public.outlet_order_counters (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  day       date not null,
  last_seq  integer not null default 0,
  primary key (outlet_id, day)
);

create table if not exists public.orders (
  id                uuid primary key,             -- dibuat di aplikasi kasir (kunci idempotensi)
  outlet_id         uuid not null references public.outlets (id),
  order_number      text not null unique,
  cashier_id        uuid references public.profiles (id),
  cashier_name      text not null default '',     -- snapshot
  shift_id          uuid references public.shifts (id),
  status            text not null default 'completed' check (status in ('completed', 'void', 'refunded')),
  subtotal          numeric(14, 2) not null default 0,
  discount_id       uuid,
  discount_name     text,
  discount_total    numeric(14, 2) not null default 0,
  tax_name          text,
  tax_rate          numeric(5, 2) not null default 0,
  tax_total         numeric(14, 2) not null default 0,
  total             numeric(14, 2) not null default 0,
  payment_method    text,
  note              text,
  is_offline        boolean not null default false,
  client_created_at timestamptz,
  created_at        timestamptz not null default now(),
  synced_at         timestamptz not null default now(),
  voided_at         timestamptz,
  voided_by         uuid,
  voided_by_name    text,
  void_reason       text,
  refund_shift_id   uuid
);
create index if not exists orders_outlet_created_idx on public.orders (outlet_id, created_at desc);
create index if not exists orders_cashier_idx on public.orders (cashier_id, created_at desc);
create index if not exists orders_shift_idx on public.orders (shift_id);
create index if not exists orders_status_idx on public.orders (status);

-- Detail memakai snapshot supaya histori tidak berubah saat produk diedit.
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  outlet_id     uuid not null references public.outlets (id),
  line_no       integer not null default 0,
  product_id    uuid references public.products (id) on delete set null,
  product_name  text not null,
  product_sku   text,
  category_name text,
  variant_id    uuid,
  variant_name  text,
  base_price    numeric(14, 2) not null,
  variant_delta numeric(14, 2) not null default 0,
  modifiers_total numeric(14, 2) not null default 0,
  unit_price    numeric(14, 2) not null,
  quantity      integer not null check (quantity > 0),
  line_total    numeric(14, 2) not null,
  note          text
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
create index if not exists order_items_outlet_idx on public.order_items (outlet_id);

create table if not exists public.order_item_modifiers (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  outlet_id     uuid not null references public.outlets (id),
  modifier_id   uuid,
  group_name    text not null,
  modifier_name text not null,
  price_delta   numeric(14, 2) not null default 0
);
create index if not exists order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id);

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  outlet_id     uuid not null references public.outlets (id),
  method        text not null,
  amount        numeric(14, 2) not null check (amount >= 0),   -- yang dibayarkan untuk tagihan
  received      numeric(14, 2) not null check (received >= 0), -- uang diterima (tunai bisa > amount)
  change_amount numeric(14, 2) not null default 0 check (change_amount >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments (order_id);

-- ---------------------------------------------------------------------
-- Audit log (hanya ditulis oleh trigger / fungsi RPC)
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  user_name  text,
  outlet_id  uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_outlet_idx on public.audit_logs (outlet_id, created_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- ---------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'outlets', 'profiles', 'business_settings', 'categories', 'products', 'product_variants',
    'modifier_groups', 'modifiers', 'outlet_products', 'discounts', 'ingredients', 'inventory_items'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
