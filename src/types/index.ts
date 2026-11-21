export type JenisKelamin = 'L' | 'P';

export type StatusAktif = 'Aktif' | 'Nonaktif';

export type UserRole = 'Admin' | 'Guru';

export type StatusAbsensi = 'H' | 'T' | 'S' | 'I' | 'A';

export type MetodeAbsensi = 'Checklist' | 'QR';

export type ActiveTab =
  | 'dashboard'
  | 'checklist'
  | 'scan-qr'
  | 'lapor-wa'
  | 'rekap-pdf'
  | 'admin-siswa'
  | 'admin-guru'
  | 'admin-koreksi'
  | 'admin-pengaturan';

export interface Siswa {
  nisn: string;
  nama: string;
  kelas: string;
  jk: JenisKelamin;
  namaOrtu: string;
  noWaOrtu: string;
  status: StatusAktif;
}

export interface Guru {
  idGuru: string;
  nama: string;
  username: string;
  pin: string;
  role: UserRole;
  waliKelas: string;
  status: StatusAktif;
  emailGoogle?: string;
}

export interface LogAbsensi {
  idLog: string;
  tanggal: string; // YYYY-MM-DD (Asia/Jakarta)
  jam: string; // HH:mm
  nisn: string;
  nama: string;
  kelas: string;
  status: StatusAbsensi;
  metode: MetodeAbsensi;
  keterangan: string;
  penginput: string;
}

export interface Pengaturan {
  Nama_Sekolah: string;
  Alamat_Sekolah: string;
  Nama_Kepsek: string;
  NIP_Kepsek: string;
  Tahun_Ajaran: string;
  Jam_Masuk: string; // HH:mm
  Logo_URL: string;
}

export interface UserSession {
  idGuru: string;
  nama: string;
  username: string;
  role: UserRole;
  waliKelas: string;
  token: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  unauthorized?: boolean;
}

export interface RingkasanAbsensi {
  totalSiswa: number;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alfa: number;
  belumAbsen: number;
  persentaseHadir: number;
}

export interface SiswaTidakHadirItem {
  idLog: string;
  nisn: string;
  nama: string;
  kelas: string;
  status: Exclude<StatusAbsensi, 'H'>;
  jam: string;
  metode: MetodeAbsensi;
  keterangan: string;
  namaOrtu: string;
  noWaOrtu: string;
}

export interface RekapKelasItem {
  kelas: string;
  waliKelas: string;
  totalSiswa: number;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alfa: number;
  belumAbsen: number;
  persentaseHadir: number;
}

export interface DashboardData {
  tanggal: string;
  ringkasan: RingkasanAbsensi;
  siswaTidakHadir: SiswaTidakHadirItem[];
  rekapPerKelas: RekapKelasItem[];
  daftarKelas: string[];
}

export interface ChecklistStudentRow {
  nisn: string;
  nama: string;
  kelas: string;
  jk: JenisKelamin;
  status: StatusAbsensi;
  keterangan: string;
  idLog?: string;
  jam?: string;
  metode?: MetodeAbsensi;
}

export interface ChecklistResponse {
  tanggal: string;
  kelas: string;
  sudahDiabsen: boolean;
  items: ChecklistStudentRow[];
}

export interface ChecklistSubmitItem {
  nisn: string;
  nama: string;
  status: StatusAbsensi;
  keterangan: string;
}

export interface ChecklistSaveResult {
  savedCount: number;
  updatedCount: number;
  totalProcessed: number;
}

export interface ScanQRResult {
  nisn: string;
  nama: string;
  kelas: string;
  status: StatusAbsensi;
  jam: string;
  tanggal: string;
  jamMasuk: string;
  alreadyScanned: boolean;
  keterangan: string;
}

export interface LaporWAItem {
  idLog: string;
  tanggal: string;
  jam: string;
  nisn: string;
  nama: string;
  kelas: string;
  status: Exclude<StatusAbsensi, 'H'>;
  keterangan: string;
  namaOrtu: string;
  noWaOrtu: string;
}

export interface SiswaBelumAbsenItem {
  nisn: string;
  nama: string;
  kelas: string;
  jk: JenisKelamin;
  namaOrtu: string;
  noWaOrtu: string;
}

export interface SiswaBelumAbsenResponse {
  tanggal: string;
  kelas: string;
  totalBelumAbsen: number;
  totalSiswaAktif: number;
  items: SiswaBelumAbsenItem[];
}

export interface RekapBulananSiswaRow {
  nisn: string;
  nama: string;
  jk: JenisKelamin;
  harian: Record<number, StatusAbsensi | ''>;
  totalH: number;
  totalT: number;
  totalS: number;
  totalI: number;
  totalA: number;
  persentaseHadir: number;
}

export interface RekapBulananData {
  bulan: number;
  tahun: number;
  namaBulan: string;
  jumlahHari: number;
  kelas: string;
  waliKelas: string;
  rows: RekapBulananSiswaRow[];
  ringkasan: {
    totalH: number;
    totalT: number;
    totalS: number;
    totalI: number;
    totalA: number;
    rataRataPersentase: number;
  };
}

export interface PdfExportResult {
  fileName: string;
  fileUrl: string;
  downloadUrl: string;
  fileId: string;
  pdfBase64?: string;
  mimeType?: string;
  isMock?: boolean;
}

export const STATUS_META: Record<
  StatusAbsensi,
  {
    code: StatusAbsensi;
    label: string;
    shortLabel: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  H: {
    code: 'H',
    label: 'Hadir',
    shortLabel: 'Hadir',
    textColor: '#15803D',
    bgColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  T: {
    code: 'T',
    label: 'Terlambat',
    shortLabel: 'Telat',
    textColor: '#C2410C',
    bgColor: '#FFEDD5',
    borderColor: '#FED7AA',
  },
  S: {
    code: 'S',
    label: 'Sakit',
    shortLabel: 'Sakit',
    textColor: '#1D4ED8',
    bgColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  I: {
    code: 'I',
    label: 'Izin',
    shortLabel: 'Izin',
    textColor: '#A16207',
    bgColor: '#FEF9C3',
    borderColor: '#FEF08A',
  },
  A: {
    code: 'A',
    label: 'Alfa',
    shortLabel: 'Alfa',
    textColor: '#B91C1C',
    bgColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
};

export const NAMA_BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;
