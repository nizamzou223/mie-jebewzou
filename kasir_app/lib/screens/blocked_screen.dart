import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../theme.dart';

/// Ditampilkan bila akun tidak dapat dipakai (nonaktif, profil tidak ada) atau server tidak terjangkau saat pertama login.
class BlockedScreen extends StatelessWidget {
  const BlockedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Icon(Icons.lock_outline_rounded, size: 56, color: Brand.muted),
                const SizedBox(height: 16),
                const Text('Tidak dapat melanjutkan', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                Text(session.blockReason ?? '', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                const SizedBox(height: 26),
                FilledButton(onPressed: session.reload, child: const Text('Coba lagi')),
                const SizedBox(height: 10),
                OutlinedButton(onPressed: session.signOut, child: const Text('Keluar')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
