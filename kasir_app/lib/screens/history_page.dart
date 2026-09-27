import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/offline_queue.dart';
import '../state/catalog.dart';
import '../state/session.dart';
import '../state/sync.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/receipt.dart';
import '../widgets/common.dart';

class HistoryPage extends StatefulWidget {
  const HistoryPage({super.key});

  @override
  State<HistoryPage> createState() => _HistoryPageState();
}

class _HistoryPageState extends State<HistoryPage> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;
  int _syncedCount = -1;

  SupabaseClient get _db => Supabase.instance.client;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final outlet = context.read<SessionController>().activeOutlet;
    if (outlet == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await _db
          .from('orders')
          .select('id, order_number, created_at, total, status, payment_method, cashier_name')
          .eq('outlet_id', outlet.id)
          .order('created_at', ascending: false)
          .limit(50)
          .timeout(const Duration(seconds: 15));
      _orders = rows.map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (e) {
      _error = isNetworkError(e) ? 'Tidak ada koneksi. Riwayat server tidak dapat dimuat.' : friendlyError(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<SyncController>();
    // Muat ulang otomatis setelah sinkronisasi menghasilkan transaksi baru di server.
    if (_syncedCount != -1 && sync.items.length < _syncedCount && !_loading) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
    _syncedCount = sync.items.length;
    final pending = sync.items;

    return Scaffold(
      appBar: AppBar(title: const Text('Riwayat transaksi')),
      body: RefreshIndicator(
        onRefresh: () async {
          await sync.syncNow();
          await _load();
        },
        child: _loading && _orders.isEmpty && pending.isEmpty
            ? ListView(children: const [SizedBox(height: 200, child: LoadingView())])
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (pending.isNotEmpty) ...[
                    const _Header('Belum tersinkron'),
                    for (final o in pending) _PendingTile(order: o),
                    const SizedBox(height: 12),
                  ],
                  const _Header('Tersimpan di server'),
                  if (_error != null)
                    Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: ErrorView(message: _error!, onRetry: _load))
                  else if (_orders.isEmpty)
                    const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: EmptyView(icon: Icons.receipt_long_outlined, title: 'Belum ada transaksi', hint: 'Transaksi yang sudah tersimpan di server tampil di sini.'))
                  else
                    for (final o in _orders) _OrderTile(order: o, onChanged: _load),
                ],
              ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Brand.muted)),
      );
}

class _PendingTile extends StatelessWidget {
  const _PendingTile({required this.order});
  final PendingOrder order;

