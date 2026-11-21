import {
  ApiResponse,
  ChecklistResponse,
  ChecklistSaveResult,
  ChecklistSubmitItem,
  DashboardData,
  Guru,
  LaporWAItem,
  LogAbsensi,
  NAMA_BULAN_ID,
  PdfExportResult,
  Pengaturan,
  RekapBulananData,
  RekapBulananSiswaRow,
  RekapKelasItem,
  RingkasanAbsensi,
  ScanQRResult,
  Siswa,
  SiswaBelumAbsenItem,
  SiswaBelumAbsenResponse,
  SiswaTidakHadirItem,
  StatusAbsensi,
  StatusAktif,
  UserRole,
  UserSession,
} from '../types';

const MOCK_DELAY_MS = 300;
const SESSION_STORAGE_KEY = 'absensi_siswa_pro_session_v1';
const MOCK_SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam
const MOCK_LOGIN_MAX_ATTEMPTS = 5;
const MOCK_LOGIN_LOCK_MS = 10 * 60 * 1000; // 10 menit

let currentAuthToken: string | null = null;
let onUnauthorizedCallback: ((message?: string) => void) | null = null;

/**
 * Mengatur token sesi aktif di memori agar otomatis dikirim pada setiap request terproteksi.
 */
export function setAuthToken(token: string | null): void {
  currentAuthToken = token ? String(token).trim() : null;
}

/**
 * Mengambil token sesi aktif (dari memori atau fallback sessionStorage).
 */
export function getAuthToken(): string {
  if (currentAuthToken) return currentAuthToken;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as Partial<UserSession>;
    if (parsed?.token) {
      currentAuthToken = String(parsed.token);
      return currentAuthToken;
    }
  } catch {
    // Abaikan jika sessionStorage tidak tersedia
  }
  return '';
}

/**
 * Mendaftarkan handler global saat server menolak token (sesi habis / tidak valid).
 */
export function setUnauthorizedHandler(handler: ((message?: string) => void) | null): void {
  onUnauthorizedCallback = handler;
}

/**
 * Mengecek apakah aplikasi berjalan di dalam iframe Google Apps Script.
 */
export function isGasIframeMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.google !== 'undefined' &&
    Boolean(window.google.script?.run)
  );
}

/**
 * Mengambil URL Web App Google Apps Script dari environment Vite (untuk hosting Vercel/eksternal).
 */
export function getGasApiUrl(): string {
  return String(import.meta.env.VITE_GAS_API_URL || '').trim();
}

/**
 * Mengecek apakah aplikasi berjalan di mode Preview Lokal (Mock Mode):
 * bukan iframe GAS dan VITE_GAS_API_URL tidak diisi.
 */
export function isMockMode(): boolean {
  return !isGasIframeMode() && !getGasApiUrl();
}

/**
 * Mengembalikan tanggal format YYYY-MM-DD dalam zona waktu Asia/Jakarta.
 */
export function getJakartaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Mengembalikan jam format HH:mm dalam zona waktu Asia/Jakarta.
 */
export function getJakartaTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withToken<T extends Record<string, unknown>>(payload?: T): T & { token: string } {
  return {
    ...(payload || ({} as T)),
    token: getAuthToken(),
  };
}

/**
 * Wrapper universal untuk memanggil backend Google Apps Script:
 * 1) Jika di dalam iframe GAS -> gunakan window.google.script.run
 * 2) Jika VITE_GAS_API_URL terisi -> gunakan fetch POST (text/plain;charset=utf-8 agar bebas CORS preflight)
 */
function runGasFunction<T>(functionName: string, ...args: unknown[]): Promise<ApiResponse<T>> {
  // Mode 1: Native iframe Google Apps Script
  if (isGasIframeMode()) {
    return new Promise((resolve) => {
      const runner = window.google?.script?.run;
      if (!runner) {
        resolve({
          success: false,
          message: 'Koneksi Google Apps Script tidak tersedia.',
        });
        return;
      }

      const executor = runner
        .withSuccessHandler((res: unknown) => {
          if (res && typeof res === 'object' && 'success' in res) {
            const typed = res as ApiResponse<T>;
            if (typed.unauthorized && onUnauthorizedCallback) {
              setAuthToken(null);
              onUnauthorizedCallback(typed.message);
            }
            resolve(typed);
          } else {
            resolve({
              success: true,
              data: res as T,
            });
          }
        })
        .withFailureHandler((err: Error) => {
          resolve({
            success: false,
            message: err?.message || 'Terjadi kesalahan pada server Google Apps Script.',
          });
        });

      const fn = executor[functionName];
      if (typeof fn !== 'function') {
        resolve({
          success: false,
          message: `Fungsi server "${functionName}" tidak ditemukan.`,
        });
        return;
      }

      (fn as (...params: unknown[]) => void)(...args);
    });
  }

  // Mode 2: Eksternal HTTPS (misal Vercel) -> POST ke doPost() Google Apps Script
  const apiUrl = getGasApiUrl();
  if (!apiUrl) {
    return Promise.resolve({
      success: false,
      message: 'Konfigurasi VITE_GAS_API_URL belum diatur.',
    });
  }

  return fetch(apiUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: functionName,
      args,
    }),
  })
    .then(async (response) => {
      if (!response.ok) {
        return {
          success: false,
          message: `Server API merespons status ${response.status}.`,
        } as ApiResponse<T>;
      }

      const rawText = await response.text();
      let envelope: { ok?: boolean; data?: unknown; error?: string };
      try {
        envelope = JSON.parse(rawText) as { ok?: boolean; data?: unknown; error?: string };
      } catch {
        return {
          success: false,
          message: 'Respons server bukan JSON valid. Pastikan Web App GAS dideploy untuk Anyone.',
        } as ApiResponse<T>;
      }

      if (!envelope.ok) {
        return {
          success: false,
          message: envelope.error || 'Terjadi kesalahan pada server API.',
        } as ApiResponse<T>;
      }

      const payload = envelope.data;
      if (payload && typeof payload === 'object' && 'success' in payload) {
        const typed = payload as ApiResponse<T>;
        if (typed.unauthorized && onUnauthorizedCallback) {
          setAuthToken(null);
          onUnauthorizedCallback(typed.message);
        }
        return typed;
      }

      return {
        success: true,
        data: payload as T,
      } as ApiResponse<T>;
    })
    .catch(() => ({
      success: false,
      message: 'Gagal terhubung ke server Google Apps Script. Periksa koneksi internet Anda.',
    }));
}

// ============================================================================
// MOCK DATABASE & SECURITY STORE IN-MEMORY (UNTUK PREVIEW LOKAL / LOCALHOST)
// ============================================================================

const mockSessionStore = new Map<string, { idGuru: string; expiresAt: number }>();
const mockLoginFails = new Map<string, number>();
const mockLoginLocks = new Map<string, number>();

function createMockToken(guru: Guru): string {
  const token = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  mockSessionStore.set(token, {
    idGuru: guru.idGuru,
    expiresAt: Date.now() + MOCK_SESSION_TTL_MS,
  });
  setAuthToken(token);
  return token;
}

