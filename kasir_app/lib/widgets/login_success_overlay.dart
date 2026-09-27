import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Animasi "berhasil masuk" bergaya kartu pembayaran modern: lingkaran memantul,
/// tanda centang tergambar sendiri, lalu sapaan muncul — semua di layar penuh.
///
/// Ditampilkan lewat [OverlayState] yang ditangkap SEBELUM proses login dimulai
/// (bukan lewat [BuildContext] layar login), sehingga animasinya tetap tuntas
/// diputar walau layar login sudah keburu diganti oleh sistem begitu sesi siap.
class LoginSuccessOverlay {
  const LoginSuccessOverlay._();

  static void show(OverlayState overlay, {required String name}) {
    late OverlayEntry entry;
    entry = OverlayEntry(builder: (_) => _SuccessSplash(name: name, onFinished: () => entry.remove()));
    overlay.insert(entry);
  }
}

class _SuccessSplash extends StatefulWidget {
  const _SuccessSplash({required this.name, required this.onFinished});
  final String name;
  final VoidCallback onFinished;

  @override
  State<_SuccessSplash> createState() => _SuccessSplashState();
}

class _SuccessSplashState extends State<_SuccessSplash> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1450));
  late final Animation<double> _bgFade = CurvedAnimation(parent: _c, curve: const Interval(0.0, 0.18, curve: Curves.easeOut));
  late final Animation<double> _ring = CurvedAnimation(parent: _c, curve: const Interval(0.06, 0.5, curve: Curves.elasticOut));
  late final Animation<double> _check = CurvedAnimation(parent: _c, curve: const Interval(0.4, 0.68, curve: Curves.easeOutCubic));
  late final Animation<double> _text = CurvedAnimation(parent: _c, curve: const Interval(0.55, 0.8, curve: Curves.easeOut));
  late final Animation<double> _exit = CurvedAnimation(parent: _c, curve: const Interval(0.86, 1.0, curve: Curves.easeIn));

  @override
  void initState() {
    super.initState();
    _c.forward();
    _c.addStatusListener((s) {
      if (s == AnimationStatus.completed) widget.onFinished();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Opacity(
          opacity: 1 - _exit.value,
          child: Stack(fit: StackFit.expand, children: [
            Opacity(opacity: _bgFade.value, child: const DecoratedBox(decoration: BoxDecoration(gradient: Brand.gradient))),
            Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Transform.scale(
                  scale: _ring.value,
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.16),
                      border: Border.all(color: Colors.white, width: 2.4),
                    ),
                    alignment: Alignment.center,
                    child: CustomPaint(size: const Size(48, 48), painter: _CheckPainter(progress: _check.value)),
                  ),
                ),
                const SizedBox(height: 24),
                Opacity(
                  opacity: _text.value,
                  child: Transform.translate(
                    offset: Offset(0, (1 - _text.value) * 10),
                    child: Column(children: [
                      Text(
                        widget.name.isEmpty ? 'Berhasil masuk!' : 'Selamat datang, ${widget.name}!',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 6),
                      const Text('Menyiapkan kasir Anda…', style: TextStyle(color: Colors.white70, fontSize: 14)),
                    ]),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Menggambar tanda centang secara progresif (0 = belum ada, 1 = penuh) memakai dua ruas garis.
class _CheckPainter extends CustomPainter {
  const _CheckPainter({required this.progress});
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final p1 = Offset(size.width * 0.06, size.height * 0.55);
    final p2 = Offset(size.width * 0.4, size.height * 0.86);
    final p3 = Offset(size.width * 0.98, size.height * 0.14);
    final leg1 = (p2 - p1).distance;
    final leg2 = (p3 - p2).distance;
    final drawn = (leg1 + leg2) * progress.clamp(0.0, 1.0);

    final path = Path()..moveTo(p1.dx, p1.dy);
    if (drawn <= leg1) {
      final t = leg1 == 0 ? 0.0 : drawn / leg1;
      path.lineTo(lerpDouble(p1.dx, p2.dx, t)!, lerpDouble(p1.dy, p2.dy, t)!);
    } else {
      path.lineTo(p2.dx, p2.dy);
      final t = leg2 == 0 ? 0.0 : ((drawn - leg1) / leg2).clamp(0.0, 1.0);
      path.lineTo(lerpDouble(p2.dx, p3.dx, t)!, lerpDouble(p2.dy, p3.dy, t)!);
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _CheckPainter oldDelegate) => oldDelegate.progress != progress;
}
