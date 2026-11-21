import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  ClockAlert,
  Info,
  Loader2,
  QrCode,
  Save,
  Search,
  Users,
} from 'lucide-react';
import {
  getChecklistData,
  getDaftarKelas,
  getJakartaDateString,
  simpanChecklistAbsensi,
} from '../services/gasApi';
import {
  STATUS_META,
  type ChecklistStudentRow,
  type StatusAbsensi,
  type UserSession,
} from '../types';
import { CardListSkeleton } from '../components/ui/SkeletonLoader';
import { useToast } from '../components/ui/Toast';

export interface ChecklistPreset {
  kelas?: string;
  tanggal?: string;
  onlyBelumAbsen?: boolean;
  nonce: number;
}

interface ChecklistPageProps {
  user: UserSession;
  preset?: ChecklistPreset | null;
}

const STATUS_OPTIONS: StatusAbsensi[] = ['H', 'T', 'S', 'I', 'A'];

export function ChecklistPage({ user, preset }: ChecklistPageProps) {
  const toast = useToast();
  const [tanggal, setTanggal] = useState<string>(
    () => preset?.tanggal || getJakartaDateString()
  );
  const [daftarKelas, setDaftarKelas] = useState<string[]>([]);
  const [kelas, setKelas] = useState<string>(() => {
    if (preset?.kelas) return preset.kelas;
    return user.role === 'Guru' && user.waliKelas && user.waliKelas !== '-'
      ? user.waliKelas
      : '';
  });
  const [filterMode, setFilterMode] = useState<'semua' | 'belum'>(() =>
    preset?.onlyBelumAbsen ? 'belum' : 'semua'
  );

  const [items, setItems] = useState<ChecklistStudentRow[]>([]);
  const [sudahDiabsen, setSudahDiabsen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingKelas, setLoadingKelas] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Terapkan preset navigasi dari Dashboard ("Tindak Lanjuti di Checklist")
  useEffect(() => {
    if (!preset) return;
    if (preset.tanggal) setTanggal(preset.tanggal);
    if (preset.kelas) setKelas(preset.kelas);
    setFilterMode(preset.onlyBelumAbsen ? 'belum' : 'semua');
  }, [preset]);

  // Muat daftar kelas saat pertama kali dibuka
  useEffect(() => {
    let active = true;
    setLoadingKelas(true);
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
      } else {
        toast.error(res.message || 'Gagal memuat daftar kelas.');
      }
      setLoadingKelas(false);
    });

    return () => {
      active = false;
    };
  }, [user.role, user.waliKelas, toast]);

  // Muat daftar siswa & status absensi saat tanggal / kelas berubah
  const loadChecklist = useCallback(async () => {
    if (!kelas) {
      setItems([]);
      setSudahDiabsen(false);
      return;
    }

    setLoadingData(true);
    try {
      const res = await getChecklistData({ tanggal, kelas });
      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal memuat daftar siswa kelas.');
        return;
      }
      setItems(res.data.items);
      setSudahDiabsen(res.data.sudahDiabsen);
    } finally {
      setLoadingData(false);
    }
  }, [tanggal, kelas, toast]);

  useEffect(() => {
    void loadChecklist();
  }, [loadChecklist]);

  const handleStatusChange = (nisn: string, newStatus: StatusAbsensi) => {
    setItems((prev) =>
      prev.map((row) =>
        row.nisn === nisn
          ? {
              ...row,
              status: newStatus,
              keterangan: newStatus === 'H' ? '' : row.keterangan,
            }
          : row
      )
    );
  };

  const handleKeteranganChange = (nisn: string, value: string) => {
    setItems((prev) =>
      prev.map((row) => (row.nisn === nisn ? { ...row, keterangan: value } : row))
    );
  };

  const handleSemuaHadir = () => {
    setItems((prev) =>
      prev.map((row) => ({
        ...row,
        status: 'H',
        keterangan: '',
      }))
    );
    toast.info(`Seluruh siswa kelas ${kelas} diatur menjadi Hadir (H).`);
  };

  const handleSimpan = async () => {
    if (!kelas || items.length === 0 || saving) return;

    setSaving(true);
    try {
      const res = await simpanChecklistAbsensi({
        tanggal,
        kelas,
        penginput: user.nama,
        items: items.map((item) => ({
          nisn: item.nisn,
          nama: item.nama,
          status: item.status,
          keterangan: item.status === 'H' ? '' : item.keterangan.trim(),
        })),
      });

      if (!res.success) {
        toast.error(res.message || 'Gagal menyimpan absensi.', 'Penyimpanan Gagal');
        return;
      }

      setSudahDiabsen(true);
      toast.success(
        res.message || `Absensi kelas ${kelas} berhasil disimpan.`,
        'Absensi Tersimpan'
      );
      await loadChecklist();
    } finally {
      setSaving(false);
    }
  };

  const belumAbsenCount = useMemo(
    () => items.filter((row) => !row.idLog).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((row) => {
      if (filterMode === 'belum' && Boolean(row.idLog)) return false;
      if (q && !row.nama.toLowerCase().includes(q) && !row.nisn.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [items, searchQuery, filterMode]);

  const summary = useMemo(() => {
    const counts: Record<StatusAbsensi, number> = { H: 0, T: 0, S: 0, I: 0, A: 0 };
    for (const item of items) {
      counts[item.status]++;
    }
    return counts;
  }, [items]);

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      {/* Panel Filter Tanggal, Kelas, Pencarian & Tombol Semua Hadir */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#0F4C81]" strokeWidth={1.75} />
              <span>Checklist Absensi Kelas</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Seluruh siswa otomatis Hadir (H). Ketuk status untuk siswa yang tidak hadir.
            </p>
          </div>

          <button
            type="button"
            disabled={items.length === 0 || loadingData || saving}
            onClick={handleSemuaHadir}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#15803D] bg-[#DCFCE7] hover:bg-[#BBF7D0]/70 transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" strokeWidth={1.75} />
            <span>Semua Hadir</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="checklist-tanggal"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Tanggal Absensi
            </label>
            <div className="relative">
              <Calendar
                className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                id="checklist-tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="checklist-kelas"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Pilih Kelas
            </label>
            <select
              id="checklist-kelas"
              value={kelas}
              disabled={loadingKelas}
              onChange={(e) => setKelas(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] disabled:bg-slate-50"
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

          <div>
            <label
              htmlFor="checklist-search"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Cari Nama / NISN
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                id="checklist-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama siswa..."
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
            </div>
          </div>
        </div>

        {/* Chip Filter Cepat: Semua vs Belum Absen */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <button
            type="button"
            onClick={() => setFilterMode('semua')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              filterMode === 'semua'
                ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-slate-100'
            }`}
          >
            Semua ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('belum')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              filterMode === 'belum'
                ? 'bg-[#A16207] text-white border-[#A16207]'
                : 'bg-[#FEF9C3] text-[#A16207] border-[#FEF08A] hover:bg-[#FEF08A]/70'
            }`}
          >
            <ClockAlert className="w-3.5 h-3.5" strokeWidth={2} />
            <span>Belum Absen ({belumAbsenCount})</span>
          </button>
        </div>

        {/* Banner Mode Update jika sudah pernah diabsen */}
        {sudahDiabsen && !loadingData && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#0F4C81]">
            <Info className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
            <p className="text-xs sm:text-sm leading-snug">
              <span className="font-bold">Mode Perbarui (Update):</span> Sebagian atau seluruh
              siswa kelas <span className="font-semibold">{kelas}</span> pada tanggal ini sudah
              tercatat. Menyimpan akan memperbarui data tanpa duplikat.
            </p>
          </div>
        )}
      </section>

      {/* Daftar Kartu Siswa */}
      {loadingData || loadingKelas ? (
        <CardListSkeleton rows={6} />
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto mb-3">
            {filterMode === 'belum' && items.length > 0 ? (
              <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
            ) : (
              <Users className="w-6 h-6 text-[#64748B]" strokeWidth={1.75} />
            )}
          </div>
          <p className="text-sm font-bold text-[#0F172A]">
            {items.length === 0
              ? 'Belum ada siswa aktif di kelas ini'
              : filterMode === 'belum' && !searchQuery
                ? 'Semua siswa di kelas ini sudah tercatat absensinya'
                : 'Siswa tidak ditemukan'}
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            {items.length === 0
              ? 'Silakan pilih kelas lain atau tambahkan data siswa melalui menu Admin.'
              : filterMode === 'belum' && !searchQuery
                ? 'Pilih chip "Semua" untuk melihat atau mengubah status kehadiran siswa yang sudah dicatat.'
                : `Tidak ada siswa yang cocok dengan filter pencarian "${searchQuery}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((row, idx) => {
            const isRecorded = Boolean(row.idLog);
            const isViaQr = isRecorded && row.metode === 'QR';

            return (
              <div
                key={row.nisn}
                className={`bg-white border rounded-2xl p-4 transition-colors ${
                  isRecorded ? 'border-[#E2E8F0]' : 'border-[#FDE047] bg-[#FEFCE8]/25'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] font-bold font-mono-num text-[#64748B] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <p className="text-sm sm:text-base font-bold text-[#0F172A] break-words">
                        {row.nama}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-8 text-xs text-[#64748B] flex-wrap">
                      <span className="font-mono-num">NISN {row.nisn}</span>
                      <span>•</span>
                      <span>{row.jk === 'P' ? 'Perempuan' : 'Laki-laki'}</span>
                    </div>
                  </div>

                  {/* Badge Visual: Sudah Absen / Via QR vs Belum Absen */}
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap pl-8 sm:pl-0">
                    {isViaQr ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#0F4C81] text-[11px] font-bold">
                        <QrCode className="w-3.5 h-3.5" strokeWidth={2} />
                        <span>Via QR{row.jam ? ` · ${row.jam}` : ''}</span>
                      </span>
                    ) : isRecorded ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                        <span>Sudah Absen</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEF9C3] border border-[#FEF08A] text-[#A16207] text-[11px] font-bold">
                        <ClockAlert className="w-3.5 h-3.5" strokeWidth={2} />
                        <span>Belum Absen</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Segmented Button Status H / T / S / I / A ramah ibu jari */}
                <div
                  role="radiogroup"
                  aria-label={`Status kehadiran ${row.nama}`}
                  className="grid grid-cols-5 gap-1.5"
                >
                  {STATUS_OPTIONS.map((code) => {
                    const meta = STATUS_META[code];
                    const active = row.status === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleStatusChange(row.nisn, code)}
                        style={
                          active
                            ? {
                                backgroundColor: meta.bgColor,
                                color: meta.textColor,
                                borderColor: meta.textColor,
                              }
                            : undefined
                        }
                        className={`h-11 rounded-xl border text-center flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-[0.97] ${
                          active
                            ? 'font-bold shadow-2xs ring-1 ring-inset ring-current/15'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] font-semibold hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm leading-none font-mono-num">{code}</span>
                        <span className="text-[10px] leading-none mt-1 hidden sm:block">
                          {meta.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Input Keterangan Opsional untuk status selain H */}
                {row.status !== 'H' && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={row.keterangan}
                      onChange={(e) => handleKeteranganChange(row.nisn, e.target.value)}
                      placeholder={`Catatan ${STATUS_META[row.status].label} (opsional)...`}
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] focus:bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] transition-colors"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky Save Bar di bagian bawah (di atas BottomNav di layar mobile) */}
      {items.length > 0 && (
        <div className="sticky bottom-[72px] md:bottom-4 z-20">
          <div className="bg-white/95 backdrop-blur-xs border border-[#CBD5E1] rounded-2xl p-3.5 shadow-lg shadow-slate-900/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map((code) => {
                const meta = STATUS_META[code];
                return (
                  <span
                    key={code}
                    style={{ backgroundColor: meta.bgColor, color: meta.textColor }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono-num"
                  >
                    <span>{code}:</span>
                    <span>{summary[code]}</span>
                  </span>
                );
              })}
            </div>

            <button
              type="button"
              disabled={saving || loadingData}
              onClick={() => void handleSimpan()}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] active:scale-[0.99] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" strokeWidth={1.75} />
                  <span>{sudahDiabsen ? 'Perbarui Absensi' : 'Simpan Absensi'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
