import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config.dart';
import 'services/offline_queue.dart';
import 'state/cart.dart';
import 'state/catalog.dart';
import 'state/session.dart';
import 'state/shift.dart';
import 'state/sync.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID');

  if (!AppConfig.isConfigured) {
    runApp(const ConfigMissingApp());
    return;
  }

  await Supabase.initialize(url: AppConfig.supabaseUrl, publishableKey: AppConfig.supabaseAnonKey);
  final prefs = await SharedPreferences.getInstance();

  final session = SessionController(prefs);
  final shift = ShiftController(session, prefs);
  final catalog = CatalogController(prefs)..restorePopular();
  final sync = SyncController(OfflineQueueStore());
  final cart = CartController();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: session),
        ChangeNotifierProvider.value(value: shift),
        ChangeNotifierProvider.value(value: catalog),
        ChangeNotifierProvider.value(value: sync),
        ChangeNotifierProvider.value(value: cart),
      ],
      child: const KasirApp(),
    ),
  );

  // Dimulai setelah UI tampil agar splash tidak tertahan oleh jaringan.
  session.init();
  sync.init();
}

class ConfigMissingApp extends StatelessWidget {
  const ConfigMissingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: buildTheme(),
      home: const Scaffold(
        body: SafeArea(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Center(
              child: Text(
                'Konfigurasi belum lengkap.\n\nJalankan dengan:\nflutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...\n\nLihat README.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
