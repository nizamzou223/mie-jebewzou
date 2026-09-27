import 'dart:async';
import 'dart:io';

import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final NumberFormat _rp = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

String rupiah(num v) => _rp.format(v);

String dateTimeId(DateTime d) => DateFormat('d MMM y, HH:mm', 'id_ID').format(d.toLocal());

String timeId(DateTime d) => DateFormat('HH:mm', 'id_ID').format(d.toLocal());

const paymentLabels = {
  'cash': 'Tunai',
  'qris': 'QRIS',
  'debit': 'Kartu Debit',
  'transfer': 'Transfer',
};

String paymentLabel(String? m) => m == null ? '-' : (paymentLabels[m] ?? m);

/// Uang dari database (numeric) menjadi rupiah bulat.
int money(dynamic v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.round();
  return (num.tryParse(v.toString()) ?? 0).round();
}

/// Kesalahan koneksi / server sementara tidak tersedia: aman dicoba ulang (transaksi disimpan offline).
/// Kesalahan bisnis (mis. UANG_KURANG, PRODUK_TIDAK_TERSEDIA) BUKAN kesalahan jaringan.
bool isNetworkError(Object e) {
  if (e is SocketException || e is TimeoutException || e is HandshakeException) return true;
  if (e is AuthRetryableFetchException) return true;
  if (e is PostgrestException) {
    final code = e.code ?? '';
    return const {'500', '502', '503', '504', '520', '521', '522', '523', '524'}.contains(code);
  }
  final name = e.runtimeType.toString();
  return name.contains('ClientException') || name.contains('SocketException');
}

const _messages = <MapEntry<String, String>>[
  MapEntry('UANG_KURANG', 'Uang yang diterima kurang dari total.'),
  MapEntry('OPSI_WAJIB', 'Ada pilihan wajib yang belum dipilih.'),
  MapEntry('VARIAN_WAJIB', 'Varian wajib dipilih.'),
  MapEntry('PRODUK_TIDAK_TERSEDIA', 'Produk sedang tidak tersedia. Muat ulang menu.'),
  MapEntry('STOK_HABIS', 'Stok bahan habis.'),
  MapEntry('TIDAK_BERIZIN_DISKON', 'Anda tidak memiliki izin memberi diskon.'),
  MapEntry('TIDAK_BERIZIN', 'Anda tidak memiliki izin untuk tindakan ini.'),
  MapEntry('ALASAN_WAJIB', 'Alasan wajib diisi (minimal 3 karakter).'),
  MapEntry('TRANSAKSI_SUDAH_DIBATALKAN', 'Transaksi ini sudah dibatalkan.'),
  MapEntry('AKSES_CABANG_DITOLAK', 'Anda tidak memiliki akses ke cabang ini.'),
  MapEntry('CABANG_NONAKTIF', 'Cabang sedang nonaktif.'),
  MapEntry('SHIFT_SUDAH_ADA', 'Masih ada shift yang berjalan. Tutup shift tersebut terlebih dahulu.'),
  MapEntry('SHIFT_SUDAH_DITUTUP', 'Shift sudah ditutup. Buka shift baru untuk melanjutkan.'),
  MapEntry('SHIFT_DIBUTUHKAN', 'Buka shift terlebih dahulu.'),
  MapEntry('HARGA_BERUBAH', 'Harga di server berubah. Muat ulang menu lalu ulangi transaksi.'),
  MapEntry('METODE_BAYAR_TIDAK_AKTIF', 'Metode pembayaran ini tidak aktif.'),
  MapEntry('AKUN_NONAKTIF', 'Akun Anda dinonaktifkan.'),
  MapEntry('Invalid login credentials', 'Email atau password salah.'),
  MapEntry('Email not confirmed', 'Email belum dikonfirmasi. Hubungi admin.'),
  MapEntry('JWT expired', 'Sesi berakhir. Silakan login kembali.'),
  MapEntry('permission denied', 'Anda tidak memiliki izin untuk tindakan ini.'),
];

String friendlyError(Object e) {
  if (isNetworkError(e)) return 'Koneksi internet terputus.';
  final raw = e is PostgrestException
      ? e.message
      : e is AuthException
          ? e.message
          : e.toString();
  for (final m in _messages) {
    if (raw.contains(m.key)) {
      // Sertakan detail setelah ":" untuk kode yang membawa nama produk/bahan.
      final i = raw.indexOf(':');
      final detail = (m.key == 'OPSI_WAJIB' || m.key == 'VARIAN_WAJIB' || m.key == 'PRODUK_TIDAK_TERSEDIA' || m.key == 'STOK_HABIS') && i > 0
          ? ' (${raw.substring(i + 1).trim()})'
          : '';
      return '${m.value}$detail';
    }
  }
  return raw.replaceFirst('Exception: ', '');
}
