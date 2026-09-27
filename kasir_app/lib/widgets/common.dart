import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../services/offline_queue.dart';
import '../state/sync.dart';
import '../theme.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label = 'Memuat…'});
  final String label;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 14),
          Text(label, style: const TextStyle(color: Brand.muted)),
        ]),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_rounded, size: 52, color: Brand.muted),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              SizedBox(width: 200, child: OutlinedButton(onPressed: onRetry, child: const Text('Coba lagi'))),
            ],
          ]),
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, this.hint});
  final IconData icon;
  final String title;
  final String? hint;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 52, color: Brand.line),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700), textAlign: TextAlign.center),
            if (hint != null) ...[
              const SizedBox(height: 6),
              Text(hint!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted)),
            ],
          ]),
        ),
      );
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.text, {super.key, this.color = Brand.muted, this.background = const Color(0xFFEFF0F2)});
  final String text;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
        child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
      );
}

/// Spanduk status koneksi & sinkronisasi di atas layar utama.
class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<SyncController>();
    final pending = sync.pendingCount;
    final failed = sync.failedCount;
    if (sync.online && pending == 0 && failed == 0) return const SizedBox.shrink();

    Color bg = Brand.warningSoft;
    Color fg = Brand.warning;
    IconData icon = Icons.wifi_off_rounded;
    String text;
    Widget? action;

    if (failed > 0) {
      bg = Brand.dangerSoft;
      fg = Brand.danger;
      icon = Icons.error_outline_rounded;
      text = '$failed transaksi gagal disinkronkan. Buka Riwayat untuk memeriksa.';
    } else if (!sync.online) {
      text = pending > 0
          ? 'Mode offline — $pending transaksi tersimpan di perangkat, belum masuk server.'
          : 'Mode offline — transaksi akan disimpan di perangkat dan dikirim otomatis saat online.';
    } else {
      icon = Icons.sync_rounded;
      text = sync.syncing ? 'Menyinkronkan $pending transaksi…' : '$pending transaksi menunggu sinkronisasi.';
      action = TextButton(onPressed: sync.syncing ? null : () => sync.syncNow(), child: const Text('Sinkronkan'));
    }

    return Material(
      color: bg,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(children: [
            Icon(icon, color: fg, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 13))),
            ?action,
          ]),
        ),
      ),
    );
  }
}

Widget syncStatusPill(PendingOrder o) => o.status == PendingStatus.failed
    ? const StatusPill('Gagal sinkron', color: Brand.danger, background: Brand.dangerSoft)
    : const StatusPill('Belum sinkron', color: Brand.warning, background: Brand.warningSoft);

/// Field angka bulat (rupiah) dengan keyboard numerik.
class AmountField extends StatelessWidget {
  const AmountField({super.key, required this.controller, this.label, this.onChanged, this.autofocus = false, this.hint});
  final TextEditingController controller;
  final String? label;
  final String? hint;
  final ValueChanged<int>? onChanged;
  final bool autofocus;

  static int parse(String s) => int.tryParse(s.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        autofocus: autofocus,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(11)],
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
        decoration: InputDecoration(labelText: label, hintText: hint, prefixText: 'Rp '),
        onChanged: (v) => onChanged?.call(parse(v)),
      );
}

/// Menggoyangkan child secara horizontal (mis. saat login gagal). Naikkan [trigger]
/// (mis. sebuah counter) untuk memicu goyangan baru — mengikuti animasi `.shake` di website admin.
class ShakeX extends StatefulWidget {
  const ShakeX({super.key, required this.trigger, required this.child});
  final int trigger;
  final Widget child;

  @override
  State<ShakeX> createState() => _ShakeXState();
}

class _ShakeXState extends State<ShakeX> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
  late final Animation<double> _offset = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 0.0, end: -10.0), weight: 1),
    TweenSequenceItem(tween: Tween(begin: -10.0, end: 10.0), weight: 2),
    TweenSequenceItem(tween: Tween(begin: 10.0, end: -7.0), weight: 2),
    TweenSequenceItem(tween: Tween(begin: -7.0, end: 5.0), weight: 2),
    TweenSequenceItem(tween: Tween(begin: 5.0, end: 0.0), weight: 2),
  ]).animate(_c);

  @override
  void didUpdateWidget(covariant ShakeX old) {
    super.didUpdateWidget(old);
    if (widget.trigger != old.trigger) _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _offset,
        builder: (_, child) => Transform.translate(offset: Offset(_offset.value, 0), child: child),
        child: widget.child,
      );
}

/// Tombol utama bergradasi merah-oranye — padanan `.btn-primary` di website admin.
/// Membungkus [FilledButton] sungguhan (bukan meniru tampilannya) agar tetap dapat
/// ditemukan lewat `find.byType(FilledButton)` di pengujian widget yang sudah ada.
class GradientButton extends StatelessWidget {
  const GradientButton({super.key, required this.onPressed, required this.child, this.loading = false});
  final VoidCallback? onPressed;
  final Widget child;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    // Gradien selalu tampil; saat nonaktif cukup diredupkan (bukan diganti abu-abu),
    // agar transisi aktif/nonaktif tidak pernah "melompat" karena tipe dekorasi berubah.
    final enabled = onPressed != null && !loading;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: enabled ? 1 : 0.5,
      child: Container(
        decoration: BoxDecoration(
          gradient: Brand.gradient,
          borderRadius: BorderRadius.circular(14),
          boxShadow: enabled ? [BoxShadow(color: Brand.primaryDark.withValues(alpha: 0.32), blurRadius: 16, offset: const Offset(0, 8))] : null,
        ),
        child: FilledButton(
          onPressed: loading ? null : onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: Colors.transparent,
            disabledBackgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            elevation: 0,
          ),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            transitionBuilder: (c, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: a, child: c)),
            child: loading
                ? const SizedBox(key: ValueKey('loading'), width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.6, color: Colors.white))
                : KeyedSubtree(key: const ValueKey('label'), child: child),
          ),
        ),
      ),
    );
  }
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(message),
    behavior: SnackBarBehavior.floating,
    backgroundColor: error ? Brand.danger : Brand.ink,
    duration: Duration(seconds: error ? 5 : 2),
  ));
}