function validateMockSession(requiredRole?: UserRole):
  | { ok: true; guru: Guru }
  | { ok: false; response: ApiResponse<never> } {
  const token = getAuthToken();
  if (!token) {
    const msg = 'Sesi login tidak ditemukan. Silakan masuk kembali.';
    if (onUnauthorizedCallback) onUnauthorizedCallback(msg);
    return { ok: false, response: { success: false, message: msg, unauthorized: true } };
  }

  let entry = mockSessionStore.get(token);

  // Hydrate ulang mock session jika halaman direload saat preview lokal
  if (!entry && token.startsWith('mock-')) {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<UserSession>;
        if (saved.token === token && saved.idGuru) {
          entry = { idGuru: saved.idGuru, expiresAt: Date.now() + MOCK_SESSION_TTL_MS };
          mockSessionStore.set(token, entry);
        }
      }
    } catch {
      // Abaikan
    }
  }

  if (!entry || Date.now() > entry.expiresAt) {
    mockSessionStore.delete(token);
    setAuthToken(null);
    const msg = 'Sesi Anda telah berakhir (maksimal 6 jam). Silakan masuk kembali.';
    if (onUnauthorizedCallback) onUnauthorizedCallback(msg);
    return { ok: false, response: { success: false, message: msg, unauthorized: true } };
  }

  const liveGuru = mockGuru.find((g) => g.idGuru === entry!.idGuru);
  if (!liveGuru || liveGuru.status !== 'Aktif') {
    mockSessionStore.delete(token);
    setAuthToken(null);
    const msg = 'Akun Anda sudah tidak aktif. Silakan hubungi Operator TU.';
    if (onUnauthorizedCallback) onUnauthorizedCallback(msg);
    return { ok: false, response: { success: false, message: msg, unauthorized: true } };
  }

  if (requiredRole === 'Admin' && liveGuru.role !== 'Admin') {
    return {
      ok: false,
      response: {
        success: false,
        message: 'Akses ditolak. Fitur ini hanya dapat diakses oleh Admin / Operator TU.',
      },
    };
  }

  return { ok: true, guru: liveGuru };
}

