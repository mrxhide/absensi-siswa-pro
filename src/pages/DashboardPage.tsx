import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ClockAlert,
  FileWarning,
  HeartPulse,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import {
  getDashboardData,
  getJakartaDateString,
  getSiswaBelumAbsen,
  simpanChecklistAbsensi,
} from '../services/gasApi';
import {
  STATUS_META,
  type ActiveTab,
  type DashboardData,
  type Pengaturan,
  type SiswaBelumAbsenItem,
  type SiswaBelumAbsenResponse,
  type UserSession,
} from '../types';
import { BadgeStatus } from '../components/ui/BadgeStatus';
import { DashboardSkeleton } from '../components/ui/SkeletonLoader';
import { useToast } from '../components/ui/Toast';

interface DashboardPageProps {
  user: UserSession;
  pengaturan: Pengaturan;
  onNavigate: (
    tab: ActiveTab,
    options?: { kelas?: string; tanggal?: string; onlyBelumAbsen?: boolean }
  ) => void;
}

function getGreetingIndonesia(): string {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  const hour = Number(hourStr);
  if (hour >= 4 && hour < 11) return 'Selamat Pagi';
  if (hour >= 11 && hour < 15) return 'Selamat Siang';
  if (hour >= 15 && hour < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}

function formatReadableDateIndonesia(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return isoDate;
  const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 5, 0, 0));
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);
}

