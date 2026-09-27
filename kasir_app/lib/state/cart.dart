import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../models/models.dart';

class SelectedModifier {
  SelectedModifier({required this.groupName, required this.modifier});
  final String groupName;
  final Modifier modifier;
}

class CartLine {
  CartLine({
    required this.product,
    this.variant,
    List<SelectedModifier>? modifiers,
    this.quantity = 1,
    this.note,
  })  : modifiers = modifiers ?? const [],
        key = const Uuid().v4();

  final String key;
  final Product product;
  final Variant? variant;
  final List<SelectedModifier> modifiers;
  int quantity;
  final String? note;

  int get unitPrice => product.price + (variant?.priceDelta ?? 0) + modifiers.fold(0, (s, m) => s + m.modifier.priceDelta);

  int get lineTotal => unitPrice * quantity;

  /// Baris dengan produk, pilihan, dan catatan yang sama digabung menjadi satu.
  String get signature {
    final ids = modifiers.map((m) => m.modifier.id).toList()..sort();
    return '${product.id}|${variant?.id ?? ''}|${ids.join(',')}|${(note ?? '').trim()}';
  }

  CartLine copyWith({Variant? variant, List<SelectedModifier>? modifiers, int? quantity, String? note}) => CartLine(
        product: product,
        variant: variant ?? this.variant,
        modifiers: modifiers ?? this.modifiers,
        quantity: quantity ?? this.quantity,
        note: note ?? this.note,
      );

  /// Hanya ID dan jumlah yang dikirim; harga selalu dihitung ulang di server.
  Map<String, dynamic> toPayload() => {
        'product_id': product.id,
        'variant_id': variant?.id,
        'quantity': quantity,
        'modifier_ids': modifiers.map((m) => m.modifier.id).toList(),
        'note': (note ?? '').trim().isEmpty ? null : note!.trim(),
      };
}

class CartController extends ChangeNotifier {
  final List<CartLine> _lines = [];
  DiscountDef? _discount;
  String _note = '';
  BusinessSettings _settings = BusinessSettings.defaults();

  List<CartLine> get lines => List.unmodifiable(_lines);
  DiscountDef? get discount => _discount;
  String get note => _note;
  bool get isEmpty => _lines.isEmpty;
  int get itemCount => _lines.fold(0, (s, l) => s + l.quantity);

  int get subtotal => _lines.fold(0, (s, l) => s + l.lineTotal);
  int get discountAmount => _discount?.amountFor(subtotal) ?? 0;
  int get tax => _settings.taxFor(subtotal - discountAmount);
  int get total => subtotal - discountAmount + tax;

  BusinessSettings get settings => _settings;

  void updateSettings(BusinessSettings s) {
    _settings = s;
    notifyListeners();
  }

  void add(CartLine line) {
    final i = _lines.indexWhere((l) => l.signature == line.signature);
    if (i >= 0) {
      _lines[i].quantity += line.quantity;
    } else {
      _lines.add(line);
    }
    notifyListeners();
  }

  void replace(String key, CartLine line) {
    final i = _lines.indexWhere((l) => l.key == key);
    if (i < 0) return;
    _lines.removeAt(i);
    final j = _lines.indexWhere((l) => l.signature == line.signature);
    if (j >= 0) {
      _lines[j].quantity += line.quantity;
    } else {
      _lines.insert(i, line);
    }
    notifyListeners();
  }

  void setQuantity(String key, int qty) {
    final i = _lines.indexWhere((l) => l.key == key);
    if (i < 0) return;
    if (qty <= 0) {
      _lines.removeAt(i);
    } else {
      _lines[i].quantity = qty > 999 ? 999 : qty;
    }
    notifyListeners();
  }

  void remove(String key) => setQuantity(key, 0);

  void setDiscount(DiscountDef? d) {
    _discount = d;
    notifyListeners();
  }

  void setNote(String n) {
    _note = n;
    notifyListeners();
  }

  void clear() {
    _lines.clear();
    _discount = null;
    _note = '';
    notifyListeners();
  }
}
