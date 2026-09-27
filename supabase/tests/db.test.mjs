// Uji skema, RLS multi-cabang, dan RPC transaksi memakai Postgres in-memory (PGlite).
// Menjalankan seluruh migration + seed (dua kali, untuk memastikan idempotent), lalu menguji
// dengan akun berbeda role/cabang. Jalankan: npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();

// Tiruan minimal lingkungan Supabase (role + skema auth)
const prelude = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_app_meta_data jsonb not null default '{}'::jsonb,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

async function migrate() {
  const files = readdirSync(path.join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await db.exec(readFileSync(path.join(root, 'migrations', f), 'utf8'));
  await db.exec(readFileSync(path.join(root, 'seed.sql'), 'utf8'));
}

let passed = 0;
let failed = 0;
async function t(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  GAGAL ${name}\n        ${e.message}`);
  }
}

const q = async (sql, params = []) => (await db.query(sql, params)).rows;

async function asUser(id, fn) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
  }
}

async function rejects(promise, re) {
  try {
    await promise;
  } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`ditolak, tetapi pesan tidak sesuai: ${e.message}`);
    return;
  }
  throw new Error('seharusnya ditolak, tetapi berhasil');
}

const createOrder = async (payload) => (await q('select public.create_order($1::jsonb) as r', [JSON.stringify(payload)]))[0].r;

// ---------------------------------------------------------------------------
console.log('\nMenyiapkan database (migration dijalankan 2x)…');
try {
  await db.exec(prelude);
  await migrate();
  await migrate();
} catch (e) {
  console.error(`Migration gagal: ${e.message}${e.hint ? `\n  petunjuk: ${e.hint}` : ''}${e.where ? `\n  di: ${e.where}` : ''}`);
  process.exit(1);
}

async function mkUser(email, role, name) {
  const [u] = await q(
    'insert into auth.users (email, raw_app_meta_data) values ($1, $2::jsonb) returning id',
    [email, JSON.stringify({ role, full_name: name })],
  );
  return u.id;
}

const ownerId = await mkUser('owner@jebew.test', 'owner', 'Owner');
const adminA = await mkUser('admin.a@jebew.test', 'admin', 'Admin A');
const adminB = await mkUser('admin.b@jebew.test', 'admin', 'Admin B');
const cashA = await mkUser('kasir.a@jebew.test', 'cashier', 'Kasir A');
const cashB = await mkUser('kasir.b@jebew.test', 'cashier', 'Kasir B');
const cashMulti = await mkUser('kasir.multi@jebew.test', 'cashier', 'Kasir Multi');
const cashFree = await mkUser('kasir.free@jebew.test', 'cashier', 'Kasir Tanpa Cabang');

let outletA;
let outletB;
await asUser(ownerId, async () => {
  [{ id: outletA }] = await q(`insert into outlets (code, name) values ('JBA', 'Jebew A') returning id`);
  [{ id: outletB }] = await q(`insert into outlets (code, name) values ('JBB', 'Jebew B') returning id`);
  const assign = [[adminA, outletA], [adminB, outletB], [cashA, outletA], [cashB, outletB], [cashMulti, outletA], [cashMulti, outletB]];
  for (const [u, o] of assign) await q('insert into user_outlets (user_id, outlet_id) values ($1, $2)', [u, o]);
});

const prod = async (sku) => (await q('select id from products where sku = $1', [sku]))[0].id;
const mod = async (name) => (await q('select id from modifiers where name = $1', [name]))[0].id;
const variant = async (sku, name) =>
  (await q('select v.id from product_variants v join products p on p.id = v.product_id where p.sku = $1 and v.name = $2', [sku, name]))[0].id;
const ing = async (name) => (await q('select id from ingredients where name = $1', [name]))[0].id;
const stock = async (outlet, name) =>
  Number((await q('select i.current_stock from inventory_items i join ingredients g on g.id = i.ingredient_id where i.outlet_id = $1 and g.name = $2', [outlet, name]))[0]?.current_stock);

const mie = await prod('MIE-001');
const esTeh = await prod('MIN-001');
const airMineral = await prod('MIN-003');
const lvl2 = await mod('Level 2');
const telur = await mod('Telur');
const large = await variant('MIN-001', 'Large');

// ---------------------------------------------------------------------------
console.log('\nAkun & pembatasan data lintas cabang');

await t('akun pertama otomatis owner; profil dibuat oleh trigger', async () => {
  const rows = await q('select role, is_active from profiles where id = $1', [ownerId]);
  assert.equal(rows[0].role, 'owner');
  assert.equal(rows[0].is_active, true);
});

await t('pendaftaran mandiri tanpa metadata menjadi kasir NONAKTIF', async () => {
  const [u] = await q(`insert into auth.users (email) values ('iseng@x.test') returning id`);
  const p = (await q('select role, is_active from profiles where id = $1', [u.id]))[0];
  assert.equal(p.role, 'cashier');
  assert.equal(p.is_active, false);
});

await t('owner melihat semua cabang', async () => {
  const rows = await asUser(ownerId, () => q('select code from outlets order by code'));
  assert.deepEqual(rows.map((r) => r.code), ['JBA', 'JBB']);
});

await t('kasir A hanya melihat cabang A', async () => {
  const rows = await asUser(cashA, () => q('select code from outlets'));
  assert.deepEqual(rows.map((r) => r.code), ['JBA']);
});

await t('admin B hanya melihat cabang B', async () => {
  const rows = await asUser(adminB, () => q('select code from outlets'));
  assert.deepEqual(rows.map((r) => r.code), ['JBB']);
});

await t('kasir multi-cabang melihat kedua cabangnya', async () => {
  const rows = await asUser(cashMulti, () => q('select code from outlets order by code'));
  assert.deepEqual(rows.map((r) => r.code), ['JBA', 'JBB']);
});

await t('admin A tidak dapat melihat profil pengguna cabang B', async () => {
  const rows = await asUser(adminA, () => q('select email from profiles order by email'));
  const emails = rows.map((r) => r.email);
  assert.ok(emails.includes('kasir.a@jebew.test'));
  assert.ok(!emails.includes('kasir.b@jebew.test'));
  assert.ok(!emails.includes('admin.b@jebew.test'));
});

await t('kasir tidak dapat membuat cabang', async () => {
  await rejects(asUser(cashA, () => q(`insert into outlets (code, name) values ('HAX', 'x')`)), /row-level security|permission/i);
});

await t('anon tidak dapat membaca tabel apa pun', async () => {
  await db.exec('reset role; set role anon');
  try {
    await rejects(q('select * from products'), /permission denied/i);
  } finally {
    await db.exec('reset role');
  }
});

await t('kasir tidak dapat mengubah harga produk (RLS memblokir baris)', async () => {
  const rows = await asUser(cashA, () => q(`update products set base_price = 1 where sku = 'MIE-001' returning id`));
  assert.equal(rows.length, 0);
  assert.equal(Number((await q(`select base_price from products where sku = 'MIE-001'`))[0].base_price), 15000);
});

await t('admin cabang tidak dapat mengubah harga global (hanya owner)', async () => {
  const rows = await asUser(adminA, () => q(`update products set base_price = 1 where sku = 'MIE-001' returning id`));
  assert.equal(rows.length, 0);
});

await t('kasir tidak dapat menulis langsung ke orders / stok / shift', async () => {
  await rejects(asUser(cashA, () => q(`insert into orders (id, outlet_id, order_number) values (gen_random_uuid(), '${outletA}', 'X')`)), /permission denied/i);
  await rejects(asUser(cashA, () => q(`insert into shifts (outlet_id, cashier_id, opening_cash) values ('${outletA}', '${cashA}', 0)`)), /permission denied/i);
  await rejects(asUser(adminA, () => q(`update inventory_items set current_stock = 999`)), /permission denied/i);
});

await t('fungsi internal tidak dapat dipanggil klien', async () => {
  await rejects(asUser(cashA, () => q(`select public._next_order_number('${outletA}')`)), /permission denied/i);
});

await t('admin tidak dapat menaikkan role (trigger guard)', async () => {
  await rejects(asUser(adminA, () => q(`update profiles set role = 'owner' where id = '${cashA}'`)), /owner yang dapat mengubah role/i);
  const own = await asUser(adminA, () => q(`update profiles set is_active = false where id = '${adminA}' returning id`));
  assert.equal(own.length, 0);
});

await t('admin A tidak dapat menugaskan kasir ke cabang B (bukan cabangnya)', async () => {
  await rejects(asUser(adminA, () => q(`insert into user_outlets (user_id, outlet_id) values ('${cashA}', '${outletB}')`)), /row-level security/i);
});

await t('admin A tidak dapat menarik kasir milik cabang B ke cabangnya', async () => {
  await rejects(asUser(adminA, () => q(`insert into user_outlets (user_id, outlet_id) values ('${cashB}', '${outletA}')`)), /row-level security/i);
});

await t('admin A dapat menugaskan kasir yang belum punya cabang ke cabangnya', async () => {
  await asUser(adminA, () => q(`insert into user_outlets (user_id, outlet_id) values ('${cashFree}', '${outletA}')`));
  await asUser(adminA, () => q(`delete from user_outlets where user_id = '${cashFree}'`));
});

await t('owner tidak dapat menonaktifkan/menurunkan owner aktif terakhir', async () => {
  await rejects(q(`update profiles set is_active = false where id = '${ownerId}'`), /minimal satu owner/i);
});

// ---------------------------------------------------------------------------
console.log('\nStok');

await t('admin A mencatat stok masuk; kasir tidak boleh', async () => {
  await asUser(adminA, async () => {
    await q(`select public.record_stock_movement($1, $2, 'in', 1000, 'Belanja', 100)`, [outletA, await ing('Mie mentah')]);
    await q(`select public.record_stock_movement($1, $2, 'in', 500, 'Belanja', 50)`, [outletA, await ing('Bumbu jebew')]);
    await q(`select public.record_stock_movement($1, $2, 'in', 10, 'Belanja', 2)`, [outletA, await ing('Teh celup')]);
  });
  await rejects(asUser(cashA, async () => q(`select public.record_stock_movement($1, $2, 'in', 5)`, [outletA, await ing('Telur')])), /TIDAK_BERIZIN/);
  assert.equal(await stock(outletA, 'Mie mentah'), 1000);
});

await t('admin A tidak dapat mengubah stok cabang B', async () => {
  await rejects(asUser(adminA, async () => q(`select public.record_stock_movement($1, $2, 'in', 5, 'x')`, [outletB, await ing('Telur')])), /TIDAK_BERIZIN/);
});

await t('stok keluar/penyesuaian wajib alasan; tidak boleh minus', async () => {
  await asUser(adminA, async () => {
    const i = await ing('Telur');
    await q(`select public.record_stock_movement($1, $2, 'in', 5, 'Belanja')`, [outletA, i]);
    await rejects(q(`select public.record_stock_movement($1, $2, 'out', 1)`, [outletA, i]), /ALASAN_WAJIB/);
    await rejects(q(`select public.record_stock_movement($1, $2, 'out', 99, 'rusak')`, [outletA, i]), /STOK_TIDAK_CUKUP/);
    await q(`select public.record_stock_movement($1, $2, 'adjustment', 4, 'Stok opname')`, [outletA, i]);
  });
  assert.equal(await stock(outletA, 'Telur'), 4);
});

// ---------------------------------------------------------------------------
console.log('\nShift & transaksi');

let shiftA;
await t('kasir A tidak dapat membuka shift di cabang B', async () => {
  await rejects(asUser(cashA, () => q(`select public.open_shift($1, 100000)`, [outletB])), /AKSES_CABANG_DITOLAK/);
});

await t('kasir A membuka shift di cabang A; shift kedua ditolak', async () => {
  await asUser(cashA, async () => {
    shiftA = (await q(`select public.open_shift($1, 100000) as s`, [outletA]))[0].s.id;
    await rejects(q(`select public.open_shift($1, 5000)`, [outletA]), /SHIFT_SUDAH_ADA/);
  });
});

const item = (over = {}) => ({ product_id: mie, quantity: 2, modifier_ids: [lvl2, telur], ...over });
const payload = (over = {}) => ({
  id: crypto.randomUUID(),
  outlet_id: outletA,
  shift_id: shiftA,
  items: [item(), { product_id: esTeh, variant_id: large, quantity: 1 }],
  payment: { method: 'cash', received: 50000 },
  ...over,
});

await t('opsi wajib (tingkat pedas) harus dipilih', async () => {
  await rejects(asUser(cashA, () => createOrder(payload({ items: [item({ modifier_ids: [telur] })] }))), /OPSI_WAJIB/);
});

await t('varian wajib dipilih bila produk memiliki varian', async () => {
  await rejects(asUser(cashA, () => createOrder(payload({ items: [{ product_id: esTeh, quantity: 1 }] }))), /VARIAN_WAJIB/);
});

await t('uang tunai kurang ditolak', async () => {
  await rejects(asUser(cashA, () => createOrder(payload({ payment: { method: 'cash', received: 1000 } }))), /UANG_KURANG/);
});

await t('metode pembayaran nonaktif ditolak', async () => {
  await rejects(asUser(cashA, () => createOrder(payload({ payment: { method: 'bitcoin', received: 1 } }))), /METODE_BAYAR_TIDAK_AKTIF/);
});

await t('kasir A tidak dapat membuat transaksi di cabang B', async () => {
  await rejects(asUser(cashA, () => createOrder(payload({ outlet_id: outletB }))), /AKSES_CABANG_DITOLAK/);
});

await t('transaksi kosong / jumlah tidak valid ditolak', async () => {
  await rejects(asUser(cashA, () => createOrder(payload({ items: [] }))), /KERANJANG_KOSONG/);
  await rejects(asUser(cashA, () => createOrder(payload({ items: [item({ quantity: 0 })] }))), /JUMLAH_TIDAK_VALID/);
});

let order1;
await t('transaksi sukses: harga dihitung server, kembalian, nomor unik per cabang', async () => {
  const base = payload();
  // klien mencoba mengirim harga palsu -> diabaikan
  base.items[0].unit_price = 1;
  order1 = await asUser(cashA, () => createOrder(base));
  // (15000 + 0 + 4000) * 2 + (5000 + 3000) = 46000
  assert.equal(Number(order1.total), 46000);
  assert.equal(Number(order1.payment.change), 4000);
  assert.equal(order1.status, 'completed');
  assert.match(order1.order_number, /^JBA-\d{8}-0001$/);
  assert.equal(order1.items.length, 2);
  assert.equal(order1.items[0].modifiers.length, 2);
  assert.equal(order1.cashier_name, 'Kasir A');
  assert.equal(order1.duplicate, false);
});

await t('stok bahan berkurang sesuai resep', async () => {
  assert.equal(await stock(outletA, 'Mie mentah'), 1000 - 240);
  assert.equal(await stock(outletA, 'Bumbu jebew'), 500 - 40);
  assert.equal(await stock(outletA, 'Teh celup'), 9);
});

await t('idempoten: mengirim ulang id yang sama tidak menggandakan transaksi/stok', async () => {
  const again = await asUser(cashA, () => createOrder({ ...payload(), id: order1.id }));
  assert.equal(again.duplicate, true);
  assert.equal(again.order_number, order1.order_number);
  assert.equal((await q('select count(*)::int as n from orders'))[0].n, 1);
  assert.equal(await stock(outletA, 'Mie mentah'), 760);
});

await t('snapshot: mengubah harga/nama produk tidak mengubah histori transaksi', async () => {
  await asUser(ownerId, () => q(`update products set name = 'Mie Baru', base_price = 99999 where sku = 'MIE-001'`));
  const rows = await q(`select product_name, unit_price from order_items where order_id = $1 order by line_no`, [order1.id]);
  assert.equal(rows[0].product_name, 'Mie Jebew Original');
  assert.equal(Number(rows[0].unit_price), 19000);
  await asUser(ownerId, () => q(`update products set name = 'Mie Jebew Original', base_price = 15000 where sku = 'MIE-001'`));
});

await t('harga khusus cabang dipakai server; ketersediaan per cabang dihormati', async () => {
  await asUser(adminA, async () => {
    await q(`insert into outlet_products (outlet_id, product_id, price_override) values ($1, $2, 16000)`, [outletA, mie]);
    await q(`insert into outlet_products (outlet_id, product_id, is_available) values ($1, $2, false)`, [outletA, airMineral]);
  });
  await rejects(asUser(cashA, () => createOrder(payload({ items: [{ product_id: airMineral, quantity: 1 }] }))), /PRODUK_TIDAK_TERSEDIA/);
  const o = await asUser(cashA, () => createOrder(payload({ items: [item({ quantity: 1, modifier_ids: [lvl2] })], payment: { method: 'qris' } })));
  assert.equal(Number(o.total), 16000);
  assert.equal(o.payment.method, 'qris');
  assert.equal(Number(o.payment.change), 0);
  await asUser(adminA, () => q(`delete from outlet_products where outlet_id = $1`, [outletA]));
});

await t('diskon hanya untuk pengguna berizin', async () => {
  const [d] = await q(`select id from discounts where name = 'Diskon 10%'`);
  await rejects(asUser(cashA, () => createOrder(payload({ discount_id: d.id }))), /TIDAK_BERIZIN_DISKON/);
  // owner memberi izin kepada role kasir lewat matriks izin
  await asUser(ownerId, () => q(`insert into role_permissions (role, permission) values ('cashier', 'discount.apply')`));
  const o = await asUser(cashA, () => createOrder(payload({ discount_id: d.id, payment: { method: 'cash', received: 50000 } })));
  assert.equal(Number(o.discount_total), 4600);
  assert.equal(Number(o.total), 41400);
  await asUser(ownerId, () => q(`delete from role_permissions where role = 'cashier' and permission = 'discount.apply'`));
});

await t('pajak tidak diterapkan otomatis; diterapkan setelah admin (owner) mengaktifkan', async () => {
  const notax = (await q('select tax_total from orders where id = $1', [order1.id]))[0];
  assert.equal(Number(notax.tax_total), 0);
  await asUser(ownerId, () => q(`update business_settings set tax_enabled = true, tax_rate = 10, tax_name = 'PPN'`));
  const o = await asUser(cashA, () => createOrder(payload({ items: [item({ quantity: 1, modifier_ids: [lvl2] })], payment: { method: 'cash', received: 20000 } })));
  assert.equal(Number(o.subtotal), 15000);
  assert.equal(Number(o.tax_total), 1500);
  assert.equal(Number(o.total), 16500);
  await asUser(ownerId, () => q(`update business_settings set tax_enabled = false, tax_rate = 0`));
});

await t('hanya owner yang dapat mengubah pengaturan usaha', async () => {
  const rows = await asUser(adminA, () => q(`update business_settings set tax_enabled = true returning id`));
  assert.equal(rows.length, 0);
});

await t('perkiraan harga berubah di server ditolak untuk transaksi online (expected_total)', async () => {
  await rejects(asUser(cashA, () => createOrder(payload({ expected_total: 1 }))), /HARGA_BERUBAH/);
});

await t('transaksi offline dicatat dengan waktu perangkat & sinkron idempoten', async () => {
  const when = new Date(Date.now() - 3600_000).toISOString();
  const body = payload({ offline: true, client_created_at: when, items: [item({ quantity: 1, modifier_ids: [lvl2] })], payment: { method: 'cash', received: 20000 } });
  const o = await asUser(cashA, () => createOrder(body));
  const row = (await q('select is_offline, created_at, synced_at from orders where id = $1', [o.id]))[0];
  assert.equal(row.is_offline, true);
  assert.ok(Math.abs(new Date(row.created_at) - new Date(when)) < 1000);
  assert.ok(new Date(row.synced_at) > new Date(row.created_at));
  const dup = await asUser(cashA, () => createOrder(body));
  assert.equal(dup.duplicate, true);
});

await t('nomor transaksi unik dan berurutan; cabang B memiliki urutan sendiri', async () => {
  const nums = (await q(`select order_number from orders where outlet_id = $1 order by order_number`, [outletA])).map((r) => r.order_number);
  assert.equal(new Set(nums).size, nums.length);
  let shiftB;
  await asUser(cashB, async () => {
    shiftB = (await q(`select public.open_shift($1, 50000) as s`, [outletB]))[0].s.id;
    const o = await createOrder(payload({ outlet_id: outletB, shift_id: shiftB }));
    assert.match(o.order_number, /^JBB-\d{8}-0001$/);
  });
});

await t('transaksi tidak terlihat oleh kasir/admin cabang lain; terlihat oleh admin cabangnya & owner', async () => {
  const n = async (id) => asUser(id, async () => (await q('select count(*)::int as n from orders'))[0].n);
  const totalA = (await q(`select count(*)::int as n from orders where outlet_id = $1`, [outletA]))[0].n;
  assert.equal(await n(adminA), totalA);
  assert.equal(await n(cashA), totalA);       // semua milik kasir A
  assert.equal(await n(cashB), 1);            // hanya transaksi cabang B miliknya
  assert.equal(await n(adminB), 1);
  assert.equal(await n(ownerId), totalA + 1);
  // kasir multi-cabang tidak boleh melihat transaksi orang lain
  assert.equal(await n(cashMulti), 0);
});

await t('detail transaksi (item, modifier, pembayaran) mengikuti RLS transaksi', async () => {
  const items = await asUser(cashB, () => q('select count(*)::int as n from order_items'));
  assert.equal(items[0].n, 2); // transaksi cabang B punya 2 baris item
  const pays = await asUser(adminB, () => q('select count(*)::int as n from payments'));
  assert.equal(pays[0].n, 1);
});

await t('kasir multi-cabang tidak dapat memakai shift cabang lain', async () => {
  let shiftM;
  await asUser(cashMulti, async () => {
    shiftM = (await q(`select public.open_shift($1, 0) as s`, [outletA]))[0].s.id;
    await rejects(createOrder(payload({ outlet_id: outletB, shift_id: shiftM })), /SHIFT_DIBUTUHKAN/);
    await q(`select public.close_shift($1, 0)`, [shiftM]);
  });
});

// ---------------------------------------------------------------------------
console.log('\nPembatalan / refund');

await t('kasir tanpa izin tidak dapat membatalkan transaksi', async () => {
  await rejects(asUser(cashA, () => q(`select public.void_order($1, 'salah input')`, [order1.id])), /TIDAK_BERIZIN/);
});

await t('admin cabang lain tidak dapat membatalkan transaksi cabang A', async () => {
  await rejects(asUser(adminB, () => q(`select public.void_order($1, 'iseng')`, [order1.id])), /TRANSAKSI_TIDAK_DITEMUKAN/);
});

await t('pembatalan wajib alasan', async () => {
  await rejects(asUser(adminA, () => q(`select public.void_order($1, '')`, [order1.id])), /ALASAN_WAJIB/);
});

await t('admin A membatalkan transaksi: status berubah, stok kembali, audit log tercatat', async () => {
  const before = await stock(outletA, 'Mie mentah');
  const r = await asUser(adminA, async () => (await q(`select public.void_order($1, 'Pelanggan batal') as r`, [order1.id]))[0].r);
  assert.equal(r.status, 'void');
  assert.equal(await stock(outletA, 'Mie mentah'), before + 240); // 2 porsi x 120 gram dikembalikan
  const log = await q(`select action, details from audit_logs where action = 'order.void'`);
  assert.equal(log.length, 1);
  assert.equal(log[0].details.reason, 'Pelanggan batal');
  await rejects(asUser(adminA, () => q(`select public.void_order($1, 'lagi')`, [order1.id])), /SUDAH_DIBATALKAN/);
});

// ---------------------------------------------------------------------------
console.log('\nTutup shift');

await t('perkiraan kas & selisih dihitung otomatis (transaksi batal tidak dihitung)', async () => {
  const before = await asUser(cashA, async () => (await q(`select public.shift_summary($1) as s`, [shiftA]))[0].s);
  const cashSales = (await q(
    `select coalesce(sum(p.amount),0) as s from payments p join orders o on o.id = p.order_id where o.shift_id = $1 and o.status = 'completed' and p.method = 'cash'`, [shiftA]))[0].s;
  assert.equal(Number(before.cash_sales), Number(cashSales));
  assert.equal(Number(before.expected_cash), 100000 + Number(cashSales));
  assert.equal(before.void_count, 1);
  assert.ok(Number(before.noncash_sales) > 0);
  const closed = await asUser(cashA, async () => (await q(`select public.close_shift($1, $2, 'aman') as s`, [shiftA, 100000 + Number(cashSales) - 1000]))[0].s);
  assert.equal(closed.status, 'closed');
  assert.equal(Number(closed.cash_difference), -1000);
  await rejects(asUser(cashA, () => q(`select public.close_shift($1, 0)`, [shiftA])), /SHIFT_SUDAH_DITUTUP/);
  await rejects(asUser(cashA, () => createOrder(payload())), /SHIFT_SUDAH_DITUTUP/);
});

await t('kasir lain tidak dapat menutup shift orang lain', async () => {
  const [{ id }] = await q(`select id from shifts where cashier_id = $1 and status = 'open'`, [cashB]);
  await rejects(asUser(cashA, () => q(`select public.close_shift($1, 0)`, [id])), /SHIFT_TIDAK_DITEMUKAN/);
});

// ---------------------------------------------------------------------------
console.log('\nLaporan');

await t('kasir tidak dapat mengakses laporan', async () => {
  await rejects(asUser(cashA, () => q(`select * from report_summary('2000-01-01', '2100-01-01')`)), /TIDAK_BERIZIN/);
});

await t('laporan admin A hanya berisi cabang A; owner melihat gabungan & filter per cabang', async () => {
  const sum = async (id, outlet = null) =>
    asUser(id, async () => (await q(`select * from report_summary('2000-01-01', '2100-01-01', $1)`, [outlet]))[0]);
  const a = await sum(adminA);
  const b = await sum(adminB);
  const all = await sum(ownerId);
  const onlyA = await sum(ownerId, outletA);
  assert.equal(Number(all.net_sales), Number(a.net_sales) + Number(b.net_sales));
  assert.equal(Number(a.net_sales), Number(onlyA.net_sales));
  assert.equal(Number(a.void_count), 1);
  assert.equal(Number(b.orders_count), 1);
  // admin B mencoba memfilter cabang A: RLS membuat hasilnya kosong
  const spy = await sum(adminB, outletA);
  assert.equal(Number(spy.orders_count), 0);
});

await t('rincian per produk/kategori/kasir/cabang/metode/hari berfungsi', async () => {
  for (const dim of ['product', 'category', 'cashier', 'outlet', 'method', 'day', 'week', 'month', 'hour']) {
    const rows = await asUser(ownerId, () => q(`select * from report_breakdown($1, '2000-01-01', '2100-01-01')`, [dim]));
    assert.ok(rows.length > 0, `dimensi ${dim} kosong`);
  }
  const byOutlet = await asUser(ownerId, () => q(`select label, net from report_breakdown('outlet', '2000-01-01', '2100-01-01') order by label`));
  assert.deepEqual(byOutlet.map((r) => r.label), ['Jebew A', 'Jebew B']);
  await rejects(asUser(ownerId, () => q(`select * from report_breakdown('nonsense', '2000-01-01', '2100-01-01')`)), /DIMENSI_TIDAK_VALID/);
});

await t('stok menipis dihitung per cabang & mengikuti RLS', async () => {
  await asUser(adminA, async () => {
    await q(`select public.record_stock_movement($1, $2, 'adjustment', 1, 'opname', 5)`, [outletA, await ing('Telur')]);
  });
  const rowsA = await asUser(adminA, () => q('select * from low_stock_items()'));
  assert.ok(rowsA.some((r) => r.ingredient_name === 'Telur'));
  // Cabang B menjual tanpa stok awal -> stok minus ikut terdeteksi, tetapi hanya untuk cabang B
  const rowsB = await asUser(adminB, () => q('select * from low_stock_items()'));
  assert.ok(rowsB.length > 0);
  assert.ok(rowsB.every((r) => r.outlet_id === outletB));
  assert.ok(!rowsA.some((r) => r.outlet_id === outletB));
});

// ---------------------------------------------------------------------------
console.log('\nAudit log & akun nonaktif');

await t('perubahan harga produk tercatat di audit log dengan nilai lama & baru', async () => {
  const rows = await q(`select details from audit_logs where action = 'product.update' and details -> 'changes' ? 'base_price' order by id limit 1`);
  assert.equal(Number(rows[0].details.changes.base_price.old), 15000);
  assert.equal(Number(rows[0].details.changes.base_price.new), 99999);
});

await t('admin A hanya melihat audit log cabangnya; kasir tidak dapat melihat', async () => {
  const rowsA = await asUser(adminA, () => q('select distinct outlet_id from audit_logs'));
  assert.ok(rowsA.every((r) => r.outlet_id === outletA));
  const rowsC = await asUser(cashA, () => q('select * from audit_logs'));
  assert.equal(rowsC.length, 0);
});

await t('akun dinonaktifkan tidak dapat melihat data maupun bertransaksi', async () => {
  await asUser(ownerId, () => q(`update profiles set is_active = false where id = '${cashB}'`));
  const outlets = await asUser(cashB, () => q('select * from outlets'));
  assert.equal(outlets.length, 0);
  const [{ id: shiftB }] = await q(`select id from shifts where cashier_id = $1`, [cashB]);
  await rejects(asUser(cashB, () => createOrder(payload({ outlet_id: outletB, shift_id: shiftB }))), /AKUN_NONAKTIF/);
});

console.log(`\nHasil: ${passed} lulus, ${failed} gagal\n`);
process.exit(failed ? 1 : 0);
