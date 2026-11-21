import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  RefreshCw,
} from 'lucide-react';
import {
  getDaftarKelas,
  getJakartaDateString,
  getLaporWAData,
} from '../services/gasApi';
import {
  STATUS_META,
  type LaporWAItem,
  type Pengaturan,
  type StatusAbsensi,
  type UserSession,
} from '../types';
import { BadgeStatus } from '../components/ui/BadgeStatus';
import { CardListSkeleton } from '../components/ui/SkeletonLoader';
import { useToast } from '../components/ui/Toast';

interface LaporWAPageProps {
  user: UserSession;
  pengaturan: Pengaturan;
}

type FilterStatusWA = 'ALL' | Exclude<StatusAbsensi, 'H'>;

function formatTanggalIndonesia(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return isoDate;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 5, 0, 0));
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function normalizeWaNumber(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function getReportedStorageKey(tanggal: string): string {
  return `absensi_wa_reported_${tanggal}`;
}

function loadReportedIds(tanggal: string): string[] {
  try {
    const raw = sessionStorage.getItem(getReportedStorageKey(tanggal));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function LaporWAPage({ user, pengaturan }: LaporWAPageProps) {
  const toast = useToast();
  const [tanggal, setTanggal] = useState<string>(() => getJakartaDateString());
  const [daftarKelas, setDaftarKelas] = useState<string[]>([]);
  const [kelas, setKelas] = useState<string>(() =>
    user.role === 'Guru' && user.waliKelas && user.waliKelas !== '-' ? user.waliKelas : ''
  );
  const [filterStatus, setFilterStatus] = useState<FilterStatusWA>('ALL');

  const [items, setItems] = useState<LaporWAItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reportedIds, setReportedIds] = useState<string[]>(() =>
    loadReportedIds(getJakartaDateString())
  );

  useEffect(() => {
    setReportedIds(loadReportedIds(tanggal));
  }, [tanggal]);

  useEffect(() => {
    let active = true;
    void getDaftarKelas().then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setDaftarKelas(res.data);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLaporWAData({
        tanggal,
        kelas: kelas || undefined,
      });
      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal memuat daftar laporan WhatsApp.');
        return;
      }
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  }, [tanggal, kelas, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const buildMessage = (item: LaporWAItem): string => {
    const statusLabel = STATUS_META[item.status].label;
    const tglLabel = formatTanggalIndonesia(item.tanggal);
    const lines = [
      `Yth. Bapak/Ibu ${item.namaOrtu || 'Orang Tua/Wali'},`,
      '',
      `Kami dari ${pengaturan.Nama_Sekolah} menginformasikan status kehadiran putra/putri Bapak/Ibu hari ini:`,
      `- Nama Siswa : ${item.nama}`,
      `- Kelas : ${item.kelas}`,
      `- Tanggal : ${tglLabel}`,
      `- Status : ${statusLabel} (tercatat pukul ${item.jam} WIB)`,
    ];

    if (item.keterangan) {
      lines.push(`- Keterangan : ${item.keterangan}`);
    }

    lines.push(
      '',
      'Mohon konfirmasi atau perhatiannya. Terima kasih atas kerja sama Bapak/Ibu.',
      `Hormat kami, ${user.nama}`
    );

    return lines.join('\n');
  };

  const markAsReported = (idLog: string) => {
    setReportedIds((prev) => {
      if (prev.includes(idLog)) return prev;
      const next = [...prev, idLog];
      try {
        sessionStorage.setItem(getReportedStorageKey(tanggal), JSON.stringify(next));
      } catch {
        // Abaikan jika sessionStorage penuh
      }
      return next;
    });
  };

  const handleOpenWhatsApp = (item: LaporWAItem) => {
    const cleanPhone = normalizeWaNumber(item.noWaOrtu);
    if (!cleanPhone) {
      toast.warning(`Nomor WhatsApp orang tua ${item.nama} belum diisi.`);
      return;
    }

    const text = buildMessage(item);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    markAsReported(item.idLog);
    toast.success(`Membuka WhatsApp untuk orang tua ${item.nama}.`);
  };

  const handleCopyMessage = async (item: LaporWAItem) => {
    const text = buildMessage(item);
    try {
      await navigator.clipboard.writeText(text);
      toast.info(`Pesan untuk orang tua ${item.nama} berhasil disalin.`);
    } catch {
      toast.error('Browser tidak mengizinkan penyalinan otomatis.');
    }
  };

  const filteredItems = useMemo(() => {
    if (filterStatus === 'ALL') return items;
    return items.filter((item) => item.status === filterStatus);
  }, [items, filterStatus]);

  const statusChips: { value: FilterStatusWA; label: string }[] = [
    { value: 'ALL', label: `Semua (${items.length})` },
    { value: 'A', label: `Alfa (${items.filter((i) => i.status === 'A').length})` },
    { value: 'T', label: `Terlambat (${items.filter((i) => i.status === 'T').length})` },
    { value: 'S', label: `Sakit (${items.filter((i) => i.status === 'S').length})` },
    { value: 'I', label: `Izin (${items.filter((i) => i.status === 'I').length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Filter Tanggal, Kelas & Status */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#15803D]" strokeWidth={1.75} />
              <span>Lapor WhatsApp Orang Tua</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Kirim notifikasi sopan 1 klik untuk siswa berstatus Alfa, Terlambat, Sakit, atau Izin.
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadData()}
            className="self-start sm:self-auto h-9 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-xs font-semibold text-[#334155] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            <span>Muat Ulang</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="wa-tanggal"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Tanggal
            </label>
            <div className="relative">
              <Calendar
                className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                id="wa-tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="wa-kelas"
              className="block text-xs font-semibold text-[#475569] mb-1.5"
            >
              Filter Kelas
            </label>
            <select
              id="wa-kelas"
              value={kelas}
              onChange={(e) => setKelas(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            >
              <option value="">Semua Kelas</option>
              {daftarKelas.map((kls) => (
                <option key={kls} value={kls}>
                  Kelas {kls}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Status Chips */}
        <div className="flex flex-wrap gap-1.5">
          {statusChips.map((chip) => {
            const active = filterStatus === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setFilterStatus(chip.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                    : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-slate-100'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Daftar Kartu Siswa Lapor WA */}
      {loading ? (
        <CardListSkeleton rows={4} />
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-bold text-[#0F172A]">Tidak ada siswa yang perlu dilaporkan</p>
          <p className="text-xs text-[#64748B] mt-1">
            Tidak ditemukan siswa dengan status terpilih pada {formatTanggalIndonesia(tanggal)}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredItems.map((item) => {
            const cleanWa = normalizeWaNumber(item.noWaOrtu);
            const hasWa = Boolean(cleanWa);
            const isReported = reportedIds.includes(item.idLog);

            return (
              <article
                key={item.idLog}
                className={`bg-white border rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-colors ${
                  isReported ? 'border-[#BBF7D0] bg-[#F8FAFC]/60' : 'border-[#E2E8F0]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-bold text-[#0F172A]">
                          {item.nama}
                        </h3>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#475569] text-xs font-semibold">
                          {item.kelas}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-1 font-mono-num">
                        NISN {item.nisn} · Pukul {item.jam} WIB
                      </p>
                    </div>
                    <BadgeStatus status={item.status} display="both" size="sm" />
                  </div>

                  {/* Info Orang Tua & No WA */}
                  <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                    <p className="text-xs text-[#475569]">
                      Orang Tua/Wali:{' '}
                      <span className="font-semibold text-[#0F172A]">{item.namaOrtu}</span>
                    </p>
                    <p className="text-xs flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#64748B] shrink-0" strokeWidth={1.75} />
                      {hasWa ? (
                        <span className="font-mono-num font-semibold text-[#334155]">
                          +{cleanWa}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#B91C1C]">
                          <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                          Nomor WA belum diisi
                        </span>
                      )}
                    </p>
                    {item.keterangan && (
                      <p className="text-xs text-[#64748B] pt-1 border-t border-[#E2E8F0] mt-1.5">
                        Catatan: {item.keterangan}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  {isReported ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#15803D] text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>Sudah Dilaporkan</span>
                    </span>
                  ) : (
                    <span className="text-xs text-[#64748B]">Belum dikirim hari ini</span>
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => void handleCopyMessage(item)}
                      aria-label={`Salin pesan untuk ${item.nama}`}
                      className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#334155] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Salin</span>
                    </button>

                    <button
                      type="button"
                      disabled={!hasWa}
                      onClick={() => handleOpenWhatsApp(item)}
                      className={`h-10 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        isReported
                          ? 'bg-white border border-[#15803D] text-[#15803D] hover:bg-[#DCFCE7]/50'
                          : 'bg-[#15803D] hover:bg-[#166534] text-white'
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>{isReported ? 'Kirim Ulang WA' : 'Kirim WA'}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
