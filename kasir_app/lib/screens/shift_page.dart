import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/cart.dart';
import '../state/session.dart';
import '../state/shift.dart';
import '../state/sync.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';

/// Dialog buka shift + modal awal kas. Membutuhkan koneksi internet.
Future<void> showOpenShiftDialog(BuildContext context) async {
  final controller = TextEditingController();
  final shift = context.read<ShiftController>();
  final messenger = ScaffoldMessenger.of(context);
  final amount = await showDialog<int>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (_, setState) => AlertDialog(
        title: const Text('Buka shift'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Masukkan modal awal (uang tunai di laci saat mulai).'),
          const SizedBox(height: 14),
          AmountField(controller: controller, label: 'Modal awal', autofocus: true, hint: '0', onChanged: (_) => setState(() {})),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Batal')),
          FilledButton(
            onPressed: controller.text.isEmpty ? null : () => Navigator.pop(dialogContext, AmountField.parse(controller.text)),
            style: FilledButton.styleFrom(minimumSize: const Size(130, 48)),
            child: const Text('Buka shift'),
          ),
        ],
      ),
    ),
  );
  controller.dispose();
  if (amount == null) return;
  try {
    await shift.open(amount);
    messenger.showSnackBar(const SnackBar(content: Text('Shift dibuka. Selamat berjualan!')));
  } catch (e) {
    final msg = isNetworkError(e) ? 'Membuka shift membutuhkan koneksi internet.' : friendlyError(e);
    messenger.showSnackBar(SnackBar(content: Text(msg), backgroundColor: Brand.danger));
  }
}

class ShiftPage extends StatefulWidget {
  const ShiftPage({super.key});

  @override
  State<ShiftPage> createState() => _ShiftPageState();
}

class _ShiftPageState extends State<ShiftPage> {
  Map<String, dynamic>? _summary;
  String? _error;
  bool _loading = false;
  String? _loadedFor;

  Future<void> _loadSummary() async {
    final shift = context.read<ShiftController>();
    if (shift.current == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _summary = await shift.summary().timeout(const Duration(seconds: 15));
    } catch (e) {
      _error = isNetworkError(e) ? 'Ringkasan shift membutuhkan koneksi internet.' : friendlyError(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _close() async {
    final sync = context.read<SyncController>();
    final shift = context.read<ShiftController>();
    final cart = context.read<CartController>();
    final messenger = ScaffoldMessenger.of(context);

    if (!cart.isEmpty) {
      showSnack(context, 'Selesaikan atau kosongkan keranjang sebelum menutup shift.', error: true);
      return;
    }
    if (sync.hasUnsynced) {
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Belum bisa menutup shift'),
          content: Text('Masih ada ${sync.items.length} transaksi yang belum tersinkron ke server. Sambungkan internet dan pastikan semuanya tersinkron (periksa menu Riwayat) sebelum menutup shift agar hitungan kas benar.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Mengerti')),
            FilledButton(
              onPressed: () {
                sync.syncNow();
                Navigator.pop(context);
              },
              style: FilledButton.styleFrom(minimumSize: const Size(140, 46)),
              child: const Text('Sinkronkan sekarang'),
            ),
          ],
        ),
      );
      return;
    }

