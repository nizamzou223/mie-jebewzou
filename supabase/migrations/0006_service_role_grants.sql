-- =====================================================================
-- Migration 0006: berikan akses penuh ke role `service_role` di semua tabel schema public.
--
-- Latar belakang: di project ini, `service_role` ternyata tidak pernah mendapat hak akses
-- (SELECT/INSERT/UPDATE/DELETE) ke tabel manapun — bukan soal Row Level Security (RLS),
-- tapi lapisan izin Postgres yang lebih dasar dari RLS. Akibatnya Edge Function `admin-users`
-- (yang memakai service-role key persis supaya bisa melewati RLS untuk operasi admin seperti
-- membuat akun) gagal dengan "permission denied" di setiap query, walã sudah logika kodenya benar.
--
-- service_role MEMANG dimaksudkan untuk melewati seluruh sistem keamanan aplikasi (RLS dan
-- lainnya) — kuncinya hanya boleh dipakai di server (Edge Function), tidak pernah dikirim ke
-- React/Flutter — sehingga memberinya akses penuh di sini sesuai dengan perannya, bukan celah baru.
--
-- Aman dijalankan ulang (idempotent): GRANT tidak error bila sudah pernah diberikan.
-- =====================================================================

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Supaya tabel BARU yang dibuat migrasi berikutnya otomatis ikut ter-grant juga,
-- bukan hanya tabel yang sudah ada saat migrasi ini dijalankan.
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant all privileges on functions to service_role;