function normalizeWaNumber(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

export function DashboardPage({ user, pengaturan, onNavigate }: DashboardPageProps) {
  const toast = useToast();
  const [tanggal, setTanggal] = useState<string>(() => getJakartaDateString());
  const [filterKelas, setFilterKelas] = useState<string>(() =>
    user.role === 'Guru' && user.waliKelas && user.waliKelas !== '-' ? user.waliKelas : ''
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [belumAbsenData, setBelumAbsenData] = useState<SiswaBelumAbsenResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [quickSavingNisn, setQuickSavingNisn] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [dashRes, belumRes] = await Promise.all([
          getDashboardData({
            tanggal,
            role: user.role,
            waliKelas: user.waliKelas,
            filterKelas: filterKelas || undefined,
          }),
          getSiswaBelumAbsen(tanggal, filterKelas || 'Semua'),
        ]);

        if (!dashRes.success || !dashRes.data) {
          toast.error(dashRes.message || 'Gagal memuat ringkasan dashboard.');
        } else {
          setData(dashRes.data);
        }

        if (belumRes.success && belumRes.data) {
          setBelumAbsenData(belumRes.data);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tanggal, filterKelas, user.role, user.waliKelas, toast]
  );

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  const handleQuickMarkStatus = async (
    siswa: SiswaBelumAbsenItem,
    status: 'S' | 'I' | 'A'
  ) => {
    if (quickSavingNisn) return;
    setQuickSavingNisn(siswa.nisn);
    try {
      const res = await simpanChecklistAbsensi({
        tanggal,
        kelas: siswa.kelas,
        penginput: user.nama,
        items: [
          {
            nisn: siswa.nisn,
            nama: siswa.nama,
            status,
            keterangan: `Dicatat cepat dari Dashboard (${STATUS_META[status].label})`,
          },
        ],
      });

      if (!res.success) {
        toast.error(res.message || `Gagal mencatat status ${siswa.nama}.`);
        return;
      }

      toast.success(
        `${siswa.nama} (${siswa.kelas}) dicatat sebagai ${STATUS_META[status].label}.`
      );
      await loadDashboard(true);
    } finally {
      setQuickSavingNisn(null);
    }
  };

  const handleOpenWaKonfirmasi = (siswa: SiswaBelumAbsenItem) => {
    const phone = normalizeWaNumber(siswa.noWaOrtu);
    if (!phone) {
      toast.warning(`Nomor WhatsApp orang tua ${siswa.nama} belum diisi.`);
      return;
    }

    const msg = [
      `Yth. Bapak/Ibu ${siswa.namaOrtu || 'Orang Tua/Wali'},`,
      '',
      `Kami dari ${pengaturan.Nama_Sekolah} ingin mengonfirmasi kehadiran putra/putri Bapak/Ibu:`,
      `- Nama Siswa : ${siswa.nama}`,
      `- Kelas : ${siswa.kelas}`,
      `- Tanggal : ${formatReadableDateIndonesia(tanggal)}`,
      '',
      'Hingga saat ini ananda belum tercatat absensinya di sekolah. Mohon informasinya apakah ananda sedang sakit, izin, atau berhalangan hadir. Terima kasih.',
      `Hormat kami, ${user.nama}`,
    ].join('\n');

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  const ringkasan = data?.ringkasan || {
    totalSiswa: 0,
    hadir: 0,
    terlambat: 0,
    sakit: 0,
    izin: 0,
    alfa: 0,
    belumAbsen: 0,
    persentaseHadir: 0,
  };

  const statCards = [
    {
      label: 'Total Siswa',
      value: ringkasan.totalSiswa,
      icon: Users,
      accentText: '#0F4C81',
      accentBg: '#EFF6FF',
    },
    {
      label: 'Hadir',
      value: ringkasan.hadir,
      icon: UserCheck,
      accentText: '#15803D',
      accentBg: '#DCFCE7',
    },
    {
      label: 'Terlambat',
      value: ringkasan.terlambat,
      icon: Clock,
      accentText: '#C2410C',
      accentBg: '#FFEDD5',
    },
    {
      label: 'Sakit',
      value: ringkasan.sakit,
      icon: HeartPulse,
      accentText: '#1D4ED8',
      accentBg: '#DBEAFE',
    },
    {
      label: 'Izin',
      value: ringkasan.izin,
      icon: FileWarning,
      accentText: '#A16207',
      accentBg: '#FEF9C3',
    },
    {
      label: 'Alfa',
      value: ringkasan.alfa,
      icon: UserX,
      accentText: '#B91C1C',
      accentBg: '#FEE2E2',
    },
  ];

  const scopeLabel = filterKelas
    ? `Kelas ${filterKelas}`
    : user.role === 'Admin'
      ? 'Seluruh Sekolah'
      : user.waliKelas && user.waliKelas !== '-'
        ? `Kelas ${user.waliKelas}`
        : 'Seluruh Sekolah';

  const belumAbsenList = belumAbsenData?.items || [];
  const targetChecklistKelas =
    filterKelas ||
    (user.role === 'Guru' && user.waliKelas && user.waliKelas !== '-'
      ? user.waliKelas
      : belumAbsenList[0]?.kelas || data?.daftarKelas[0] || '');

  return (
    <div className="space-y-5">
      {/* Header Salam, Filter Tanggal & Kelas */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0F4C81]">
              {getGreetingIndonesia()}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] mt-0.5 truncate">
              {user.nama}
            </h2>
            <p className="text-sm text-[#64748B] mt-1 flex items-center gap-1.5 flex-wrap">
              <Calendar className="w-4 h-4 shrink-0 text-[#64748B]" strokeWidth={1.75} />
              <span>{formatReadableDateIndonesia(tanggal)}</span>
              <span className="text-[#CBD5E1]">•</span>
              <span className="font-semibold text-[#334155]">{scopeLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Pilih tanggal absensi"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] font-mono-num focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] min-w-0 flex-1 sm:flex-none"
            />

            <select
              aria-label="Filter kelas"
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] min-w-0 flex-1 sm:flex-none"
            >
              <option value="">Semua Kelas</option>
              {(data?.daftarKelas || []).map((kls) => (
                <option key={kls} value={kls}>
                  Kelas {kls}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              aria-label="Muat ulang data"
              className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-[#334155] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                strokeWidth={1.75}
              />
              <span className="hidden sm:inline">Muat Ulang</span>
            </button>
          </div>
        </div>

        {/* Persentase Kehadiran + Pintasan Cepat */}
        <div className="mt-5 pt-5 border-t border-[#E2E8F0] grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Tingkat Kehadiran ({scopeLabel})
                </p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  <span className="font-mono-num font-semibold text-[#0F172A]">
                    {ringkasan.hadir + ringkasan.terlambat}
                  </span>{' '}
                  dari{' '}
                  <span className="font-mono-num font-semibold text-[#0F172A]">
                    {ringkasan.totalSiswa}
                  </span>{' '}
                  siswa masuk sekolah
                  {ringkasan.belumAbsen > 0 && (
                    <span className="text-[#A16207] font-semibold">
                      {' '}
                      · {ringkasan.belumAbsen} belum absen
                    </span>
                  )}
                </p>
              </div>
              <span className="text-2xl sm:text-3xl font-bold font-mono-num text-[#0F4C81]">
                {ringkasan.persentaseHadir}%
              </span>
            </div>

            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                style={{ width: `${Math.min(100, Math.max(0, ringkasan.persentaseHadir))}%` }}
                className="h-full rounded-full bg-[#0F4C81] transition-all duration-300"
              />
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('checklist', { kelas: targetChecklistKelas, tanggal })}
              className="h-12 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>Checklist Cepat</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scan-qr')}
              className="h-12 px-4 rounded-xl bg-white hover:bg-[#EFF6FF] text-[#0F4C81] border border-[#0F4C81]/30 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <QrCode className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>Scan QR Code</span>
            </button>
          </div>
        </div>
      </section>

      {/* 6 Kartu Statistik KPI */}
      <section aria-label="Ringkasan statistik kehadiran">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#64748B] truncate">
                    {card.label}
                  </span>
                  <span
                    style={{ backgroundColor: card.accentBg, color: card.accentText }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                  </span>
                </div>
                <p
                  style={{ color: card.label === 'Total Siswa' ? '#0F172A' : card.accentText }}
                  className="text-2xl font-bold font-mono-num leading-none"
                >
                  {card.value}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bagian Pemantauan: Siswa Belum Absen Hari Ini */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                belumAbsenList.length > 0
                  ? 'bg-[#FEF9C3] text-[#A16207]'
                  : 'bg-[#DCFCE7] text-[#15803D]'
              }`}
            >
              {belumAbsenList.length > 0 ? (
                <ClockAlert className="w-5 h-5" strokeWidth={1.75} />
              ) : (
                <CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-[#0F172A]">Belum Absen Hari Ini</h3>
                <span
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold font-mono-num ${
                    belumAbsenList.length > 0
                      ? 'bg-[#FEF9C3] text-[#A16207] border border-[#FEF08A]'
                      : 'bg-[#DCFCE7] text-[#15803D]'
                  }`}
                >
                  {belumAbsenList.length} Siswa
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Siswa aktif yang belum scan QR atau belum dicatat di Checklist ({scopeLabel})
              </p>
            </div>
          </div>

          {belumAbsenList.length > 0 && targetChecklistKelas && (
            <button
              type="button"
              onClick={() =>
                onNavigate('checklist', {
                  kelas: targetChecklistKelas,
                  tanggal,
                  onlyBelumAbsen: true,
                })
              }
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#0F4C81] hover:bg-[#0C3D68] transition-colors cursor-pointer shrink-0"
            >
              <ClipboardCheck className="w-4 h-4" strokeWidth={1.75} />
              <span>Tindak Lanjuti di Checklist</span>
            </button>
          )}
        </div>

        {belumAbsenList.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-[#15803D]">
              Semua siswa aktif sudah tercatat absensinya
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              Tidak ada siswa yang tertinggal pada {formatReadableDateIndonesia(tanggal)}.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E2E8F0]">
            {belumAbsenList.map((siswa) => {
              const isSavingThis = quickSavingNisn === siswa.nisn;
              const hasWa = Boolean(normalizeWaNumber(siswa.noWaOrtu));
              return (
                <li
                  key={siswa.nisn}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-[#F8FAFC] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[#0F172A]">{siswa.nama}</p>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#475569] text-xs font-semibold">
                        {siswa.kelas}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#FEF9C3] text-[#A16207] border border-[#FEF08A] text-[11px] font-semibold">
                        Belum Absen
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono-num">NISN {siswa.nisn}</span>
                      {siswa.namaOrtu && (
                        <>
                          <span>•</span>
                          <span>Ortu: {siswa.namaOrtu}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Aksi Cepat: Catat S / I / A atau Konfirmasi WA Ortu */}
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {isSavingThis ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-semibold text-[#475569]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                        <span>Menyimpan...</span>
                      </span>
                    ) : (
                      <>
                        {(['S', 'I', 'A'] as const).map((code) => {
                          const meta = STATUS_META[code];
                          return (
                            <button
                              key={code}
                              type="button"
                              disabled={Boolean(quickSavingNisn)}
                              title={`Catat ${siswa.nama} sebagai ${meta.label}`}
                              onClick={() => void handleQuickMarkStatus(siswa, code)}
                              style={{
                                backgroundColor: meta.bgColor,
                                color: meta.textColor,
                                borderColor: meta.borderColor,
                              }}
                              className="h-9 min-w-[38px] px-2.5 rounded-xl border text-xs font-bold font-mono-num hover:brightness-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                            >
                              {code}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          disabled={!hasWa}
                          title={
                            hasWa
                              ? `Konfirmasi via WA ke orang tua ${siswa.nama}`
                              : 'Nomor WA orang tua belum diisi'
                          }
                          onClick={() => handleOpenWaKonfirmasi(siswa)}
                          className="h-9 px-3 rounded-xl border border-[#BBF7D0] bg-[#DCFCE7] hover:bg-[#BBF7D0]/80 text-[#15803D] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>WA Ortu</span>
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Khusus Admin: Ringkasan Kehadiran per Kelas */}
      {user.role === 'Admin' && data && data.rekapPerKelas.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">
                Ringkasan Kehadiran per Kelas
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Rekap gabungan seluruh kelas pada {formatReadableDateIndonesia(tanggal)}
              </p>
            </div>
            <span className="text-xs font-semibold text-[#64748B] font-mono-num">
              {data.rekapPerKelas.length} Kelas Aktif
            </span>
          </div>

          {/* Tampilan Tabel Desktop (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Wali Kelas</th>
                  <th className="py-3 px-3 text-center">Siswa</th>
                  <th className="py-3 px-3 text-center text-[#15803D]">H</th>
                  <th className="py-3 px-3 text-center text-[#C2410C]">T</th>
                  <th className="py-3 px-3 text-center text-[#1D4ED8]">S</th>
                  <th className="py-3 px-3 text-center text-[#A16207]">I</th>
                  <th className="py-3 px-3 text-center text-[#B91C1C]">A</th>
                  <th className="py-3 px-3 text-center">Belum</th>
                  <th className="py-3 px-4 text-right">% Hadir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm">
                {data.rekapPerKelas.map((row) => (
                  <tr
                    key={row.kelas}
                    onClick={() =>
                      setFilterKelas((prev) => (prev === row.kelas ? '' : row.kelas))
                    }
                    className={`transition-colors cursor-pointer ${
                      filterKelas === row.kelas
                        ? 'bg-[#EFF6FF]/80'
                        : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-bold text-[#0F172A]">{row.kelas}</td>
                    <td className="py-3.5 px-4 text-[#475569]">{row.waliKelas}</td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-semibold text-[#0F172A]">
                      {row.totalSiswa}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-semibold text-[#15803D]">
                      {row.hadir}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-semibold text-[#C2410C]">
                      {row.terlambat}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-semibold text-[#1D4ED8]">
                      {row.sakit}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-semibold text-[#A16207]">
                      {row.izin}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-semibold text-[#B91C1C]">
                      {row.alfa}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-semibold text-[#A16207]">
                      {row.belumAbsen}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#EFF6FF] text-[#0F4C81] font-mono-num text-xs font-bold">
                        {row.persentaseHadir}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tampilan Kartu Mobile (< md) */}
          <div className="md:hidden divide-y divide-[#E2E8F0]">
            {data.rekapPerKelas.map((row) => (
              <button
                key={row.kelas}
                type="button"
                onClick={() =>
                  setFilterKelas((prev) => (prev === row.kelas ? '' : row.kelas))
                }
                className={`w-full text-left p-4 transition-colors cursor-pointer ${
                  filterKelas === row.kelas ? 'bg-[#EFF6FF]/70' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0F172A]">
                      Kelas {row.kelas}
                      {row.belumAbsen > 0 && (
                        <span className="ml-2 text-[11px] font-semibold text-[#A16207]">
                          ({row.belumAbsen} belum)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#64748B] truncate">{row.waliKelas}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#EFF6FF] text-[#0F4C81] font-mono-num text-xs font-bold shrink-0">
                    {row.persentaseHadir}%
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  <div className="rounded-lg bg-[#DCFCE7] py-1.5 px-1">
                    <p className="text-[10px] font-semibold text-[#15803D]">H</p>
                    <p className="text-xs font-bold font-mono-num text-[#15803D]">{row.hadir}</p>
                  </div>
                  <div className="rounded-lg bg-[#FFEDD5] py-1.5 px-1">
                    <p className="text-[10px] font-semibold text-[#C2410C]">T</p>
                    <p className="text-xs font-bold font-mono-num text-[#C2410C]">
                      {row.terlambat}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#DBEAFE] py-1.5 px-1">
                    <p className="text-[10px] font-semibold text-[#1D4ED8]">S</p>
                    <p className="text-xs font-bold font-mono-num text-[#1D4ED8]">{row.sakit}</p>
                  </div>
                  <div className="rounded-lg bg-[#FEF9C3] py-1.5 px-1">
                    <p className="text-[10px] font-semibold text-[#A16207]">I</p>
                    <p className="text-xs font-bold font-mono-num text-[#A16207]">{row.izin}</p>
                  </div>
                  <div className="rounded-lg bg-[#FEE2E2] py-1.5 px-1">
                    <p className="text-[10px] font-semibold text-[#B91C1C]">A</p>
                    <p className="text-xs font-bold font-mono-num text-[#B91C1C]">{row.alfa}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Daftar Siswa Tidak Hadir / Terlambat */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 text-[#C2410C] shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[#0F172A] truncate">
                Siswa Tidak Hadir & Terlambat
              </h3>
              <p className="text-xs text-[#64748B]">
                Daftar siswa berstatus T, S, I, atau A pada tanggal terpilih
              </p>
            </div>
          </div>

          {(data?.siswaTidakHadir.length || 0) > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('lapor-wa')}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#15803D] bg-[#DCFCE7] hover:bg-[#BBF7D0]/70 transition-colors cursor-pointer shrink-0"
            >
              <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
              <span>Buka Lapor WA</span>
            </button>
          )}
        </div>

        {!data || data.siswaTidakHadir.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-bold text-[#0F172A]">
              Tidak ada siswa tidak hadir atau terlambat
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              Seluruh siswa yang sudah tercatat pada {formatReadableDateIndonesia(tanggal)} hadir
              tepat waktu.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E2E8F0]">
            {data.siswaTidakHadir.map((item) => (
              <li
                key={item.idLog}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 hover:bg-[#F8FAFC] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[#0F172A]">{item.nama}</p>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-[#475569]">
                      {item.kelas}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono-num">NISN {item.nisn}</span>
                    <span>•</span>
                    <span className="font-mono-num">Pukul {item.jam}</span>
                    <span>•</span>
                    <span>{item.metode}</span>
                  </p>
                  {item.keterangan && (
                    <p className="text-xs text-[#334155] mt-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 inline-block max-w-full break-words">
                      {item.keterangan}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                  <BadgeStatus status={item.status} display="both" size="md" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
