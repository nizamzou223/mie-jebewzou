import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:provider/provider.dart';

import 'screens/blocked_screen.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'screens/outlet_picker_screen.dart';
import 'state/session.dart';
import 'theme.dart';

class KasirApp extends StatelessWidget {
  const KasirApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Jebewsizou Kasir',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const RootGate(),
      // Default global: ikon status bar gelap (aplikasi ini selalu bertema terang). Layar login
      // (tanpa AppBar, latar gradien merah-oranye) mengganti ini sendiri jadi ikon putih.
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.dark,
        child: child!,
      ),
    );
  }
}

/// Menentukan layar berdasarkan status sesi: login -> pilih cabang -> kasir.
/// Perpindahan antar layar (mis. login berhasil, atau keluar/logout) dianimasikan
/// dengan memudar + sedikit membesar, senada dengan transisi halaman di website admin.
class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    late final Widget child;
    late final String screenKey;
    switch (session.status) {
      case SessionStatus.booting:
      case SessionStatus.loading:
        child = const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );
        screenKey = 'loading';
      case SessionStatus.signedOut:
        child = const LoginScreen();
        screenKey = 'login';
      case SessionStatus.blocked:
        child = const BlockedScreen();
        screenKey = 'blocked';
      case SessionStatus.ready:
        final outlet = session.activeOutlet;
        if (outlet == null) {
          child = const OutletPickerScreen();
          screenKey = 'outlet-picker';
        } else {
          // key: ganti cabang = seluruh state layar utama dibuat ulang
          child = HomeShell(key: ValueKey(outlet.id));
          screenKey = 'home-${outlet.id}';
        }
    }
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 380),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (widget, animation) => FadeTransition(
        opacity: animation,
        child: ScaleTransition(
          scale: Tween(begin: 0.98, end: 1.0).animate(animation),
          child: widget,
        ),
      ),
      child: KeyedSubtree(key: ValueKey(screenKey), child: child),
    );
  }
}
