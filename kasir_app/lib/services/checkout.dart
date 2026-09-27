import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../state/cart.dart';
import '../state/catalog.dart';
import '../state/session.dart';
import '../state/shift.dart';
import '../state/sync.dart';
import '../utils/format.dart';
import '../utils/receipt.dart';
import 'offline_queue.dart';

class CheckoutResult {
  CheckoutResult({required this.receipt, required this.synced, required this.change});

  /// Struk (bentuk sama dengan JSON dari server).
  final Map<String, dynamic> receipt;

  /// false = tersimpan di perangkat, menunggu sinkronisasi.
  final bool synced;
  final int change;
}

/// Menyelesaikan transaksi: kirim ke server; bila koneksi bermasalah, simpan ke antrean offline
/// dengan id yang sama. Kesalahan bisnis dilempar ke pemanggil (tidak masuk antrean).
class CheckoutService {
  CheckoutService({
    required this.session,
    required this.shift,
    required this.sync,
    required this.catalog,
  });

  final SessionController session;
  final ShiftController shift;
  final SyncController sync;
  final CatalogController catalog;

  SupabaseClient get _db => Supabase.instance.client;

  Future<CheckoutResult> checkout({required CartController cart, required String method, required int received}) async {
    final outlet = session.activeOutlet;
    final sh = shift.current;
    final user = session.profile;
    if (outlet == null || user == null) throw Exception('Cabang belum dipilih.');
    if (sh == null) throw Exception('SHIFT_DIBUTUHKAN');
    if (cart.isEmpty) throw Exception('Keranjang kosong.');
    if (method == 'cash' && received < cart.total) throw Exception('UANG_KURANG');

    final id = const Uuid().v4();
    final createdAt = DateTime.now();
    final payload = <String, dynamic>{
      'id': id,
      'outlet_id': outlet.id,
      'shift_id': sh.id,
      'client_created_at': createdAt.toUtc().toIso8601String(),
      'note': cart.note.trim().isEmpty ? null : cart.note.trim(),
      'discount_id': cart.discount?.id,
      'expected_total': cart.total,
      'items': cart.lines.map((l) => l.toPayload()).toList(),
      'payment': {'method': method, 'received': method == 'cash' ? received : cart.total},
    };

    final salesByProduct = cart.lines.map((l) => MapEntry(l.product.id, l.quantity)).toList();
    final change = method == 'cash' ? received - cart.total : 0;

    Map<String, dynamic> localReceipt() => buildLocalReceipt(
          localNumber: 'OFF-${id.substring(0, 6).toUpperCase()}',
          cart: cart,
          outlet: outlet,
          cashierName: user.fullName,
          method: method,
          received: received,
          createdAt: createdAt,
        );

    Future<CheckoutResult> saveOffline() async {
      final receipt = localReceipt();
      await sync.enqueue(PendingOrder(id: id, userId: user.id, payload: payload, receipt: receipt, createdAt: createdAt));
      catalog.countSale(salesByProduct);
      return CheckoutResult(receipt: receipt, synced: false, change: change);
    }

    // Sudah diketahui offline: jangan membuat kasir menunggu timeout.
    if (!sync.online) return saveOffline();

    try {
      final res = await _db.rpc('create_order', params: {'p': payload}).timeout(const Duration(seconds: 12));
      sync.markOnline(true);
      catalog.countSale(salesByProduct);
      final receipt = Map<String, dynamic>.from(res as Map);
      return CheckoutResult(receipt: receipt, synced: true, change: change);
    } catch (e) {
      if (isNetworkError(e)) {
        // Server mungkin sudah memproses tetapi respons hilang. Karena id sama, sinkronisasi ulang
        // dijawab "duplicate" oleh server dan tidak menggandakan transaksi.
        sync.markOnline(false);
        return saveOffline();
      }
      rethrow;
    }
  }
}
