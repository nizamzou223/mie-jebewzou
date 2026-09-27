import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/catalog.dart';
import '../state/session.dart';
import '../state/shift.dart';
import '../widgets/common.dart';
import 'account_page.dart';
import 'cashier_page.dart';
import 'history_page.dart';
import 'shift_page.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final outlet = context.read<SessionController>().activeOutlet;
      context.read<ShiftController>().load();
      if (outlet != null) context.read<CatalogController>().load(outlet, force: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final pages = const [CashierPage(), HistoryPage(), ShiftPage(), AccountPage()];
    return Scaffold(
      body: Column(children: [
        const ConnectionBanner(),
        Expanded(child: IndexedStack(index: _index, children: pages)),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.point_of_sale_outlined), selectedIcon: Icon(Icons.point_of_sale), label: 'Kasir'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Riwayat'),
          NavigationDestination(icon: Icon(Icons.schedule_outlined), selectedIcon: Icon(Icons.schedule), label: 'Shift'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Akun'),
        ],
      ),
    );
  }
}
