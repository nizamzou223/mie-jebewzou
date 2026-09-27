import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/cart.dart';
import '../state/catalog.dart';
import '../state/session.dart';
import '../state/shift.dart';
import '../state/sync.dart';
import '../theme.dart';
import '../widgets/common.dart';

class AccountPage extends StatelessWidget {
  const AccountPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final sync = context.watch<SyncController>();
    final p = session.profile;

    return Scaffold(
      appBar: AppBar(title: const Text('Akun')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Brand.primarySoft,
                child: Text((p?.fullName.isNotEmpty ?? false) ? p!.fullName.characters.first.toUpperCase() : '?', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Brand.primaryDark)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p?.fullName ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  Text(p?.email ?? '', style: const TextStyle(color: Brand.muted)),
                  const SizedBox(height: 6),
                  StatusPill(p?.roleLabel ?? '', color: Brand.primaryDark, background: Brand.primarySoft),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.storefront_outlined),
              title: const Text('Cabang aktif'),
              subtitle: Text(session.activeOutlet?.name ?? '-'),
              trailing: session.outlets.length > 1
                  ? TextButton(
                      onPressed: session.outletLocked ? null : () => _changeOutlet(context),
                      child: const Text('Ganti'),
                    )
                  : null,
            ),
            if (session.outletLocked && session.outlets.length > 1)
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Text('Cabang tidak dapat diganti selama shift berjalan. Tutup shift terlebih dahulu.', style: TextStyle(color: Brand.muted, fontSize: 13)),
              ),
            const Divider(height: 1),
            ListTile(
              leading: Icon(sync.online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined, color: sync.online ? Brand.success : Brand.warning),
              title: Text(sync.online ? 'Online' : 'Offline'),
              subtitle: Text(sync.items.isEmpty ? 'Semua transaksi tersinkron' : '${sync.pendingCount} menunggu · ${sync.failedCount} gagal sinkron'),
              trailing: sync.pendingCount > 0 ? TextButton(onPressed: sync.syncing ? null : sync.syncNow, child: const Text('Sinkronkan')) : null,
            ),
            if (session.usingCachedProfile)
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Text('Data akun dimuat dari penyimpanan perangkat (offline).', style: TextStyle(color: Brand.muted, fontSize: 13)),
              ),
          ]),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => _logout(context),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Keluar'),
        ),
        const SizedBox(height: 16),
        const Center(child: Text('Jebewsizou Kasir · v1.0.0', style: TextStyle(color: Brand.muted, fontSize: 12))),
      ]),
    );
  }

  Future<void> _changeOutlet(BuildContext context) async {
    final session = context.read<SessionController>();
    final cart = context.read<CartController>();
    if (!cart.isEmpty) {
      showSnack(context, 'Kosongkan keranjang sebelum berganti cabang.', error: true);
      return;
    }
    session.clearOutlet(); // RootGate menampilkan pemilih cabang
    context.read<CatalogController>().clear();
    context.read<ShiftController>().clear();
  }

  Future<void> _logout(BuildContext context) async {
    final sync = context.read<SyncController>();
    final session = context.read<SessionController>();
    final shift = context.read<ShiftController>();
    final catalog = context.read<CatalogController>();
    final cart = context.read<CartController>();
    final hasShift = shift.current != null;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Keluar dari akun?'),
        content: Text([
          if (sync.items.isNotEmpty) '${sync.items.length} transaksi belum tersinkron tetap tersimpan di perangkat dan baru terkirim setelah Anda login kembali dengan akun ini.',
          if (hasShift) 'Shift Anda masih berjalan.',
          if (sync.items.isEmpty && !hasShift) 'Anda perlu login lagi untuk memakai aplikasi.',
        ].join('\n\n')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(context, true), style: FilledButton.styleFrom(minimumSize: const Size(110, 46)), child: const Text('Keluar')),
        ],
      ),
    );
    if (ok != true) return;
    cart.clear();
    catalog.clear();
    shift.clear();

    if (!context.mounted) return;
    final name = session.profile?.fullName.split(' ').first ?? '';
    // Overlay animasi keluar; ditutup otomatis setelah sesi benar-benar berakhir.
    // Sesudahnya RootGate memudarkan tampilan ke halaman login (lihat app.dart).
    unawaited(showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black26,
      transitionDuration: const Duration(milliseconds: 260),
      pageBuilder: (_, _, _) => _LogoutOverlay(name: name),
      transitionBuilder: (_, animation, _, child) => FadeTransition(
        opacity: animation,
        child: ScaleTransition(scale: Tween(begin: 0.9, end: 1.0).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutBack)), child: child),
      ),
    ));
    await session.signOut();
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
  }
}

/// Kartu kecil beranimasi yang tampil sesaat saat proses keluar berjalan.
class _LogoutOverlay extends StatelessWidget {
  const _LogoutOverlay({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) => Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 40),
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 26),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [BoxShadow(color: Brand.ink.withValues(alpha: 0.12), blurRadius: 30, offset: const Offset(0, 14))],
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(gradient: Brand.gradient, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: const Icon(Icons.waving_hand_rounded, color: Colors.white, size: 26),
            ),
            const SizedBox(height: 16),
            Text(name.isEmpty ? 'Sampai jumpa!' : 'Sampai jumpa, $name!', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            const Text('Sedang keluar…', style: TextStyle(color: Brand.muted, fontSize: 13)),
            const SizedBox(height: 16),
            const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.6, color: Brand.primary)),
          ]),
        ),
      );
}
