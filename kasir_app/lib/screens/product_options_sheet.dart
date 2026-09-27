import 'package:flutter/material.dart';

import '../models/models.dart';
import '../state/cart.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';

/// Bottom sheet pilihan produk: variasi, tingkat pedas, topping, tambahan, catatan, jumlah.
/// Opsi wajib harus dipilih sebelum tombol "Tambah" aktif. Mengembalikan CartLine atau null.
Future<CartLine?> showProductOptions(BuildContext context, {required Product product, CartLine? editing}) {
  return showModalBottomSheet<CartLine>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (_) => _OptionsSheet(product: product, editing: editing),
  );
}

class _OptionsSheet extends StatefulWidget {
  const _OptionsSheet({required this.product, this.editing});
  final Product product;
  final CartLine? editing;

  @override
  State<_OptionsSheet> createState() => _OptionsSheetState();
}

class _OptionsSheetState extends State<_OptionsSheet> {
  Variant? _variant;
  final Map<String, Set<String>> _selected = {}; // groupId -> modifierIds
  int _qty = 1;
  late final TextEditingController _note;

  Product get p => widget.product;

  @override
  void initState() {
    super.initState();
    final e = widget.editing;
    _note = TextEditingController(text: e?.note ?? '');
    if (e != null) {
      _variant = e.variant;
      _qty = e.quantity;
      for (final g in p.groups) {
        _selected[g.id] = e.modifiers.where((m) => g.modifiers.any((x) => x.id == m.modifier.id)).map((m) => m.modifier.id).toSet();
      }
    }
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  List<SelectedModifier> _mods() => [
        for (final g in p.groups)
          for (final m in g.modifiers)
            if (_selected[g.id]?.contains(m.id) ?? false) SelectedModifier(groupName: g.name, modifier: m),
      ];

  List<String> get _missing => [
        if (p.variants.isNotEmpty && _variant == null) 'Variasi',
        for (final g in p.groups)
          if ((_selected[g.id]?.length ?? 0) < g.requiredCount) g.name,
      ];

  int get _unit => p.price + (_variant?.priceDelta ?? 0) + _mods().fold(0, (s, m) => s + m.modifier.priceDelta);

  void _toggle(ModifierGroup g, Modifier m) {
    final set = _selected.putIfAbsent(g.id, () => <String>{});
    setState(() {
      if (g.singleChoice) {
        set
          ..clear()
          ..add(m.id);
      } else if (set.contains(m.id)) {
        set.remove(m.id);
      } else if (g.maxSelect == null || set.length < g.maxSelect!) {
        set.add(m.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final missing = _missing;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Flexible(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            children: [
              Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              if ((p.description ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(p.description!, style: const TextStyle(color: Brand.muted))),
              const SizedBox(height: 16),
              if (p.variants.isNotEmpty)
                _Section(
                  title: 'Variasi',
                  required: true,
                  hint: 'Pilih 1',
                  children: [
                    for (final v in p.variants)
                      _OptionTile(
                        label: v.name,
                        price: v.priceDelta,
                        selected: _variant?.id == v.id,
                        radio: true,
                        onTap: () => setState(() => _variant = v),
                      ),
                  ],
                ),
              for (final g in p.groups)
                _Section(
                  title: g.name,
                  required: g.requiredCount > 0,
                  hint: g.singleChoice ? 'Pilih 1' : (g.maxSelect == null ? 'Boleh lebih dari satu' : 'Maksimal ${g.maxSelect}'),
                  children: [
                    for (final m in g.modifiers)
                      _OptionTile(
                        label: m.name,
                        price: m.priceDelta,
                        selected: _selected[g.id]?.contains(m.id) ?? false,
                        radio: g.singleChoice,
                        onTap: () => _toggle(g, m),
                      ),
                  ],
                ),
              const SizedBox(height: 4),
              TextField(
                controller: _note,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'Catatan pesanan (opsional)', hintText: 'mis. tidak pedas, saus dipisah'),
              ),
            ],
          ),
        ),
        Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: Brand.line))),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: SafeArea(
            top: false,
            child: Row(children: [
              _Stepper(value: _qty, onChanged: (v) => setState(() => _qty = v.clamp(1, 99))),
              const SizedBox(width: 14),
              Expanded(
                child: FilledButton(
                  onPressed: missing.isNotEmpty
                      ? null
                      : () => Navigator.of(context).pop(CartLine(
                            product: p,
                            variant: _variant,
                            modifiers: _mods(),
                            quantity: _qty,
                            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
                          )),
                  child: Text(missing.isEmpty ? '${widget.editing == null ? 'Tambah' : 'Simpan'} · ${rupiah(_unit * _qty)}' : 'Pilih: ${missing.join(', ')}', overflow: TextOverflow.ellipsis),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.required, required this.hint, required this.children});
  final String title;
  final bool required;
  final String hint;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(width: 8),
            required
                ? const StatusPill('WAJIB', color: Brand.danger, background: Brand.dangerSoft)
                : const StatusPill('Opsional'),
            const Spacer(),
            Text(hint, style: const TextStyle(color: Brand.muted, fontSize: 12)),
          ]),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: children),
        ]),
      );
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.label, required this.price, required this.selected, required this.radio, required this.onTap});
  final String label;
  final int price;
  final bool selected;
  final bool radio;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: selected ? Brand.primarySoft : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: selected ? Brand.primary : const Color(0xFFD7D9DF), width: selected ? 2 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(
                radio ? (selected ? Icons.radio_button_checked : Icons.radio_button_unchecked) : (selected ? Icons.check_box : Icons.check_box_outline_blank),
                color: selected ? Brand.primary : Brand.muted,
                size: 22,
              ),
              const SizedBox(width: 8),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              if (price > 0) ...[
                const SizedBox(width: 8),
                Text('+${rupiah(price)}', style: const TextStyle(color: Brand.muted, fontSize: 13)),
              ],
            ]),
          ),
        ),
      );
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton.outlined(
          onPressed: value > 1 ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove),
          iconSize: 26,
          tooltip: 'Kurangi',
          style: IconButton.styleFrom(minimumSize: const Size(52, 52)),
        ),
        SizedBox(width: 40, child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
        IconButton.outlined(
          onPressed: () => onChanged(value + 1),
          icon: const Icon(Icons.add),
          iconSize: 26,
          tooltip: 'Tambah',
          style: IconButton.styleFrom(minimumSize: const Size(52, 52)),
        ),
      ]);
}
