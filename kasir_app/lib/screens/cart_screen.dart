import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/cart.dart';
import '../state/catalog.dart';
import '../state/session.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import 'payment_screen.dart';
import 'product_options_sheet.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  Future<void> _edit(BuildContext context, CartLine l) async {
    final cart = context.read<CartController>();
    final updated = await showProductOptions(context, product: l.product, editing: l);
    if (updated != null) cart.replace(l.key, updated);
  }

  Future<void> _pickDiscount(BuildContext context) async {
    final cart = context.read<CartController>();
    final discounts = context.read<CatalogController>().discounts;
    final picked = await showModalBottomSheet<Object>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 8), child: Align(alignment: Alignment.centerLeft, child: Text('Pilih diskon', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)))),
          if (discounts.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Belum ada diskon yang tersedia.', style: TextStyle(color: Brand.muted))),
          for (final d in discounts)
            ListTile(
              title: Text(d.label, style: const TextStyle(fontWeight: FontWeight.w600)),
              trailing: Text('-${rupiah(d.amountFor(cart.subtotal))}', style: const TextStyle(color: Brand.success, fontWeight: FontWeight.w700)),
              onTap: () => Navigator.of(context).pop(d),
            ),
          if (cart.discount != null) ListTile(leading: const Icon(Icons.close), title: const Text('Hapus diskon'), onTap: () => Navigator.of(context).pop('none')),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (picked is DiscountDef) cart.setDiscount(picked);
    if (picked == 'none') cart.setDiscount(null);
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final session = context.watch<SessionController>();
    final canDiscount = session.can('discount.apply');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Keranjang'),
        actions: [
          if (!cart.isEmpty)
            TextButton(
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (_) => AlertDialog(
                    title: const Text('Kosongkan keranjang?'),
                    content: const Text('Semua item akan dihapus.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
                      TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Kosongkan')),
                    ],
                  ),
                );
                if (ok == true) {
                  cart.clear();
                  if (context.mounted) Navigator.of(context).pop();
                }
              },
              child: const Text('Kosongkan'),
            ),
        ],
      ),
      body: cart.isEmpty
          ? const EmptyView(icon: Icons.shopping_basket_outlined, title: 'Keranjang kosong', hint: 'Pilih menu di halaman kasir.')
          : Column(children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    for (final l in cart.lines)
                      Dismissible(
                        key: ValueKey(l.key),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 24),
                          margin: const EdgeInsets.only(bottom: 10),
                          decoration: BoxDecoration(color: Brand.danger, borderRadius: BorderRadius.circular(14)),
                          child: const Icon(Icons.delete_outline, color: Colors.white, size: 28),
                        ),
                        onDismissed: (_) => cart.remove(l.key),
                        child: _LineCard(line: l, onEdit: l.product.needsOptions ? () => _edit(context, l) : null),
                      ),
                    const SizedBox(height: 6),
                    if (canDiscount)
                      Card(
                        child: ListTile(
                          leading: const Icon(Icons.local_offer_outlined, color: Brand.primary),
                          title: Text(cart.discount?.label ?? 'Tambah diskon'),
                          subtitle: cart.discount == null ? null : Text('Potongan ${rupiah(cart.discountAmount)}'),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => _pickDiscount(context),
                        ),
                      ),
                    const SizedBox(height: 10),
                    _NoteField(initial: cart.note, onChanged: cart.setNote),
                  ],
                ),
              ),
              Container(
                decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Brand.line))),
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
                child: SafeArea(
                  top: false,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    _row('Subtotal', rupiah(cart.subtotal)),
                    if (cart.discountAmount > 0) _row('Diskon', '-${rupiah(cart.discountAmount)}', color: Brand.success),
                    if (cart.tax > 0) _row(cart.settings.taxName, rupiah(cart.tax)),
                    const Divider(height: 20),
                    _row('Total', rupiah(cart.total), big: true),
                    const SizedBox(height: 12),
                    GradientButton(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PaymentScreen())),
                      child: Text('Bayar ${rupiah(cart.total)}'),
                    ),
                  ]),
                ),
              ),
            ]),
    );
  }

  Widget _row(String l, String v, {bool big = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(l, style: TextStyle(fontSize: big ? 20 : 15, fontWeight: big ? FontWeight.w800 : FontWeight.w500, color: color)),
          Text(v, style: TextStyle(fontSize: big ? 22 : 15, fontWeight: big ? FontWeight.w800 : FontWeight.w600, color: color)),
        ]),
      );
}

class _NoteField extends StatefulWidget {
  const _NoteField({required this.initial, required this.onChanged});
  final String initial;
  final ValueChanged<String> onChanged;

  @override
  State<_NoteField> createState() => _NoteFieldState();
}

class _NoteFieldState extends State<_NoteField> {
  late final TextEditingController _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: _c,
        onChanged: widget.onChanged,
        maxLength: 200,
        decoration: const InputDecoration(labelText: 'Catatan untuk transaksi (opsional)'),
      );
}

class _LineCard extends StatelessWidget {
  const _LineCard({required this.line, this.onEdit});
  final CartLine line;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final cart = context.read<CartController>();
    final detail = [
      if (line.variant != null) line.variant!.name,
      ...line.modifiers.map((m) => m.modifier.name),
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onEdit,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: Text(line.product.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                Text(rupiah(line.lineTotal), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              ]),
              if (detail.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(detail, style: const TextStyle(color: Brand.muted, fontSize: 13))),
              if ((line.note ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text('Catatan: ${line.note}', style: const TextStyle(color: Brand.warning, fontSize: 13))),
              const SizedBox(height: 10),
              Row(children: [
                Text('${rupiah(line.unitPrice)} / porsi', style: const TextStyle(color: Brand.muted, fontSize: 13)),
                if (onEdit != null) ...[
                  const SizedBox(width: 10),
                  const Text('Ketuk untuk ubah', style: TextStyle(color: Brand.primary, fontSize: 12, fontWeight: FontWeight.w600)),
                ],
                const Spacer(),
                IconButton.outlined(
                  onPressed: () => cart.setQuantity(line.key, line.quantity - 1),
                  icon: Icon(line.quantity == 1 ? Icons.delete_outline : Icons.remove),
                  tooltip: line.quantity == 1 ? 'Hapus' : 'Kurangi',
                  style: IconButton.styleFrom(minimumSize: const Size(46, 46)),
                ),
                SizedBox(width: 40, child: Text('${line.quantity}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                IconButton.outlined(
                  onPressed: () => cart.setQuantity(line.key, line.quantity + 1),
                  icon: const Icon(Icons.add),
                  tooltip: 'Tambah',
                  style: IconButton.styleFrom(minimumSize: const Size(46, 46)),
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}
