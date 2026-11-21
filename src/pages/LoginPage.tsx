import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  LogIn,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  isGasIframeMode,
  isMockMode,
  loginUser,
  loginWithGoogle,
} from '../services/gasApi';
import type { Pengaturan, UserSession } from '../types';
import { useToast } from '../components/ui/Toast';
import { SkeletonBox } from '../components/ui/SkeletonLoader';

interface LoginPageProps {
  pengaturan: Pengaturan;
  loadingPengaturan: boolean;
  onLoginSuccess: (session: UserSession) => void;
}

function GoogleLogoSvg() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export function LoginPage({
  pengaturan,
  loadingPengaturan,
  onLoginSuccess,
}: LoginPageProps) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Tombol Login dengan Google hanya tampil di dalam iframe Google Apps Script (disembunyikan di Vercel/eksternal)
  const showGoogleLogin = isGasIframeMode();
  const mockMode = isMockMode();
  const isBusy = submitting || googleSubmitting;

  const executeLogin = async (inputUser: string, inputPin: string) => {
    setErrorMsg('');
    if (!inputUser.trim() || !inputPin.trim()) {
      setErrorMsg('Mohon masukkan Username dan PIN Anda terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await loginUser(inputUser.trim(), inputPin.trim());
      if (!res.success || !res.data) {
        const msg = res.message || 'Username atau PIN tidak sesuai.';
        setErrorMsg(msg);
        toast.error(msg, 'Gagal Masuk');
        return;
      }

      toast.success(`Selamat datang, ${res.data.nama}.`, 'Berhasil Masuk');
      onLoginSuccess(res.data);
    } finally {
      setSubmitting(false);
    }
  };

  const executeGoogleLogin = async () => {
    setErrorMsg('');
    setGoogleSubmitting(true);
    try {
      const res = await loginWithGoogle();
      if (!res.success || !res.data) {
        const msg =
          res.message ||
          'Akun Google tidak terdeteksi otomatis. Silakan masuk menggunakan Username & PIN.';
        setErrorMsg(msg);
        toast.warning(msg, 'Login Google');
        return;
      }

      toast.success(`Selamat datang, ${res.data.nama}.`, 'Berhasil Masuk dengan Google');
      onLoginSuccess(res.data);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void executeLogin(username, pin);
  };

  const handleQuickDemo = (demoUser: string, demoPin: string) => {
    setUsername(demoUser);
    setPin(demoPin);
    void executeLogin(demoUser, demoPin);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="w-full max-w-md mx-auto"
      >
        {/* Kartu Login Utama */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xs overflow-hidden">
          <div className="h-1.5 w-full bg-[#0F4C81]" />

          <div className="p-6 sm:p-8">
            {/* Identitas Sekolah Dinamis */}
            <div className="flex flex-col items-center text-center mb-6">
              {loadingPengaturan ? (
                <SkeletonBox className="w-16 h-16 rounded-2xl mb-4" />
              ) : pengaturan.Logo_URL ? (
                <img
                  src={pengaturan.Logo_URL}
                  alt={pengaturan.Nama_Sekolah}
                  className="w-16 h-16 rounded-2xl object-contain bg-[#F8FAFC] border border-[#E2E8F0] p-2 mb-4"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-[#0F4C81] text-white flex items-center justify-center mb-4 shadow-xs">
                  <GraduationCap className="w-8 h-8" strokeWidth={1.75} />
                </div>
              )}

              {loadingPengaturan ? (
                <div className="space-y-2 w-full flex flex-col items-center">
                  <SkeletonBox className="h-6 w-52" />
                  <SkeletonBox className="h-4 w-64" />
                </div>
              ) : (
                <>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-[#0F4C81]/10 text-[#0F4C81] text-xs font-semibold mb-2">
                    Sistem Absensi Siswa · TA {pengaturan.Tahun_Ajaran}
                  </span>
                  <h1 className="text-xl font-bold text-[#0F172A] leading-snug">
                    {pengaturan.Nama_Sekolah}
                  </h1>
                  {pengaturan.Alamat_Sekolah && (
                    <p className="text-xs text-[#64748B] mt-1 leading-relaxed max-w-xs">
                      {pengaturan.Alamat_Sekolah}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Pesan Error Inline */}
            {errorMsg && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                <p className="text-sm font-medium leading-snug">{errorMsg}</p>
              </div>
            )}

            {/* Tombol Masuk dengan Google (hanya tampil saat berjalan di dalam iframe GAS) */}
            {showGoogleLogin && (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void executeGoogleLogin()}
                  className="w-full h-12 px-4 rounded-xl bg-white hover:bg-[#F8FAFC] active:scale-[0.99] border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#0F172A] font-semibold text-sm sm:text-base inline-flex items-center justify-center gap-3 shadow-2xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {googleSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-[#0F4C81]" strokeWidth={1.75} />
                      <span>Memeriksa Akun Google...</span>
                    </>
                  ) : (
                    <>
                      <GoogleLogoSvg />
                      <span>Masuk dengan Google</span>
                    </>
                  )}
                </button>

                <div className="relative my-5 flex items-center">
                  <div className="flex-1 border-t border-[#E2E8F0]" />
                  <span className="px-3 text-xs font-medium text-[#64748B] bg-white whitespace-nowrap">
                    atau masuk dengan Username & PIN
                  </span>
                  <div className="flex-1 border-t border-[#E2E8F0]" />
                </div>
              </>
            )}

            {/* Form Login Username & PIN */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-sm font-semibold text-[#0F172A] mb-1.5"
                >
                  Username
                </label>
                <div className="relative">
                  <User
                    className="w-5 h-5 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    strokeWidth={1.75}
                  />
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Contoh: rina atau admin"
                    disabled={isBusy}
                    className="w-full h-12 pl-11 pr-4 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] text-base placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/25 focus:border-[#0F4C81] transition-colors disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-pin"
                  className="block text-sm font-semibold text-[#0F172A] mb-1.5"
                >
                  PIN Akses
                </label>
                <div className="relative">
                  <Lock
                    className="w-5 h-5 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    strokeWidth={1.75}
                  />
                  <input
                    id="login-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Masukkan PIN Anda"
                    disabled={isBusy}
                    className="w-full h-12 pl-11 pr-12 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] font-mono-num text-base tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/25 focus:border-[#0F4C81] transition-colors disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((prev) => !prev)}
                    aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    {showPin ? (
                      <EyeOff className="w-5 h-5" strokeWidth={1.75} />
                    ) : (
                      <Eye className="w-5 h-5" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full h-12 mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] active:scale-[0.99] text-white font-semibold text-base transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
                    <span>Memeriksa Akun...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" strokeWidth={1.75} />
                    <span>Masuk ke Aplikasi</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Tombol Uji Cepat khusus Preview Lokal (isMockMode) */}
        {mockMode && (
          <div className="mt-4 bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0F4C81]" strokeWidth={1.75} />
              <p className="text-xs font-bold uppercase tracking-wider text-[#0F4C81]">
                Uji Cepat Mode Preview Lokal
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleQuickDemo('admin', '1234')}
                className="flex flex-col items-start px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#0F4C81]/40 hover:bg-[#EFF6FF]/60 transition-colors text-left cursor-pointer disabled:opacity-50"
              >
                <span className="text-xs font-bold text-[#0F172A]">Admin (PIN)</span>
                <span className="text-[11px] text-[#64748B] font-mono-num mt-0.5">
                  admin / 1234
                </span>
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleQuickDemo('rina', '1111')}
                className="flex flex-col items-start px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#0F4C81]/40 hover:bg-[#EFF6FF]/60 transition-colors text-left cursor-pointer disabled:opacity-50"
              >
                <span className="text-xs font-bold text-[#0F172A]">Guru VII-A (PIN)</span>
                <span className="text-[11px] text-[#64748B] font-mono-num mt-0.5">
                  rina / 1111
                </span>
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-[#64748B] mt-5">
          Lupa Username atau PIN? Silakan hubungi Operator TU sekolah.
        </p>
      </motion.div>
    </div>
  );
}
