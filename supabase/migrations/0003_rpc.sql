-- =====================================================================
-- Migration 0003: fungsi bisnis (RPC) yang berjalan atomik di server.
-- Klien tidak pernah menulis langsung ke orders/payments/shifts/stok.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Penomoran transaksi per cabang (atomik, unik lintas cabang)
-- ---------------------------------------------------------------------
create or replace function public._next_order_number(p_outlet uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_fmt  text;
  v_day  date;
  v_seq  integer;
begin
  select code, order_number_format into v_code, v_fmt from public.outlets where id = p_outlet;
  if v_code is null then
    raise exception 'OUTLET_TIDAK_DITEMUKAN' using errcode = 'P0002';
  end if;

  -- Bila format tidak memuat tanggal, urutan tidak boleh di-reset harian (agar tetap unik).
  if v_fmt like '%{YYYYMMDD}%' or v_fmt like '%{YYMMDD}%' then
    v_day := (now() at time zone public._biz_tz())::date;
  else
    v_day := date '2000-01-01';
  end if;

  insert into public.outlet_order_counters as c (outlet_id, day, last_seq)
  values (p_outlet, v_day, 1)
  on conflict (outlet_id, day) do update set last_seq = c.last_seq + 1
  returning last_seq into v_seq;

  return replace(replace(replace(replace(v_fmt,
    '{CODE}', v_code),
    '{YYYYMMDD}', to_char(v_day, 'YYYYMMDD')),
    '{YYMMDD}', to_char(v_day, 'YYMMDD')),
    '{SEQ}', lpad(v_seq::text, 4, '0'));
end $$;

-- ---------------------------------------------------------------------
-- Representasi JSON lengkap satu transaksi (untuk struk)
-- ---------------------------------------------------------------------
create or replace function public._order_json(p_order uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'cashier_name', o.cashier_name,
    'outlet', jsonb_build_object('id', ou.id, 'code', ou.code, 'name', ou.name, 'address', ou.address, 'phone', ou.phone),
    'subtotal', o.subtotal,
    'discount_name', o.discount_name,
    'discount_total', o.discount_total,
    'tax_name', o.tax_name,
    'tax_rate', o.tax_rate,
    'tax_total', o.tax_total,
    'total', o.total,
    'payment_method', o.payment_method,
    'note', o.note,
    'payment', (
      select jsonb_build_object('method', pay.method, 'amount', pay.amount, 'received', pay.received, 'change', pay.change_amount)
      from public.payments pay where pay.order_id = o.id order by pay.created_at limit 1
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name,
        'variant_name', oi.variant_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'line_total', oi.line_total,
        'note', oi.note,
        'modifiers', coalesce((
          select jsonb_agg(jsonb_build_object('group_name', m.group_name, 'name', m.modifier_name, 'price_delta', m.price_delta))
          from public.order_item_modifiers m where m.order_item_id = oi.id
        ), '[]'::jsonb)
      ) order by oi.line_no)
      from public.order_items oi where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.outlets ou on ou.id = o.outlet_id
  where o.id = p_order
$$;

-- ---------------------------------------------------------------------
-- create_order: hitung ulang semua harga di server, simpan order + item + pembayaran +
-- pengurangan stok dalam satu transaksi database. Idempoten berdasarkan p->>'id'.
--
-- Payload:
-- { "id": uuid, "outlet_id": uuid, "shift_id": uuid, "offline": bool, "client_created_at": ts,
--   "note": text, "discount_id": uuid|null, "expected_total": number|null,
--   "items": [{ "product_id": uuid, "variant_id": uuid|null, "quantity": int,
--               "modifier_ids": [uuid], "note": text }],
--   "payment": { "method": "cash", "received": 50000 } }
-- ---------------------------------------------------------------------
create or replace function public.create_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_settings  public.business_settings;
  v_outlet    public.outlets;
  v_shift     public.shifts;
  v_existing  public.orders;
  v_order_id  uuid;
  v_offline   boolean := coalesce((p ->> 'offline')::boolean, false);
  v_client_ts timestamptz := nullif(p ->> 'client_created_at', '')::timestamptz;
  v_number    text;
  v_item      jsonb;
  v_line_no   integer := 0;
  v_prod      public.products;
  v_op        public.outlet_products;
  v_var       public.product_variants;
  v_has_var   boolean;
  v_cat_name  text;
  v_base      numeric;
  v_var_delta numeric;
  v_mod_total numeric;
  v_unit      numeric;
  v_qty       integer;
  v_line      numeric;
  v_item_id   uuid;
  v_mod_ids   uuid[];
  v_mod       record;
  v_grp       record;
  v_cnt       integer;
  v_min       integer;
  v_subtotal  numeric := 0;
  v_disc      public.discounts;
  v_disc_amt  numeric := 0;
  v_tax       numeric := 0;
  v_total     numeric;
  v_method    text := lower(coalesce(p #>> '{payment,method}', ''));
  v_received  numeric := coalesce((p #>> '{payment,received}')::numeric, 0);
  v_change    numeric := 0;
  v_use       record;
  v_new_stock numeric;
  v_created   timestamptz := now();
begin
  if v_uid is null then
    raise exception 'TIDAK_LOGIN' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where id = v_uid and is_active;
  if not found then
    raise exception 'AKUN_NONAKTIF' using errcode = '42501';
  end if;

  v_order_id := (p ->> 'id')::uuid;
  if v_order_id is null then
    raise exception 'ID_TRANSAKSI_WAJIB' using errcode = '22023';
  end if;

  -- Serialkan permintaan dengan id yang sama (retry / sinkronisasi ganda)
  perform pg_advisory_xact_lock(hashtextextended(v_order_id::text, 0));
  select * into v_existing from public.orders where id = v_order_id;
  if found then
    if v_existing.cashier_id is distinct from v_uid and not public.is_owner() then
      raise exception 'ID_TRANSAKSI_SUDAH_DIPAKAI' using errcode = '42501';
    end if;
    return public._order_json(v_order_id) || jsonb_build_object('duplicate', true);
  end if;

  select * into v_outlet from public.outlets where id = (p ->> 'outlet_id')::uuid;
  if not found or not public.has_outlet_access(v_outlet.id) then
    raise exception 'AKSES_CABANG_DITOLAK' using errcode = '42501';
  end if;
  if not v_outlet.is_active then
    raise exception 'CABANG_NONAKTIF' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts
  where id = nullif(p ->> 'shift_id', '')::uuid and outlet_id = v_outlet.id and cashier_id = v_uid;
  if not found then
    raise exception 'SHIFT_DIBUTUHKAN: buka shift terlebih dahulu' using errcode = '22023';
  end if;
  if v_shift.status <> 'open' and not v_offline then
    raise exception 'SHIFT_SUDAH_DITUTUP' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'KERANJANG_KOSONG' using errcode = '22023';
  end if;

  select * into v_settings from public.business_settings limit 1;

  -- Waktu transaksi: transaksi offline memakai waktu perangkat (dibatasi wajar)
  if v_offline and v_client_ts is not null and v_client_ts <= now() and v_client_ts > now() - interval '30 days' then
    v_created := v_client_ts;
  end if;

  v_number := public._next_order_number(v_outlet.id);

  insert into public.orders (
    id, outlet_id, order_number, cashier_id, cashier_name, shift_id, status,
    payment_method, note, is_offline, client_created_at, created_at, synced_at
  ) values (
    v_order_id, v_outlet.id, v_number, v_uid, v_profile.full_name, v_shift.id, 'completed',
    v_method, nullif(trim(p ->> 'note'), ''), v_offline, v_client_ts, v_created, now()
  );

  -- ---- Item ----
  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_line_no := v_line_no + 1;
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 999 then
      raise exception 'JUMLAH_TIDAK_VALID' using errcode = '22023';
    end if;

    select * into v_prod from public.products where id = (v_item ->> 'product_id')::uuid and is_active;
    if not found then
      raise exception 'PRODUK_TIDAK_DITEMUKAN' using errcode = 'P0002';
    end if;

    select * into v_op from public.outlet_products where outlet_id = v_outlet.id and product_id = v_prod.id;
    if found and not v_offline and (not v_op.is_listed or not v_op.is_available) then
      raise exception 'PRODUK_TIDAK_TERSEDIA: %', v_prod.name using errcode = '22023';
    end if;
    v_base := coalesce(v_op.price_override, v_prod.base_price);

    select name into v_cat_name from public.categories where id = v_prod.category_id;

    -- Varian
    select exists (select 1 from public.product_variants where product_id = v_prod.id and is_active) into v_has_var;
    v_var_delta := 0;
    v_var := null;
    if nullif(v_item ->> 'variant_id', '') is not null then
      select * into v_var from public.product_variants
      where id = (v_item ->> 'variant_id')::uuid and product_id = v_prod.id and is_active;
      if not found then
        raise exception 'VARIAN_TIDAK_VALID: %', v_prod.name using errcode = '22023';
      end if;
      v_var_delta := v_var.price_delta;
    elsif v_has_var then
      raise exception 'VARIAN_WAJIB: %', v_prod.name using errcode = '22023';
    end if;

    -- Modifier: harus milik grup produk ini; grup wajib harus terpenuhi
    select coalesce(array(
      select distinct x::uuid from jsonb_array_elements_text(coalesce(v_item -> 'modifier_ids', '[]'::jsonb)) x
    ), '{}') into v_mod_ids;

    select count(*) into v_cnt
    from public.modifiers m
    join public.modifier_groups g on g.id = m.group_id and g.is_active
    join public.product_modifier_groups pmg on pmg.group_id = g.id and pmg.product_id = v_prod.id
    where m.id = any (v_mod_ids) and m.is_active;
    if v_cnt <> coalesce(array_length(v_mod_ids, 1), 0) then
      raise exception 'OPSI_TIDAK_VALID: %', v_prod.name using errcode = '22023';
    end if;

    for v_grp in
      select g.* from public.product_modifier_groups pmg
      join public.modifier_groups g on g.id = pmg.group_id
      where pmg.product_id = v_prod.id and g.is_active
    loop
      select count(*) into v_cnt from public.modifiers m where m.id = any (v_mod_ids) and m.group_id = v_grp.id;
      v_min := case when v_grp.is_required then greatest(v_grp.min_select, 1) else v_grp.min_select end;
      if v_cnt < v_min then
        raise exception 'OPSI_WAJIB: % — %', v_prod.name, v_grp.name using errcode = '22023';
      end if;
      if v_grp.max_select is not null and v_cnt > v_grp.max_select then
        raise exception 'OPSI_TERLALU_BANYAK: % — %', v_prod.name, v_grp.name using errcode = '22023';
      end if;
    end loop;

    select coalesce(sum(m.price_delta), 0) into v_mod_total from public.modifiers m where m.id = any (v_mod_ids);

    v_unit := v_base + v_var_delta + v_mod_total;
    v_line := v_unit * v_qty;
    v_subtotal := v_subtotal + v_line;

    insert into public.order_items (
      order_id, outlet_id, line_no, product_id, product_name, product_sku, category_name,
      variant_id, variant_name, base_price, variant_delta, modifiers_total, unit_price, quantity, line_total, note
    ) values (
      v_order_id, v_outlet.id, v_line_no, v_prod.id, v_prod.name, v_prod.sku, v_cat_name,
      v_var.id, v_var.name, v_base, v_var_delta, v_mod_total, v_unit, v_qty, v_line,
      nullif(trim(v_item ->> 'note'), '')
    ) returning id into v_item_id;

    insert into public.order_item_modifiers (order_item_id, outlet_id, modifier_id, group_name, modifier_name, price_delta)
    select v_item_id, v_outlet.id, m.id, g.name, m.name, m.price_delta
    from public.modifiers m join public.modifier_groups g on g.id = m.group_id
    where m.id = any (v_mod_ids)
    order by g.sort_order, m.sort_order;
  end loop;

  -- ---- Diskon (hanya bagi yang berizin) ----
  if nullif(p ->> 'discount_id', '') is not null then
    if not public.has_permission('discount.apply') then
      raise exception 'TIDAK_BERIZIN_DISKON' using errcode = '42501';
    end if;
    select * into v_disc from public.discounts
    where id = (p ->> 'discount_id')::uuid and is_active and (outlet_id is null or outlet_id = v_outlet.id);
    if not found then
      raise exception 'DISKON_TIDAK_VALID' using errcode = '22023';
    end if;
    v_disc_amt := case v_disc.type
      when 'percent' then round(v_subtotal * v_disc.value / 100, 0)
      else least(v_disc.value, v_subtotal)
    end;
  end if;

  -- ---- Pajak (hanya bila diaktifkan admin) ----
  if v_settings.tax_enabled and v_settings.tax_rate > 0 then
    v_tax := round((v_subtotal - v_disc_amt) * v_settings.tax_rate / 100, 0);
  end if;

  v_total := v_subtotal - v_disc_amt + v_tax;

  if not v_offline and (p ->> 'expected_total') is not null
     and (p ->> 'expected_total')::numeric <> v_total then
    raise exception 'HARGA_BERUBAH: total di server %, di perangkat %', v_total, (p ->> 'expected_total')
      using errcode = '22023';
  end if;

  -- ---- Pembayaran ----
  if not (v_method = any (v_settings.payment_methods)) then
    raise exception 'METODE_BAYAR_TIDAK_AKTIF: %', v_method using errcode = '22023';
  end if;
  if v_method = 'cash' then
    if v_received < v_total then
      raise exception 'UANG_KURANG: total %, diterima %', v_total, v_received using errcode = '22023';
    end if;
    v_change := v_received - v_total;
  else
    v_received := v_total;
  end if;

  insert into public.payments (order_id, outlet_id, method, amount, received, change_amount, created_at)
  values (v_order_id, v_outlet.id, v_method, v_total, v_received, v_change, v_created);

  update public.orders set
    subtotal = v_subtotal,
    discount_id = v_disc.id, discount_name = v_disc.name, discount_total = v_disc_amt,
    tax_name = case when v_settings.tax_enabled and v_settings.tax_rate > 0 then v_settings.tax_name end,
    tax_rate = case when v_settings.tax_enabled then v_settings.tax_rate else 0 end,
    tax_total = v_tax,
    total = v_total
  where id = v_order_id;

  -- ---- Pengurangan stok berdasarkan resep ----
  for v_use in
    select r.ingredient_id, i.name as ingredient_name, sum(r.quantity * oi.quantity) as used
    from public.order_items oi
    join public.recipes r on r.product_id = oi.product_id
    join public.ingredients i on i.id = r.ingredient_id
    where oi.order_id = v_order_id
    group by r.ingredient_id, i.name
  loop
    insert into public.inventory_items (outlet_id, ingredient_id) values (v_outlet.id, v_use.ingredient_id)
    on conflict (outlet_id, ingredient_id) do nothing;

    update public.inventory_items
    set current_stock = current_stock - v_use.used
    where outlet_id = v_outlet.id and ingredient_id = v_use.ingredient_id
    returning current_stock into v_new_stock;

    if v_new_stock < 0 and v_settings.block_negative_stock and not v_offline then
      raise exception 'STOK_HABIS: %', v_use.ingredient_name using errcode = '22023';
    end if;

    insert into public.inventory_movements (
      outlet_id, ingredient_id, type, quantity, stock_after, reason, order_id, created_by, created_by_name
    ) values (
      v_outlet.id, v_use.ingredient_id, 'sale', -v_use.used, v_new_stock,
      'Penjualan ' || v_number, v_order_id, v_uid, v_profile.full_name
    );
  end loop;

  return public._order_json(v_order_id) || jsonb_build_object('duplicate', false);
end $$;

-- ---------------------------------------------------------------------
-- void_order: batalkan (void) atau refund transaksi. Wajib alasan; masuk audit log;
-- stok bahan dikembalikan.
-- ---------------------------------------------------------------------
create or replace function public.void_order(p_order_id uuid, p_reason text, p_kind text default 'void')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_order   public.orders;
  v_shift   uuid;
  v_mv      record;
  v_new     numeric;
begin
  select * into v_profile from public.profiles where id = v_uid and is_active;
  if not found then
    raise exception 'AKUN_NONAKTIF' using errcode = '42501';
  end if;
  if p_kind not in ('void', 'refund') then
    raise exception 'JENIS_TIDAK_VALID' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'ALASAN_WAJIB' using errcode = '22023';
  end if;
  if not public.has_permission(case p_kind when 'void' then 'order.void' else 'order.refund' end) then
    raise exception 'TIDAK_BERIZIN' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.has_outlet_access(v_order.outlet_id) then
    raise exception 'TRANSAKSI_TIDAK_DITEMUKAN' using errcode = 'P0002';
  end if;
  if v_order.cashier_id is distinct from v_uid and not public.has_permission('order.view_outlet') then
    raise exception 'TIDAK_BERIZIN' using errcode = '42501';
  end if;
  if v_order.status <> 'completed' then
    raise exception 'TRANSAKSI_SUDAH_DIBATALKAN' using errcode = '22023';
  end if;

  select id into v_shift from public.shifts
  where cashier_id = v_uid and outlet_id = v_order.outlet_id and status = 'open';

  update public.orders set
    status = case p_kind when 'void' then 'void' else 'refunded' end,
    voided_at = now(), voided_by = v_uid, voided_by_name = v_profile.full_name,
    void_reason = trim(p_reason), refund_shift_id = v_shift
  where id = p_order_id;

  -- Kembalikan stok bahan yang dipakai transaksi ini
  for v_mv in
    select ingredient_id, -sum(quantity) as qty
    from public.inventory_movements where order_id = p_order_id and type = 'sale'
    group by ingredient_id
  loop
    update public.inventory_items set current_stock = current_stock + v_mv.qty
    where outlet_id = v_order.outlet_id and ingredient_id = v_mv.ingredient_id
    returning current_stock into v_new;

    insert into public.inventory_movements (
      outlet_id, ingredient_id, type, quantity, stock_after, reason, order_id, created_by, created_by_name
    ) values (
      v_order.outlet_id, v_mv.ingredient_id, 'void_return', v_mv.qty, v_new,
      case p_kind when 'void' then 'Pembatalan ' else 'Refund ' end || v_order.order_number,
      p_order_id, v_uid, v_profile.full_name
    );
  end loop;

  perform public._audit(
    'order.' || p_kind, 'order', p_order_id::text, v_order.outlet_id,
    jsonb_build_object('order_number', v_order.order_number, 'total', v_order.total, 'reason', trim(p_reason))
  );

  return public._order_json(p_order_id);
end $$;

-- ---------------------------------------------------------------------
-- Shift kasir
-- ---------------------------------------------------------------------
create or replace function public.open_shift(p_outlet uuid, p_opening_cash numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_outlet  public.outlets;
  v_shift   public.shifts;
begin
  select * into v_profile from public.profiles where id = v_uid and is_active;
  if not found then
    raise exception 'AKUN_NONAKTIF' using errcode = '42501';
  end if;
  select * into v_outlet from public.outlets where id = p_outlet;
  if not found or not public.has_outlet_access(p_outlet) then
    raise exception 'AKSES_CABANG_DITOLAK' using errcode = '42501';
  end if;
  if not v_outlet.is_active then
    raise exception 'CABANG_NONAKTIF' using errcode = '42501';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'MODAL_AWAL_TIDAK_VALID' using errcode = '22023';
  end if;
  if exists (select 1 from public.shifts where cashier_id = v_uid and status = 'open') then
    raise exception 'SHIFT_SUDAH_ADA: tutup shift yang berjalan terlebih dahulu' using errcode = '23505';
  end if;

  insert into public.shifts (outlet_id, cashier_id, cashier_name, opening_cash)
  values (p_outlet, v_uid, v_profile.full_name, p_opening_cash)
  returning * into v_shift;

  return to_jsonb(v_shift);
end $$;

-- Ringkasan shift: penjualan tunai/non-tunai, refund, perkiraan kas.
create or replace function public.shift_summary(p_shift uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_sh          public.shifts;
  v_cash        numeric;
  v_noncash     numeric;
  v_sales       numeric;
  v_orders      integer;
  v_void_n      integer;
  v_void_sum    numeric;
  v_refund_n    integer;
  v_refund_sum  numeric;
  v_cash_out    numeric;
  v_by_method   jsonb;
  v_expected    numeric;
begin
  select * into v_sh from public.shifts where id = p_shift;
  if not found or not (
    public.is_owner()
    or (public.has_outlet_access(v_sh.outlet_id)
        and (v_sh.cashier_id = auth.uid() or public.has_permission('order.view_outlet')))
  ) then
    raise exception 'SHIFT_TIDAK_DITEMUKAN' using errcode = 'P0002';
  end if;

  select count(*), coalesce(sum(total), 0) into v_orders, v_sales
  from public.orders where shift_id = p_shift and status = 'completed';

  select coalesce(sum(pay.amount) filter (where pay.method = 'cash'), 0),
         coalesce(sum(pay.amount) filter (where pay.method <> 'cash'), 0)
    into v_cash, v_noncash
  from public.payments pay join public.orders o on o.id = pay.order_id
  where o.shift_id = p_shift and o.status = 'completed';

  select coalesce(jsonb_object_agg(method, amount), '{}'::jsonb) into v_by_method
  from (
    select pay.method, sum(pay.amount) as amount
    from public.payments pay join public.orders o on o.id = pay.order_id
    where o.shift_id = p_shift and o.status = 'completed' group by pay.method
  ) s;

  select count(*), coalesce(sum(total), 0) into v_void_n, v_void_sum
  from public.orders where shift_id = p_shift and status = 'void';

  select count(*), coalesce(sum(total), 0) into v_refund_n, v_refund_sum
  from public.orders where shift_id = p_shift and status = 'refunded';

  -- Refund tunai atas transaksi shift lain yang dibayarkan dari laci shift ini
  select coalesce(sum(pay.amount), 0) into v_cash_out
  from public.payments pay join public.orders o on o.id = pay.order_id
  where o.refund_shift_id = p_shift and o.status = 'refunded'
    and o.shift_id is distinct from p_shift and pay.method = 'cash';

  v_expected := v_sh.opening_cash + v_cash - v_cash_out;

  return jsonb_build_object(
    'shift_id', v_sh.id,
    'outlet_id', v_sh.outlet_id,
    'cashier_name', v_sh.cashier_name,
    'status', v_sh.status,
    'opened_at', v_sh.opened_at,
    'closed_at', v_sh.closed_at,
    'opening_cash', v_sh.opening_cash,
    'orders_count', v_orders,
    'sales_total', v_sales,
    'cash_sales', v_cash,
    'noncash_sales', v_noncash,
    'by_method', v_by_method,
    'void_count', v_void_n, 'void_total', v_void_sum,
    'refund_count', v_refund_n, 'refund_total', v_refund_sum,
    'cash_refunded_out', v_cash_out,
    'expected_cash', v_expected,
    'closing_cash_actual', v_sh.closing_cash_actual,
    'cash_difference', v_sh.cash_difference
  );
end $$;

create or replace function public.close_shift(p_shift uuid, p_closing_cash numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sh      public.shifts;
  v_summary jsonb;
  v_expected numeric;
begin
  select * into v_sh from public.shifts where id = p_shift for update;
  if not found or (v_sh.cashier_id <> auth.uid() and not public.is_owner()) then
    raise exception 'SHIFT_TIDAK_DITEMUKAN' using errcode = 'P0002';
  end if;
  if v_sh.status <> 'open' then
    raise exception 'SHIFT_SUDAH_DITUTUP' using errcode = '22023';
  end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'KAS_AKTUAL_TIDAK_VALID' using errcode = '22023';
  end if;

  v_summary := public.shift_summary(p_shift);
  v_expected := (v_summary ->> 'expected_cash')::numeric;

  update public.shifts set
    status = 'closed', closed_at = now(), closing_cash_actual = p_closing_cash,
    expected_cash = v_expected, cash_difference = p_closing_cash - v_expected,
    note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_shift;

  perform public._audit(
    'shift.close', 'shift', p_shift::text, v_sh.outlet_id,
    jsonb_build_object('expected_cash', v_expected, 'actual_cash', p_closing_cash, 'difference', p_closing_cash - v_expected)
  );

  return public.shift_summary(p_shift);
end $$;

-- ---------------------------------------------------------------------
-- Stok: masuk / keluar / penyesuaian (adjustment = set ke jumlah aktual)
-- ---------------------------------------------------------------------
create or replace function public.record_stock_movement(
  p_outlet uuid, p_ingredient uuid, p_type text, p_quantity numeric,
  p_reason text default null, p_min_stock numeric default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_item    public.inventory_items;
  v_delta   numeric;
  v_new     numeric;
  v_reason  text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_profile from public.profiles where id = v_uid and is_active;
  if not found then
    raise exception 'AKUN_NONAKTIF' using errcode = '42501';
  end if;
  if not (public.has_permission('inventory.manage') and public.has_outlet_access(p_outlet)) then
    raise exception 'TIDAK_BERIZIN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ingredients where id = p_ingredient) then
    raise exception 'BAHAN_TIDAK_DITEMUKAN' using errcode = 'P0002';
  end if;
  if p_type not in ('in', 'out', 'adjustment') then
    raise exception 'JENIS_STOK_TIDAK_VALID' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or (p_type <> 'adjustment' and p_quantity = 0) then
    raise exception 'JUMLAH_TIDAK_VALID' using errcode = '22023';
  end if;
  if p_type <> 'in' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'ALASAN_WAJIB' using errcode = '22023';
  end if;

  insert into public.inventory_items (outlet_id, ingredient_id, min_stock)
  values (p_outlet, p_ingredient, coalesce(p_min_stock, 0))
  on conflict (outlet_id, ingredient_id) do nothing;

  select * into v_item from public.inventory_items
  where outlet_id = p_outlet and ingredient_id = p_ingredient for update;

  v_delta := case p_type
    when 'in' then p_quantity
    when 'out' then -p_quantity
    else p_quantity - v_item.current_stock
  end;
  v_new := v_item.current_stock + v_delta;
  if v_new < 0 then
    raise exception 'STOK_TIDAK_CUKUP' using errcode = '22023';
  end if;

  update public.inventory_items
  set current_stock = v_new, min_stock = coalesce(p_min_stock, min_stock)
  where id = v_item.id;

  insert into public.inventory_movements (
    outlet_id, ingredient_id, type, quantity, stock_after, reason, created_by, created_by_name
  ) values (
    p_outlet, p_ingredient, p_type, v_delta, v_new, coalesce(v_reason, 'Stok masuk'), v_uid, v_profile.full_name
  );

  return jsonb_build_object('item_id', v_item.id, 'stock_after', v_new);
end $$;
