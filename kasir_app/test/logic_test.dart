import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mie_jebew_kasir/models/models.dart';
import 'package:mie_jebew_kasir/services/offline_queue.dart';
import 'package:mie_jebew_kasir/state/cart.dart';
import 'package:mie_jebew_kasir/state/catalog.dart';
import 'package:mie_jebew_kasir/utils/format.dart';
import 'package:mie_jebew_kasir/utils/receipt.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Product product({String id = 'p1', int price = 15000, List<Variant> variants = const [], List<ModifierGroup> groups = const []}) => Product(
      id: id,
      sku: 'SKU-$id',
      name: 'Mie $id',
      categoryId: null,
      categoryName: null,
      description: null,
      price: price,
      imageUrl: null,
      isAvailable: true,
      variants: variants,
      groups: groups,
    );

BusinessSettings settings({bool tax = false, double rate = 0}) => BusinessSettings(
      name: 'Jebewsizou',
      receiptHeader: null,
      receiptFooter: 'Terima kasih',
      paymentMethods: const ['cash', 'qris'],
      taxEnabled: tax,
      taxName: 'PPN',
      taxRateBp: (rate * 100).round(),
    );

void main() {
  setUpAll(() => initializeDateFormatting('id_ID'));

  group('Perhitungan keranjang (harus sama dengan server)', () {
    test('subtotal = (harga + variasi + tambahan) x jumlah', () {
      final cart = CartController();
      final telur = Modifier(id: 'm1', name: 'Telur', priceDelta: 4000);
      cart.add(CartLine(product: product(), modifiers: [SelectedModifier(groupName: 'Topping', modifier: telur)], quantity: 2));
      cart.add(CartLine(product: product(id: 'p2', price: 5000), variant: Variant(id: 'v1', name: 'Large', priceDelta: 3000)));
      // (15000+4000)*2 + (5000+3000) = 46000 — sama dengan uji database
      expect(cart.subtotal, 46000);
      expect(cart.total, 46000);
      expect(cart.itemCount, 3);
    });

    test('diskon persen dibulatkan ke rupiah; potongan tetap tidak melebihi subtotal', () {
      final cart = CartController()..add(CartLine(product: product(price: 46000)));
      cart.setDiscount(DiscountDef(id: 'd', name: '10%', type: 'percent', valueBp: 1000));
      expect(cart.discountAmount, 4600);
      expect(cart.total, 41400);
      cart.setDiscount(DiscountDef(id: 'd2', name: 'Potong 100rb', type: 'fixed', valueBp: 10000000));
      expect(cart.discountAmount, 46000);
      expect(cart.total, 0);
    });

    test('pembulatan setengah ke atas seperti PostgreSQL round()', () {
      // 12,5% dari 10.001 = 1250,125 -> 1250 ; 2,5% dari 10.020 = 250,5 -> 251
      expect(DiscountDef(id: 'a', name: '', type: 'percent', valueBp: 1250).amountFor(10001), 1250);
      expect(DiscountDef(id: 'b', name: '', type: 'percent', valueBp: 250).amountFor(10020), 251);
    });

    test('pajak TIDAK dihitung bila belum diaktifkan', () {
      final cart = CartController()..add(CartLine(product: product()));
      cart.updateSettings(settings(tax: false, rate: 10));
      expect(cart.tax, 0);
      expect(cart.total, 15000);
    });

    test('pajak dihitung dari total setelah diskon', () {
      final cart = CartController()..add(CartLine(product: product()));
      cart.updateSettings(settings(tax: true, rate: 10));
      expect(cart.tax, 1500);
      expect(cart.total, 16500); // sama dengan uji database
      cart.setDiscount(DiscountDef(id: 'd', name: '10%', type: 'percent', valueBp: 1000));
      expect(cart.discountAmount, 1500);
      expect(cart.tax, 1350);
      expect(cart.total, 14850);
    });

    test('baris identik digabung; catatan/pilihan berbeda tidak digabung', () {
      final cart = CartController();
      cart.add(CartLine(product: product()));
      cart.add(CartLine(product: product()));
      expect(cart.lines.length, 1);
      expect(cart.lines.first.quantity, 2);
      cart.add(CartLine(product: product(), note: 'tidak pedas'));
      expect(cart.lines.length, 2);
    });

    test('jumlah 0 menghapus baris; clear mengosongkan keranjang & diskon', () {
      final cart = CartController();
      cart.add(CartLine(product: product()));
      cart.setQuantity(cart.lines.first.key, 0);
      expect(cart.isEmpty, isTrue);
      cart.add(CartLine(product: product()));
      cart.setDiscount(DiscountDef(id: 'd', name: 'x', type: 'fixed', valueBp: 100000));
      cart.clear();
      expect(cart.isEmpty, isTrue);
      expect(cart.discount, isNull);
    });

    test('payload hanya berisi id & jumlah (tanpa harga)', () {
      final line = CartLine(product: product(), variant: Variant(id: 'v', name: 'L', priceDelta: 1), quantity: 3, note: ' pedas ');
      final p = line.toPayload();
      expect(p.keys.toSet(), {'product_id', 'variant_id', 'quantity', 'modifier_ids', 'note'});
      expect(p['note'], 'pedas');
      expect(p['quantity'], 3);
    });
  });

  group('Katalog per cabang', () {
    Map<String, dynamic> raw() => {
          'categories': [
            {'id': 'c1', 'name': 'Mie'},
          ],
          'products': [
            {
              'id': 'p1', 'sku': 'A', 'name': 'Mie A', 'category_id': 'c1', 'description': null, 'base_price': 15000, 'image_url': null,
              'product_variants': [
                {'id': 'v2', 'name': 'Besar', 'price_delta': '3000.00', 'sort_order': 2, 'is_active': true},
                {'id': 'v1', 'name': 'Kecil', 'price_delta': 0, 'sort_order': 1, 'is_active': true},
                {'id': 'v3', 'name': 'Lama', 'price_delta': 0, 'sort_order': 3, 'is_active': false},
              ],
              'product_modifier_groups': [
                {'group_id': 'g1', 'sort_order': 1},
              ],
            },
            {'id': 'p2', 'sku': 'B', 'name': 'Mie B', 'category_id': 'c1', 'base_price': 10000, 'product_variants': [], 'product_modifier_groups': []},
            {'id': 'p3', 'sku': 'C', 'name': 'Mie C', 'category_id': 'c1', 'base_price': 12000, 'product_variants': [], 'product_modifier_groups': []},
          ],
          'groups': [
            {
              'id': 'g1', 'name': 'Tingkat Pedas', 'is_required': true, 'min_select': 1, 'max_select': 1,
              'modifiers': [
                {'id': 'm2', 'name': 'Level 2', 'price_delta': 0, 'sort_order': 2, 'is_active': true},
                {'id': 'm1', 'name': 'Level 1', 'price_delta': 0, 'sort_order': 1, 'is_active': true},
                {'id': 'm9', 'name': 'Nonaktif', 'price_delta': 0, 'sort_order': 3, 'is_active': false},
              ],
            },
          ],
          'overrides': [
            {'product_id': 'p1', 'price_override': '16000.00', 'is_listed': true, 'is_available': true},
            {'product_id': 'p2', 'price_override': null, 'is_listed': true, 'is_available': false},
            {'product_id': 'p3', 'price_override': null, 'is_listed': false, 'is_available': true},
          ],
          'discounts': [
            {'id': 'd1', 'name': 'Promo', 'type': 'percent', 'value': '12.50'},
          ],
          'settings': [
            {'business_name': 'Mie Jebew', 'receipt_footer': 'Thx', 'payment_methods': ['cash', 'qris'], 'tax_enabled': false, 'tax_name': 'PPN', 'tax_rate': '11.00'},
          ],
        };

    test('harga khusus cabang, ketersediaan, dan produk yang tidak dijual', () async {
      SharedPreferences.setMockInitialValues({});
      final c = CatalogController(await SharedPreferences.getInstance())..applyRaw(raw());
      expect(c.products.map((p) => p.id), ['p1', 'p2']); // p3 disembunyikan di cabang ini
      final p1 = c.products.first;
      expect(p1.price, 16000);
      expect(p1.variants.map((v) => v.name), ['Kecil', 'Besar']); // urut & hanya yang aktif
      expect(p1.variants.last.priceDelta, 3000);
      expect(p1.groups.single.modifiers.map((m) => m.name), ['Level 1', 'Level 2']);
      expect(p1.groups.single.requiredCount, 1);
      expect(p1.groups.single.singleChoice, isTrue);
      expect(c.products.last.isAvailable, isFalse);
      expect(c.categories.single.name, 'Mie');
    });

    test('diskon & pengaturan pajak terbaca; nilai desimal aman', () async {
      SharedPreferences.setMockInitialValues({});
      final c = CatalogController(await SharedPreferences.getInstance())..applyRaw(raw());
      expect(c.discounts.single.valueBp, 1250);
      expect(c.settings.taxEnabled, isFalse);
      expect(c.settings.taxRateBp, 1100);
      expect(c.settings.taxFor(10000), 0); // tidak aktif
    });
  });

  group('Antrean offline', () {
    test('serialisasi JSON menjaga id (kunci idempotensi), payload, dan status', () {
      final o = PendingOrder(
        id: 'abc',
        userId: 'u1',
        payload: {'id': 'abc', 'outlet_id': 'o1', 'items': [{'product_id': 'p1', 'quantity': 2}]},
        receipt: {'order_number': 'OFF-ABC', 'total': 38000},
        createdAt: DateTime.utc(2026, 9, 26, 10),
        status: PendingStatus.failed,
        error: 'x',
        attempts: 2,
      );
      final back = PendingOrder.fromJson(o.toJson());
      expect(back.id, 'abc');
      expect(back.payload['outlet_id'], 'o1');
      expect(back.total, 38000);
      expect(back.localNumber, 'OFF-ABC');
      expect(back.status, PendingStatus.failed);
      expect(back.attempts, 2);
      expect(back.createdAt, DateTime.utc(2026, 9, 26, 10));
    });
  });

  group('Klasifikasi kesalahan', () {
    test('kesalahan koneksi dapat dicoba ulang (offline); kesalahan bisnis tidak', () {
      expect(isNetworkError(const SocketException('x')), isTrue);
      expect(isNetworkError(TimeoutException('x')), isTrue);
      expect(isNetworkError(const PostgrestException(message: 'bad gateway', code: '502')), isTrue);
      expect(isNetworkError(const PostgrestException(message: 'UANG_KURANG: total 1', code: '22023')), isFalse);
      expect(isNetworkError(const PostgrestException(message: 'PRODUK_TIDAK_TERSEDIA: Mie', code: '22023')), isFalse);
      expect(isNetworkError(StateError('bug')), isFalse);
    });

    test('pesan bisnis diterjemahkan', () {
      expect(friendlyError(const PostgrestException(message: 'UANG_KURANG: total 5, diterima 1', code: '22023')), contains('kurang'));
      expect(friendlyError(const PostgrestException(message: 'OPSI_WAJIB: Mie A — Tingkat Pedas', code: '22023')), contains('Tingkat Pedas'));
      expect(friendlyError(const SocketException('x')), contains('terputus'));
    });
  });

  group('Struk', () {
    test('struk lokal (offline) memakai bentuk yang sama dan menampilkan kembalian', () {
      final cart = CartController()..add(CartLine(product: product(price: 19000), quantity: 2));
      final r = buildLocalReceipt(
        localNumber: 'OFF-ABC123',
        cart: cart,
        outlet: Outlet(id: 'o1', code: 'JBA', name: 'Jebew A'),
        cashierName: 'Kasir A',
        method: 'cash',
        received: 50000,
        createdAt: DateTime.utc(2026, 9, 26, 3),
      );
      expect(r['total'], 38000);
      expect((r['payment'] as Map)['change'], 12000);
      final text = receiptText(r, settings());
      expect(text, contains('OFF-ABC123'));
      expect(text, contains('Kasir A'));
      expect(text, contains('TOTAL'));
      expect(text, contains('Kembali'));
    });
  });
}