  @override
  Widget build(BuildContext context) {
    final failed = order.status == PendingStatus.failed;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _showPendingDetail(context, order),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(order.localNumber, style: const TextStyle(fontWeight: FontWeight.w700))),
                syncStatusPill(order),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                Text(dateTimeId(order.createdAt), style: const TextStyle(color: Brand.muted, fontSize: 13)),
                const Spacer(),
                Text(rupiah(order.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ]),
              if (failed && order.error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(order.error!, style: const TextStyle(color: Brand.danger, fontSize: 13))),
            ]),
          ),
        ),
      ),
    );
  }

  void _showPendingDetail(BuildContext context, PendingOrder o) {
    final sync = context.read<SyncController>();
    final settings = context.read<CatalogController>().settings;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _ReceiptSheet(
        receipt: o.receipt,
        settings: settings,
        header: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          syncStatusPill(o),
          const SizedBox(height: 8),
          Text(
            o.status == PendingStatus.failed
                ? 'Server menolak transaksi ini: ${o.error}. Data tetap aman di perangkat. Hubungi admin cabang sebelum menghapus.'
                : 'Belum tersimpan di server. Akan dikirim otomatis saat online.',
            style: TextStyle(color: o.status == PendingStatus.failed ? Brand.danger : Brand.warning, fontWeight: FontWeight.w600),
          ),
        ]),
        actions: [
          if (o.status == PendingStatus.failed)
            OutlinedButton(
              onPressed: () {
                sync.retry(o.id);
                Navigator.of(context).pop();
              },
              child: const Text('Coba kirim lagi'),
            ),
          if (o.status == PendingStatus.failed)
            TextButton(
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (_) => AlertDialog(
                    title: const Text('Hapus dari perangkat?'),
                    content: const Text('Transaksi ini TIDAK akan pernah masuk ke server dan penjualannya tidak tercatat. Lakukan hanya bila sudah dikonfirmasi admin.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
                      TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Hapus', style: TextStyle(color: Brand.danger))),
                    ],
                  ),
                );
                if (ok == true) {
                  await sync.discard(o.id);
                  if (context.mounted) Navigator.of(context).pop();
                }
              },
              child: const Text('Hapus dari perangkat', style: TextStyle(color: Brand.danger)),
            ),
        ],
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order, required this.onChanged});
  final Map<String, dynamic> order;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final status = order['status'] as String;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _open(context),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('${order['order_number']}', style: const TextStyle(fontWeight: FontWeight.w700))),
                if (status == 'completed')
                  const StatusPill('Selesai', color: Brand.success, background: Brand.successSoft)
                else if (status == 'void')
                  const StatusPill('Dibatalkan')
                else
                  const StatusPill('Refund', color: Brand.warning, background: Brand.warningSoft),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                const Icon(Icons.cloud_done_outlined, size: 15, color: Brand.success),
                const SizedBox(width: 4),
                Text('${dateTimeId(DateTime.parse(order['created_at'] as String))} · ${paymentLabel(order['payment_method'] as String?)}', style: const TextStyle(color: Brand.muted, fontSize: 13)),
                const Spacer(),
                Text(rupiah(money(order['total'])), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, decoration: status == 'completed' ? null : TextDecoration.lineThrough)),
              ]),
            ]),
          ),
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    final db = Supabase.instance.client;
    final session = context.read<SessionController>();
    final settings = context.read<CatalogController>().settings;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final row = await db
          .from('orders')
          .select('*, outlets(name, code, address, phone), order_items(*, order_item_modifiers(*)), payments(*)')
          .eq('id', order['id'] as String)
          .single()
          .timeout(const Duration(seconds: 15));
      final receipt = receiptFromOrderRow(Map<String, dynamic>.from(row));
      if (!context.mounted) return;
      final canVoid = order['status'] == 'completed' && session.can('order.void');
      final canRefund = order['status'] == 'completed' && session.can('order.refund');
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        useSafeArea: true,
        builder: (sheetContext) => _ReceiptSheet(
          receipt: receipt,
          settings: settings,
          header: order['status'] == 'completed'
              ? null
              : Text('${order['status'] == 'void' ? 'Dibatalkan' : 'Di-refund'}. Alasan: ${receipt['void_reason'] ?? '-'}', style: const TextStyle(color: Brand.warning, fontWeight: FontWeight.w700)),
          actions: [
            if (canVoid) TextButton(onPressed: () => _reason(sheetContext, 'void'), child: const Text('Batalkan transaksi', style: TextStyle(color: Brand.danger))),
            if (canRefund) TextButton(onPressed: () => _reason(sheetContext, 'refund'), child: const Text('Refund', style: TextStyle(color: Brand.danger))),
          ],
        ),
      );
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(friendlyError(e)), backgroundColor: Brand.danger));
    }
  }

  Future<void> _reason(BuildContext sheetContext, String kind) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: sheetContext,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setState) => AlertDialog(
          title: Text(kind == 'void' ? 'Batalkan transaksi?' : 'Refund transaksi?'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Stok bahan dikembalikan dan tindakan ini tercatat di audit log.'),
            const SizedBox(height: 12),
            TextField(controller: controller, autofocus: true, maxLines: 2, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Alasan (wajib)')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Batal')),
            FilledButton(
              onPressed: controller.text.trim().length < 3 ? null : () => Navigator.pop(dialogContext, controller.text.trim()),
              style: FilledButton.styleFrom(minimumSize: const Size(120, 46), backgroundColor: Brand.danger),
              child: const Text('Lanjutkan'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (reason == null || !sheetContext.mounted) return;
    final messenger = ScaffoldMessenger.of(sheetContext);
    final nav = Navigator.of(sheetContext);
    try {
      await Supabase.instance.client.rpc('void_order', params: {'p_order_id': order['id'], 'p_reason': reason, 'p_kind': kind});
      nav.pop();
      messenger.showSnackBar(SnackBar(content: Text(kind == 'void' ? 'Transaksi dibatalkan' : 'Transaksi di-refund')));
      await onChanged();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(friendlyError(e)), backgroundColor: Brand.danger));
    }
  }
}

class _ReceiptSheet extends StatelessWidget {
  const _ReceiptSheet({required this.receipt, required this.settings, this.header, this.actions = const []});
  final Map<String, dynamic> receipt;
  final dynamic settings;
  final Widget? header;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final text = receiptText(receipt, settings);
    return Column(children: [
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 12), children: [
          if (header != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: header),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Brand.line)),
            child: Text(text, style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5, height: 1.4)),
          ),
        ]),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            OutlinedButton.icon(
              onPressed: () => SharePlus.instance.share(ShareParams(text: text, subject: 'Struk ${receipt['order_number']}')),
              icon: const Icon(Icons.ios_share_rounded),
              label: const Text('Bagikan / cetak struk'),
            ),
            ...actions,
          ]),
        ),
      ),
    ]);
  }
}
