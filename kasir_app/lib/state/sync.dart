import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/offline_queue.dart';
import '../utils/format.dart';

/// Status koneksi + antrean transaksi offline + sinkronisasi otomatis.
///
/// Aturan keselamatan:
///  * Transaksi hanya dianggap tersimpan di server setelah RPC create_order berhasil.
///  * Setiap transaksi punya id unik (idempotency key). Mengirim ulang id yang sama tidak menggandakan data.
///  * Kesalahan bisnis (mis. produk dihapus) menandai transaksi "gagal" dan TIDAK dibuang otomatis.
class SyncController extends ChangeNotifier {
  SyncController(this._store);

  final OfflineQueueStore _store;
  SupabaseClient get _db => Supabase.instance.client;

  List<PendingOrder> _items = [];
  bool online = true;
  bool syncing = false;
  StreamSubscription<List<ConnectivityResult>>? _conn;
  Timer? _timer;

  String? get _uid => _db.auth.currentUser?.id;

  /// Transaksi milik pengguna yang sedang login.
  List<PendingOrder> get items => _items.where((e) => e.userId == _uid).toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  int get pendingCount => items.where((e) => e.status == PendingStatus.pending).length;
  int get failedCount => items.where((e) => e.status == PendingStatus.failed).length;
  bool get hasUnsynced => items.isNotEmpty;

  Future<void> init() async {
    _items = await _store.load();
    _conn = Connectivity().onConnectivityChanged.listen((results) {
      final nowOnline = !results.contains(ConnectivityResult.none) && results.isNotEmpty;
      final regained = nowOnline && !online;
      online = nowOnline;
      notifyListeners();
      if (regained) syncNow();
    });
    final initial = await Connectivity().checkConnectivity();
    online = !initial.contains(ConnectivityResult.none);
    _timer = Timer.periodic(const Duration(seconds: 25), (_) => syncNow());
    notifyListeners();
    unawaited(syncNow());
  }

  void markOnline(bool v) {
    if (online != v) {
      online = v;
      notifyListeners();
    }
  }

  Future<void> enqueue(PendingOrder o) async {
    _items.removeWhere((e) => e.id == o.id);
    _items.add(o);
    await _store.save(_items);
    notifyListeners();
    unawaited(syncNow());
  }

  Future<void> retry(String id) async {
    for (final e in _items.where((e) => e.id == id)) {
      e.status = PendingStatus.pending;
      e.error = null;
    }
    await _store.save(_items);
    notifyListeners();
    unawaited(syncNow());
  }

  Future<void> discard(String id) async {
    _items.removeWhere((e) => e.id == id);
    await _store.save(_items);
    notifyListeners();
  }

  /// Menyinkronkan semua transaksi berstatus pending milik pengguna yang login. Aman dipanggil berulang.
  Future<void> syncNow() async {
    if (syncing || _uid == null || _db.auth.currentSession == null) return;
    final todo = _items.where((e) => e.userId == _uid && e.status == PendingStatus.pending).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    if (todo.isEmpty) return;
    syncing = true;
    notifyListeners();
    try {
      for (final o in todo) {
        try {
          o.attempts += 1;
          await _db.rpc('create_order', params: {
            'p': {...o.payload, 'offline': true},
          }).timeout(const Duration(seconds: 20));
          _items.removeWhere((e) => e.id == o.id);
          online = true;
        } catch (e) {
          if (isNetworkError(e)) {
            online = false;
            break; // coba lagi nanti; urutan tetap terjaga
          }
          o.status = PendingStatus.failed;
          o.error = friendlyError(e);
        }
        await _store.save(_items);
        notifyListeners();
      }
    } finally {
      await _store.save(_items);
      syncing = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _conn?.cancel();
    _timer?.cancel();
    super.dispose();
  }
}
