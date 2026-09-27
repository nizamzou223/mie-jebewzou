export interface PermissionDef {
  key: string;
  label: string;
  hint: string;
}

/** Izin yang dapat diatur owner untuk role Admin Cabang dan Kasir. */
export const PERMISSIONS: PermissionDef[] = [
  { key: 'order.view_outlet', label: 'Lihat semua transaksi cabang', hint: 'Tanpa izin ini, kasir hanya melihat transaksi miliknya sendiri.' },
  { key: 'order.void', label: 'Batalkan transaksi', hint: 'Wajib mengisi alasan, tercatat di audit log.' },
  { key: 'order.refund', label: 'Refund transaksi', hint: 'Wajib mengisi alasan, tercatat di audit log.' },
  { key: 'discount.apply', label: 'Memberi diskon saat transaksi', hint: 'Hanya diskon yang sudah disiapkan di pengaturan.' },
  { key: 'discount.manage', label: 'Kelola diskon cabang', hint: 'Diskon untuk semua cabang tetap khusus owner.' },
  { key: 'product.manage_outlet', label: 'Atur harga & ketersediaan produk di cabangnya', hint: 'Tidak mengubah data produk global.' },
  { key: 'product.manage_global', label: 'Ubah data produk global', hint: 'Berlaku untuk seluruh cabang. Sebaiknya khusus owner.' },
  { key: 'category.manage', label: 'Kelola kategori & variasi/tambahan', hint: 'Berlaku untuk seluruh cabang.' },
  { key: 'inventory.manage', label: 'Kelola bahan & stok cabangnya', hint: 'Stok masuk, keluar, penyesuaian.' },
  { key: 'user.manage', label: 'Kelola akun kasir cabangnya', hint: 'Admin hanya dapat mengelola akun kasir di cabangnya.' },
  { key: 'report.view', label: 'Lihat laporan & dashboard', hint: 'Hanya untuk cabang yang ditugaskan.' },
  { key: 'audit.view', label: 'Lihat riwayat aktivitas cabangnya', hint: '' },
];

export const ACTION_LABELS: Record<string, string> = {
  'outlet.insert': 'Menambah cabang',
  'outlet.update': 'Mengubah cabang',
  'user.insert': 'Akun dibuat',
  'user.update': 'Mengubah pengguna',
  'user.create': 'Membuat akun pengguna',
  'user.set_password': 'Reset password',
  'user_outlet.insert': 'Menugaskan pengguna ke cabang',
  'user_outlet.delete': 'Mencabut akses cabang',
  'permission.insert': 'Menambah izin role',
  'permission.delete': 'Mencabut izin role',
  'settings.update': 'Mengubah pengaturan usaha',
  'category.insert': 'Menambah kategori',
  'category.update': 'Mengubah kategori',
  'product.insert': 'Menambah produk',
  'product.update': 'Mengubah produk',
  'variant.insert': 'Menambah variasi',
  'variant.update': 'Mengubah variasi',
  'variant.delete': 'Menghapus variasi',
  'modifier_group.insert': 'Menambah grup pilihan',
  'modifier_group.update': 'Mengubah grup pilihan',
  'modifier.insert': 'Menambah pilihan/tambahan',
  'modifier.update': 'Mengubah pilihan/tambahan',
  'modifier.delete': 'Menghapus pilihan/tambahan',
  'outlet_product.insert': 'Atur produk cabang',
  'outlet_product.update': 'Ubah pengaturan produk cabang',
  'outlet_product.delete': 'Hapus pengaturan produk cabang',
  'discount.insert': 'Menambah diskon',
  'discount.update': 'Mengubah diskon',
  'discount.delete': 'Menghapus diskon',
  'ingredient.insert': 'Menambah bahan',
  'ingredient.update': 'Mengubah bahan',
  'recipe.insert': 'Menambah resep',
  'recipe.update': 'Mengubah resep',
  'recipe.delete': 'Menghapus resep',
  'product_modifier_group.insert': 'Menautkan grup pilihan ke produk',
  'product_modifier_group.delete': 'Melepas grup pilihan dari produk',
  'stock.insert': 'Perubahan stok',
  'order.void': 'Membatalkan transaksi',
  'order.refund': 'Refund transaksi',
  'shift.close': 'Menutup shift',
};

export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;
