-- =====================================================================
-- Migration 0004: laporan, dashboard, dan hak eksekusi fungsi.
-- Fungsi laporan berjalan sebagai SECURITY INVOKER: RLS tetap berlaku, sehingga admin cabang
-- hanya mendapatkan angka dari cabangnya sendiri. Basis tanggal = tanggal transaksi (zona
-- waktu usaha). Omzet = total transaksi berstatus 'completed'.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create or replace function public._require_report_access()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('report.view') then
    raise exception 'TIDAK_BERIZIN' using errcode = '42501';
  end if;
end $$;

-- Ringkasan angka utama. p_outlet null = semua cabang yang boleh diakses. p_method null = semua metode.
create or replace function public.report_summary(
  p_from date, p_to date, p_outlet uuid default null, p_method text default null
) returns table (
  orders_count bigint, gross numeric, discount numeric, tax numeric, net_sales numeric,
  avg_order numeric, refund_count bigint, refund_total numeric, void_count bigint, void_total numeric
) language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz text := public._biz_tz();
  v_from timestamptz := p_from::timestamp at time zone v_tz;
  v_to   timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  perform public._require_report_access();
  return query
  select
    count(*) filter (where o.status = 'completed'),
    coalesce(sum(o.subtotal) filter (where o.status = 'completed'), 0),
    coalesce(sum(o.discount_total) filter (where o.status = 'completed'), 0),
    coalesce(sum(o.tax_total) filter (where o.status = 'completed'), 0),
    coalesce(sum(o.total) filter (where o.status = 'completed'), 0),
    coalesce(round(avg(o.total) filter (where o.status = 'completed'), 0), 0),
    count(*) filter (where o.status = 'refunded'),
    coalesce(sum(o.total) filter (where o.status = 'refunded'), 0),
    count(*) filter (where o.status = 'void'),
    coalesce(sum(o.total) filter (where o.status = 'void'), 0)
  from public.orders o
  where o.created_at >= v_from and o.created_at < v_to
    and (p_outlet is null or o.outlet_id = p_outlet)
    and (p_method is null or o.payment_method = p_method);
end $$;

-- Rincian per dimensi: day | week | month | hour | product | category | cashier | outlet | method
-- Untuk product/category angka memakai total baris item (sebelum diskon tingkat transaksi).
create or replace function public.report_breakdown(
  p_dimension text, p_from date, p_to date, p_outlet uuid default null, p_method text default null
) returns table (
  key text, label text, orders_count bigint, quantity numeric, gross numeric, discount numeric, net numeric
) language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz text := public._biz_tz();
  v_from timestamptz := p_from::timestamp at time zone v_tz;
  v_to   timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  perform public._require_report_access();

  if p_dimension in ('product', 'category') then
    return query
    select
      case p_dimension when 'product' then coalesce(oi.product_id::text, oi.product_name) else coalesce(oi.category_name, '-') end,
      case p_dimension when 'product' then oi.product_name else coalesce(oi.category_name, 'Tanpa kategori') end,
      count(distinct o.id),
      sum(oi.quantity)::numeric,
      sum(oi.line_total),
      0::numeric,
      sum(oi.line_total)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = 'completed' and o.created_at >= v_from and o.created_at < v_to
      and (p_outlet is null or o.outlet_id = p_outlet)
      and (p_method is null or o.payment_method = p_method)
    group by 1, 2
    order by sum(oi.line_total) desc;
    return;
  end if;

  if p_dimension not in ('day', 'week', 'month', 'hour', 'cashier', 'outlet', 'method') then
    raise exception 'DIMENSI_TIDAK_VALID' using errcode = '22023';
  end if;

  return query
  with base as (
    select o.*, ou.name as outlet_name,
           (o.created_at at time zone v_tz) as local_ts,
           coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id), 0) as qty
    from public.orders o
    join public.outlets ou on ou.id = o.outlet_id
    where o.status = 'completed' and o.created_at >= v_from and o.created_at < v_to
      and (p_outlet is null or o.outlet_id = p_outlet)
      and (p_method is null or o.payment_method = p_method)
  )
  select
    k.key, k.label,
    count(*), sum(b.qty)::numeric, sum(b.subtotal), sum(b.discount_total), sum(b.total)
  from base b
  cross join lateral (
    select
      case p_dimension
        when 'day' then to_char(b.local_ts, 'YYYY-MM-DD')
        when 'week' then to_char(date_trunc('week', b.local_ts), 'YYYY-MM-DD')
        when 'month' then to_char(b.local_ts, 'YYYY-MM')
        when 'hour' then to_char(b.local_ts, 'HH24')
        when 'cashier' then coalesce(b.cashier_id::text, b.cashier_name)
        when 'outlet' then b.outlet_id::text
        else coalesce(b.payment_method, '-')
      end as key,
      case p_dimension
        when 'day' then to_char(b.local_ts, 'YYYY-MM-DD')
        when 'week' then to_char(date_trunc('week', b.local_ts), 'YYYY-MM-DD')
        when 'month' then to_char(b.local_ts, 'YYYY-MM')
        when 'hour' then to_char(b.local_ts, 'HH24')
        when 'cashier' then b.cashier_name
        when 'outlet' then b.outlet_name
        else coalesce(b.payment_method, '-')
      end as label
  ) k
  group by k.key, k.label
  order by case when p_dimension in ('day', 'week', 'month', 'hour') then k.key end asc,
           sum(b.total) desc;
end $$;

-- Bahan yang stoknya <= batas minimum (per cabang)
create or replace function public.low_stock_items(p_outlet uuid default null)
returns table (
  outlet_id uuid, outlet_name text, ingredient_id uuid, ingredient_name text,
  unit text, current_stock numeric, min_stock numeric
) language sql stable security invoker set search_path = public as $$
  select i.outlet_id, ou.name, i.ingredient_id, g.name, g.unit, i.current_stock, i.min_stock
  from public.inventory_items i
  join public.outlets ou on ou.id = i.outlet_id
  join public.ingredients g on g.id = i.ingredient_id
  where g.is_active and ou.is_active and i.current_stock <= i.min_stock
    and (p_outlet is null or i.outlet_id = p_outlet)
  order by (i.current_stock - i.min_stock), ou.name, g.name
$$;

-- ---------------------------------------------------------------------
-- Hak eksekusi fungsi: hanya pengguna login (authenticated) & service_role.
-- Fungsi internal berawalan "_" tidak boleh dipanggil klien.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on function
  public._audit(text, text, text, uuid, jsonb),
  public._next_order_number(uuid),
  public._order_json(uuid)
from authenticated;
-- (_require_report_access & _biz_tz sengaja tetap dapat dieksekusi: dipanggil dari fungsi invoker.)

-- Fungsi yang dibuat di masa depan tidak otomatis dapat dieksekusi anon/public.
alter default privileges in schema public revoke execute on functions from public, anon;
