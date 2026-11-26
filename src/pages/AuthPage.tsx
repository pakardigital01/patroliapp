import { useState, type FormEvent } from 'react';
import { ShieldCheck, LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Button, Field, Input } from '@/components/ui';
import { registerSchema, loginSchema } from '@/lib/validation';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const { show } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  // login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // register
  const [fullName, setFullName] = useState('');
  const [npk, setNpk] = useState('');
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (fe[i.path[0] as string] = i.message));
      setFieldErrors(fe);
      return;
    }
    setLoading(true);
    const { error: err } = await signIn(parsed.data.identifier, parsed.data.password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      show('Berhasil masuk', 'success');
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const parsed = registerSchema.safeParse({ fullName, npk, email, password: regPassword });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (fe[i.path[0] as string] = i.message));
      setFieldErrors(fe);
      return;
    }
    setLoading(true);
    const { error: err } = await signUp(parsed.data);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setRegistered(true);
      show('Pendaftaran terkirim. Menunggu persetujuan admin.', 'success');
    }
  };

  return (
    <div className="min-h-screen bg-kertas flex flex-col">
      <header className="bg-tinta text-kertas px-5 py-6">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <ShieldCheck size={32} className="text-aksen" />
          <div>
            <h1 className="text-xl font-bold">Patroli</h1>
            <p className="text-xs text-kertas/70">Sistem Patroli Keamanan Multi-Cabang</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-border p-6 animate-slide-up">
          {registered ? (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="mx-auto text-sukses mb-3" />
              <h2 className="font-semibold text-tinta text-lg mb-2">Pendaftaran Berhasil</h2>
              <p className="text-sm text-tintalight mb-5">
                Akun Anda berstatus <span className="font-medium text-peringatan">menunggu persetujuan</span>.
                Admin akan meninjau dan menyetujui akun Anda beserta penentuan cabang.
                Anda akan mendapat notifikasi email setelah disetujui.
              </p>
              <Button variant="secondary" full onClick={() => { setRegistered(false); setMode('login'); }}>
                Kembali ke Masuk
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-1 mb-5 bg-kertasdark rounded p-1">
                <button
                  onClick={() => { setMode('login'); setError(null); }}
                  className={`flex-1 btn-touch rounded text-sm font-medium transition-colors ${mode === 'login' ? 'bg-white text-tinta shadow-sm' : 'text-tintalight'}`}
                >
                  <LogIn size={16} className="inline mr-1" /> Masuk
                </button>
                <button
                  onClick={() => { setMode('register'); setError(null); }}
                  className={`flex-1 btn-touch rounded text-sm font-medium transition-colors ${mode === 'register' ? 'bg-white text-tinta shadow-sm' : 'text-tintalight'}`}
                >
                  <UserPlus size={16} className="inline mr-1" /> Daftar
                </button>
              </div>

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded bg-bahaya/10 border border-bahaya/30 px-3 py-2.5 text-sm text-bahaya">
                  <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {mode === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-0">
                  <Field label="NPK atau Email" required error={fieldErrors.identifier}>
                    <Input
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Masukkan NPK atau email"
                      autoComplete="username"
                      error={fieldErrors.identifier}
                    />
                  </Field>
                  <Field label="Password" required error={fieldErrors.password}>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete="current-password"
                      error={fieldErrors.password}
                    />
                  </Field>
                  <Button type="submit" full loading={loading}>Masuk</Button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-0">
                  <Field label="Nama Lengkap" required error={fieldErrors.fullName}>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nama lengkap" error={fieldErrors.fullName} />
                  </Field>
                  <Field label="NPK" required error={fieldErrors.npk} hint="3-20 huruf/angka, unik">
                    <Input value={npk} onChange={(e) => setNpk(e.target.value)} placeholder="Contoh: NPK12345" error={fieldErrors.npk} />
                  </Field>
                  <Field label="Email" required error={fieldErrors.email}>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@perusahaan.id" error={fieldErrors.email} />
                  </Field>
                  <Field label="Password" required error={fieldErrors.password} hint="Minimal 8 karakter">
                    <Input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Password" error={fieldErrors.password} />
                  </Field>
                  <Button type="submit" full loading={loading}>Daftar</Button>
                  <p className="text-xs text-tintalight mt-3 text-center">
                    Akun baru berstatus menunggu persetujuan admin.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="text-center text-xs text-tintalight py-4 no-print">
        Patroli © 2026 — Bukti patroli ber-GPS & QR terenkripsi
      </footer>
    </div>
  );
}
