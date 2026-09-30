/// Konfigurasi dibaca saat build/run lewat --dart-define:
///
///   flutter run --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
///               --dart-define=SUPABASE_ANON_KEY=eyJ...
///
/// Hanya URL dan anon (publishable) key. JANGAN PERNAH memakai service-role key di aplikasi ini.
///
/// Nilai cadangan di bawah HANYA dipakai kalau --dart-define tidak disertakan (mis. menekan
/// tombol Run di VS Code tanpa konfigurasi launch.json) — supaya aplikasi tetap bisa jalan untuk
/// pengembangan sehari-hari alih-alih menampilkan layar "Konfigurasi belum lengkap" melulu.
/// Ini AMAN: anon/publishable key memang dirancang untuk tertanam di aplikasi yang didistribusikan
/// (APK, bundel web) — keamanan data sesungguhnya dijaga oleh Row Level Security di database, bukan
/// oleh merahasiakan kunci ini (sama seperti VITE_SUPABASE_ANON_KEY di admin-web). Yang TIDAK PERNAH
/// boleh ditaruh di sini adalah service-role key.
/// Ganti dua nilai ini kalau Anda pindah ke project Supabase lain untuk pengembangan lokal.
const _fallbackSupabaseUrl = 'https://eufnktdymbzjaeuoxgzq.supabase.co';
const _fallbackSupabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1Zm5rdGR5bWJ6amFldW94Z3pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MzI0MjgsImV4cCI6MjEwNjAwODQyOH0.rhkfo_U1c4wvaqtYc0djJmKdMGunIaBKLVllaj7pmOM';

class AppConfig {
  static const _envUrl = String.fromEnvironment('SUPABASE_URL');
  static const _envAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static const supabaseUrl = _envUrl == '' ? _fallbackSupabaseUrl : _envUrl;
  static const supabaseAnonKey = _envAnonKey == '' ? _fallbackSupabaseAnonKey : _envAnonKey;

  static bool get isConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