    Map<String, dynamic> fresh;
    try {
      fresh = await shift.summary().timeout(const Duration(seconds: 15));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(isNetworkError(e) ? 'Menutup shift membutuhkan koneksi internet.' : friendlyError(e)), backgroundColor: Brand.danger));
      return;
    }
    if (!mounted) return;

    final expected = money(fresh['expected_cash']);
    final controller = TextEditingController();
    final noteController = TextEditingController();
    final result = await showDialog<({int actual, String note})>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (_, setState) {
        final actual = AmountField.parse(controller.text);
        final diff = actual - expected;
        return AlertDialog(
          title: const Text('Tutup shift'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              _kv('Modal awal', rupiah(money(fresh['opening_cash']))),
              _kv('Penjualan tunai', rupiah(money(fresh['cash_sales']))),
              if (money(fresh['cash_refunded_out']) > 0) _kv('Refund tunai', '-${rupiah(money(fresh['cash_refunded_out']))}'),
              const Divider(height: 22),
              _kv('Perkiraan kas', rupiah(expected), bold: true),
              const SizedBox(height: 14),
              AmountField(controller: controller, label: 'Uang tunai aktual di laci', autofocus: true, onChanged: (_) => setState(() {})),
              const SizedBox(height: 10),
              if (controller.text.isNotEmpty)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: diff == 0 ? Brand.successSoft : Brand.warningSoft, borderRadius: BorderRadius.circular(12)),
                  child: Text(
                    diff == 0 ? 'Kas sesuai ✔' : (diff > 0 ? 'Lebih ${rupiah(diff)}' : 'Kurang ${rupiah(-diff)}'),
                    style: TextStyle(fontWeight: FontWeight.w800, color: diff == 0 ? Brand.success : Brand.warning),
                  ),
                ),
              const SizedBox(height: 10),
              TextField(controller: noteController, decoration: const InputDecoration(labelText: 'Catatan (opsional)')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Batal')),
            FilledButton(
              onPressed: controller.text.isEmpty ? null : () => Navigator.pop(dialogContext, (actual: actual, note: noteController.text.trim())),
              style: FilledButton.styleFrom(minimumSize: const Size(130, 48)),
              child: const Text('Tutup shift'),
            ),
          ],
        );
      }),
    );
    controller.dispose();
    noteController.dispose();
    if (result == null) return;

    try {
      final closed = await shift.close(result.actual, result.note.isEmpty ? null : result.note);
      if (!mounted) return;
      _summary = null;
      final diff = money(closed['cash_difference']);
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Shift ditutup'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            _kv('Transaksi', '${closed['orders_count']}'),
            _kv('Total penjualan', rupiah(money(closed['sales_total']))),
            _kv('Perkiraan kas', rupiah(money(closed['expected_cash']))),
            _kv('Kas aktual', rupiah(money(closed['closing_cash_actual']))),
            const Divider(height: 22),
            _kv('Selisih', diff == 0 ? 'Sesuai' : rupiah(diff), bold: true),
          ]),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), style: FilledButton.styleFrom(minimumSize: const Size(120, 46)), child: const Text('Selesai'))],
        ),
      );
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(friendlyError(e)), backgroundColor: Brand.danger));
    }
  }

  Widget _kv(String k, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Flexible(child: Text(k)),
          const SizedBox(width: 12),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 17 : 15)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final shift = context.watch<ShiftController>();
    final session = context.watch<SessionController>();
    final s = shift.current;

    if (s != null && _loadedFor != s.id && !_loading) {
      _loadedFor = s.id;
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadSummary());
    }
    if (s == null) _loadedFor = null;

    return Scaffold(
      appBar: AppBar(title: const Text('Shift kasir'), actions: [
        if (s != null) IconButton(onPressed: _loading ? null : _loadSummary, icon: const Icon(Icons.refresh_rounded), tooltip: 'Muat ulang'),
      ]),
      body: s == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.lock_clock_outlined, size: 56, color: Brand.muted),
                  const SizedBox(height: 12),
                  const Text('Tidak ada shift yang berjalan', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 20),
                  SizedBox(width: 260, child: GradientButton(onPressed: () => showOpenShiftDialog(context), child: const Text('Buka shift'))),
                ]),
              ),
            )
          : ListView(padding: const EdgeInsets.all(16), children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      const StatusPill('SHIFT BERJALAN', color: Brand.success, background: Brand.successSoft),
                      const Spacer(),
                      Text(session.activeOutlet?.name ?? '', style: const TextStyle(color: Brand.muted)),
                    ]),
                    const SizedBox(height: 12),
                    _kv('Dibuka', dateTimeId(s.openedAt)),
                    _kv('Modal awal', rupiah(s.openingCash)),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              if (_loading)
                const Padding(padding: EdgeInsets.all(28), child: LoadingView())
              else if (_error != null)
                Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(_error!, style: const TextStyle(color: Brand.warning, fontWeight: FontWeight.w600))))
              else if (_summary != null)
                _SummaryCard(summary: _summary!),
              const SizedBox(height: 16),
              FilledButton(onPressed: _close, style: FilledButton.styleFrom(backgroundColor: Brand.ink), child: const Text('Tutup shift')),
            ]),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});
  final Map<String, dynamic> summary;

  @override
  Widget build(BuildContext context) {
    final m = summary;
    Widget kv(String k, String v, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(k),
            Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w900 : FontWeight.w600, fontSize: bold ? 20 : 15)),
          ]),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Ringkasan shift', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          kv('Jumlah transaksi', '${m['orders_count']}'),
          kv('Total penjualan', rupiah(money(m['sales_total']))),
          kv('Penjualan tunai', rupiah(money(m['cash_sales']))),
          kv('Penjualan non-tunai', rupiah(money(m['noncash_sales']))),
          kv('Refund', '${m['refund_count']} · ${rupiah(money(m['refund_total']))}'),
          kv('Dibatalkan', '${m['void_count']} · ${rupiah(money(m['void_total']))}'),
          const Divider(height: 22),
          kv('Perkiraan kas di laci', rupiah(money(m['expected_cash'])), bold: true),
        ]),
      ),
    );
  }
}
