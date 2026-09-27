import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mie_jebew_kasir/models/models.dart';
import 'package:mie_jebew_kasir/screens/product_options_sheet.dart';
import 'package:mie_jebew_kasir/state/cart.dart';
import 'package:mie_jebew_kasir/theme.dart';

Product spicyNoodle() => Product(
      id: 'p1',
      sku: 'MIE-001',
      name: 'Mie Jebew',
      categoryId: null,
      categoryName: null,
      description: null,
      price: 15000,
      imageUrl: null,
      isAvailable: true,
      variants: const [],
      groups: [
        ModifierGroup(
          id: 'g1',
          name: 'Tingkat Pedas',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          modifiers: [Modifier(id: 'm1', name: 'Level 1', priceDelta: 0), Modifier(id: 'm2', name: 'Level 5', priceDelta: 1000)],
        ),
        ModifierGroup(
          id: 'g2',
          name: 'Topping',
          isRequired: false,
          minSelect: 0,
          maxSelect: 2,
          modifiers: [
            Modifier(id: 't1', name: 'Telur', priceDelta: 4000),
            Modifier(id: 't2', name: 'Bakso', priceDelta: 5000),
            Modifier(id: 't3', name: 'Keju', priceDelta: 4000),
          ],
        ),
      ],
    );

void main() {
  testWidgets('opsi wajib harus dipilih sebelum tombol tambah aktif; harga mengikuti pilihan', (tester) async {
    CartLine? result;
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async => result = await showProductOptions(context, product: spicyNoodle()),
              child: const Text('buka'),
            ),
          ),
        ),
      ),
    ));

    await tester.tap(find.text('buka'));
    await tester.pumpAndSettle();

    // Belum memilih tingkat pedas: tombol nonaktif dan menyebut grup yang kurang
    FilledButton button() => tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button().onPressed, isNull);
    expect(find.textContaining('Pilih: Tingkat Pedas'), findsOneWidget);

    await tester.tap(find.text('Level 5'));
    await tester.pumpAndSettle();
    expect(button().onPressed, isNotNull);
    expect(find.textContaining('Rp 16.000'), findsWidgets); // 15.000 + 1.000

    // Topping maksimal 2: pilihan ketiga diabaikan
    await tester.tap(find.text('Telur'));
    await tester.tap(find.text('Bakso'));
    await tester.tap(find.text('Keju'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Rp 25.000'), findsWidgets); // 15.000 + 1.000 + 4.000 + 5.000

    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(result, isNotNull);
    expect(result!.modifiers.map((m) => m.modifier.name).toSet(), {'Level 5', 'Telur', 'Bakso'});
    expect(result!.unitPrice, 25000);
    expect(result!.quantity, 1);
  });

  testWidgets('tingkat pedas pilihan tunggal: memilih yang lain menggantikan', (tester) async {
    CartLine? result;
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async => result = await showProductOptions(context, product: spicyNoodle()),
              child: const Text('buka'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('buka'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Level 1'));
    await tester.tap(find.text('Level 5'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
    expect(result!.modifiers.map((m) => m.modifier.name), ['Level 5']);
  });
}
