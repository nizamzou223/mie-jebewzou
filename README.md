# Jebewsizou — Sistem Manajemen & Kasir Multi-Cabang

Tiga bagian dalam satu repositori:

| Folder | Isi | Teknologi |
|---|---|---|
| [supabase/](supabase/) | Skema database, RLS, fungsi bisnis (RPC), Edge Function, seed, dan uji database | PostgreSQL · Supabase |
| [admin-web/](admin-web/) | Website admin untuk owner & admin cabang | React 18 · TypeScript · Vite |
| [kasir_app/](kasir_app/) | Aplikasi kasir Android/iOS (mendukung offline) | Flutter · Dart |

> Baca juga bagian **Status pengujian & batasan** di bawah — di sana tertulis dengan jujur apa yang sudah diuji dan apa yang belum.

## Cara kerja singkat

* **Satu owner, banyak cabang.** Owner membuat cabang & akun, lalu menugaskan tiap akun ke satu atau beberapa cabang.
* **Keamanan ditegakkan di database (Supabase RLS)**, bukan di tampilan. Admin cabang dan kasir hanya bisa membaca/menulis data cabang yang ditugaskan kepadanya; peran tidak bisa dinaikkan sendiri.
* **Harga selalu dihitung ulang di server** saat transaksi (`create_order`). Aplikasi hanya mengirim ID produk, pilihan, dan jumlah — bukan harga.
* **Transaksi atomik & idempoten.** Order, item, pembayaran, dan pengurangan stok tersimpan dalam satu transaksi database. Setiap transaksi punya ID unik dari perangkat, sehingga kirim ulang (mis. setelah offline) tidak menggandakan data.
* **Histori aman diedit.** Nama produk, harga, varian, dan tambahan disalin (snapshot) ke detail transaksi.
* **Audit log** otomatis untuk perubahan harga, produk, stok, role, cabang, izin, refund, dan pembatalan.

### Peran

| Peran | Cakupan |
|---|---|
| **Owner** | Semua cabang, semua data, akun, izin, pengaturan usaha |
| **Admin Cabang** | Hanya cabang yang ditugaskan; izin dapat diatur owner (mis. laporan, stok, batalkan transaksi) |
| **Kasir** | Login dengan akun sendiri; bertransaksi di cabang yang ditugaskan; melihat transaksinya sendiri |

Izin per peran dapat diubah owner di **Pengaturan → Hak akses role**. Owner-only (tidak dapat didelegasikan): kelola cabang & pengaturan usaha.

---

## 1. Menyiapkan Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. **Matikan pendaftaran mandiri:** *Authentication → Sign In / Providers → Email* → nonaktifkan **Allow new users to sign up**. (Akun hanya dibuat oleh owner/admin lewat aplikasi.)
3. Jalankan skema. Pilih salah satu:
   * **SQL Editor:** buka dan jalankan berurutan isi file
     `supabase/migrations/0001_schema.sql` → `0002_security.sql` → `0003_rpc.sql` → `0004_reports.sql` → `0005_profile.sql`, lalu `supabase/seed.sql` (kategori, variasi, menu contoh, bahan & resep contoh).
   * **Supabase CLI:** `supabase link --project-ref <ref>` lalu `supabase db push` dan jalankan `seed.sql` di SQL Editor.

   Semua file aman dijalankan ulang (idempotent). Bila Anda sudah pernah menjalankan `0004_reports.sql`, jalankan ulang file itu agar laporan **per jam** (dipakai kartu "Jam ramai") tersedia. Bila Anda sudah pernah menjalankan migrasi sebelum `0005_profile.sql`, jalankan file itu agar kolom **foto profil** dan halaman **Profil Saya** (ganti nama/foto sendiri) berfungsi.
4. Deploy Edge Function untuk pembuatan akun (memakai service-role key **di sisi server saja**):
   ```bash
   supabase functions deploy admin-users
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` disediakan otomatis oleh Supabase untuk fungsi tersebut. Jangan pernah menaruh service-role key di React/Flutter.
5. Ambil **Project URL** dan **anon (publishable) key** dari *Project Settings → API*.

### Membuat akun owner pertama

1. *Authentication → Users → Add user → Create new user*: isi email & password, centang **Auto Confirm User**.
2. Akun **pertama** yang dibuat otomatis menjadi **owner** (trigger `handle_new_user`). Akun berikutnya dibuat dari website admin (menu **Pengguna**), bukan dari dashboard Supabase.
3. Login ke website admin → buat cabang (menu **Cabang**) → buat akun admin/kasir dan tentukan cabangnya.

## 2. Menjalankan website admin

Prasyarat: Node.js 18+.