function sanitizeMockText(val: unknown): string {
  const str = String(val ?? '').trim().replace(/^[\t\r\n]+/, '');
  if (!str) return '';
  if (str !== '-' && /^[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

const mockPengaturan: Pengaturan = {
  Nama_Sekolah: 'SMP Negeri 1 Nusantara',
  Alamat_Sekolah: 'Jl. Pendidikan No. 45, Kec. Coblong, Kota Bandung, Jawa Barat 40132',
  Nama_Kepsek: 'Drs. H. Bambang Sutrisno, M.Pd.',
  NIP_Kepsek: '196805121994031008',
  Tahun_Ajaran: '2026/2027',
  Jam_Masuk: '07:15',
  Logo_URL: '',
};

const mockGuru: Guru[] = [
  {
    idGuru: 'G001',
    nama: 'Ahmad Fauzi, S.Pd.',
    username: 'admin',
    pin: '1234',
    role: 'Admin',
    waliKelas: '-',
    status: 'Aktif',
    emailGoogle: 'admin@sekolah.sch.id',
  },
  {
    idGuru: 'G002',
    nama: 'Rina Kartika, S.Pd.',
    username: 'rina',
    pin: '1111',
    role: 'Guru',
    waliKelas: 'VII-A',
    status: 'Aktif',
    emailGoogle: 'rina@sekolah.sch.id',
  },
  {
    idGuru: 'G003',
    nama: 'Budi Santoso, S.Pd.',
    username: 'budi',
    pin: '2222',
    role: 'Guru',
    waliKelas: 'VII-B',
    status: 'Aktif',
    emailGoogle: 'budi@sekolah.sch.id',
  },
  {
    idGuru: 'G004',
    nama: 'Siti Rahmawati, M.Pd.',
    username: 'siti',
    pin: '3333',
    role: 'Guru',
    waliKelas: 'VIII-A',
    status: 'Aktif',
    emailGoogle: 'siti@sekolah.sch.id',
  },
];

const mockSiswa: Siswa[] = [
  // Kelas VII-A (8 siswa)
  {
    nisn: '0091234501',
    nama: 'Aditya Pratama Putra',
    kelas: 'VII-A',
    jk: 'L',
    namaOrtu: 'Hendra Wijaya',
    noWaOrtu: '6281234567801',
    status: 'Aktif',
  },
  {
    nisn: '0091234502',
    nama: 'Aisyah Putri Ramadhani',
    kelas: 'VII-A',
    jk: 'P',
    namaOrtu: 'Sri Wahyuni',
    noWaOrtu: '6281234567802',
    status: 'Aktif',
  },
  {
    nisn: '0091234503',
    nama: 'Bagas Saputra',
    kelas: 'VII-A',
    jk: 'L',
    namaOrtu: 'Agus Setiawan',
    noWaOrtu: '6281234567803',
    status: 'Aktif',
  },
  {
    nisn: '0091234504',
    nama: 'Citra Dewi Lestari',
    kelas: 'VII-A',
    jk: 'P',
    namaOrtu: 'Dedi Kurniawan',
    noWaOrtu: '6281234567804',
    status: 'Aktif',
  },
  {
    nisn: '0091234505',
    nama: 'Dimas Arya Nugroho',
    kelas: 'VII-A',
    jk: 'L',
    namaOrtu: 'Bambang Hermawan',
    noWaOrtu: '6281234567805',
    status: 'Aktif',
  },
  {
    nisn: '0091234506',
    nama: 'Fauzan Hakim',
    kelas: 'VII-A',
    jk: 'L',
    namaOrtu: 'Lukman Hakim',
    noWaOrtu: '6281234567806',
    status: 'Aktif',
  },
  {
    nisn: '0091234507',
    nama: 'Nabila Khairunnisa',
    kelas: 'VII-A',
    jk: 'P',
    namaOrtu: 'Ratna Sari',
    noWaOrtu: '6281234567807',
    status: 'Aktif',
  },
  {
    nisn: '0091234508',
    nama: 'Rizky Ramadhan',
    kelas: 'VII-A',
    jk: 'L',
    namaOrtu: 'Taufik Hidayat',
    noWaOrtu: '6281234567808',
    status: 'Aktif',
  },
  // Kelas VII-B (8 siswa)
  {
    nisn: '0091234509',
    nama: 'Anisa Nurul Fadilah',
    kelas: 'VII-B',
    jk: 'P',
    namaOrtu: 'Mulyadi',
    noWaOrtu: '6281234567809',
    status: 'Aktif',
  },
  {
    nisn: '0091234510',
    nama: 'Bayu Aji Santoso',
    kelas: 'VII-B',
    jk: 'L',
    namaOrtu: 'Slamet Riyadi',
    noWaOrtu: '6281234567810',
    status: 'Aktif',
  },
  {
    nisn: '0091234511',
    nama: 'Dinda Permata Sari',
    kelas: 'VII-B',
    jk: 'P',
    namaOrtu: 'Yuniarti',
    noWaOrtu: '6281234567811',
    status: 'Aktif',
  },
  {
    nisn: '0091234512',
    nama: 'Fajar Mahendra',
    kelas: 'VII-B',
    jk: 'L',
    namaOrtu: 'Eko Prasetyo',
    noWaOrtu: '6281234567812',
    status: 'Aktif',
  },
  {
    nisn: '0091234513',
    nama: 'Gita Purnamasari',
    kelas: 'VII-B',
    jk: 'P',
    namaOrtu: 'Susanto',
    noWaOrtu: '6281234567813',
    status: 'Aktif',
  },
  {
    nisn: '0091234514',
    nama: 'Ilham Akbar',
    kelas: 'VII-B',
    jk: 'L',
    namaOrtu: 'Syaiful Anwar',
    noWaOrtu: '6281234567814',
    status: 'Aktif',
  },
  {
    nisn: '0091234515',
    nama: 'Keisha Maharani',
    kelas: 'VII-B',
    jk: 'P',
    namaOrtu: 'Dewi Anggraini',
    noWaOrtu: '6281234567815',
    status: 'Aktif',
  },
  {
    nisn: '0091234516',
    nama: 'Muhammad Farhan',
    kelas: 'VII-B',
    jk: 'L',
    namaOrtu: 'H. Abdullah',
    noWaOrtu: '6281234567816',
    status: 'Aktif',
  },
  // Kelas VIII-A (8 siswa)
  {
    nisn: '0089876501',
    nama: 'Alifia Zahra',
    kelas: 'VIII-A',
    jk: 'P',
    namaOrtu: 'Arif Budiman',
    noWaOrtu: '6281322334401',
    status: 'Aktif',
  },
  {
    nisn: '0089876502',
    nama: 'Bima Sakti Wicaksono',
    kelas: 'VIII-A',
    jk: 'L',
    namaOrtu: 'Wahyu Widodo',
    noWaOrtu: '6281322334402',
    status: 'Aktif',
  },
  {
    nisn: '0089876503',
    nama: 'Cahya Kamila Putri',
    kelas: 'VIII-A',
    jk: 'P',
    namaOrtu: 'Rudi Hartono',
    noWaOrtu: '6281322334403',
    status: 'Aktif',
  },
  {
    nisn: '0089876504',
    nama: 'Dani Kurniawan',
    kelas: 'VIII-A',
    jk: 'L',
    namaOrtu: 'Supriyadi',
    noWaOrtu: '6281322334404',
    status: 'Aktif',
  },
  {
    nisn: '0089876505',
    nama: 'Elsa Oktaviani',
    kelas: 'VIII-A',
    jk: 'P',
    namaOrtu: 'Nining Suryani',
    noWaOrtu: '6281322334405',
    status: 'Aktif',
  },
  {
    nisn: '0089876506',
    nama: 'Galih Prakoso',
    kelas: 'VIII-A',
    jk: 'L',
    namaOrtu: 'Suharto',
    noWaOrtu: '6281322334406',
    status: 'Aktif',
  },
  {
    nisn: '0089876507',
    nama: 'Hana Safira',
    kelas: 'VIII-A',
    jk: 'P',
    namaOrtu: 'M. Ridwan',
    noWaOrtu: '6281322334407',
    status: 'Aktif',
  },
  {
    nisn: '0089876508',
    nama: 'Reza Pahlevi',
    kelas: 'VIII-A',
    jk: 'L',
    namaOrtu: 'Zainal Abidin',
    noWaOrtu: '6281322334408',
    status: 'Nonaktif',
  },
];

function seedInitialMockLogs(): LogAbsensi[] {
  const todayStr = getJakartaDateString();
  const [yearStr, monthStr, dayStr] = todayStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const todayDay = Number(dayStr);

  const logs: LogAbsensi[] = [];
  let counter = 1;
  const makeId = () => `LOG-${String(counter++).padStart(5, '0')}`;

  const todayPreset: Record<
    string,
    { status: StatusAbsensi; jam: string; metode: 'Checklist' | 'QR'; ket: string }
  > = {
    '0091234501': { status: 'H', jam: '06:55', metode: 'QR', ket: '' },
    '0091234502': { status: 'H', jam: '07:02', metode: 'QR', ket: '' },
    '0091234503': { status: 'T', jam: '07:24', metode: 'QR', ket: 'Terlambat 9 menit (macet)' },
    // 0091234504 (Citra) & 0091234506 (Fauzan) belum absen hari ini untuk simulasi pemantauan VII-A
    '0091234505': { status: 'S', jam: '07:15', metode: 'Checklist', ket: 'Demam, surat orang tua via WA' },
    '0091234507': { status: 'I', jam: '07:15', metode: 'Checklist', ket: 'Acara keluarga di luar kota' },
    '0091234508': { status: 'A', jam: '07:30', metode: 'Checklist', ket: 'Tanpa keterangan' },
    // VII-B (0091234514 Ilham Akbar belum absen hari ini)
    '0091234509': { status: 'H', jam: '06:58', metode: 'QR', ket: '' },
    '0091234510': { status: 'H', jam: '07:01', metode: 'QR', ket: '' },
    '0091234511': { status: 'H', jam: '07:08', metode: 'Checklist', ket: '' },
    '0091234512': { status: 'T', jam: '07:21', metode: 'QR', ket: 'Terlambat 6 menit' },
    '0091234513': { status: 'H', jam: '07:04', metode: 'Checklist', ket: '' },
    '0091234515': { status: 'S', jam: '07:15', metode: 'Checklist', ket: 'Flu dan batuk' },
    '0091234516': { status: 'H', jam: '07:06', metode: 'QR', ket: '' },
    // VIII-A (0089876506 Galih Prakoso belum absen hari ini)
    '0089876501': { status: 'H', jam: '06:50', metode: 'QR', ket: '' },
    '0089876502': { status: 'H', jam: '07:03', metode: 'QR', ket: '' },
    '0089876503': { status: 'H', jam: '07:07', metode: 'Checklist', ket: '' },
    '0089876504': { status: 'A', jam: '07:30', metode: 'Checklist', ket: 'Belum ada konfirmasi orang tua' },
    '0089876505': { status: 'H', jam: '07:09', metode: 'Checklist', ket: '' },
    '0089876507': { status: 'H', jam: '07:04', metode: 'QR', ket: '' },
  };

  for (const siswa of mockSiswa) {
    if (siswa.status !== 'Aktif') continue;
    const preset = todayPreset[siswa.nisn];
    if (preset) {
      const wali = mockGuru.find((g) => g.waliKelas === siswa.kelas)?.nama || 'Ahmad Fauzi, S.Pd.';
      logs.push({
        idLog: makeId(),
        tanggal: todayStr,
        jam: preset.jam,
        nisn: siswa.nisn,
        nama: siswa.nama,
        kelas: siswa.kelas,
        status: preset.status,
        metode: preset.metode,
        keterangan: preset.ket,
        penginput: wali,
      });
    }
  }

  const sampleDays = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19].filter(
    (d) => d < todayDay
  );

  for (const d of sampleDays) {
    const tgl = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    mockSiswa.forEach((siswa, idx) => {
      if (siswa.status !== 'Aktif') return;
      let status: StatusAbsensi = 'H';
      let ket = '';
      const hash = (d * 7 + idx * 13) % 29;
      if (hash === 1) {
        status = 'T';
        ket = 'Terlambat masuk gerbang';
      } else if (hash === 2) {
        status = 'S';
        ket = 'Sakit';
      } else if (hash === 3) {
        status = 'I';
        ket = 'Izin keperluan keluarga';
      } else if (hash === 4) {
        status = 'A';
        ket = 'Tanpa keterangan';
      }

      logs.push({
        idLog: makeId(),
        tanggal: tgl,
        jam: status === 'T' ? '07:22' : '07:05',
        nisn: siswa.nisn,
        nama: siswa.nama,
        kelas: siswa.kelas,
        status,
        metode: idx % 2 === 0 ? 'QR' : 'Checklist',
        keterangan: ket,
        penginput: mockGuru.find((g) => g.waliKelas === siswa.kelas)?.nama || 'Ahmad Fauzi, S.Pd.',
      });
    });
  }

  return logs;
}

const mockLogs: LogAbsensi[] = seedInitialMockLogs();

function getUniqueClasses(): string[] {
  const set = new Set<string>();
  mockSiswa.forEach((s) => {
    if (s.kelas) set.add(s.kelas);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
}

function computeRingkasan(siswaAktif: Siswa[], logsForDate: LogAbsensi[]): RingkasanAbsensi {
  const totalSiswa = siswaAktif.length;
  const nisnSet = new Set(siswaAktif.map((s) => s.nisn));
  const filteredLogs = logsForDate.filter((l) => nisnSet.has(l.nisn));

  let hadir = 0;
  let terlambat = 0;
  let sakit = 0;
  let izin = 0;
  let alfa = 0;

  const recordedNisn = new Set<string>();
  for (const log of filteredLogs) {
    recordedNisn.add(log.nisn);
    if (log.status === 'H') hadir++;
    else if (log.status === 'T') terlambat++;
    else if (log.status === 'S') sakit++;
    else if (log.status === 'I') izin++;
    else if (log.status === 'A') alfa++;
  }

  const belumAbsen = Math.max(0, totalSiswa - recordedNisn.size);
  const totalMasuk = hadir + terlambat;
  const persentaseHadir = totalSiswa > 0 ? Math.round((totalMasuk / totalSiswa) * 1000) / 10 : 0;

  return {
    totalSiswa,
    hadir,
    terlambat,
    sakit,
    izin,
    alfa,
    belumAbsen,
    persentaseHadir,
  };
}

// ============================================================================
// PUBLIC & AUTH API FUNCTIONS (100% MATCH DENGAN /gas/*.gs)
// ============================================================================

export async function getPublicPengaturan(): Promise<ApiResponse<Pengaturan>> {
  if (!isMockMode()) {
    return runGasFunction<Pengaturan>('getPublicPengaturan');
  }
  await sleep(MOCK_DELAY_MS);
  return { success: true, data: { ...mockPengaturan } };
}

export async function loginUser(
  username: string,
  pin: string
): Promise<ApiResponse<UserSession>> {
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanPin = String(pin || '').trim();

  if (!isMockMode()) {
    const res = await runGasFunction<UserSession>('loginUser', cleanUser, cleanPin);
    if (res.success && res.data?.token) {
      setAuthToken(res.data.token);
    }
    return res;
  }

  await sleep(MOCK_DELAY_MS);
  if (!cleanUser || !cleanPin) {
    return { success: false, message: 'Username dan PIN wajib diisi.' };
  }

  const lockedUntil = mockLoginLocks.get(cleanUser);
  if (lockedUntil && Date.now() < lockedUntil) {
    const remainingMin = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
    return {
      success: false,
      message: `Terlalu banyak percobaan PIN salah. Akun sementara diblokir selama ${remainingMin} menit lagi.`,
    };
  }

  const found = mockGuru.find(
    (g) => g.username.toLowerCase() === cleanUser && String(g.pin) === cleanPin
  );

  if (!found) {
    const fails = (mockLoginFails.get(cleanUser) || 0) + 1;
    if (fails >= MOCK_LOGIN_MAX_ATTEMPTS) {
      mockLoginLocks.set(cleanUser, Date.now() + MOCK_LOGIN_LOCK_MS);
      mockLoginFails.delete(cleanUser);
      return {
        success: false,
        message: 'Salah PIN 5 kali berturut-turut. Login untuk username ini diblokir selama 10 menit.',
      };
    }
    mockLoginFails.set(cleanUser, fails);
    return {
      success: false,
      message: `Username atau PIN tidak sesuai. Sisa percobaan sebelum blokir sementara: ${
        MOCK_LOGIN_MAX_ATTEMPTS - fails
      } kali.`,
    };
  }

  if (found.status !== 'Aktif') {
    return {
      success: false,
      message: 'Akun Anda sedang dinonaktifkan. Hubungi Operator TU / Admin.',
    };
  }

  mockLoginFails.delete(cleanUser);
  mockLoginLocks.delete(cleanUser);
  const token = createMockToken(found);

  return {
    success: true,
    data: {
      idGuru: found.idGuru,
      nama: found.nama,
      username: found.username,
      role: found.role,
      waliKelas: found.waliKelas,
      token,
    },
  };
}

export async function loginWithGoogle(mockEmail?: string): Promise<ApiResponse<UserSession>> {
  if (!isMockMode()) {
    const res = await runGasFunction<UserSession>('loginWithGoogle');
    if (res.success && res.data?.token) {
      setAuthToken(res.data.token);
    }
    return res;
  }

  await sleep(MOCK_DELAY_MS);
  const simulatedEmail =
    mockEmail === undefined
      ? 'admin@sekolah.sch.id'
      : String(mockEmail || '').trim().toLowerCase();

  if (!simulatedEmail) {
    return {
      success: false,
      message:
        'Akun Google tidak terdeteksi otomatis (biasanya terjadi pada akun Gmail pribadi non-Workspace). Silakan masuk menggunakan Username & PIN.',
    };
  }

  const found = mockGuru.find(
    (g) => (g.emailGoogle || '').trim().toLowerCase() === simulatedEmail
  );

  if (!found) {
    return {
      success: false,
      message: `Email ${simulatedEmail} belum terdaftar sebagai Admin atau Guru di sekolah ini. Hubungi Operator TU.`,
    };
  }

  if (found.status !== 'Aktif') {
    return {
      success: false,
      message: `Akun dengan email ${simulatedEmail} sedang dinonaktifkan. Hubungi Operator TU / Admin.`,
    };
  }

  const token = createMockToken(found);
  return {
    success: true,
    data: {
      idGuru: found.idGuru,
      nama: found.nama,
      username: found.username,
      role: found.role,
      waliKelas: found.waliKelas,
      token,
    },
  };
}

export async function logoutUser(): Promise<ApiResponse<null>> {
  const token = getAuthToken();
  setAuthToken(null);

  if (!isMockMode()) {
    return runGasFunction<null>('logoutUser', { token });
  }

  if (token) {
    mockSessionStore.delete(token);
  }
  return { success: true, message: 'Sesi berakhir.' };
}

// ============================================================================
// PROTECTED ABSENSI & REKAP FUNCTIONS (SEMUA MENGIRIM SESSION TOKEN)
// ============================================================================

export async function getDaftarKelas(): Promise<ApiResponse<string[]>> {
  if (!isMockMode()) {
    return runGasFunction<string[]>('getDaftarKelas', withToken());
  }
  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;
  return { success: true, data: getUniqueClasses() };
}

export async function getDashboardData(payload: {
  tanggal: string;
  role: UserRole;
  waliKelas?: string;
  filterKelas?: string;
}): Promise<ApiResponse<DashboardData>> {
  if (!isMockMode()) {
    return runGasFunction<DashboardData>('getDashboardData', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  const daftarKelas = getUniqueClasses();
  const activeSiswaAll = mockSiswa.filter((s) => s.status === 'Aktif');
  const logsDate = mockLogs.filter((l) => l.tanggal === payload.tanggal);

  let targetKelas = payload.filterKelas || '';
  if (
    auth.guru.role === 'Guru' &&
    !targetKelas &&
    auth.guru.waliKelas &&
    auth.guru.waliKelas !== '-'
  ) {
    targetKelas = auth.guru.waliKelas;
  }

  const scopedSiswa = targetKelas
    ? activeSiswaAll.filter((s) => s.kelas === targetKelas)
    : activeSiswaAll;

  const ringkasan = computeRingkasan(scopedSiswa, logsDate);

  const siswaMap = new Map(mockSiswa.map((s) => [s.nisn, s]));
  const siswaTidakHadir: SiswaTidakHadirItem[] = logsDate
    .filter((l) => l.status !== 'H' && (!targetKelas || l.kelas === targetKelas))
    .map((l) => {
      const s = siswaMap.get(l.nisn);
      return {
        idLog: l.idLog,
        nisn: l.nisn,
        nama: l.nama,
        kelas: l.kelas,
        status: l.status as Exclude<StatusAbsensi, 'H'>,
        jam: l.jam,
        metode: l.metode,
        keterangan: l.keterangan,
        namaOrtu: s?.namaOrtu || '-',
        noWaOrtu: s?.noWaOrtu || '',
      };
    })
    .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));

  const rekapPerKelas: RekapKelasItem[] = daftarKelas.map((kelas) => {
    const siswaKelas = activeSiswaAll.filter((s) => s.kelas === kelas);
    const stat = computeRingkasan(siswaKelas, logsDate);
    const wali = mockGuru.find((g) => g.waliKelas === kelas && g.status === 'Aktif')?.nama || '-';
    return {
      kelas,
      waliKelas: wali,
      ...stat,
    };
  });

  return {
    success: true,
    data: {
      tanggal: payload.tanggal,
      ringkasan,
      siswaTidakHadir,
      rekapPerKelas,
      daftarKelas,
    },
  };
}

export async function getChecklistData(payload: {
  tanggal: string;
  kelas: string;
}): Promise<ApiResponse<ChecklistResponse>> {
  if (!isMockMode()) {
    return runGasFunction<ChecklistResponse>('getChecklistData', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  const siswaKelas = mockSiswa
    .filter((s) => s.kelas === payload.kelas && s.status === 'Aktif')
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const existingLogs = mockLogs.filter(
    (l) => l.tanggal === payload.tanggal && l.kelas === payload.kelas
  );
  const logByNisn = new Map(existingLogs.map((l) => [l.nisn, l]));

  const items = siswaKelas.map((s) => {
    const existing = logByNisn.get(s.nisn);
    return {
      nisn: s.nisn,
      nama: s.nama,
      kelas: s.kelas,
      jk: s.jk,
      status: existing ? existing.status : ('H' as StatusAbsensi),
      keterangan: existing ? existing.keterangan : '',
      idLog: existing?.idLog,
      jam: existing?.jam,
      metode: existing?.metode,
    };
  });

  return {
    success: true,
    data: {
      tanggal: payload.tanggal,
      kelas: payload.kelas,
      sudahDiabsen: existingLogs.length > 0,
      items,
    },
  };
}

export async function simpanChecklistAbsensi(payload: {
  tanggal: string;
  kelas: string;
  penginput: string;
  items: ChecklistSubmitItem[];
}): Promise<ApiResponse<ChecklistSaveResult>> {
  if (!isMockMode()) {
    return runGasFunction<ChecklistSaveResult>('simpanChecklistAbsensi', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  const jamSekarang = getJakartaTimeString();
  let savedCount = 0;
  let updatedCount = 0;

  for (const item of payload.items) {
    const existingIdx = mockLogs.findIndex(
      (l) => l.tanggal === payload.tanggal && l.nisn === String(item.nisn)
    );

    if (existingIdx >= 0) {
      mockLogs[existingIdx] = {
        ...mockLogs[existingIdx],
        status: item.status,
        keterangan: sanitizeMockText(item.keterangan),
        penginput: auth.guru.nama,
        jam: mockLogs[existingIdx].jam || jamSekarang,
      };
      updatedCount++;
    } else {
      mockLogs.push({
        idLog: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tanggal: payload.tanggal,
        jam: jamSekarang,
        nisn: String(item.nisn),
        nama: sanitizeMockText(item.nama),
        kelas: sanitizeMockText(payload.kelas),
        status: item.status,
        metode: 'Checklist',
        keterangan: sanitizeMockText(item.keterangan),
        penginput: auth.guru.nama,
      });
      savedCount++;
    }
  }

  return {
    success: true,
    data: {
      savedCount,
      updatedCount,
      totalProcessed: savedCount + updatedCount,
    },
    message:
      updatedCount > 0
        ? `Absensi kelas ${payload.kelas} berhasil diperbarui (${updatedCount} diperbarui, ${savedCount} baru).`
        : `Absensi kelas ${payload.kelas} berhasil disimpan (${savedCount} siswa).`,
  };
}

export async function prosesScanQR(payload: {
  nisn: string;
  penginput: string;
  tanggal?: string;
}): Promise<ApiResponse<ScanQRResult>> {
  const cleanNisn = String(payload.nisn || '').trim();
  if (!cleanNisn) {
    return { success: false, message: 'Kode QR kosong atau tidak valid.' };
  }

  if (!isMockMode()) {
    return runGasFunction<ScanQRResult>(
      'prosesScanQR',
      withToken({ ...payload, nisn: cleanNisn })
    );
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  const siswa = mockSiswa.find((s) => s.nisn === cleanNisn);
  if (!siswa) {
    return {
      success: false,
      message: `NISN "${cleanNisn}" tidak terdaftar di database siswa.`,
    };
  }
  if (siswa.status !== 'Aktif') {
    return {
      success: false,
      message: `Siswa ${siswa.nama} (${siswa.nisn}) berstatus Nonaktif.`,
    };
  }

  const tanggal = payload.tanggal || getJakartaDateString();
  const jamSekarang = getJakartaTimeString();
  const jamMasuk = mockPengaturan.Jam_Masuk || '07:15';

  const existing = mockLogs.find((l) => l.tanggal === tanggal && l.nisn === cleanNisn);
  if (existing) {
    return {
      success: true,
      data: {
        nisn: siswa.nisn,
        nama: siswa.nama,
        kelas: siswa.kelas,
        status: existing.status,
        jam: existing.jam,
        tanggal,
        jamMasuk,
        alreadyScanned: true,
        keterangan: `Sudah tercatat pada pukul ${existing.jam}`,
      },
      message: `${siswa.nama} sudah tercatat absen hari ini (${existing.jam}).`,
    };
  }

  const isTerlambat = jamSekarang > jamMasuk;
  const status: StatusAbsensi = isTerlambat ? 'T' : 'H';
  const keterangan = isTerlambat ? `Scan QR melewati jam masuk (${jamMasuk})` : '';

  mockLogs.push({
    idLog: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    tanggal,
    jam: jamSekarang,
    nisn: siswa.nisn,
    nama: siswa.nama,
    kelas: siswa.kelas,
    status,
    metode: 'QR',
    keterangan,
    penginput: auth.guru.nama,
  });

  return {
    success: true,
    data: {
      nisn: siswa.nisn,
      nama: siswa.nama,
      kelas: siswa.kelas,
      status,
      jam: jamSekarang,
      tanggal,
      jamMasuk,
      alreadyScanned: false,
      keterangan,
    },
    message: isTerlambat
      ? `${siswa.nama} tercatat Terlambat (${jamSekarang}).`
      : `${siswa.nama} tercatat Hadir (${jamSekarang}).`,
  };
}

export async function getLaporWAData(payload: {
  tanggal: string;
  kelas?: string;
}): Promise<ApiResponse<LaporWAItem[]>> {
  if (!isMockMode()) {
    return runGasFunction<LaporWAItem[]>('getLaporWAData', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  const siswaMap = new Map(mockSiswa.map((s) => [s.nisn, s]));

  const items: LaporWAItem[] = mockLogs
    .filter(
      (l) =>
        l.tanggal === payload.tanggal &&
        l.status !== 'H' &&
        (!payload.kelas || l.kelas === payload.kelas)
    )
    .map((l) => {
      const s = siswaMap.get(l.nisn);
      return {
        idLog: l.idLog,
        tanggal: l.tanggal,
        jam: l.jam,
        nisn: l.nisn,
        nama: l.nama,
        kelas: l.kelas,
        status: l.status as Exclude<StatusAbsensi, 'H'>,
        keterangan: l.keterangan,
        namaOrtu: s?.namaOrtu || 'Bapak/Ibu Orang Tua',
        noWaOrtu: s?.noWaOrtu || '',
      };
    })
    .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));

  return { success: true, data: items };
}

export async function getSiswaBelumAbsen(
  tanggal: string,
  kelas?: string
): Promise<ApiResponse<SiswaBelumAbsenResponse>> {
  const cleanTanggal = String(tanggal || '').trim() || getJakartaDateString();
  const cleanKelas = String(kelas || '').trim();

  if (!isMockMode()) {
    return runGasFunction<SiswaBelumAbsenResponse>(
      'getSiswaBelumAbsen',
      getAuthToken(),
      cleanTanggal,
      cleanKelas
    );
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  let effectiveKelas = '';
  if (auth.guru.role === 'Guru') {
    if (auth.guru.waliKelas && auth.guru.waliKelas !== '-') {
      effectiveKelas = auth.guru.waliKelas;
    } else if (cleanKelas && cleanKelas !== 'Semua') {
      effectiveKelas = cleanKelas;
    }
  } else if (cleanKelas && cleanKelas !== 'Semua') {
    effectiveKelas = cleanKelas;
  }

  const activeScoped = mockSiswa.filter(
    (s) => s.status === 'Aktif' && (!effectiveKelas || s.kelas === effectiveKelas)
  );
  const recordedSet = new Set(
    mockLogs.filter((l) => l.tanggal === cleanTanggal).map((l) => l.nisn)
  );

  const items: SiswaBelumAbsenItem[] = activeScoped
    .filter((s) => !recordedSet.has(s.nisn))
    .map((s) => ({
      nisn: s.nisn,
      nama: s.nama,
      kelas: s.kelas,
      jk: s.jk,
      namaOrtu: s.namaOrtu,
      noWaOrtu: s.noWaOrtu,
    }))
    .sort((a, b) => a.kelas.localeCompare(b.kelas, 'id') || a.nama.localeCompare(b.nama, 'id'));

  return {
    success: true,
    data: {
      tanggal: cleanTanggal,
      kelas: effectiveKelas,
      totalBelumAbsen: items.length,
      totalSiswaAktif: activeScoped.length,
      items,
    },
  };
}

export async function getRekapBulanan(payload: {
  bulan: number;
  tahun: number;
  kelas: string;
}): Promise<ApiResponse<RekapBulananData>> {
  if (!isMockMode()) {
    return runGasFunction<RekapBulananData>('getRekapBulanan', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  const jumlahHari = new Date(payload.tahun, payload.bulan, 0).getDate();
  const prefix = `${payload.tahun}-${String(payload.bulan).padStart(2, '0')}-`;

  const siswaKelas = mockSiswa
    .filter((s) => s.kelas === payload.kelas && s.status === 'Aktif')
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const logsBulan = mockLogs.filter(
    (l) => l.kelas === payload.kelas && l.tanggal.startsWith(prefix)
  );

  let sumH = 0;
  let sumT = 0;
  let sumS = 0;
  let sumI = 0;
  let sumA = 0;
  let sumPersen = 0;

  const rows: RekapBulananSiswaRow[] = siswaKelas.map((s) => {
    const harian: Record<number, StatusAbsensi | ''> = {};
    let totalH = 0;
    let totalT = 0;
    let totalS = 0;
    let totalI = 0;
    let totalA = 0;

    for (let d = 1; d <= jumlahHari; d++) {
      harian[d] = '';
    }

    logsBulan
      .filter((l) => l.nisn === s.nisn)
      .forEach((l) => {
        const dayNum = Number(l.tanggal.split('-')[2]);
        if (dayNum >= 1 && dayNum <= jumlahHari) {
          harian[dayNum] = l.status;
        }
      });

    for (let d = 1; d <= jumlahHari; d++) {
      const st = harian[d];
      if (st === 'H') totalH++;
      else if (st === 'T') totalT++;
      else if (st === 'S') totalS++;
      else if (st === 'I') totalI++;
      else if (st === 'A') totalA++;
    }

    const totalTercatat = totalH + totalT + totalS + totalI + totalA;
    const persentaseHadir =
      totalTercatat > 0 ? Math.round(((totalH + totalT) / totalTercatat) * 1000) / 10 : 0;

    sumH += totalH;
    sumT += totalT;
    sumS += totalS;
    sumI += totalI;
    sumA += totalA;
    sumPersen += persentaseHadir;

    return {
      nisn: s.nisn,
      nama: s.nama,
      jk: s.jk,
      harian,
      totalH,
      totalT,
      totalS,
      totalI,
      totalA,
      persentaseHadir,
    };
  });

  const waliKelas =
    mockGuru.find((g) => g.waliKelas === payload.kelas && g.status === 'Aktif')?.nama || '-';

  return {
    success: true,
    data: {
      bulan: payload.bulan,
      tahun: payload.tahun,
      namaBulan: NAMA_BULAN_ID[payload.bulan - 1] || '',
      jumlahHari,
      kelas: payload.kelas,
      waliKelas,
      rows,
      ringkasan: {
        totalH: sumH,
        totalT: sumT,
        totalS: sumS,
        totalI: sumI,
        totalA: sumA,
        rataRataPersentase:
          rows.length > 0 ? Math.round((sumPersen / rows.length) * 10) / 10 : 0,
      },
    },
  };
}

export async function generateRekapPDF(payload: {
  bulan: number;
  tahun: number;
  kelas: string;
  namaWaliKelas?: string;
}): Promise<ApiResponse<PdfExportResult>> {
  if (!isMockMode()) {
    return runGasFunction<PdfExportResult>('generateRekapPDF', withToken(payload));
  }

  await sleep(600);
  const auth = validateMockSession();
  if (!auth.ok) return auth.response;

  const namaBulan = NAMA_BULAN_ID[payload.bulan - 1] || String(payload.bulan);
  const fileName = `Rekap_Absensi_${payload.kelas}_${namaBulan}_${payload.tahun}.pdf`;

  return {
    success: true,
    data: {
      fileName,
      fileUrl: '#preview-pdf-mock',
      downloadUrl: '',
      fileId: 'MOCK-PDF-ID',
      isMock: true,
    },
    message: `Mode Preview Lokal: File "${fileName}" disimulasikan berhasil dibuat. Di Google Apps Script, PDF diarsipkan secara privat di Drive dan dikirim sebagai Base64 untuk unduhan aman di browser.`,
  };
}

// ============================================================================
// ADMIN CRUD FUNCTIONS (TERPROTEKSI SERVER-SIDE ADMIN SESSION TOKEN)
// ============================================================================

export async function getSiswaList(payload?: {
  kelas?: string;
  status?: string;
  search?: string;
}): Promise<ApiResponse<Siswa[]>> {
  if (!isMockMode()) {
    return runGasFunction<Siswa[]>('getSiswaList', withToken(payload || {}));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  const q = (payload?.search || '').trim().toLowerCase();
  const filtered = mockSiswa
    .filter((s) => {
      if (payload?.kelas && payload.kelas !== 'Semua' && s.kelas !== payload.kelas) return false;
      if (payload?.status && payload.status !== 'Semua' && s.status !== payload.status)
        return false;
      if (
        q &&
        !s.nama.toLowerCase().includes(q) &&
        !s.nisn.toLowerCase().includes(q) &&
        !s.namaOrtu.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama, 'id'));

  return { success: true, data: filtered.map((s) => ({ ...s })) };
}

export async function simpanSiswa(payload: {
  mode: 'create' | 'update';
  originalNisn?: string;
  siswa: Siswa;
  actorRole: UserRole;
}): Promise<ApiResponse<Siswa>> {
  const rawWa = String(payload.siswa.noWaOrtu || '').replace(/\D/g, '');
  const normalizedWa = rawWa.startsWith('0') ? `62${rawWa.slice(1)}` : rawWa;

  const sanitized: Siswa = {
    nisn: sanitizeMockText(payload.siswa.nisn),
    nama: sanitizeMockText(payload.siswa.nama),
    kelas: sanitizeMockText(payload.siswa.kelas),
    jk: payload.siswa.jk === 'P' ? 'P' : 'L',
    namaOrtu: sanitizeMockText(payload.siswa.namaOrtu),
    noWaOrtu: normalizedWa,
    status: payload.siswa.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
  };

  if (!isMockMode()) {
    return runGasFunction<Siswa>('simpanSiswa', withToken({ ...payload, siswa: sanitized }));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  if (!sanitized.nisn || !sanitized.nama || !sanitized.kelas) {
    return { success: false, message: 'NISN, Nama, dan Kelas wajib diisi.' };
  }

  if (payload.mode === 'create') {
    if (mockSiswa.some((s) => s.nisn === sanitized.nisn)) {
      return { success: false, message: `NISN ${sanitized.nisn} sudah terdaftar.` };
    }
    mockSiswa.push(sanitized);
    return { success: true, data: { ...sanitized }, message: 'Data siswa berhasil ditambahkan.' };
  }

  const targetNisn = String(payload.originalNisn || sanitized.nisn);
  const idx = mockSiswa.findIndex((s) => s.nisn === targetNisn);
  if (idx < 0) {
    return { success: false, message: 'Data siswa tidak ditemukan.' };
  }

  if (sanitized.nisn !== targetNisn && mockSiswa.some((s) => s.nisn === sanitized.nisn)) {
    return { success: false, message: `NISN ${sanitized.nisn} sudah digunakan siswa lain.` };
  }

  mockSiswa[idx] = sanitized;
  return { success: true, data: { ...sanitized }, message: 'Data siswa berhasil diperbarui.' };
}

export async function toggleStatusSiswa(payload: {
  nisn: string;
  status: StatusAktif;
  actorRole: UserRole;
}): Promise<ApiResponse<Siswa>> {
  if (!isMockMode()) {
    return runGasFunction<Siswa>('toggleStatusSiswa', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  const idx = mockSiswa.findIndex((s) => s.nisn === String(payload.nisn));
  if (idx < 0) {
    return { success: false, message: 'Siswa tidak ditemukan.' };
  }
  mockSiswa[idx].status = payload.status;
  return {
    success: true,
    data: { ...mockSiswa[idx] },
    message: `Status ${mockSiswa[idx].nama} diubah menjadi ${payload.status}.`,
  };
}

export async function getGuruList(payload: {
  actorRole: UserRole;
}): Promise<ApiResponse<Guru[]>> {
  if (!isMockMode()) {
    return runGasFunction<Guru[]>('getGuruList', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  return { success: true, data: mockGuru.map((g) => ({ ...g })) };
}

export async function simpanGuru(payload: {
  mode: 'create' | 'update';
  guru: Omit<Guru, 'idGuru'> & { idGuru?: string };
  actorRole: UserRole;
}): Promise<ApiResponse<Guru>> {
  const cleanUsername = sanitizeMockText(String(payload.guru.username || '').trim().toLowerCase());
  const cleanPin = sanitizeMockText(payload.guru.pin);
  const cleanEmailGoogle = sanitizeMockText(
    String(payload.guru.emailGoogle || '').trim().toLowerCase()
  );

  if (!isMockMode()) {
    return runGasFunction<Guru>(
      'simpanGuru',
      withToken({
        ...payload,
        guru: {
          ...payload.guru,
          username: cleanUsername,
          pin: cleanPin,
          emailGoogle: cleanEmailGoogle,
        },
      })
    );
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  if (!payload.guru.nama.trim() || !cleanUsername || !cleanPin) {
    return { success: false, message: 'Nama, Username, dan PIN wajib diisi.' };
  }

  if (payload.mode === 'create') {
    if (mockGuru.some((g) => g.username.toLowerCase() === cleanUsername)) {
      return { success: false, message: `Username "${cleanUsername}" sudah digunakan.` };
    }
    if (
      cleanEmailGoogle &&
      mockGuru.some((g) => (g.emailGoogle || '').toLowerCase() === cleanEmailGoogle)
    ) {
      return {
        success: false,
        message: `Email Google "${cleanEmailGoogle}" sudah terdaftar pada akun lain.`,
      };
    }
    const nextNum = mockGuru.length + 1;
    const created: Guru = {
      idGuru: `G${String(nextNum).padStart(3, '0')}`,
      nama: sanitizeMockText(payload.guru.nama),
      username: cleanUsername,
      pin: cleanPin,
      role: payload.guru.role === 'Admin' ? 'Admin' : 'Guru',
      waliKelas: sanitizeMockText(payload.guru.waliKelas.trim() || '-'),
      status: payload.guru.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
      emailGoogle: cleanEmailGoogle,
    };
    mockGuru.push(created);
    return { success: true, data: { ...created }, message: 'Akun guru berhasil ditambahkan.' };
  }

  const idx = mockGuru.findIndex((g) => g.idGuru === payload.guru.idGuru);
  if (idx < 0) {
    return { success: false, message: 'Data guru tidak ditemukan.' };
  }

  if (
    mockGuru.some(
      (g) => g.idGuru !== payload.guru.idGuru && g.username.toLowerCase() === cleanUsername
    )
  ) {
    return { success: false, message: `Username "${cleanUsername}" sudah digunakan akun lain.` };
  }

  if (
    cleanEmailGoogle &&
    mockGuru.some(
      (g) =>
        g.idGuru !== payload.guru.idGuru &&
        (g.emailGoogle || '').toLowerCase() === cleanEmailGoogle
    )
  ) {
    return {
      success: false,
      message: `Email Google "${cleanEmailGoogle}" sudah terdaftar pada akun lain.`,
    };
  }

  mockGuru[idx] = {
    idGuru: mockGuru[idx].idGuru,
    nama: sanitizeMockText(payload.guru.nama),
    username: cleanUsername,
    pin: cleanPin,
    role: payload.guru.role === 'Admin' ? 'Admin' : 'Guru',
    waliKelas: sanitizeMockText(payload.guru.waliKelas.trim() || '-'),
    status: payload.guru.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
    emailGoogle: cleanEmailGoogle,
  };

  return { success: true, data: { ...mockGuru[idx] }, message: 'Data guru berhasil diperbarui.' };
}

export async function toggleStatusGuru(payload: {
  idGuru: string;
  status: StatusAktif;
  actorRole: UserRole;
}): Promise<ApiResponse<Guru>> {
  if (!isMockMode()) {
    return runGasFunction<Guru>('toggleStatusGuru', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  const idx = mockGuru.findIndex((g) => g.idGuru === payload.idGuru);
  if (idx < 0) {
    return { success: false, message: 'Guru tidak ditemukan.' };
  }
  const activeAdmins = mockGuru.filter((g) => g.role === 'Admin' && g.status === 'Aktif').length;
  if (mockGuru[idx].role === 'Admin' && payload.status === 'Nonaktif' && activeAdmins <= 1) {
    return {
      success: false,
      message: 'Tidak dapat menonaktifkan satu-satunya akun Admin yang aktif.',
    };
  }
  mockGuru[idx].status = payload.status;
  return {
    success: true,
    data: { ...mockGuru[idx] },
    message: `Status akun ${mockGuru[idx].nama} diubah menjadi ${payload.status}.`,
  };
}

export async function getLogAbsensi(payload: {
  tanggal: string;
  kelas?: string;
  actorRole: UserRole;
}): Promise<ApiResponse<LogAbsensi[]>> {
  if (!isMockMode()) {
    return runGasFunction<LogAbsensi[]>('getLogAbsensi', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  const list = mockLogs
    .filter(
      (l) =>
        l.tanggal === payload.tanggal &&
        (!payload.kelas || payload.kelas === 'Semua' || l.kelas === payload.kelas)
    )
    .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama, 'id'));

  return { success: true, data: list.map((l) => ({ ...l })) };
}

export async function koreksiLogAbsensi(payload: {
  idLog: string;
  status: StatusAbsensi;
  keterangan: string;
  penginput: string;
  actorRole: UserRole;
}): Promise<ApiResponse<LogAbsensi>> {
  if (!isMockMode()) {
    return runGasFunction<LogAbsensi>('koreksiLogAbsensi', withToken(payload));
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  const idx = mockLogs.findIndex((l) => l.idLog === payload.idLog);
  if (idx < 0) {
    return { success: false, message: 'Log absensi tidak ditemukan.' };
  }

  mockLogs[idx] = {
    ...mockLogs[idx],
    status: payload.status,
    keterangan: sanitizeMockText(payload.keterangan),
    penginput: `${auth.guru.nama} (Koreksi)`,
  };

  return {
    success: true,
    data: { ...mockLogs[idx] },
    message: `Status kehadiran ${mockLogs[idx].nama} berhasil dikoreksi.`,
  };
}

export async function getPengaturan(): Promise<ApiResponse<Pengaturan>> {
  if (!isMockMode()) {
    return runGasFunction<Pengaturan>('getPengaturan', withToken());
  }
  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;
  return { success: true, data: { ...mockPengaturan } };
}

export async function simpanPengaturan(payload: {
  pengaturan: Pengaturan;
  actorRole: UserRole;
}): Promise<ApiResponse<Pengaturan>> {
  const sanitized: Pengaturan = {
    Nama_Sekolah: sanitizeMockText(payload.pengaturan.Nama_Sekolah),
    Alamat_Sekolah: sanitizeMockText(payload.pengaturan.Alamat_Sekolah),
    Nama_Kepsek: sanitizeMockText(payload.pengaturan.Nama_Kepsek),
    NIP_Kepsek: sanitizeMockText(payload.pengaturan.NIP_Kepsek),
    Tahun_Ajaran: sanitizeMockText(payload.pengaturan.Tahun_Ajaran),
    Jam_Masuk: String(payload.pengaturan.Jam_Masuk || '07:15').trim(),
    Logo_URL: sanitizeMockText(payload.pengaturan.Logo_URL),
  };

  if (!isMockMode()) {
    return runGasFunction<Pengaturan>(
      'simpanPengaturan',
      withToken({
        pengaturan: sanitized,
        actorRole: payload.actorRole,
      })
    );
  }

  await sleep(MOCK_DELAY_MS);
  const auth = validateMockSession('Admin');
  if (!auth.ok) return auth.response;

  Object.assign(mockPengaturan, sanitized);
  return {
    success: true,
    data: { ...mockPengaturan },
    message: 'Pengaturan identitas sekolah berhasil disimpan.',
  };
}
