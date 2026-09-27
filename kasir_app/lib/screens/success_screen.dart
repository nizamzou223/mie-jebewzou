import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../services/checkout.dart';
import '../state/catalog.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/receipt.dart';
import '../widgets/common.dart';

class SuccessScreen extends StatelessWidget {
  const SuccessScreen({super.key, required this.result});
  final CheckoutResult result;

  @override
  Widget build(BuildContext context) {
    final settings = context.read<CatalogController>().settings;
    final r = result.receipt;
    final text = receiptText(r, settings);
    final synced = result.synced;

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Column(children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const SizedBox(height: 12),
                  Icon(synced ? Icons.check_circle_rounded : Icons.save_alt_rounded, size: 84, color: synced ? Brand.success : Brand.warning),
                  const SizedBox(height: 12),
                  Text(
                    synced ? 'Transaksi berhasil' : 'Tersimpan di perangkat',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  Text('No. ${r['order_number']}', textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted, fontSize: 15)),
                  if (!synced)
                    Container(
                      margin: const EdgeInsets.only(top: 14),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: Brand.warningSoft, borderRadius: BorderRadius.circular(12)),
                      child: const Text(
                        'Belum ada koneksi ke server. Transaksi ini BELUM tercatat di server dan akan dikirim otomatis saat internet kembali. '
                        'Nomor resmi akan diberikan setelah sinkronisasi. Jangan hapus data aplikasi atau keluar dari akun sebelum tersinkron.',
                        style: TextStyle(color: Brand.warning, fontWeight: FontWeight.w600),
                      ),
                    ),
                  const SizedBox(height: 20),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(children: [
                        _row('Total', rupiah(r['total'] as num), big: true),
                        _row('Metode', paymentLabel(r['payment_method'] as String?)),
                        if (r['payment_method'] == 'cash') ...[
                          _row('Diterima', rupiah((r['payment'] as Map)['received'] as num)),
                          const Divider(height: 24),
                          _row('Kembalian', rupiah(result.change), big: true, color: Brand.success),
                        ],
                      ]),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ExpansionTile(
                    title: const Text('Lihat struk', style: TextStyle(fontWeight: FontWeight.w700)),
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        color: Colors.white,
                        child: Text(text, style: const TextStyle(fontFamily: 'monospace', fontSize: 12, height: 1.35)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
              child: Column(children: [
                OutlinedButton.icon(
                  onPressed: () => SharePlus.instance.share(ShareParams(text: text, subject: 'Struk ${r['order_number']}')),
                  icon: const Icon(Icons.ios_share_rounded),
                  label: const Text('Bagikan / cetak struk'),
                ),
                const SizedBox(height: 10),
                GradientButton(onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst), child: const Text('Transaksi baru')),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _row(String l, String v, {bool big = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(l, style: TextStyle(fontSize: big ? 18 : 15, fontWeight: FontWeight.w600)),
          Text(v, style: TextStyle(fontSize: big ? 26 : 15, fontWeight: big ? FontWeight.w900 : FontWeight.w600, color: color)),
        ]),
      );
}
