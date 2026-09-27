import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mie_jebew_kasir/screens/login_screen.dart';
import 'package:mie_jebew_kasir/state/session.dart';
import 'package:mie_jebew_kasir/theme.dart';
import 'package:mie_jebew_kasir/widgets/common.dart';
import 'package:mie_jebew_kasir/widgets/login_success_overlay.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('GradientButton (tombol utama bertema gradasi merah-oranye)', () {
    testWidgets('tetap dapat ditemukan sebagai FilledButton dan dapat ditekan', (tester) async {
      var tapped = 0;
      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(),
        home: Scaffold(body: GradientButton(onPressed: () => tapped++, child: const Text('Simpan'))),
      ));
      expect(find.byType(FilledButton), findsOneWidget);
      expect(find.text('Simpan'), findsOneWidget);
      await tester.tap(find.byType(FilledButton));
      expect(tapped, 1);
    });

    testWidgets('saat loading menampilkan spinner, menyembunyikan label, dan menonaktifkan tombol', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(),
        home: Scaffold(body: GradientButton(onPressed: () {}, loading: true, child: const Text('Simpan'))),
      ));
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Simpan'), findsNothing);
      final btn = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(btn.onPressed, isNull);
    });

    testWidgets('onPressed null membuat tombol nonaktif (bukan hanya redup)', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(),
        home: Scaffold(body: GradientButton(onPressed: null, child: const Text('Simpan'))),
      ));
      final btn = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(btn.onPressed, isNull);
    });
  });

  testWidgets('ShakeX menggoyangkan child saat trigger berubah tanpa melempar galat', (tester) async {
    int trigger = 0;
    await tester.pumpWidget(MaterialApp(
      home: StatefulBuilder(builder: (context, setState) {
        return Scaffold(
          body: Column(children: [
            ShakeX(trigger: trigger, child: const Text('Kartu login')),
            ElevatedButton(onPressed: () => setState(() => trigger++), child: const Text('Goyang')),
          ]),
        );
      }),
    ));
    await tester.tap(find.text('Goyang'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));
    await tester.pump(const Duration(milliseconds: 300)); // animasi selesai (420ms)
    expect(find.text('Kartu login'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  group('LoginSuccessOverlay', () {
    testWidgets('menampilkan sapaan dan menghapus dirinya sendiri saat animasi selesai', (tester) async {
      final navKey = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(navigatorKey: navKey, theme: buildTheme(), home: const Scaffold(body: SizedBox())));
      final overlay = navKey.currentState!.overlay!;

      LoginSuccessOverlay.show(overlay, name: 'Nadya');
      await tester.pump();
      expect(find.text('Selamat datang, Nadya!'), findsOneWidget);

      // Tuntas diputar (durasi 1450ms) lalu menghapus diri sendiri.
      await tester.pump(const Duration(milliseconds: 1500));
      await tester.pumpAndSettle();
      expect(find.text('Selamat datang, Nadya!'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('tanpa nama menampilkan sapaan umum', (tester) async {
      final navKey = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(navigatorKey: navKey, theme: buildTheme(), home: const Scaffold(body: SizedBox())));
      LoginSuccessOverlay.show(navKey.currentState!.overlay!, name: '');
      await tester.pump();
      expect(find.text('Berhasil masuk!'), findsOneWidget);
      await tester.pumpAndSettle();
    });
  });

  group('LoginScreen', () {
    Widget harness(SessionController session) => MaterialApp(
          theme: buildTheme(),
          home: ChangeNotifierProvider.value(value: session, child: const LoginScreen()),
        );

    testWidgets('validasi kosong menampilkan pesan galat dan memicu animasi goyang', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final session = SessionController(await SharedPreferences.getInstance());
      await tester.pumpWidget(harness(session));

      await tester.tap(find.widgetWithText(FilledButton, 'Masuk'));
      await tester.pump();
      expect(find.text('Isi email dan password.'), findsOneWidget);

      // animasi goyang (420ms) berjalan mulus sampai selesai
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(milliseconds: 250));
      expect(tester.takeException(), isNull);
    });

    testWidgets('tombol tampil/sembunyikan password berfungsi pada tata letak baru', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final session = SessionController(await SharedPreferences.getInstance());
      await tester.pumpWidget(harness(session));

      final passwordField = find.byType(TextField).last;
      expect(tester.widget<TextField>(passwordField).obscureText, isTrue);
      await tester.tap(find.byTooltip('Tampilkan password'));
      await tester.pump();
      expect(tester.widget<TextField>(passwordField).obscureText, isFalse);
    });
  });
}
