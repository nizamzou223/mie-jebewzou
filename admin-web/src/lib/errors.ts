// Menerjemahkan kode kesalahan dari database / edge function menjadi pesan yang mudah dipahami.
const MAP: [RegExp, string][] = [
  [/UANG_KURANG/, 'Uang yang diterima kurang dari total.'],
  [/OPSI_WAJIB: ?(.*)/, 'Ada pilihan wajib yang belum dipilih: $1'],
  [/VARIAN_WAJIB: ?(.*)/, 'Varian wajib dipilih: $1'],
  [/PRODUK_TIDAK_TERSEDIA: ?(.*)/, 'Produk sedang tidak tersedia: $1'],
  [/STOK_HABIS: ?(.*)/, 'Stok habis: $1'],
  [/STOK_TIDAK_CUKUP/, 'Stok tidak cukup untuk dikurangi sebanyak itu.'],
  [/ALASAN_WAJIB/, 'Alasan wajib diisi (minimal 3 karakter).'],
  [/TIDAK_BERIZIN_DISKON/, 'Anda tidak memiliki izin memberi diskon.'],
  [/TIDAK_BERIZIN/, 'Anda tidak memiliki izin untuk tindakan ini.'],
  [/TRANSAKSI_SUDAH_DIBATALKAN/, 'Transaksi ini sudah dibatalkan / di-refund.'],
  [/TRANSAKSI_TIDAK_DITEMUKAN/, 'Transaksi tidak ditemukan.'],
  [/AKSES_CABANG_DITOLAK/, 'Anda tidak memiliki akses ke cabang ini.'],
  [/CABANG_NONAKTIF/, 'Cabang sedang nonaktif.'],
  [/SHIFT_SUDAH_ADA/, 'Masih ada shift yang berjalan. Tutup shift tersebut terlebih dahulu.'],
  [/SHIFT_SUDAH_DITUTUP/, 'Shift sudah ditutup.'],
  [/SHIFT_DIBUTUHKAN/, 'Buka shift terlebih dahulu.'],
  [/HARGA_BERUBAH/, 'Harga berubah di server. Muat ulang menu lalu coba lagi.'],
  [/AKUN_NONAKTIF/, 'Akun Anda nonaktif.'],
  [/minimal satu owner/i, 'Harus ada minimal satu owner aktif.'],
  [/owner yang dapat mengubah role/i, 'Hanya owner yang dapat mengubah role.'],
  [/duplicate key value.*sku/i, 'SKU sudah dipakai produk lain.'],
  [/duplicate key value.*outlets_code/i, 'Kode cabang sudah dipakai.'],
  [/duplicate key value/i, 'Data dengan nama/kode yang sama sudah ada.'],
  [/violates row-level security/i, 'Anda tidak memiliki izin untuk menyimpan data ini.'],
  [/permission denied/i, 'Anda tidak memiliki izin untuk tindakan ini.'],
  [/violates foreign key/i, 'Data ini masih dipakai oleh data lain sehingga tidak dapat diubah/dihapus.'],
  [/Invalid login credentials/i, 'Email atau password salah.'],
  [/Failed to fetch|NetworkError|network/i, 'Koneksi terputus. Periksa internet Anda lalu coba lagi.'],
  [/JWT expired|not authenticated/i, 'Sesi berakhir. Silakan login kembali.'],
];

export function friendlyError(e: unknown): string {
  const raw =
    typeof e === 'string' ? e : e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? 'Terjadi kesalahan';
  for (const [re, msg] of MAP) {
    const m = raw.match(re);
    if (m) return msg.replace(/\$(\d)/g, (_, i) => (m[Number(i)] ?? '').trim());
  }
  return raw;
}
