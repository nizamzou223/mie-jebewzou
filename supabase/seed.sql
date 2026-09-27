-- =====================================================================
-- Data awal Mie Jebew (kategori, variasi, menu contoh, bahan & resep).
-- Aman dijalankan ulang. Ubah / hapus menu contoh sesuai kebutuhan lewat website admin.
-- Tidak membuat pengguna maupun cabang: buat akun owner dulu (lihat README), lalu cabang lewat admin.
-- =====================================================================

insert into public.categories (name, sort_order) values
  ('Mie', 1), ('Minuman', 2), ('Topping', 3), ('Paket', 4), ('Tambahan', 5)
on conflict (name) do nothing;

-- Grup pilihan
insert into public.modifier_groups (name, is_required, min_select, max_select, sort_order) values
  ('Tingkat Pedas', true, 1, 1, 1),
  ('Topping', false, 0, null, 2),
  ('Tambahan', false, 0, null, 3)
on conflict (name) do nothing;

insert into public.modifiers (group_id, name, price_delta, sort_order)
select g.id, v.name, v.price, v.ord
from (values
  ('Tingkat Pedas', 'Level 0 (Tidak pedas)', 0, 1),
  ('Tingkat Pedas', 'Level 1', 0, 2),
  ('Tingkat Pedas', 'Level 2', 0, 3),
  ('Tingkat Pedas', 'Level 3', 0, 4),
  ('Tingkat Pedas', 'Level 5 (Jebew!)', 1000, 5),
  ('Topping', 'Telur', 4000, 1),
  ('Topping', 'Bakso', 5000, 2),
  ('Topping', 'Ceker', 6000, 3),
  ('Topping', 'Keju', 4000, 4),
  ('Tambahan', 'Kerupuk', 2000, 1),
  ('Tambahan', 'Nasi Putih', 4000, 2)
) as v(grp, name, price, ord)
join public.modifier_groups g on g.name = v.grp
where not exists (select 1 from public.modifiers m where m.group_id = g.id and m.name = v.name);

-- Menu contoh
insert into public.products (sku, name, category_id, description, base_price)
select v.sku, v.name, c.id, v.descr, v.price
from (values
  ('MIE-001', 'Mie Jebew Original', 'Mie', 'Mie pedas khas Jebew dengan bumbu rahasia', 15000),
  ('MIE-002', 'Mie Jebew Special', 'Mie', 'Mie Jebew dengan telur dan bakso', 22000),
  ('MIE-003', 'Mie Ayam Jebew', 'Mie', 'Mie ayam gurih dengan sambal pilihan', 17000),
  ('MIN-001', 'Es Teh Manis', 'Minuman', 'Teh manis dingin', 5000),
  ('MIN-002', 'Es Jeruk', 'Minuman', 'Jeruk peras segar', 7000),
  ('MIN-003', 'Air Mineral', 'Minuman', 'Botol 600 ml', 4000),
  ('TOP-001', 'Telur Rebus', 'Topping', 'Tambahan telur rebus', 4000),
  ('PKT-001', 'Paket Hemat Jebew', 'Paket', 'Mie Jebew Original + Es Teh Manis', 18000)
) as v(sku, name, cat, descr, price)
join public.categories c on c.name = v.cat
on conflict (sku) do nothing;

-- Pilihan tingkat pedas & topping untuk menu mie
insert into public.product_modifier_groups (product_id, group_id, sort_order)
select p.id, g.id, case g.name when 'Tingkat Pedas' then 1 when 'Topping' then 2 else 3 end
from public.products p
join public.modifier_groups g on g.name in ('Tingkat Pedas', 'Topping', 'Tambahan')
where p.sku in ('MIE-001', 'MIE-002', 'MIE-003')
on conflict do nothing;

-- Ukuran untuk minuman
insert into public.product_variants (product_id, name, price_delta, sort_order)
select p.id, v.name, v.delta, v.ord
from public.products p
cross join (values ('Reguler', 0, 1), ('Large', 3000, 2)) as v(name, delta, ord)
where p.sku in ('MIN-001', 'MIN-002')
  and not exists (select 1 from public.product_variants pv where pv.product_id = p.id and pv.name = v.name);

-- Bahan baku & resep contoh
insert into public.ingredients (name, unit) values
  ('Mie mentah', 'gram'), ('Bumbu jebew', 'gram'), ('Teh celup', 'pcs'), ('Air mineral botol', 'botol'), ('Telur', 'pcs')
on conflict (name) do nothing;

insert into public.recipes (product_id, ingredient_id, quantity)
select p.id, i.id, v.qty
from (values
  ('MIE-001', 'Mie mentah', 120), ('MIE-001', 'Bumbu jebew', 20),
  ('MIE-002', 'Mie mentah', 150), ('MIE-002', 'Bumbu jebew', 25), ('MIE-002', 'Telur', 1),
  ('MIE-003', 'Mie mentah', 120),
  ('MIN-001', 'Teh celup', 1),
  ('MIN-003', 'Air mineral botol', 1),
  ('TOP-001', 'Telur', 1)
) as v(sku, ing, qty)
join public.products p on p.sku = v.sku
join public.ingredients i on i.name = v.ing
on conflict do nothing;

-- Diskon global contoh (dapat diedit/dinonaktifkan)
insert into public.discounts (outlet_id, name, type, value)
select null, v.name, v.type, v.value
from (values ('Diskon 10%', 'percent', 10), ('Potongan Rp 5.000', 'fixed', 5000)) as v(name, type, value)
where not exists (select 1 from public.discounts d where d.name = v.name and d.outlet_id is null);
