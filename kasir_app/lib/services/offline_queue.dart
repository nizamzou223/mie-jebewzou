import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

enum PendingStatus { pending, failed }

/// Satu transaksi yang belum tersimpan di server.
class PendingOrder {
  PendingOrder({
    required this.id,
    required this.userId,
    required this.payload,
    required this.receipt,
    required this.createdAt,
    this.status = PendingStatus.pending,
    this.error,
    this.attempts = 0,
  });

  /// Sama dengan payload['id'] — kunci idempotensi yang membuat sinkronisasi ulang aman.
  final String id;
  final String userId;
  final Map<String, dynamic> payload;
  final Map<String, dynamic> receipt;
  final DateTime createdAt;
  PendingStatus status;
  String? error;
  int attempts;

  String get outletId => payload['outlet_id'] as String;
  int get total => (receipt['total'] as num).round();
  String get localNumber => receipt['order_number'] as String;

  Map<String, dynamic> toJson() => {
        'id': id,
        'user_id': userId,
        'payload': payload,
        'receipt': receipt,
        'created_at': createdAt.toIso8601String(),
        'status': status.name,
        'error': error,
        'attempts': attempts,
      };

  factory PendingOrder.fromJson(Map<String, dynamic> j) => PendingOrder(
        id: j['id'] as String,
        userId: j['user_id'] as String,
        payload: Map<String, dynamic>.from(j['payload'] as Map),
        receipt: Map<String, dynamic>.from(j['receipt'] as Map),
        createdAt: DateTime.parse(j['created_at'] as String),
        status: j['status'] == 'failed' ? PendingStatus.failed : PendingStatus.pending,
        error: j['error'] as String?,
        attempts: (j['attempts'] as int?) ?? 0,
      );
}

/// Antrean transaksi offline. Disimpan terenkripsi (Android Keystore / iOS Keychain)
/// lewat flutter_secure_storage. Batasan: cocok untuk puluhan-ratusan transaksi; bukan database penuh.
class OfflineQueueStore {
  OfflineQueueStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'pending_orders_v1';
  final FlutterSecureStorage _storage;

  Future<List<PendingOrder>> load() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return [];
      final list = jsonDecode(raw) as List;
      return list.map((e) => PendingOrder.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {
      // Data rusak tidak boleh membuat aplikasi gagal dibuka.
      return [];
    }
  }

  Future<void> save(List<PendingOrder> items) async {
    await _storage.write(key: _key, value: jsonEncode(items.map((e) => e.toJson()).toList()));
  }
}