```bash
cd admin-web
cp .env.example .env        # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # http://localhost:5173
```

Build produksi: `npm run build` (hasil di `admin-web/dist`, dapat di-hosting statis di Netlify/Vercel/Cloudflare Pages/Nginx; arahkan semua path ke `index.html`).

Tampilan & kenyamanan: halaman login layar-terbagi (tampil/sembunyi password, peringatan Caps Lock, ingat email, **lupa password** lewat email, **animasi selamat datang saat login berhasil** dan animasi goyang saat gagal) · **halaman Profil Saya** (ganti foto profil, ganti nama, ganti password, ganti email, ringkasan cabang & hak akses milik sendiri) · **tema terang/gelap** dengan palet merah-oranye bernama **Jebewsizou** (mengikuti sistem, dapat diganti) · sidebar berikon yang bisa diciutkan · **pencarian cepat `Ctrl + K`** (pindah halaman, cari produk, cari nomor transaksi) · lonceng peringatan stok menipis · tampilan produk daftar/kartu · animasi halus dan kerangka pemuatan (skeleton).

> Alur "lupa password" memakai email pemulihan bawaan Supabase: tambahkan alamat website Anda (mis. `http://localhost:5173` dan domain produksi) di *Authentication → URL Configuration → Redirect URLs*, dan atur pengirim email (SMTP) bila memakai banyak pengguna.

Fitur: dashboard (sapaan, omzet/transaksi/rata-rata **dengan tren vs periode sebelumnya**, produk terlaris, kasir terbaik, **jam ramai**, grafik harian/mingguan/bulanan, stok menipis, transaksi terbaru, filter periode/cabang/metode) · cabang & jam operasional · pengguna & hak akses · produk, varian, tambahan, resep, harga/ketersediaan per cabang · kategori · bahan & stok per cabang (masuk/keluar/penyesuaian + riwayat) · transaksi (filter, detail, cetak/unduh struk, batalkan/refund dengan alasan) · laporan (harian/mingguan/bulanan/rentang, per produk/kategori/kasir/cabang/metode, ekspor CSV, klik baris untuk menelusuri ke transaksi sumber) · riwayat aktivitas · pengaturan usaha, struk, metode pembayaran, pajak (nonaktif secara default), diskon.

## 3. Menjalankan aplikasi kasir (Flutter)

Prasyarat: Flutter stable (Dart ≥ 3.9), Android Studio / Xcode.

```bash
cd kasir_app
flutter pub get
flutter run --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
            --dart-define=SUPABASE_ANON_KEY=eyJ...
```

Atau simpan nilainya di file: salin `dart_defines.example.json` menjadi `dart_defines.json`, isi, lalu `flutter run --dart-define-from-file=dart_defines.json`.

Build rilis Android: `flutter build apk --release --dart-define-from-file=dart_defines.json`
(izin INTERNET sudah diaktifkan di `AndroidManifest.xml`; minSdk 23).

Alur kasir: login → (pilih cabang bila lebih dari satu) → buka shift + modal awal → pilih menu (variasi/pedas/topping/catatan; opsi wajib harus dipilih) → keranjang → bayar (tunai dengan kembalian otomatis / QRIS / debit / transfer) → struk (bagikan/cetak lewat aplikasi lain) → tutup shift (kas aktual vs perkiraan, selisih dihitung otomatis).

### Mode offline

* Menu terakhir yang dimuat, profil, dan shift disimpan di perangkat; kasir tetap dapat berjualan tanpa internet.
* Transaksi offline disimpan **terenkripsi** (Android Keystore / iOS Keychain) dengan ID unik, lalu dikirim otomatis saat online. Server menjawab "duplicate" bila sudah pernah masuk, sehingga tidak ada transaksi ganda.
* Aplikasi **tidak pernah** menampilkan transaksi offline sebagai tersimpan di server sebelum sinkronisasi berhasil (label *Belum sinkron*; nomor sementara `OFF-XXXXXX`, nomor resmi diberikan server).
* Yang **tidak** bisa offline: login pertama, buka/tutup shift, pembatalan/refund, laporan.
* Tutup shift diblokir selama masih ada transaksi belum sinkron.

## 4. Menguji database

```bash
cd supabase/tests
npm install
npm test
```

Menjalankan seluruh migration (dua kali) di Postgres in-memory (PGlite) lalu menguji RLS, pembatasan antar cabang, dan alur transaksi dengan akun berbeda peran.

---

## Status pengujian & batasan (jujur)

**Sudah diuji secara otomatis**

