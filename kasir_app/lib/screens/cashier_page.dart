import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/cart.dart';
import '../state/catalog.dart';
import '../state/session.dart';
import '../state/shift.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import 'cart_screen.dart';
import 'product_options_sheet.dart';
import 'shift_page.dart';

class CashierPage extends StatefulWidget {
  const CashierPage({super.key});

  @override
  State<CashierPage> createState() => _CashierPageState();
}

class _CashierPageState extends State<CashierPage> {
  static const _popularKey = '__popular__';
  final _search = TextEditingController();
  String? _category; // null = semua

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Product> _filtered(CatalogController c) {
    final q = _search.text.trim().toLowerCase();
    Iterable<Product> list = _category == _popularKey ? c.popular : c.products;
    if (_category != null && _category != _popularKey) list = list.where((p) => p.categoryId == _category);
    if (q.isNotEmpty) list = list.where((p) => p.name.toLowerCase().contains(q) || p.sku.toLowerCase().contains(q));
    return list.toList();
  }

  Future<void> _onTap(Product p) async {
    if (!p.isAvailable) {
      showSnack(context, '${p.name} sedang habis di cabang ini.', error: true);
      return;
    }
    HapticFeedback.selectionClick();
    final cart = context.read<CartController>();
    if (!p.needsOptions) {
      cart.add(CartLine(product: p));
      return;
    }
    final line = await showProductOptions(context, product: p);
    if (line != null) cart.add(line);
  }

  @override
  Widget build(BuildContext context) {
    final shift = context.watch<ShiftController>();
    final catalog = context.watch<CatalogController>();
    final cart = context.watch<CartController>();
    final session = context.watch<SessionController>();

    if (shift.loading && shift.current == null) return const LoadingView(label: 'Memeriksa shift…');
    if (shift.current == null) return _NoShift(error: shift.error);

    final products = _filtered(catalog);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(session.activeOutlet?.name ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text('Kasir: ${session.profile?.fullName ?? ''}', style: const TextStyle(fontSize: 12, color: Brand.muted)),
        ]),
        actions: [
          IconButton(
            tooltip: 'Muat ulang menu',
            onPressed: catalog.loading ? null : () => catalog.load(session.activeOutlet!, force: true),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Cari menu…',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => setState(() => _search.clear()),
                    ),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              _chip('Semua', null),
              if (catalog.popular.isNotEmpty) _chip('⭐ Populer', _popularKey),
              for (final c in catalog.categories) _chip(c.name, c.id),
            ],
          ),
        ),
        if (catalog.fromCache)
          Container(
            width: double.infinity,
            color: Brand.warningSoft,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: const Text('Menu dari penyimpanan perangkat — harga/ketersediaan mungkin belum terbaru.', style: TextStyle(color: Brand.warning, fontSize: 12)),
          ),
        Expanded(
          child: catalog.loading && catalog.products.isEmpty
              ? const LoadingView(label: 'Memuat menu…')
              : catalog.error != null && catalog.products.isEmpty
                  ? ErrorView(message: catalog.error!, onRetry: () => catalog.load(session.activeOutlet!, force: true))
                  : products.isEmpty
                      ? const EmptyView(icon: Icons.ramen_dining_outlined, title: 'Menu tidak ditemukan', hint: 'Coba kata kunci atau kategori lain.')
                      : GridView.builder(
                          padding: EdgeInsets.fromLTRB(16, 8, 16, cart.isEmpty ? 16 : 100),
                          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                            maxCrossAxisExtent: 210,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                            childAspectRatio: 0.82,
                          ),
                          itemCount: products.length,
                          itemBuilder: (_, i) {
                            final p = products[i];
                            final qty = cart.lines.where((l) => l.product.id == p.id).fold(0, (s, l) => s + l.quantity);
                            return _ProductTile(product: p, inCart: qty, onTap: () => _onTap(p));
                          },
                        ),
        ),
      ]),
      bottomSheet: cart.isEmpty
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: GradientButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CartScreen())),
                  child: Row(children: [
                    const Icon(Icons.shopping_basket_outlined),
                    const SizedBox(width: 10),
                    Text('${cart.itemCount} item'),
                    const Spacer(),
                    Text(rupiah(cart.subtotal)),
                    const SizedBox(width: 8),
                    const Icon(Icons.chevron_right_rounded),
                  ]),
                ),
              ),
            ),
    );
  }

  Widget _chip(String label, String? id) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: ChoiceChip(
          label: Text(label),
          selected: _category == id,
          onSelected: (_) => setState(() => _category = id),
        ),
      );
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.product, required this.inCart, required this.onTap});
  final Product product;
  final int inCart;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = product;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              flex: 5,
              child: SizedBox(
                width: double.infinity,
                child: p.imageUrl == null
                    ? _placeholder(p.name)
                    : Image.network(
                        p.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => _placeholder(p.name),
                        loadingBuilder: (c, child, prog) => prog == null ? child : _placeholder(p.name),
                      ),
              ),
            ),
            Expanded(
              flex: 4,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, height: 1.2)),
                  const Spacer(),
                  Text(
                    p.variants.isNotEmpty ? 'mulai ${rupiah(p.price)}' : rupiah(p.price),
                    style: const TextStyle(color: Brand.primaryDark, fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                ]),
              ),
            ),
          ]),
          if (!p.isAvailable)
            Positioned.fill(
              child: Container(
                color: Colors.white.withValues(alpha: 0.8),
                alignment: Alignment.center,
                child: const StatusPill('HABIS', color: Brand.danger, background: Brand.dangerSoft),
              ),
            ),
          if (inCart > 0)
            Positioned(
              top: 8,
              right: 8,
              child: CircleAvatar(radius: 14, backgroundColor: Brand.primary, child: Text('$inCart', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13))),
            ),
        ]),
      ),
    );
  }

  Widget _placeholder(String name) => Container(
        color: Brand.primarySoft,
        alignment: Alignment.center,
        child: Text(name.isEmpty ? '?' : name.characters.first.toUpperCase(), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: Brand.primary)),
      );
}

class _NoShift extends StatelessWidget {
  const _NoShift({this.error});
  final String? error;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return Scaffold(
      appBar: AppBar(title: Text(session.activeOutlet?.name ?? 'Kasir')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Icon(Icons.lock_clock_outlined, size: 60, color: Brand.muted),
              const SizedBox(height: 16),
              const Text('Shift belum dibuka', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text('Buka shift dan isi modal awal kas untuk mulai berjualan.', textAlign: TextAlign.center, style: TextStyle(color: Brand.muted)),
              if (error != null) ...[
                const SizedBox(height: 12),
                Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.danger)),
              ],
              const SizedBox(height: 24),
              GradientButton(onPressed: () => showOpenShiftDialog(context), child: const Text('Buka shift')),
              const SizedBox(height: 10),
              OutlinedButton(onPressed: () => context.read<ShiftController>().load(), child: const Text('Periksa ulang')),
            ]),
          ),
        ),
      ),
    );
  }
}
