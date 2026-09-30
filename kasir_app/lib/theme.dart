import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;

/// Warna identik dengan website admin: merah-oranye sebagai aksen, abu netral bersih.
class Brand {
  static const primary = Color(0xFFE0503C);
  static const primaryDark = Color(0xFFC23A29);
  static const primarySoft = Color(0xFFFDECE7);
  static const accent = Color(0xFFF2884A);
  static const ink = Color(0xFF202329);
  static const muted = Color(0xFF6B7280);
  static const bg = Color(0xFFF7F7F8);
  static const line = Color(0xFFE7E8EC);
  static const success = Color(0xFF21895E);
  static const successSoft = Color(0xFFE6F5EE);
  static const warning = Color(0xFFB1660A);
  static const warningSoft = Color(0xFFFDF1E0);
  static const danger = Color(0xFFC23A29);
  static const dangerSoft = Color(0xFFFDECE7);

  /// Gradasi merah-oranye — identik dengan --brand-grad di website admin.
  static const gradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accent, primary],
  );
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.primary,
    primary: Brand.primary,
    onPrimary: Colors.white,
    secondary: Brand.accent,
    surface: Colors.white,
    error: Brand.danger,
  );
  const radius = BorderRadius.all(Radius.circular(14));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.bg,
    fontFamily: null,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: Brand.ink,
      elevation: 0,
      scrolledUnderElevation: 1,
      centerTitle: false,
      // Eksplisit (bukan mengandalkan deteksi otomatis): ikon status bar gelap di atas
      // app bar putih, supaya jam/baterai tidak "menghilang" (putih di atas putih) di sebagian
      // perangkat Android saat mode gelap sistem aktif.
      systemOverlayStyle: SystemUiOverlayStyle.dark,
    ),
    cardTheme: const CardThemeData(
      color: Colors.white,
      elevation: 1,
      shadowColor: Color(
        0x14000000,
      ), // bayangan lembut, senada dengan --shadow di website admin
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: Brand.line),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: Brand.ink,
        side: const BorderSide(color: Color(0xFFD7D9DF)),
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: const OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: Color(0xFFD7D9DF)),
      ),
      enabledBorder: const OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: Color(0xFFD7D9DF)),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: Brand.primary, width: 2),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: Brand.primarySoft,
      side: const BorderSide(color: Brand.line),
      labelStyle: const TextStyle(fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: Brand.primarySoft,
      height: 68,
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
      ),
    ),
  );
}
