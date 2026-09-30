import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/cart.dart';
import '../state/catalog.dart';
import '../state/session.dart';
import '../state/shift.dart';
import '../state/sync.dart';
import '../theme.dart';
import '../utils/format.dart';
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
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _ProfileHeader(profile: p),
          const SizedBox(height: 18),
          const _SectionLabel('Cabang & sinkronisasi'),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const _SectionIcon(icon: Icons.storefront_outlined),
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
                    child: Text(
                      'Cabang tidak dapat diganti selama shift berjalan. Tutup shift terlebih dahulu.',
                      style: TextStyle(color: Brand.muted, fontSize: 13),
                    ),
                  ),
                const Divider(height: 1),
                ListTile(
                  leading: _SectionIcon(
                    icon: sync.online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined,
                    color: sync.online ? Brand.success : Brand.warning,
                    background: sync.online ? Brand.successSoft : Brand.warningSoft,
                  ),
                  title: Text(sync.online ? 'Online' : 'Offline'),
                  subtitle: Text(sync.items.isEmpty ? 'Semua transaksi tersinkron' : '${sync.pendingCount} menunggu · ${sync.failedCount} gagal sinkron'),
                  trailing: sync.pendingCount > 0 ? TextButton(onPressed: sync.syncing ? null : sync.syncNow, child: const Text('Sinkronkan')) : null,
                ),
                if (session.usingCachedProfile)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text('Data akun dimuat dari penyimpanan perangkat (offline).', style: TextStyle(color: Brand.muted, fontSize: 13)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const _SectionLabel('Keamanan akun'),
          Card(
            child: ListTile(
              leading: const _SectionIcon(icon: Icons.lock_outline_rounded),
              title: const Text('Ganti password'),
              subtitle: const Text('Perlu koneksi internet'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showDialog<void>(context: context, builder: (_) => const _ChangePasswordDialog()),
            ),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Keluar'),
          ),
          const SizedBox(height: 16),
          const Center(child: Text('Jebewsizou Kasir · v1.0.0', style: TextStyle(color: Brand.muted, fontSize: 12))),
        ],
      ),
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

/// Kartu profil di puncak halaman Akun: foto/inisial, nama, email, badge role, dan
/// tanggal bergabung (kalau ada) — padanan visual kartu profil di website admin.
class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.profile});
  final AppProfile? profile;

  @override
  Widget build(BuildContext context) {
    final initial = (profile?.fullName.isNotEmpty ?? false) ? profile!.fullName.characters.first.toUpperCase() : '?';
    final photo = profile?.avatarUrl;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: Brand.gradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Brand.primaryDark.withValues(alpha: 0.28), blurRadius: 24, offset: const Offset(0, 12))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 2),
                ),
                padding: const EdgeInsets.all(2),
                child: CircleAvatar(
                  backgroundColor: Colors.white.withValues(alpha: 0.22),
                  backgroundImage: (photo != null && photo.isNotEmpty) ? NetworkImage(photo) : null,
                  child: (photo == null || photo.isEmpty)
                      ? Text(initial, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white))
                      : null,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile?.fullName ?? '',
                      style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: Colors.white),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      profile?.email ?? '',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(999)),
                child: Text(profile?.roleLabel ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
              if (profile?.createdAt != null)
                Text('Bergabung sejak ${dateId(profile!.createdAt!)}', style: TextStyle(color: Colors.white.withValues(alpha: 0.78), fontSize: 12.5)),
            ],
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Brand.muted, letterSpacing: 0.2)),
      );
}

/// Ikon bulat kecil dengan latar lembut — dipakai di depan setiap baris kartu Akun,
/// padanan `.stat-ico`/`.stat-ico` kecil di website admin.
class _SectionIcon extends StatelessWidget {
  const _SectionIcon({required this.icon, this.color = Brand.primaryDark, this.background = Brand.primarySoft});
  final IconData icon;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) => Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(11)),
        alignment: Alignment.center,
        child: Icon(icon, color: color, size: 19),
      );
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

/// Dialog ganti password akun sendiri — memakai supabase.auth.updateUser, jadi perlu
/// sesi yang masih aktif (butuh koneksi internet; tidak tersedia dalam mode offline).
class _ChangePasswordDialog extends StatefulWidget {
  const _ChangePasswordDialog();

  @override
  State<_ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<_ChangePasswordDialog> {
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  bool _hideNew = true;
  bool _hideConfirm = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (_new.text.length < 8) {
      setState(() => _error = 'Password minimal 8 karakter.');
      return;
    }
    if (_new.text != _confirm.text) {
      setState(() => _error = 'Konfirmasi password tidak sama.');
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<SessionController>().changePassword(_new.text);
      if (!mounted) return;
      Navigator.pop(context);
      showSnack(context, 'Password berhasil diganti.');
    } catch (e) {
      setState(() {
        _busy = false;
        _error = friendlyError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Ganti password'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_error != null) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(color: Brand.dangerSoft, borderRadius: BorderRadius.circular(12)),
              child: Text(_error!, style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w600)),
            ),
          ],
          TextField(
            controller: _new,
            obscureText: _hideNew,
            autofocus: true,
            decoration: InputDecoration(
              labelText: 'Password baru',
              suffixIcon: IconButton(
                icon: Icon(_hideNew ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _hideNew = !_hideNew),
              ),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _confirm,
            obscureText: _hideConfirm,
            onSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: 'Konfirmasi password baru',
              suffixIcon: IconButton(
                icon: Icon(_hideConfirm ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _hideConfirm = !_hideConfirm),
              ),
            ),
          ),
          const SizedBox(height: 6),
          const Text('Minimal 8 karakter.', style: TextStyle(color: Brand.muted, fontSize: 12.5)),
        ],
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: _busy ? null : _submit,
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
              : const Text('Simpan'),
        ),
      ],
    );
  }
}