| Bagian | Cara uji | Hasil |
|---|---|---|
| Skema, RLS, RPC transaksi/shift/stok/void/laporan | 59 tes di PGlite (`supabase/tests`), termasuk migration ganda, pembatasan antar cabang, dan penjagaan agar pengguna tidak dapat menonaktifkan akunnya sendiri | lulus |
| Website admin | `tsc` (strict) + build produksi; lalu dijalankan di Chromium (Playwright) terhadap **PostgREST asli** di atas database uji berisi data contoh: 33 skenario (owner: kategori, variasi, produk lengkap, harga per cabang, stok, void transaksi, laporan → transaksi sumber, CSV, pajak, diskon, hak akses, cabang, pengguna, audit; admin cabang: menu terbatas, data cabang lain tidak terlihat, produk global read-only) | 33/33 lulus |
| Aplikasi Flutter | `flutter analyze` (0 isu) + 16 unit/widget test (hitungan harga/diskon/pajak sama dengan server, katalog per cabang, opsi wajib, antrean offline, klasifikasi error). Sekali juga dijalankan manual: query katalog/riwayat/shift dan `create_order` milik aplikasi ke PostgREST uji (total server = total aplikasi, kirim ulang tidak menggandakan) | lulus |

**Belum / tidak dapat diuji di lingkungan pengembangan ini**

* **Supabase yang sebenarnya** (Auth/GoTrue, Storage, Edge Function, Realtime): tidak tersedia. Edge Function `admin-users` dan unggah gambar **belum dijalankan**; ditulis mengikuti API resmi dan perlu Anda uji setelah deploy (buat akun dari menu Pengguna, unggah gambar produk).
* **Ganti email dari halaman Profil Saya** (`supabase.auth.updateUser({ email })`) ditulis mengikuti API resmi tetapi **belum diuji** terhadap alur konfirmasi email Supabase yang sesungguhnya — coba dulu dengan akun Anda sendiri setelah deploy, dan pastikan SMTP/redirect URL sudah diatur (lihat catatan "lupa password" di atas) agar email konfirmasi terkirim.
* **Animasi selamat datang saat login** dan **halaman Profil Saya** (unggah foto, ubah nama) sudah diperiksa secara visual (Chromium/Playwright) dengan REST API tiruan, tampilannya sesuai dan tanpa galat JavaScript — tetapi belum dicoba terhadap Supabase Storage yang sesungguhnya untuk unggah foto.
* **Aplikasi Flutter belum dijalankan di perangkat/emulator** dan belum di-build APK/IPA (tidak ada Android SDK/Xcode). Logika sudah diuji, tetapi tampilan dan alur di layar nyata perlu dicoba langsung. Sinkronisasi offline ke server asli juga belum diuji end-to-end.
* **Cetak ke printer thermal** belum ada. Struk dibagikan sebagai teks (`share_plus`) dan halaman web mendukung cetak lewat dialog browser. Integrasi printer Bluetooth/ESC-POS memerlukan paket & perangkat tambahan.
* **QRIS/debit/transfer** hanya dicatat sebagai metode pembayaran; tidak ada integrasi payment gateway.
* Realtime tidak dipakai (tidak diperlukan untuk fungsi saat ini).

**Asumsi & keputusan desain**

* Produk, kategori, variasi, dan resep bersifat **global**; hanya harga khusus & ketersediaan yang per cabang. Admin cabang secara bawaan tidak boleh mengubah data global (dapat diberi izin `product.manage_global` oleh owner).
* Stok bahan dicatat per cabang dan berkurang otomatis dari **resep**; penjualan tanpa stok tidak ditolak secara bawaan (stok bisa minus dan muncul di "stok menipis") — dapat diubah di Pengaturan → Usaha. Transaksi offline tidak pernah ditolak karena stok.
* Refund/pembatalan menandai transaksi dan mengembalikan stok; sistem tidak mengelola pengembalian uang secara fisik selain memengaruhi perkiraan kas shift (refund tunai atas transaksi shift lain mengurangi kas shift yang sedang berjalan).
* Omzet = total transaksi berstatus *Selesai*; tanggal laporan mengikuti zona waktu usaha (bawaan Asia/Jakarta, dapat diubah).
* Perhitungan pembulatan: diskon persen dan pajak dibulatkan ke rupiah (setengah ke atas), sama di server dan aplikasi.
* Antrean offline memakai `flutter_secure_storage` (cocok untuk puluhan–ratusan transaksi). Untuk volume sangat besar, ganti ke database terenkripsi (mis. SQLCipher).
* Server menolak kunci transaksi yang sama dari kasir berbeda; transaksi offline yang ditolak server (mis. produk sudah dihapus) ditandai **Gagal sinkron** dan tetap tersimpan di perangkat untuk ditinjau — tidak dibuang otomatis.
