import '../models/models.dart';
import '../state/cart.dart';
import 'format.dart';

/// Struk direpresentasikan sebagai Map dengan bentuk yang sama dengan JSON dari server
/// (fungsi create_order), sehingga struk online dan struk offline memakai kode tampilan yang sama.
Map<String, dynamic> buildLocalReceipt({
  required String localNumber,
  required CartController cart,
  required Outlet outlet,
  required String cashierName,
  required String method,
  required int received,
  required DateTime createdAt,
}) {
  final total = cart.total;
  final change = method == 'cash' ? received - total : 0;
  return {
    'order_number': localNumber,
    'status': 'completed',
    'created_at': createdAt.toUtc().toIso8601String(),
    'cashier_name': cashierName,
    'outlet': outlet.toJson(),
    'subtotal': cart.subtotal,
    'discount_name': cart.discount?.name,
    'discount_total': cart.discountAmount,
    'tax_name': cart.tax > 0 ? cart.settings.taxName : null,
    'tax_rate': cart.settings.taxRateBp / 100,
    'tax_total': cart.tax,
    'total': total,
    'payment_method': method,
    'note': cart.note.trim().isEmpty ? null : cart.note.trim(),
    'payment': {
      'method': method,
      'amount': total,
      'received': method == 'cash' ? received : total,
      'change': change,
    },
    'items': [
      for (final l in cart.lines)
        {
          'product_name': l.product.name,
          'variant_name': l.variant?.name,
          'quantity': l.quantity,
          'unit_price': l.unitPrice,
          'line_total': l.lineTotal,
          'note': l.note,
          'modifiers': [
            for (final m in l.modifiers) {'group_name': m.groupName, 'name': m.modifier.name, 'price_delta': m.modifier.priceDelta},
          ],
        },
    ],
  };
}

/// Struk dari baris `orders` (dengan relasi outlets, order_items, order_item_modifiers, payments).
Map<String, dynamic> receiptFromOrderRow(Map<String, dynamic> o) {
  final items = List<Map<String, dynamic>>.from((o['order_items'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)))
    ..sort((a, b) => (a['line_no'] as int? ?? 0).compareTo(b['line_no'] as int? ?? 0));
  final pays = (o['payments'] as List?) ?? const [];
  final p = pays.isEmpty ? null : Map<String, dynamic>.from(pays.first as Map);
  return {
    'id': o['id'],
    'order_number': o['order_number'],
    'status': o['status'],
    'created_at': o['created_at'],
    'cashier_name': o['cashier_name'],
    'outlet': o['outlets'],
    'subtotal': money(o['subtotal']),
    'discount_name': o['discount_name'],
    'discount_total': money(o['discount_total']),
    'tax_name': o['tax_name'],
    'tax_rate': o['tax_rate'],
    'tax_total': money(o['tax_total']),
    'total': money(o['total']),
    'payment_method': o['payment_method'],
    'note': o['note'],
    'void_reason': o['void_reason'],
    'payment': p == null
        ? null
        : {'method': p['method'], 'amount': money(p['amount']), 'received': money(p['received']), 'change': money(p['change_amount'])},
    'items': [
      for (final i in items)
        {
          'product_name': i['product_name'],
          'variant_name': i['variant_name'],
          'quantity': i['quantity'],
          'unit_price': money(i['unit_price']),
          'line_total': money(i['line_total']),
          'note': i['note'],
          'modifiers': [
            for (final m in (i['order_item_modifiers'] as List? ?? const []))
              {'group_name': (m as Map)['group_name'], 'name': m['modifier_name'], 'price_delta': money(m['price_delta'])},
          ],
        },
    ],
  };
}

/// Teks struk (lebar 32 karakter) untuk dibagikan / dicetak lewat aplikasi lain.
String receiptText(Map<String, dynamic> r, BusinessSettings s) {
  const w = 32;
  String line(String l, [String rt = '']) {
    final gap = w - l.length - rt.length;
    return l + ' ' * (gap < 1 ? 1 : gap) + rt;
  }

  final out = <String>[];
  final outlet = Map<String, dynamic>.from(r['outlet'] as Map);
  out.add(s.name.toUpperCase());
  out.add('${outlet['name']}');
  if ((outlet['address'] as String?)?.isNotEmpty ?? false) out.add(outlet['address'] as String);
  if ((s.receiptHeader ?? '').isNotEmpty) out.add(s.receiptHeader!);
  out.add('-' * w);
  out.add(line('No', '${r['order_number']}'));
  out.add(line('Waktu', dateTimeId(DateTime.parse(r['created_at'] as String))));
  out.add(line('Kasir', '${r['cashier_name']}'));
  if (r['status'] != null && r['status'] != 'completed') {
    out.add('*** ${r['status'] == 'void' ? 'DIBATALKAN' : 'REFUND'} ***');
  }
  out.add('-' * w);
  for (final it in (r['items'] as List)) {
    final m = Map<String, dynamic>.from(it as Map);
    final variant = m['variant_name'] != null ? ' (${m['variant_name']})' : '';
    out.add('${m['product_name']}$variant');
    for (final mod in (m['modifiers'] as List)) {
      out.add('  + ${(mod as Map)['name']}');
    }
    if (m['note'] != null) out.add('  Catatan: ${m['note']}');
    out.add(line('  ${m['quantity']} x ${rupiah(m['unit_price'] as num)}', rupiah(m['line_total'] as num)));
  }
  out.add('-' * w);
  out.add(line('Subtotal', rupiah(r['subtotal'] as num)));
  if (money(r['discount_total']) > 0) out.add(line('Diskon', '-${rupiah(r['discount_total'] as num)}'));
  if (money(r['tax_total']) > 0) out.add(line('${r['tax_name'] ?? 'Pajak'}', rupiah(r['tax_total'] as num)));
  out.add(line('TOTAL', rupiah(r['total'] as num)));
  final p = r['payment'];
  if (p != null) {
    final pm = Map<String, dynamic>.from(p as Map);
    out.add(line('Bayar (${paymentLabel(pm['method'] as String?)})', rupiah(pm['received'] as num)));
    if (pm['method'] == 'cash') out.add(line('Kembali', rupiah(pm['change'] as num)));
  }
  out.add('-' * w);
  out.add(s.receiptFooter);
  return out.join('\n');
}
