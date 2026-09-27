import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import '../utils/format.dart';

/// Menu untuk cabang aktif: kategori, produk (dengan harga/ketersediaan khusus cabang),
/// variasi, tambahan, diskon, dan pengaturan usaha. Disalin ke penyimpanan lokal agar
/// kasir tetap dapat berjualan saat internet mati.
class CatalogController extends ChangeNotifier {
  CatalogController(this._prefs);

  final SharedPreferences _prefs;
  SupabaseClient get _db => Supabase.instance.client;

  List<MenuCategory> categories = [];
  List<Product> products = [];
  List<DiscountDef> discounts = [];
  BusinessSettings settings = BusinessSettings.defaults();
  bool loading = false;
  String? error;
  bool fromCache = false;
  DateTime? loadedAt;
  String? _outletId;

  Map<String, int> _popular = {};
  static const _kPopular = 'popular_counts';

  void restorePopular() {
    final raw = _prefs.getString(_kPopular);
    if (raw != null) {
      _popular = (jsonDecode(raw) as Map).map((k, v) => MapEntry(k as String, (v as num).toInt()));
    }
  }

  /// Produk yang paling sering dijual di perangkat ini (akses cepat).
  List<Product> get popular {
    final list = products.where((p) => (_popular[p.id] ?? 0) > 0 && p.isAvailable).toList()
      ..sort((a, b) => (_popular[b.id] ?? 0).compareTo(_popular[a.id] ?? 0));
    return list.take(6).toList();
  }

  void countSale(Iterable<MapEntry<String, int>> productQty) {
    for (final e in productQty) {
      _popular[e.key] = (_popular[e.key] ?? 0) + e.value;
    }
    _prefs.setString(_kPopular, jsonEncode(_popular));
  }

  Future<void> load(Outlet outlet, {bool force = false}) async {
    if (!force && _outletId == outlet.id && products.isNotEmpty && !fromCache) return;
    _outletId = outlet.id;
    loading = true;
    error = null;
    notifyListeners();
    final cacheKey = 'catalog_${outlet.id}';
    try {
      final raw = await _fetch(outlet.id).timeout(const Duration(seconds: 20));
      await _prefs.setString(cacheKey, jsonEncode(raw));
      _parse(raw);
      fromCache = false;
      loadedAt = DateTime.now();
    } catch (e) {
      final cached = _prefs.getString(cacheKey);
      if (isNetworkError(e) && cached != null) {
        _parse(Map<String, dynamic>.from(jsonDecode(cached) as Map));
        fromCache = true;
      } else {
        error = isNetworkError(e) ? 'Menu belum tersimpan di perangkat. Sambungkan internet untuk memuat menu.' : friendlyError(e);
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<Map<String, dynamic>> _fetch(String outletId) async {
    final results = await Future.wait([
      _db.from('categories').select().eq('is_active', true).order('sort_order'),
      _db.from('products').select('*, product_variants(*), product_modifier_groups(group_id, sort_order)').eq('is_active', true).order('name'),
      _db.from('modifier_groups').select('*, modifiers(*)').eq('is_active', true),
      _db.from('outlet_products').select().eq('outlet_id', outletId),
      _db.from('discounts').select().eq('is_active', true).or('outlet_id.is.null,outlet_id.eq.$outletId').order('name'),
      _db.from('business_settings').select().limit(1),
    ]);
    return {
      'categories': results[0],
      'products': results[1],
      'groups': results[2],
      'overrides': results[3],
      'discounts': results[4],
      'settings': results[5],
    };
  }

  @visibleForTesting
  void applyRaw(Map<String, dynamic> raw) => _parse(raw);

  void _parse(Map<String, dynamic> raw) {
    List<Map<String, dynamic>> rows(String k) => (raw[k] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

    categories = rows('categories').map((c) => MenuCategory(id: c['id'] as String, name: c['name'] as String)).toList();
    final catName = {for (final c in categories) c.id: c.name};

    final groups = <String, ModifierGroup>{};
    for (final g in rows('groups')) {
      final mods = (g['modifiers'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .where((m) => m['is_active'] as bool? ?? true)
          .toList()
        ..sort((a, b) => (a['sort_order'] as int? ?? 0).compareTo(b['sort_order'] as int? ?? 0));
      groups[g['id'] as String] = ModifierGroup(
        id: g['id'] as String,
        name: g['name'] as String,
        isRequired: g['is_required'] as bool? ?? false,
        minSelect: g['min_select'] as int? ?? 0,
        maxSelect: g['max_select'] as int?,
        modifiers: mods.map((m) => Modifier(id: m['id'] as String, name: m['name'] as String, priceDelta: money(m['price_delta']))).toList(),
      );
    }

    final overrides = {for (final o in rows('overrides')) o['product_id'] as String: o};

    products = [];
    for (final p in rows('products')) {
      final ov = overrides[p['id']];
      if (ov != null && !(ov['is_listed'] as bool? ?? true)) continue; // tidak dijual di cabang ini
      final variants = (p['product_variants'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .where((v) => v['is_active'] as bool? ?? true)
          .toList()
        ..sort((a, b) => (a['sort_order'] as int? ?? 0).compareTo(b['sort_order'] as int? ?? 0));
      final links = (p['product_modifier_groups'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList()
        ..sort((a, b) => (a['sort_order'] as int? ?? 0).compareTo(b['sort_order'] as int? ?? 0));
      products.add(Product(
        id: p['id'] as String,
        sku: p['sku'] as String,
        name: p['name'] as String,
        categoryId: p['category_id'] as String?,
        categoryName: catName[p['category_id']],
        description: p['description'] as String?,
        price: ov?['price_override'] != null ? money(ov!['price_override']) : money(p['base_price']),
        imageUrl: p['image_url'] as String?,
        isAvailable: ov?['is_available'] as bool? ?? true,
        variants: variants.map((v) => Variant(id: v['id'] as String, name: v['name'] as String, priceDelta: money(v['price_delta']))).toList(),
        groups: [for (final l in links) if (groups[l['group_id']] != null) groups[l['group_id']]!],
      ));
    }

    discounts = rows('discounts').map(DiscountDef.fromJson).toList();
    final s = rows('settings');
    settings = s.isEmpty ? BusinessSettings.defaults() : BusinessSettings.fromJson(s.first);
  }

  void clear() {
    categories = [];
    products = [];
    discounts = [];
    _outletId = null;
    error = null;
    notifyListeners();
  }
}
