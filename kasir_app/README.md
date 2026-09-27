# Jebewsizou Kasir (Flutter)

Aplikasi kasir Android/iOS untuk sistem Jebewsizou. Petunjuk lengkap ada di [README utama](../README.md#3-menjalankan-aplikasi-kasir-flutter).

```bash
flutter pub get
flutter run --dart-define-from-file=dart_defines.json   # salin dari dart_defines.example.json
flutter analyze && flutter test
```

Struktur `lib/`:

| Folder | Isi |
|---|---|
| `state/` | `SessionController` (login, cabang, izin), `ShiftController`, `CatalogController` (menu per cabang + cache), `CartController` (hitungan harga), `SyncController` (koneksi + antrean offline) |
| `services/` | `CheckoutService` (kirim ke server / simpan offline), `OfflineQueueStore` (penyimpanan terenkripsi) |
| `screens/` | Login, pilih cabang, kasir, opsi produk, keranjang, pembayaran, sukses, riwayat, shift, akun |
| `utils/` | Format rupiah/tanggal, penerjemah error, pembuat struk |

Aturan penting: harga tidak pernah dikirim dari aplikasi — server menghitung ulang di `create_order`. Perhitungan lokal (`CartController`) hanya untuk tampilan dan struk offline, dan diuji agar sama dengan server.
