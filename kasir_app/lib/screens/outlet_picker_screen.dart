import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Pengguna dengan lebih dari satu cabang memilih cabang aktif — hanya dari daftar yang ditugaskan.
class OutletPickerScreen extends StatelessWidget {
  const OutletPickerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pilih cabang'),
        actions: [TextButton(onPressed: session.signOut, child: const Text('Keluar'))],
      ),
      body: session.outlets.isEmpty
          ? const EmptyView(
              icon: Icons.storefront_outlined,
              title: 'Belum ada cabang yang ditugaskan',
              hint: 'Hubungi owner atau admin untuk mendapatkan akses ke sebuah cabang.',
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Halo, ${session.profile?.fullName ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                const Text('Anda bertugas di beberapa cabang. Pilih cabang untuk sesi ini.', style: TextStyle(color: Brand.muted)),
                const SizedBox(height: 18),
                for (final o in session.outlets)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Card(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => session.selectOutlet(o),
                        child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: Row(children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(color: Brand.primarySoft, borderRadius: BorderRadius.circular(14)),
                              alignment: Alignment.center,
                              child: Text(o.code, style: const TextStyle(color: Brand.primaryDark, fontWeight: FontWeight.w800)),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(o.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                                if ((o.address ?? '').isNotEmpty) Text(o.address!, style: const TextStyle(color: Brand.muted)),
                              ]),
                            ),
                            const Icon(Icons.chevron_right_rounded),
                          ]),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
