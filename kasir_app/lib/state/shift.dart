import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import '../utils/format.dart';
import 'session.dart';

/// Shift kasir: buka (modal awal) dan tutup (uang tunai aktual). Perhitungan kas dilakukan di server.
class ShiftController extends ChangeNotifier {
  ShiftController(this._session, this._prefs);

  final SessionController _session;
  final SharedPreferences _prefs;
  SupabaseClient get _db => Supabase.instance.client;

  static const _kShift = 'cache_open_shift';

  Shift? current;
  bool loading = false;
  String? error;

  Future<void> load() async {
    final uid = _db.auth.currentUser?.id;
    if (uid == null) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final row = await _db.from('shifts').select().eq('cashier_id', uid).eq('status', 'open').maybeSingle().timeout(const Duration(seconds: 12));
      current = row == null ? null : Shift.fromJson(row);
      await _cache(uid);
    } catch (e) {
      if (isNetworkError(e)) {
        current = _readCache(uid); // offline: percayai shift terakhir yang diketahui
      } else {
        error = friendlyError(e);
      }
    }
    loading = false;
    _session.setOutletLocked(current != null);
    notifyListeners();
  }

  Future<void> open(int openingCash) async {
    final outlet = _session.activeOutlet;
    if (outlet == null) throw Exception('Pilih cabang terlebih dahulu.');
    final res = await _db.rpc('open_shift', params: {'p_outlet': outlet.id, 'p_opening_cash': openingCash});
    current = Shift.fromJson(Map<String, dynamic>.from(res as Map));
    await _cache(_db.auth.currentUser!.id);
    _session.setOutletLocked(true);
    notifyListeners();
  }

  Future<Map<String, dynamic>> summary() async {
    final s = current;
    if (s == null) throw Exception('Tidak ada shift yang berjalan.');
    final res = await _db.rpc('shift_summary', params: {'p_shift': s.id});
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> close(int actualCash, String? note) async {
    final s = current;
    if (s == null) throw Exception('Tidak ada shift yang berjalan.');
    final res = await _db.rpc('close_shift', params: {'p_shift': s.id, 'p_closing_cash': actualCash, 'p_note': note});
    current = null;
    await _prefs.remove(_kShift);
    _session.setOutletLocked(false);
    notifyListeners();
    return Map<String, dynamic>.from(res as Map);
  }

  void clear() {
    current = null;
    error = null;
    notifyListeners();
  }

  Future<void> _cache(String uid) async {
    if (current == null) {
      await _prefs.remove(_kShift);
    } else {
      await _prefs.setString(_kShift, jsonEncode({'user_id': uid, 'shift': current!.toJson()}));
    }
  }

  Shift? _readCache(String uid) {
    final raw = _prefs.getString(_kShift);
    if (raw == null) return null;
    final j = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    if (j['user_id'] != uid) return null;
    return Shift.fromJson(Map<String, dynamic>.from(j['shift'] as Map));
  }
}
