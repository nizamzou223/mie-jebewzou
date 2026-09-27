import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/checkout.dart';
import '../state/cart.dart';
import '../state/catalog.dart';
import '../state/session.dart';
import '../state/shift.dart';
import '../state/sync.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import 'success_screen.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  String _method = 'cash';
  final _received = TextEditingController();
  int _receivedValue = 0;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final methods = context.read<CatalogController>().settings.paymentMethods;
    if (methods.isNotEmpty && !methods.contains('cash')) _method = methods.first;
  }

  @override
  void dispose() {
    _received.dispose();
    super.dispose();
  }

  /// Nominal cepat: uang pas dan pembulatan ke atas (5rb, 10rb, 20rb, 50rb, 100rb).
  List<int> _quick(int total) {
    final s = <int>{total};
    for (final step in [5000, 10000, 20000, 50000, 100000]) {
      s.add(((total + step - 1) ~/ step) * step);
    }
    return (s.toList()..sort()).take(5).toList();
  }

  void _setReceived(int v) {
    setState(() {
      _receivedValue = v;
      _received.text = v == 0 ? '' : '$v';
      _received.selection = TextSelection.collapsed(offset: _received.text.length);
    });
  }

  Future<void> _confirmAndPay() async {
    final cart = context.read<CartController>();
    final total = cart.total;
    final change = _method == 'cash' ? _receivedValue - total : 0;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Selesaikan transaksi?'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          _kv('Total', rupiah(total), bold: true),
          _kv('Metode', paymentLabel(_method)),
          if (_method == 'cash') ...[
            _kv('Uang diterima', rupiah(_receivedValue)),
            _kv('Kembalian', rupiah(change), bold: true),
          ],
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Periksa lagi')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(minimumSize: const Size(140, 48)),
            child: const Text('Selesaikan'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _pay(cart);
  }

  Future<void> _pay(CartController cart) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final service = CheckoutService(
      session: context.read<SessionController>(),
      shift: context.read<ShiftController>(),
      sync: context.read<SyncController>(),
      catalog: context.read<CatalogController>(),
    );
    try {
      final result = await service.checkout(cart: cart, method: _method, received: _receivedValue);
      cart.clear();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => SuccessScreen(result: result)));
    } catch (e) {
      if (!mounted) return;
      final msg = friendlyError(e);
      setState(() => _error = msg);
      final stale = e.toString().contains('HARGA_BERUBAH') || e.toString().contains('PRODUK_TIDAK_TERSEDIA');
      if (stale) {
        final session = context.read<SessionController>();
        if (session.activeOutlet != null) context.read<CatalogController>().load(session.activeOutlet!, force: true);
      }
      if (e.toString().contains('SHIFT_SUDAH_DITUTUP') || e.toString().contains('SHIFT_DIBUTUHKAN')) {
        context.read<ShiftController>().load();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _kv(String k, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(k),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 18 : 15)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final methods = context.watch<CatalogController>().settings.paymentMethods;
    final total = cart.total;
    final isCash = _method == 'cash';
    final change = _receivedValue - total;
    final canPay = !_busy && !cart.isEmpty && (!isCash || _receivedValue >= total);

    return Scaffold(
      appBar: AppBar(title: const Text('Pembayaran')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(children: [
                const Text('Total tagihan', style: TextStyle(color: Brand.muted)),
                const SizedBox(height: 4),
                Text(rupiah(total), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: Brand.primaryDark)),
                if (cart.discountAmount > 0 || cart.tax > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Subtotal ${rupiah(cart.subtotal)}'
                      '${cart.discountAmount > 0 ? ' · Diskon -${rupiah(cart.discountAmount)}' : ''}'
                      '${cart.tax > 0 ? ' · ${cart.settings.taxName} ${rupiah(cart.tax)}' : ''}',
                      style: const TextStyle(color: Brand.muted, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
              ]),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Metode pembayaran', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Wrap(spacing: 10, runSpacing: 10, children: [
            for (final m in methods)
              ChoiceChip(
                label: Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), child: Text(paymentLabel(m), style: const TextStyle(fontSize: 16))),
                selected: _method == m,
                onSelected: _busy ? null : (_) => setState(() => _method = m),
              ),
          ]),
          const SizedBox(height: 20),
          if (isCash) ...[
            const Text('Uang diterima', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final q in _quick(total))
                ActionChip(
                  label: Padding(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4), child: Text(q == total ? 'Uang pas' : rupiah(q))),
                  onPressed: _busy ? null : () => _setReceived(q),
                ),
            ]),
            const SizedBox(height: 12),
            AmountField(
              controller: _received,
              label: 'Nominal diterima',
              onChanged: (v) => setState(() => _receivedValue = v),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: _receivedValue == 0 ? Colors.white : (change >= 0 ? Brand.successSoft : Brand.dangerSoft),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Brand.line),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(_receivedValue == 0 || change >= 0 ? 'Kembalian' : 'Kurang', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                Text(
                  _receivedValue == 0 ? '-' : rupiah(change.abs()),
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: change >= 0 ? Brand.success : Brand.danger),
                ),
              ]),
            ),
          ] else
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Brand.warningSoft, borderRadius: BorderRadius.circular(12)),
              child: Text(
                'Pastikan pembayaran ${paymentLabel(_method)} sebesar ${rupiah(total)} sudah diterima sebelum menyelesaikan transaksi.',
                style: const TextStyle(color: Brand.warning, fontWeight: FontWeight.w600),
              ),
            ),
          if (_error != null)
            Container(
              margin: const EdgeInsets.only(top: 16),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Brand.dangerSoft, borderRadius: BorderRadius.circular(12)),
              child: Text(_error!, style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: GradientButton(
            onPressed: canPay ? _confirmAndPay : null,
            loading: _busy,
            child: const Text('Selesaikan transaksi'),
          ),
        ),
      ),
    );
  }
}
