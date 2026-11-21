import { useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  Clock,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  Save,
  Settings,
} from 'lucide-react';
import { getPengaturan, simpanPengaturan } from '../../services/gasApi';
import type { Pengaturan, UserSession } from '../../types';
import { CardListSkeleton } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../components/ui/Toast';

interface PengaturanPageProps {
  user: UserSession;
  initialPengaturan: Pengaturan;
  onPengaturanUpdated: (updated: Pengaturan) => void;
}

export function PengaturanPage({
  user,
  initialPengaturan,
  onPengaturanUpdated,
}: PengaturanPageProps) {
  const toast = useToast();
  const [form, setForm] = useState<Pengaturan>(initialPengaturan);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getPengaturan().then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setForm(res.data);
        setLogoError(false);
      } else {
        toast.error(res.message || 'Gagal memuat pengaturan sekolah.');
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [toast]);

  const handleLogoUrlChange = (val: string) => {
    setLogoError(false);
    setForm((prev) => ({ ...prev, Logo_URL: val }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.Nama_Sekolah.trim()) {
      toast.warning('Nama Sekolah wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const res = await simpanPengaturan({
        pengaturan: form,
        actorRole: user.role,
      });

      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal menyimpan pengaturan sekolah.');
        return;
      }

      setForm(res.data);
      onPengaturanUpdated(res.data);
      toast.success(
        res.message || 'Identitas sekolah berhasil diperbarui.',
        'Pengaturan Tersimpan'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <CardListSkeleton rows={4} />;
  }

  const hasValidLogoPreview = Boolean(form.Logo_URL.trim()) && !logoError;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl">
      {/* Header */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#0F4C81]" strokeWidth={1.75} />
            <span>Pengaturan Identitas Sekolah</span>
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Otomatis diterapkan pada Halaman Login, Kop Surat Rekap PDF, Kartu QR, dan batas
            keterlambatan Scan QR.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="h-11 px-5 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 shrink-0"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
              <span>Menyimpan...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" strokeWidth={1.75} />
              <span>Simpan Pengaturan</span>
            </>
          )}
        </button>
      </section>

      {/* Identitas Utama & Pratinjau Logo */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
          <Building2 className="w-4 h-4 text-[#0F4C81]" strokeWidth={1.75} />
          <h3 className="text-sm font-bold text-[#0F172A]">Identitas & Logo Sekolah</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[#334155] mb-1.5">
              Nama Sekolah <span className="text-[#B91C1C]">*</span>
            </label>
            <input
              type="text"
              required
              value={form.Nama_Sekolah}
              onChange={(e) => setForm((f) => ({ ...f, Nama_Sekolah: e.target.value }))}
              placeholder="Contoh: SMP Negeri 1 Nusantara"
              className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[#334155] mb-1.5">
              Alamat Lengkap Sekolah
            </label>
            <textarea
              rows={2}
              value={form.Alamat_Sekolah}
              onChange={(e) => setForm((f) => ({ ...f, Alamat_Sekolah: e.target.value }))}
              placeholder="Jl. Pendidikan No. 45, Kota..."
              className="w-full p-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>

          {/* Input Logo_URL + Pratinjau Instan */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[#334155] mb-1.5">
              URL Logo Sekolah (Opsional)
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3.5">
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <ImageIcon
                    className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    strokeWidth={1.75}
                  />
                  <input
                    type="url"
                    value={form.Logo_URL}
                    onChange={(e) => handleLogoUrlChange(e.target.value)}
                    placeholder="https://contoh.sch.id/logo.png"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                  />
                </div>
                <p className="text-[11px] text-[#64748B] mt-1.5 leading-relaxed">
                  Gunakan tautan gambar langsung (PNG/JPG). Kosongkan jika ingin memakai lambang
                  sekolah bawaan.
                </p>
              </div>

              {/* Kotak Pratinjau Logo Instan */}
              <div className="shrink-0 flex items-center gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] sm:w-52">
                {hasValidLogoPreview ? (
                  <img
                    src={form.Logo_URL.trim()}
                    alt="Pratinjau Logo"
                    onError={() => setLogoError(true)}
                    className="w-12 h-12 rounded-xl object-contain bg-white border border-[#E2E8F0] p-1 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#0F4C81] text-white flex items-center justify-center shrink-0">
                    <GraduationCap className="w-6 h-6" strokeWidth={1.75} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#0F172A]">Pratinjau Logo</p>
                  <p className="text-[11px] text-[#64748B] leading-tight mt-0.5">
                    {logoError
                      ? 'URL tidak bisa dimuat (pakai ikon bawaan)'
                      : form.Logo_URL.trim()
                        ? 'Logo kustom aktif'
                        : 'Menggunakan ikon bawaan'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Kepala Sekolah, Tahun Ajaran & Jam Masuk */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
          <Clock className="w-4 h-4 text-[#0F4C81]" strokeWidth={1.75} />
          <h3 className="text-sm font-bold text-[#0F172A]">
            Pejabat Penandatangan & Aturan Absensi
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1.5">
              Nama Kepala Sekolah
            </label>
            <input
              type="text"
              value={form.Nama_Kepsek}
              onChange={(e) => setForm((f) => ({ ...f, Nama_Kepsek: e.target.value }))}
              placeholder="Drs. H. Bambang Sutrisno, M.Pd."
              className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1.5">
              NIP Kepala Sekolah
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={form.NIP_Kepsek}
              onChange={(e) => setForm((f) => ({ ...f, NIP_Kepsek: e.target.value }))}
              placeholder="196805121994031008"
              className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1.5">
              Tahun Ajaran
            </label>
            <input
              type="text"
              value={form.Tahun_Ajaran}
              onChange={(e) => setForm((f) => ({ ...f, Tahun_Ajaran: e.target.value }))}
              placeholder="2026/2027"
              className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1.5">
              Batas Jam Masuk (WIB)
            </label>
            <input
              type="time"
              value={form.Jam_Masuk}
              onChange={(e) => setForm((f) => ({ ...f, Jam_Masuk: e.target.value }))}
              className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
            <p className="text-[11px] text-[#64748B] mt-1">
              Scan QR melewati jam ini otomatis dicatat sebagai Terlambat (T).
            </p>
          </div>
        </div>
      </section>
    </form>
  );
}
