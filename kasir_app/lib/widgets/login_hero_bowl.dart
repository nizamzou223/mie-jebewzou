import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Ilustrasi mangkuk mie pedas (dekoratif) — padanan persis ilustrasi di panel
/// hero halaman login website admin, digambar langsung dengan [CustomPainter]
/// (bukan aset gambar) agar ringan dan tetap tajam di semua ukuran layar.
class NoodleBowl extends StatelessWidget {
  const NoodleBowl({super.key, this.width = 150});
  final double width;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: SizedBox(
        width: width,
        height: width * 330 / 400,
        child: CustomPaint(painter: _NoodleBowlPainter()),
      ),
    );
  }
}

class _NoodleBowlPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 400;
    canvas.save();
    canvas.scale(s);

    _paintSteam(canvas);
    _paintChopsticks(canvas);
    _paintBody(canvas);
    _paintRimAndBroth(canvas);
    _paintNoodles(canvas);
    _paintToppings(canvas);

    canvas.restore();
  }

  void _paintSteam(Canvas canvas) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;
    final p = Path()
      ..moveTo(150, 105)
      ..cubicTo(136, 85, 162, 75, 152, 49)
      ..moveTo(200, 100)
      ..cubicTo(186, 78, 212, 66, 202, 38)
      ..moveTo(250, 105)
      ..cubicTo(236, 85, 262, 75, 252, 49);
    canvas.drawPath(p, paint);
  }

  void _paintChopsticks(Canvas canvas) {
    final paint = Paint()
      ..color = const Color(0xFFD4954F)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(const Offset(318, 26), const Offset(232, 150), paint);
    canvas.drawLine(const Offset(340, 44), const Offset(258, 160), paint);
  }

  void _paintBody(Canvas canvas) {
    final body = Path()
      ..moveTo(34, 168)
      ..lineTo(366, 168)
      ..cubicTo(366, 252, 302, 302, 200, 302)
      ..cubicTo(98, 302, 34, 252, 34, 168)
      ..close();
    final bodyPaint = Paint()
      ..shader = ui.Gradient.linear(const Offset(200, 168), const Offset(200, 302), [
        const Color(0xFFFFF8EE),
        const Color(0xFFF0D6B4),
      ]);
    canvas.drawPath(body, bodyPaint);

    final band = Path()
      ..moveTo(40, 204)
      ..cubicTo(80, 218, 320, 218, 360, 204)
      ..lineTo(354, 226)
      ..cubicTo(308, 242, 92, 242, 46, 226)
      ..close();
    canvas.drawPath(band, Paint()..color = const Color(0xFFC23A29));

    final base = Path()
      ..moveTo(150, 300)
      ..lineTo(250, 300)
      ..lineTo(258, 314)
      ..lineTo(142, 314)
      ..close();
    canvas.drawPath(base, Paint()..color = const Color(0xFFE9C99F));
  }

  void _paintRimAndBroth(Canvas canvas) {
    canvas.drawOval(
      Rect.fromCenter(center: const Offset(200, 168), width: 332, height: 56),
      Paint()..color = const Color(0xFFF8E7CF),
    );
    final brothRect = Rect.fromCenter(center: const Offset(200, 170), width: 300, height: 42);
    canvas.drawOval(
      brothRect,
      Paint()
        ..shader = ui.Gradient.linear(brothRect.topLeft, brothRect.bottomRight, [
          const Color(0xFFF0682A),
          const Color(0xFFC2331A),
        ]),
    );
  }

  void _paintNoodles(Canvas canvas) {
    final paint = Paint()
      ..color = const Color(0xFFF7D066)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 11
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(
      Path()
        ..moveTo(68, 166)
        ..cubicTo(102, 108, 142, 188, 180, 136)
        ..cubicTo(218, 84, 258, 106, 330, 162),
      paint,
    );
    canvas.drawPath(
      Path()
        ..moveTo(84, 170)
        ..cubicTo(124, 124, 154, 184, 194, 144)
        ..cubicTo(234, 104, 264, 120, 310, 164),
      paint,
    );
    canvas.drawPath(
      Path()
        ..moveTo(110, 172)
        ..cubicTo(144, 142, 172, 178, 206, 158)
        ..cubicTo(240, 138, 258, 146, 290, 170),
      paint,
    );
  }

  void _paintToppings(Canvas canvas) {
    // telur ceplok
    canvas.drawOval(
      Rect.fromCenter(center: const Offset(146, 150), width: 68, height: 48),
      Paint()..color = Colors.white,
    );
    canvas.drawCircle(const Offset(146, 150), 12, Paint()..color = const Color(0xFFF5A623));
    // bakso
    canvas.drawCircle(const Offset(262, 148), 22, Paint()..color = const Color(0xFF8B4A2B));
    canvas.drawCircle(const Offset(255, 141), 6, Paint()..color = const Color(0xFFB06A44).withValues(alpha: 0.6));
    // cabai
    final chili = Paint()..color = const Color(0xFFE3301A);
    canvas.drawCircle(const Offset(204, 132), 7, chili);
    canvas.drawCircle(const Offset(222, 160), 6, chili);
    canvas.drawCircle(const Offset(106, 168), 6, chili);
    // daun bawang
    final scallion = Paint()..color = const Color(0xFF5FBF5F);
    _rotatedOval(canvas, const Offset(190, 150), 16, 8, -25, scallion);
    _rotatedOval(canvas, const Offset(300, 160), 16, 8, 20, scallion);
    _rotatedOval(canvas, const Offset(180, 176), 14, 7, 10, scallion);
  }

  void _rotatedOval(Canvas canvas, Offset center, double w, double h, double degrees, Paint paint) {
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(degrees * 3.14159265 / 180);
    canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: w, height: h), paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _NoodleBowlPainter oldDelegate) => false;
}

/// Tekstur titik-titik lembut yang memudar dari satu titik fokus — padanan
/// tekstur di panel hero halaman login website admin, memberi kesan "berisi"
/// pada bidang gradien polos tanpa mengganggu keterbacaan teks di atasnya.
class DottedTexture extends StatelessWidget {
  const DottedTexture({super.key, this.focal = const Alignment(-0.4, 0.2)});
  final Alignment focal;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: CustomPaint(painter: _DottedTexturePainter(focal), size: Size.infinite),
    );
  }
}

class _DottedTexturePainter extends CustomPainter {
  _DottedTexturePainter(this.focal);
  final Alignment focal;

  @override
  void paint(Canvas canvas, Size size) {
    const spacing = 15.0;
    const radius = 1.3;
    final focalPoint = focal.alongSize(size);
    final maxDist = size.longestSide * 0.62;
    final paint = Paint()..style = PaintingStyle.fill;
    for (double y = 0; y < size.height; y += spacing) {
      for (double x = 0; x < size.width; x += spacing) {
        final d = (Offset(x, y) - focalPoint).distance;
        final fade = (1 - d / maxDist).clamp(0.0, 1.0);
        if (fade <= 0) continue;
        paint.color = Colors.white.withValues(alpha: 0.16 * fade);
        canvas.drawCircle(Offset(x, y), radius, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DottedTexturePainter oldDelegate) => oldDelegate.focal != focal;
}
