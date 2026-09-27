import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Latar belakang bola-bola cahaya lembut yang melayang pelan — dipasang di belakang
/// konten (mis. halaman login) agar layar tidak terasa kosong/datar, tanpa mengganggu
/// keterbacaan karena warnanya tipis dan geraknya lambat.
class FloatingBlobsBackground extends StatefulWidget {
  const FloatingBlobsBackground({super.key});

  @override
  State<FloatingBlobsBackground> createState() => _FloatingBlobsBackgroundState();
}

class _FloatingBlobsBackgroundState extends State<FloatingBlobsBackground> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 14))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: ClipRect(
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            final t = _c.value * 2 * math.pi;
            double dx(double phase, double amp) => amp * math.sin(t + phase);
            double dy(double phase, double amp) => amp * math.cos(t + phase);
            return Stack(children: [
              // Diposisikan tepat di bawah panel gradien (bukan di baliknya) agar tidak tersembunyi/percuma.
              Positioned(
                top: 210 + dy(0, 16),
                right: -100 + dx(0.6, 14),
                child: _blob(300, Brand.accent.withValues(alpha: 0.35)),
              ),
              Positioned(
                top: 460 + dy(1.4, 18),
                left: -120 + dx(2.1, 16),
                child: _blob(260, Brand.primary.withValues(alpha: 0.20)),
              ),
              Positioned(
                bottom: -130 + dy(2.6, 20),
                right: -80 + dx(3.4, 18),
                child: _blob(320, Brand.primary.withValues(alpha: 0.24)),
              ),
              Positioned(
                bottom: 70 + dy(4.2, 14),
                left: -70 + dx(1.0, 12),
                child: _blob(200, Brand.accent.withValues(alpha: 0.28)),
              ),
            ]);
          },
        ),
      ),
    );
  }

  Widget _blob(double size, Color color) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
        ),
      );
}
