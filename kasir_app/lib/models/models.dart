import '../utils/format.dart';

class Outlet {
  Outlet({required this.id, required this.code, required this.name, this.address, this.phone});

  final String id;
  final String code;
  final String name;
  final String? address;
  final String? phone;

  factory Outlet.fromJson(Map<String, dynamic> j) => Outlet(
        id: j['id'] as String,
        code: j['code'] as String,
        name: j['name'] as String,
        address: j['address'] as String?,
        phone: j['phone'] as String?,
      );

  Map<String, dynamic> toJson() => {'id': id, 'code': code, 'name': name, 'address': address, 'phone': phone};
}

class AppProfile {
  AppProfile({required this.id, required this.fullName, required this.email, required this.role});

  final String id;
  final String fullName;
  final String? email;
  final String role; // owner | admin | cashier

  factory AppProfile.fromJson(Map<String, dynamic> j) => AppProfile(
        id: j['id'] as String,
        fullName: (j['full_name'] as String?) ?? '',
        email: j['email'] as String?,
        role: (j['role'] as String?) ?? 'cashier',
      );

  Map<String, dynamic> toJson() => {'id': id, 'full_name': fullName, 'email': email, 'role': role};

  String get roleLabel => switch (role) { 'owner' => 'Owner', 'admin' => 'Admin Cabang', _ => 'Kasir' };
}

class MenuCategory {
  MenuCategory({required this.id, required this.name});
  final String id;
  final String name;
}

class Variant {
  Variant({required this.id, required this.name, required this.priceDelta});
  final String id;
  final String name;
  final int priceDelta;
}

class Modifier {
  Modifier({required this.id, required this.name, required this.priceDelta});
  final String id;
  final String name;
  final int priceDelta;
}

class ModifierGroup {
  ModifierGroup({
    required this.id,
    required this.name,
    required this.isRequired,
    required this.minSelect,
    required this.maxSelect,
    required this.modifiers,
  });

  final String id;
  final String name;
  final bool isRequired;
  final int minSelect;
  final int? maxSelect;
  final List<Modifier> modifiers;

  /// Jumlah minimal yang harus dipilih kasir (grup wajib minimal 1).
  int get requiredCount => isRequired ? (minSelect < 1 ? 1 : minSelect) : minSelect;

  bool get singleChoice => maxSelect == 1;
}

class Product {
  Product({
    required this.id,
    required this.sku,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    required this.description,
    required this.price,
    required this.imageUrl,
    required this.isAvailable,
    required this.variants,
    required this.groups,
  });

  final String id;
  final String sku;
  final String name;
  final String? categoryId;
  final String? categoryName;
  final String? description;

  /// Harga efektif di cabang aktif (harga khusus cabang bila ada, jika tidak harga global).
  final int price;
  final String? imageUrl;
  final bool isAvailable;
  final List<Variant> variants;
  final List<ModifierGroup> groups;

  bool get needsOptions => variants.isNotEmpty || groups.isNotEmpty;
}

class DiscountDef {
  DiscountDef({required this.id, required this.name, required this.type, required this.valueBp});

  final String id;
  final String name;
  final String type; // percent | fixed

  /// Nilai x100 (persen 12,5 => 1250; rupiah 5000 => 500000) agar hitungan bebas floating point.
  final int valueBp;

  factory DiscountDef.fromJson(Map<String, dynamic> j) => DiscountDef(
        id: j['id'] as String,
        name: j['name'] as String,
        type: j['type'] as String,
        valueBp: (num.parse(j['value'].toString()) * 100).round(),
      );

  String get label => type == 'percent' ? '$name (${valueBp % 100 == 0 ? valueBp ~/ 100 : valueBp / 100}%)' : '$name (${rupiah(valueBp ~/ 100)})';

  /// Sama dengan perhitungan di server: persen dibulatkan ke rupiah, potongan tetap tidak melebihi subtotal.
  int amountFor(int subtotal) {
    if (type == 'percent') return (subtotal * valueBp + 5000) ~/ 10000;
    final v = valueBp ~/ 100;
    return v < subtotal ? v : subtotal;
  }
}

class BusinessSettings {
  BusinessSettings({
    required this.name,
    required this.receiptHeader,
    required this.receiptFooter,
    required this.paymentMethods,
    required this.taxEnabled,
    required this.taxName,
    required this.taxRateBp,
  });

  final String name;
  final String? receiptHeader;
  final String receiptFooter;
  final List<String> paymentMethods;
  final bool taxEnabled;
  final String taxName;
  final int taxRateBp; // persen x100

  factory BusinessSettings.defaults() => BusinessSettings(
        name: 'Jebewsizou',
        receiptHeader: null,
        receiptFooter: 'Terima kasih!',
        paymentMethods: const ['cash'],
        taxEnabled: false,
        taxName: 'Pajak',
        taxRateBp: 0,
      );

  factory BusinessSettings.fromJson(Map<String, dynamic> j) => BusinessSettings(
        name: (j['business_name'] as String?) ?? 'Jebewsizou',
        receiptHeader: j['receipt_header'] as String?,
        receiptFooter: (j['receipt_footer'] as String?) ?? 'Terima kasih!',
        paymentMethods: ((j['payment_methods'] as List?) ?? const ['cash']).map((e) => e.toString()).toList(),
        taxEnabled: (j['tax_enabled'] as bool?) ?? false,
        taxName: (j['tax_name'] as String?) ?? 'Pajak',
        taxRateBp: (num.parse((j['tax_rate'] ?? 0).toString()) * 100).round(),
      );

  /// Pajak hanya dihitung bila diaktifkan admin.
  int taxFor(int taxableBase) {
    if (!taxEnabled || taxRateBp <= 0) return 0;
    return (taxableBase * taxRateBp + 5000) ~/ 10000;
  }
}

class Shift {
  Shift({required this.id, required this.outletId, required this.openedAt, required this.openingCash});

  final String id;
  final String outletId;
  final DateTime openedAt;
  final int openingCash;

  factory Shift.fromJson(Map<String, dynamic> j) => Shift(
        id: j['id'] as String,
        outletId: j['outlet_id'] as String,
        openedAt: DateTime.parse(j['opened_at'] as String),
        openingCash: money(j['opening_cash']),
      );

  Map<String, dynamic> toJson() =>
      {'id': id, 'outlet_id': outletId, 'opened_at': openedAt.toIso8601String(), 'opening_cash': openingCash};
}
