import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Info,
  Loader2,
  Printer,
  Users,
} from 'lucide-react';
import {
  generateRekapPDF,
  getDaftarKelas,
  getJakartaDateString,
  getRekapBulanan,
} from '../services/gasApi';
import {
  NAMA_BULAN_ID,
  STATUS_META,
  type PdfExportResult,
  type Pengaturan,
  type RekapBulananData,
  type StatusAbsensi,
  type UserSession,
} from '../types';
import { CardListSkeleton } from '../components/ui/SkeletonLoader';
import { useToast } from '../components/ui/Toast';

interface RekapPDFPageProps {
  user: UserSession;
  pengaturan: Pengaturan;
}

export function RekapPDFPage({ user, pengaturan }: RekapPDFPageProps) {
  const toast = useToast();
  const todayParts = useMemo(() => {
    const [y, m] = getJakartaDateString().split('-').map(Number);
    return { year: y || 2026, month: m || 1 };
  }, []);

  const [bulan, setBulan] = useState<number>(todayParts.month);
  const [tahun, setTahun] = useState<number>(todayParts.year);
  const [daftarKelas, setDaftarKelas] = useState<string[]>([]);
  const [kelas, setKelas] = useState<string>(() =>
    user.role === 'Guru' && user.waliKelas && user.waliKelas !== '-' ? user.waliKelas : ''
  );

  const [rekap, setRekap] = useState<RekapBulananData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [generatingPdf, setGeneratingPdf] = useState<boolean>(false);
  const [pdfResult, setPdfResult] = useState<PdfExportResult | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');

  // Buat Blob URL lokal yang aman dari data Base64 PDF (tanpa tautan Drive publik)
  useEffect(() => {
    if (!pdfResult?.pdfBase64) {
      setPdfBlobUrl('');
      return;
    }
    try {
      const binaryStr = window.atob(pdfResult.pdfBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: pdfResult.mimeType || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch {
      setPdfBlobUrl('');
      return;
    }
  }, [pdfResult]);

  const yearOptions = useMemo(() => {
    const base = todayParts.year;
    return [base - 2, base - 1, base, base + 1];
  }, [todayParts.year]);

  useEffect(() => {
    let active = true;
    void getDaftarKelas().then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setDaftarKelas(res.data);
        setKelas((prev) => {
          if (prev && res.data!.includes(prev)) return prev;
          if (user.role === 'Guru' && user.waliKelas && res.data!.includes(user.waliKelas)) {
            return user.waliKelas;
          }
          return res.data![0] || '';
        });
      }
    });
    return () => {
      active = false;
    };
  }, [user.role, user.waliKelas]);

  const loadRekap = useCallback(async () => {
    if (!kelas) {
      setRekap(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setPdfResult(null);
    try {
      const res = await getRekapBulanan({ bulan, tahun, kelas });
      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal memuat rekap bulanan.');
        return;
      }
      setRekap(res.data);
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, kelas, toast]);

  useEffect(() => {
    void loadRekap();
  }, [loadRekap]);

  const handleGeneratePDF = async () => {
    if (!kelas || generatingPdf) return;
    setGeneratingPdf(true);
    try {
      const res = await generateRekapPDF({
        bulan,
        tahun,
        kelas,
        namaWaliKelas: rekap?.waliKelas,
      });

      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal membuat file PDF.', 'Ekspor PDF Gagal');
        return;
      }

      setPdfResult(res.data);
      toast.success(
        res.data.isMock
          ? `Simulasi PDF "${res.data.fileName}" siap.`
          : `File "${res.data.fileName}" tersimpan di Google Drive.`,
        'Rekap PDF Selesai'
      );
    } finally {
      setGeneratingPdf(false);
    }
  };

  const dayList = useMemo(() => {
    const count = rekap?.jumlahHari || 30;
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [rekap?.jumlahHari]);

  return (
    <div className="space-y-4">
      {/* Panel Filter Bulan, Tahun, Kelas + Tombol Ekspor PDF */}
      <section className="no-print bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0F4C81]" strokeWidth={1.75} />
              <span>Rekap Absensi Bulanan & PDF</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Pratinjau matriks kehadiran tanggal 1–31 dan ekspor dokumen resmi berkop surat ke
              Google Drive.
            </p>
          </div>

          <button
            type="button"
            disabled={generatingPdf || loading || !kelas}
            onClick={() => void handleGeneratePDF()}
            className="w-full lg:w-auto h-11 px-5 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            {generatingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                <span>Menyusun PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" strokeWidth={1.75} />
                <span>Buat & Unduh Rekap PDF</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="rekap-bulan"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Bulan
            </label>
            <select
              id="rekap-bulan"
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            >
              {NAMA_BULAN_ID.map((nama, idx) => (
                <option key={nama} value={idx + 1}>
                  {nama}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="rekap-tahun"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Tahun
            </label>
            <select
              id="rekap-tahun"
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-mono-num font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="rekap-kelas"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Kelas
            </label>
            <select
              id="rekap-kelas"
              value={kelas}
              onChange={(e) => setKelas(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            >
              {daftarKelas.length === 0 ? (
                <option value="">Memuat kelas...</option>
              ) : (
                daftarKelas.map((kls) => (
                  <option key={kls} value={kls}>
                    Kelas {kls}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </section>

      {/* Kartu Hasil Ekspor PDF */}
      {pdfResult && (
        <section className="no-print bg-white border border-[#BBF7D0] rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0F172A] break-all">{pdfResult.fileName}</p>
                {pdfResult.isMock ? (
                  <p className="text-xs text-[#475569] mt-1 leading-relaxed flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#0F4C81] shrink-0 mt-0.5" strokeWidth={1.75} />
                    <span>
                      Mode Preview Lokal: saat dideploy ke Google Apps Script, PDF resmi berkop
                      surat {pengaturan.Nama_Sekolah} otomatis tersimpan di folder Google Drive{' '}
                      <span className="font-mono-num font-semibold">Rekap_Absensi_PDF</span>.
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-[#15803D] mt-0.5">
                    Arsip tersimpan privat di Google Drive <strong>Rekap_Absensi_PDF</strong> dan
                    siap diunduh aman langsung dari browser.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {pdfResult.isMock ? (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-10 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" strokeWidth={1.75} />
                  <span>Cetak Pratinjau</span>
                </button>
              ) : (
                <>
                  {pdfBlobUrl && (
                    <>
                      <a
                        href={pdfBlobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-10 px-3.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#0F172A] text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
                        <span>Pratinjau PDF</span>
                      </a>
                      <a
                        href={pdfBlobUrl}
                        download={pdfResult.fileName}
                        className="h-10 px-3.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" strokeWidth={1.75} />
                        <span>Unduh PDF (Aman)</span>
                      </a>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Ringkasan & Tabel Matriks Bulanan */}
      {loading ? (
        <CardListSkeleton rows={5} />
      ) : !rekap || rekap.rows.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[#64748B] flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-bold text-[#0F172A]">Belum ada data rekap untuk kelas ini</p>
          <p className="text-xs text-[#64748B] mt-1">
            Pastikan kelas memiliki siswa aktif dan absensi sudah dicatat pada bulan terpilih.
          </p>
        </div>
      ) : (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          {/* Header Ringkasan Bulanan */}
          <div className="p-4 sm:p-5 border-b border-[#E2E8F0] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#0F172A]">
                  Rekap Kelas {rekap.kelas} — {rekap.namaBulan} {rekap.tahun}
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Wali Kelas: <span className="font-semibold text-[#334155]">{rekap.waliKelas}</span>{' '}
                  · {rekap.rows.length} siswa aktif
                </p>
              </div>
              <span className="self-start sm:self-auto px-3 py-1 rounded-xl bg-[#EFF6FF] text-[#0F4C81] font-mono-num text-xs font-bold">
                Rata-rata Hadir: {rekap.ringkasan.rataRataPersentase}%
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {(
                [
                  { code: 'H' as StatusAbsensi, val: rekap.ringkasan.totalH },
                  { code: 'T' as StatusAbsensi, val: rekap.ringkasan.totalT },
                  { code: 'S' as StatusAbsensi, val: rekap.ringkasan.totalS },
                  { code: 'I' as StatusAbsensi, val: rekap.ringkasan.totalI },
                  { code: 'A' as StatusAbsensi, val: rekap.ringkasan.totalA },
                ] as const
              ).map((item) => {
                const meta = STATUS_META[item.code];
                return (
                  <div
                    key={item.code}
                    style={{ backgroundColor: meta.bgColor, color: meta.textColor }}
                    className="rounded-xl py-2 px-1.5 text-center"
                  >
                    <p className="text-[10px] font-bold uppercase">{meta.shortLabel}</p>
                    <p className="text-sm sm:text-base font-bold font-mono-num mt-0.5">
                      {item.val}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kontainer tabel dengan overflow-x-auto terisolasi agar halaman 360px tidak meluber */}
          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                  <th className="sticky left-0 z-10 bg-[#F8FAFC] py-2.5 px-2.5 text-center font-bold border-r border-[#E2E8F0] w-9">
                    No
                  </th>
                  <th className="sticky left-9 z-10 bg-[#F8FAFC] py-2.5 px-3 text-left font-bold border-r border-[#E2E8F0] min-w-[150px] max-w-[190px]">
                    Nama Siswa
                  </th>
                  {dayList.map((d) => (
                    <th
                      key={d}
                      className="py-2.5 px-1 text-center font-mono-num font-semibold w-7 border-r border-[#E2E8F0]/60"
                    >
                      {d}
                    </th>
                  ))}
                  <th className="py-2.5 px-2 text-center font-bold text-[#15803D] bg-[#DCFCE7]/50">
                    H
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-[#C2410C] bg-[#FFEDD5]/50">
                    T
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-[#1D4ED8] bg-[#DBEAFE]/50">
                    S
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-[#A16207] bg-[#FEF9C3]/50">
                    I
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-[#B91C1C] bg-[#FEE2E2]/50">
                    A
                  </th>
                  <th className="py-2.5 px-2.5 text-center font-bold text-[#0F4C81] bg-[#EFF6FF]">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rekap.rows.map((row, idx) => (
                  <tr key={row.nisn} className="hover:bg-[#F8FAFC]/80">
                    <td className="sticky left-0 z-10 bg-white py-2.5 px-2.5 text-center font-mono-num text-[#64748B] border-r border-[#E2E8F0]">
                      {idx + 1}
                    </td>
                    <td className="sticky left-9 z-10 bg-white py-2.5 px-3 border-r border-[#E2E8F0]">
                      <p className="font-semibold text-[#0F172A] truncate max-w-[165px]">
                        {row.nama}
                      </p>
                      <p className="text-[10px] font-mono-num text-[#64748B]">{row.nisn}</p>
                    </td>
                    {dayList.map((d) => {
                      const code = row.harian[d];
                      const meta = code ? STATUS_META[code] : null;
                      return (
                        <td
                          key={d}
                          style={
                            meta
                              ? { backgroundColor: meta.bgColor, color: meta.textColor }
                              : undefined
                          }
                          className="py-2 px-1 text-center font-mono-num font-bold border-r border-[#E2E8F0]/60 text-[11px]"
                        >
                          {code || <span className="text-slate-300 font-normal">·</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-center font-mono-num font-bold text-[#15803D]">
                      {row.totalH}
                    </td>
                    <td className="py-2 px-2 text-center font-mono-num font-bold text-[#C2410C]">
                      {row.totalT}
                    </td>
                    <td className="py-2 px-2 text-center font-mono-num font-bold text-[#1D4ED8]">
                      {row.totalS}
                    </td>
                    <td className="py-2 px-2 text-center font-mono-num font-bold text-[#A16207]">
                      {row.totalI}
                    </td>
                    <td className="py-2 px-2 text-center font-mono-num font-bold text-[#B91C1C]">
                      {row.totalA}
                    </td>
                    <td className="py-2 px-2.5 text-center font-mono-num font-bold text-[#0F4C81] bg-[#EFF6FF]/50">
                      {row.persentaseHadir}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="no-print px-4 py-2.5 bg-[#F8FAFC] border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
            Geser tabel ke samping untuk melihat seluruh tanggal 1–{rekap.jumlahHari}.
          </div>
        </section>
      )}
    </div>
  );
}
