import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import '../utils/format.dart';

enum SessionStatus { booting, signedOut, loading, blocked, ready }

/// Login (Supabase Auth), profil, daftar cabang yang ditugaskan, izin, dan cabang aktif.
/// Profil/cabang/izin disimpan lokal supaya aplikasi tetap dapat dibuka saat internet mati.
class SessionController extends ChangeNotifier {
  SessionController(this._prefs);

  final SharedPreferences _prefs;
  SupabaseClient get _db => Supabase.instance.client;

  static const _kProfile = 'cache_profile';
  static const _kOutlets = 'cache_outlets';
  static const _kPerms = 'cache_perms';
  static const _kActiveOutlet = 'active_outlet';

  SessionStatus status = SessionStatus.booting;
  String? blockReason;
  String? notice;
  AppProfile? profile;
  List<Outlet> outlets = [];
  Set<String> permissions = {};
  Outlet? activeOutlet;
  bool usingCachedProfile = false;

  /// true selama ada shift terbuka: cabang tidak boleh diganti sebelum shift ditutup.
  bool outletLocked = false;

  StreamSubscription<AuthState>? _sub;

  bool can(String permission) => profile?.role == 'owner' || permissions.contains(permission);

  Future<void> init() async {
    _sub = _db.auth.onAuthStateChange.listen((data) {
      if (data.event == AuthChangeEvent.signedOut && status != SessionStatus.signedOut) {
        // Sesi berakhir / token refresh gagal / logout dari tempat lain.
        _reset();
        notice = 'Sesi berakhir. Silakan login kembali.';
        status = SessionStatus.signedOut;
        notifyListeners();
      }
    });
    if (_db.auth.currentSession != null) {
      await _load();
    } else {
      status = SessionStatus.signedOut;
      notifyListeners();
    }
  }

  Future<void> signIn(String email, String password) async {
    notice = null;
    await _db.auth.signInWithPassword(email: email.trim(), password: password);
    await _load();
  }

  Future<void> signOut() async {
    try {
      await _db.auth.signOut();
    } catch (_) {
      // Tetap keluar secara lokal walau tidak ada internet.
    }
    _reset();
    await _prefs.remove(_kProfile);
    await _prefs.remove(_kOutlets);
    await _prefs.remove(_kPerms);
    await _prefs.remove(_kActiveOutlet);
    status = SessionStatus.signedOut;
    notifyListeners();
  }

  Future<void> reload() => _load();

  /// Ganti password akun sendiri — perlu sesi yang masih aktif (butuh koneksi internet).
  Future<void> changePassword(String newPassword) => _db.auth.updateUser(UserAttributes(password: newPassword));

  void _reset() {
    profile = null;
    outlets = [];
    permissions = {};
    activeOutlet = null;
    outletLocked = false;
    usingCachedProfile = false;
    blockReason = null;
  }

  Future<void> _load() async {
    status = SessionStatus.loading;
    notifyListeners();
    final uid = _db.auth.currentUser?.id;
    if (uid == null) {
      status = SessionStatus.signedOut;
      notifyListeners();
      return;
    }
    try {
      final p = await _db.from('profiles').select().eq('id', uid).maybeSingle().timeout(const Duration(seconds: 15));
      if (p == null) return _block('Profil akun tidak ditemukan. Hubungi owner.');
      final prof = AppProfile.fromJson(p);
      if (!(p['is_active'] as bool? ?? true)) return _block('Akun Anda dinonaktifkan. Hubungi owner.');

      final rows = await _db.from('outlets').select().eq('is_active', true).order('name');
      final perms = await _db.from('role_permissions').select('permission').eq('role', prof.role == 'owner' ? 'admin' : prof.role);

      profile = prof;
      outlets = rows.map(Outlet.fromJson).toList();
      permissions = perms.map((r) => r['permission'] as String).toSet();
      usingCachedProfile = false;
      await _prefs.setString(_kProfile, jsonEncode(prof.toJson()));
      await _prefs.setString(_kOutlets, jsonEncode(outlets.map((o) => o.toJson()).toList()));
      await _prefs.setStringList(_kPerms, permissions.toList());

      // Bila masih ada shift terbuka, cabang aktif otomatis mengikuti shift tersebut.
      String? shiftOutlet;
      try {
        final s = await _db.from('shifts').select('outlet_id').eq('cashier_id', uid).eq('status', 'open').maybeSingle();
        shiftOutlet = s?['outlet_id'] as String?;
      } catch (_) {}
      _resolveOutlet(shiftOutlet);
      if (shiftOutlet != null) outletLocked = activeOutlet?.id == shiftOutlet;
      status = SessionStatus.ready;
      notifyListeners();
    } catch (e) {
      if (isNetworkError(e) && _restoreCache(uid)) {
        _resolveOutlet(null);
        status = SessionStatus.ready;
        notifyListeners();
      } else if (isNetworkError(e)) {
        _block('Tidak dapat terhubung ke server. Periksa internet Anda, lalu coba lagi.');
      } else {
        _block(friendlyError(e));
      }
    }
  }

  bool _restoreCache(String uid) {
    final rawP = _prefs.getString(_kProfile);
    final rawO = _prefs.getString(_kOutlets);
    if (rawP == null || rawO == null) return false;
    final p = AppProfile.fromJson(Map<String, dynamic>.from(jsonDecode(rawP) as Map));
    if (p.id != uid) return false; // cache milik pengguna lain
    profile = p;
    outlets = (jsonDecode(rawO) as List).map((e) => Outlet.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    permissions = (_prefs.getStringList(_kPerms) ?? const []).toSet();
    usingCachedProfile = true;
    return true;
  }

  void _block(String reason) {
    blockReason = reason;
    status = SessionStatus.blocked;
    notifyListeners();
  }

  void _resolveOutlet(String? forcedId) {
    Outlet? pick(String? id) => id == null ? null : outlets.where((o) => o.id == id).cast<Outlet?>().firstOrNull;
    activeOutlet = pick(forcedId) ?? pick(_prefs.getString(_kActiveOutlet)) ?? (outlets.length == 1 ? outlets.first : null);
  }

  /// Kasir hanya dapat memilih cabang dari daftar yang ditugaskan kepadanya.
  Future<void> selectOutlet(Outlet o) async {
    if (outletLocked || !outlets.any((x) => x.id == o.id)) return;
    activeOutlet = o;
    await _prefs.setString(_kActiveOutlet, o.id);
    notifyListeners();
  }

  void clearOutlet() {
    if (outletLocked) return;
    activeOutlet = null;
    _prefs.remove(_kActiveOutlet);
    notifyListeners();
  }

  void setOutletLocked(bool v) {
    if (outletLocked == v) return;
    outletLocked = v;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
