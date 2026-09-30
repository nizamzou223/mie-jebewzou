import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/animated_background.dart';
import '../widgets/common.dart';
import '../widgets/login_hero_bowl.dart';
import '../widgets/login_success_overlay.dart';

enum _ButtonState { idle, loading }

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  _ButtonState _state = _ButtonState.idle;
  bool _hide = true;
  String? _error;
  int _shake = 0;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _state = _ButtonState.idle;
      _error = message;
      _shake++;
    });
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      _fail('Isi email dan password.');
      return;
    }
    setState(() {
      _state = _ButtonState.loading;
      _error = null;
    });
    // Ditangkap SEKARANG (sebelum menunggu login), bukan lewat context layar ini setelahnya —
    // RootGate bisa saja langsung mengganti layar begitu sesi siap, sebelum kode di bawah sempat
    // jalan lagi. OverlayState dari Navigator akar tetap hidup walau layar ini sudah diganti,
    // sehingga animasi "berhasil masuk" selalu tuntas diputar.
    final overlay = Overlay.of(context, rootOverlay: true);
    final session = context.read<SessionController>();
    try {
      await session.signIn(_email.text, _password.text);
      if (session.status == SessionStatus.ready) {
        LoginSuccessOverlay.show(
          overlay,
          name: session.profile?.fullName.split(' ').first ?? '',
        );
      } else if (mounted) {
        // Akun ternyata diblokir/nonaktif setelah login: batalkan animasi berhasil,
        // biarkan RootGate menampilkan BlockedScreen dengan alasannya.
        setState(() => _state = _ButtonState.idle);
      }
    } catch (e) {
      _fail(friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final notice = context.watch<SessionController>().notice;
    // Menimpa default global (lihat app.dart): bagian atas layar ini adalah gradien
    // merah-oranye yang gelap, jadi ikon status bar harus putih supaya tetap terlihat —
    // beda dengan layar lain yang semuanya berlatar terang.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Brand.bg,
        body: Stack(
          children: [
            const Positioned.fill(child: FloatingBlobsBackground()),
            SafeArea(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Hero gradasi — padanan panel kiri pada halaman login website admin.
                    Container(
                      width: double.infinity,
                      clipBehavior: Clip.antiAlias,
                      decoration: const BoxDecoration(
                        gradient: RadialGradient(
                          center: Alignment(0.9, -1),
                          radius: 1.4,
                          colors: [Color(0x3DFFCD96), Colors.transparent],
                          stops: [0, 0.6],
                        ),
                        borderRadius: BorderRadius.vertical(
                          bottom: Radius.circular(32),
                        ),
                      ),
                      child: Stack(
                        children: [
                          // Latar gradien merek — padanan panel hero pada halaman login website admin.
                          const Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: Brand.gradient,
                              ),
                            ),
                          ),
                          const Positioned.fill(child: DottedTexture()),
                          Positioned(
                            bottom: -8,
                            right: -14,
                            child: NoodleBowl(width: 150),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(28, 40, 28, 130),
                            child: Column(
                              children: [
                                Container(
                                  width: 60,
                                  height: 60,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.18),
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                  alignment: Alignment.center,
                                  child: const Text(
                                    'JZ',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 24,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                const Text(
                                  'Jebewsizou Kasir',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 25,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Kelola transaksi cabang Anda',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.88),
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Transform.translate(
                      offset: const Offset(0, -28),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: ShakeX(
                          trigger: _shake,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 420),
                            child: Container(
                              margin: const EdgeInsets.symmetric(horizontal: 0),
                              padding: const EdgeInsets.all(22),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(22),
                                boxShadow: [
                                  BoxShadow(
                                    color: Brand.ink.withValues(alpha: 0.08),
                                    blurRadius: 28,
                                    offset: const Offset(0, 14),
                                  ),
                                ],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  AnimatedSize(
                                    duration: const Duration(milliseconds: 220),
                                    alignment: Alignment.topCenter,
                                    child: notice != null
                                        ? _Banner(
                                            key: const ValueKey('notice'),
                                            text: notice,
                                            color: Brand.warning,
                                            bg: Brand.warningSoft,
                                          )
                                        : _error != null
                                        ? _Banner(
                                            key: const ValueKey('error'),
                                            text: _error!,
                                            color: Brand.danger,
                                            bg: Brand.dangerSoft,
                                          )
                                        : const SizedBox.shrink(
                                            key: ValueKey('none'),
                                          ),
                                  ),
                                  TextField(
                                    controller: _email,
                                    keyboardType: TextInputType.emailAddress,
                                    autofillHints: const [
                                      AutofillHints.username,
                                    ],
                                    textInputAction: TextInputAction.next,
                                    decoration: const InputDecoration(
                                      labelText: 'Email',
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  TextField(
                                    controller: _password,
                                    obscureText: _hide,
                                    autofillHints: const [
                                      AutofillHints.password,
                                    ],
                                    onSubmitted: (_) => _submit(),
                                    decoration: InputDecoration(
                                      labelText: 'Password',
                                      suffixIcon: IconButton(
                                        icon: Icon(
                                          _hide
                                              ? Icons.visibility_outlined
                                              : Icons.visibility_off_outlined,
                                        ),
                                        onPressed: () =>
                                            setState(() => _hide = !_hide),
                                        tooltip: _hide
                                            ? 'Tampilkan password'
                                            : 'Sembunyikan password',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 22),
                                  GradientButton(
                                    onPressed: _state == _ButtonState.idle
                                        ? _submit
                                        : null,
                                    loading: _state == _ButtonState.loading,
                                    child: const Text('Masuk'),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Lupa password? Hubungi owner atau admin cabang.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Brand.muted, fontSize: 13),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    super.key,
    required this.text,
    required this.color,
    required this.bg,
  });
  final String text;
  final Color color;
  final Color bg;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(
      text,
      style: TextStyle(color: color, fontWeight: FontWeight.w600),
    ),
  );
}
