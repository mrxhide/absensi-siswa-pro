import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { GraduationCap, Loader2, Printer, QrCode, X } from 'lucide-react';
import type { Pengaturan, Siswa } from '../../types';

interface KartuQRPrintProps {
  open: boolean;
  onClose: () => void;
  siswaList: Siswa[];
  daftarKelas: string[];
  initialKelas: string;
  pengaturan: Pengaturan;
}

export function KartuQRPrint({
  open,
  onClose,
  siswaList,
  daftarKelas,
  initialKelas,
  pengaturan,
}: KartuQRPrintProps) {
  const [selectedKelas, setSelectedKelas] = useState<string>(initialKelas);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      if (initialKelas && initialKelas !== 'Semua') {
        setSelectedKelas(initialKelas);
      } else if (daftarKelas.length > 0) {
        setSelectedKelas(daftarKelas[0]);
      }
    }
  }, [open, initialKelas, daftarKelas]);

  // Kunci scroll body saat pratinjau cetak terbuka
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const activeStudentsInClass = useMemo(() => {
    return siswaList
      .filter((s) => s.status === 'Aktif' && (!selectedKelas || s.kelas === selectedKelas))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [siswaList, selectedKelas]);

  // Generate QR Code data URL untuk seluruh siswa aktif di kelas terpilih
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const generateAll = async () => {
      setGenerating(true);
      const nextMap: Record<string, string> = {};
      for (const s of activeStudentsInClass) {
        try {
          nextMap[s.nisn] = await QRCode.toDataURL(String(s.nisn), {
            width: 220,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#0F172A',
              light: '#FFFFFF',
            },
          });
        } catch {
          nextMap[s.nisn] = '';
        }
      }
      if (!cancelled) {
        setQrMap(nextMap);
        setGenerating(false);
      }
    };

    void generateAll();
    return () => {
      cancelled = true;
    };
  }, [open, activeStudentsInClass]);

  if (!open) return null;

  // Bagi menjadi kelompok 8 kartu (2 kolom × 4 baris per halaman A4)
  const pages: Siswa[][] = [];
  for (let i = 0; i < activeStudentsInClass.length; i += 8) {
    pages.push(activeStudentsInClass.slice(i, i + 8));
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#F8FAFC] overflow-y-auto print:static print:inset-auto print:bg-white print:overflow-visible">
      {/* Toolbar Pratinjau (disembunyikan saat cetak) */}
      <div className="no-print sticky top-0 z-20 bg-white border-b border-[#E2E8F0] shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#0F4C81] flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#0F172A] truncate">
                Pratinjau Cetak Kartu QR (A4)
              </h2>
              <p className="text-xs text-[#64748B]">
                Grid 2 kolom × 4 baris · {activeStudentsInClass.length} siswa aktif (
                {Math.max(1, pages.length)} halaman A4)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Pilih kelas untuk cetak kartu"
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            >
              {daftarKelas.map((kls) => (
                <option key={kls} value={kls}>
                  Kelas {kls}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={generating || activeStudentsInClass.length === 0}
              onClick={() => window.print()}
              className="h-10 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Printer className="w-4 h-4" strokeWidth={1.75} />
              )}
              <span>Cetak Kartu (A4)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-slate-100 text-[#334155] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
              <span>Tutup</span>
            </button>
          </div>
        </div>
      </div>

      {/* Konten Lembar A4 */}
      <div className="max-w-4xl mx-auto px-4 py-6 print:max-w-none print:p-0">
        {generating ? (
          <div className="no-print bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center">
            <Loader2 className="w-8 h-8 text-[#0F4C81] animate-spin mx-auto mb-3" strokeWidth={1.75} />
            <p className="text-sm font-semibold text-[#0F172A]">Menyiapkan QR Code kartu pelajar...</p>
          </div>
        ) : activeStudentsInClass.length === 0 ? (
          <div className="no-print bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center">
            <p className="text-sm font-bold text-[#0F172A]">Tidak ada siswa aktif pada kelas ini</p>
            <p className="text-xs text-[#64748B] mt-1">
              Pilih kelas lain yang memiliki siswa berstatus Aktif.
            </p>
          </div>
        ) : (
          <div className="space-y-6 print:space-y-0">
            {pages.map((pageStudents, pageIdx) => (
              <div
                key={`page-${pageIdx}`}
                className={`bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs print:border-0 print:rounded-none print:shadow-none print:p-0 ${
                  pageIdx < pages.length - 1 ? 'print-page-break-after' : ''
                }`}
              >
                <div className="no-print mb-3 pb-2 border-b border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
                  <span className="font-semibold">
                    Halaman {pageIdx + 1} dari {pages.length} · Kelas {selectedKelas}
                  </span>
                  <span>Ukuran Cetak: A4 Portrait (2 × 4)</span>
                </div>

                {/* Grid 2 kolom × 4 baris */}
                <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3.5 print:gap-3">
                  {pageStudents.map((siswa) => (
                    <article
                      key={siswa.nisn}
                      className="print-break-inside-avoid border border-[#CBD5E1] rounded-xl overflow-hidden bg-white flex flex-col justify-between min-h-[210px] print:min-h-[61mm]"
                    >
                      {/* Header Kartu Institusional */}
                      <div className="bg-[#0F4C81] text-white px-3.5 py-2.5 flex items-center gap-2.5">
                        {pengaturan.Logo_URL ? (
                          <img
                            src={pengaturan.Logo_URL}
                            alt="Logo"
                            className="w-8 h-8 rounded-lg bg-white p-0.5 object-contain shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                            <GraduationCap className="w-5 h-5 text-white" strokeWidth={1.75} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold uppercase tracking-wide leading-tight truncate">
                            {pengaturan.Nama_Sekolah}
                          </p>
                          <p className="text-[9px] text-white/80 leading-tight mt-0.5">
                            KARTU ABSENSI SISWA · TA {pengaturan.Tahun_Ajaran}
                          </p>
                        </div>
                      </div>

                      {/* Isi Kartu: Identitas + QR Code */}
                      <div className="p-3.5 flex items-center justify-between gap-3 flex-1">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <p className="text-[9px] uppercase tracking-wider font-semibold text-[#64748B]">
                              Nama Siswa
                            </p>
                            <p className="text-sm font-bold text-[#0F172A] leading-snug line-clamp-2">
                              {siswa.nama}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[9px] uppercase tracking-wider font-semibold text-[#64748B]">
                                Kelas
                              </p>
                              <p className="text-xs font-bold text-[#0F4C81]">{siswa.kelas}</p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-wider font-semibold text-[#64748B]">
                                Jenis Kelamin
                              </p>
                              <p className="text-xs font-semibold text-[#334155]">
                                {siswa.jk === 'P' ? 'Perempuan' : 'Laki-laki'}
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="text-[9px] uppercase tracking-wider font-semibold text-[#64748B]">
                              NISN
                            </p>
                            <p className="text-xs font-bold font-mono-num text-[#0F172A] tracking-wide">
                              {siswa.nisn}
                            </p>
                          </div>
                        </div>

                        {/* Kotak QR Code */}
                        <div className="shrink-0 flex flex-col items-center">
                          <div className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white">
                            {qrMap[siswa.nisn] ? (
                              <img
                                src={qrMap[siswa.nisn]}
                                alt={`QR ${siswa.nisn}`}
                                className="w-[88px] h-[88px] print:w-[24mm] print:h-[24mm] block"
                              />
                            ) : (
                              <div className="w-[88px] h-[88px] bg-slate-100 flex items-center justify-center text-[10px] text-[#64748B]">
                                QR
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] font-mono-num text-[#64748B] mt-1">
                            {siswa.nisn}
                          </span>
                        </div>
                      </div>

                      {/* Footer Strip */}
                      <div className="px-3.5 py-1.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between text-[9px] text-[#64748B]">
                        <span>Tunjukkan saat masuk gerbang</span>
                        <span className="font-semibold text-[#0F4C81]">Absensi QR</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
