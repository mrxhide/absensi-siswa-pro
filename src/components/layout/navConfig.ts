import {
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  MessageCircle,
  QrCode,
  Settings,
  SlidersHorizontal,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ActiveTab, UserRole } from '../../types';

export interface NavMenuItem {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  section: 'absensi' | 'admin';
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavMenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Beranda',
    description: 'Ringkasan kehadiran siswa harian',
    icon: LayoutDashboard,
    section: 'absensi',
  },
  {
    id: 'checklist',
    label: 'Checklist Cepat',
    shortLabel: 'Checklist',
    description: 'Input absensi manual per kelas',
    icon: ClipboardCheck,
    section: 'absensi',
  },
  {
    id: 'scan-qr',
    label: 'Scan QR Code',
    shortLabel: 'Scan QR',
    description: 'Absensi gerbang via kamera kartu siswa',
    icon: QrCode,
    section: 'absensi',
  },
  {
    id: 'lapor-wa',
    label: 'Lapor WA Ortu',
    shortLabel: 'Lapor WA',
    description: 'Kirim pemberitahuan kehadiran 1 klik',
    icon: MessageCircle,
    section: 'absensi',
  },
  {
    id: 'rekap-pdf',
    label: 'Rekap PDF',
    shortLabel: 'Rekap',
    description: 'Cetak laporan absensi bulanan resmi',
    icon: FileText,
    section: 'absensi',
  },
  {
    id: 'admin-siswa',
    label: 'Kelola Siswa',
    shortLabel: 'Siswa',
    description: 'Data siswa & cetak kartu QR per kelas',
    icon: Users,
    section: 'admin',
    adminOnly: true,
  },
  {
    id: 'admin-guru',
    label: 'Kelola Guru',
    shortLabel: 'Guru',
    description: 'Akun guru, PIN, peran, dan wali kelas',
    icon: UserCheck,
    section: 'admin',
    adminOnly: true,
  },
  {
    id: 'admin-koreksi',
    label: 'Koreksi Absensi',
    shortLabel: 'Koreksi',
    description: 'Ubah status log kehadiran siswa',
    icon: SlidersHorizontal,
    section: 'admin',
    adminOnly: true,
  },
  {
    id: 'admin-pengaturan',
    label: 'Pengaturan Sekolah',
    shortLabel: 'Pengaturan',
    description: 'Identitas sekolah, jam masuk, dan kepala sekolah',
    icon: Settings,
    section: 'admin',
    adminOnly: true,
  },
];

export function getNavItemsForRole(role: UserRole): NavMenuItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === 'Admin');
}

export function getNavItemByTab(tab: ActiveTab): NavMenuItem {
  return NAV_ITEMS.find((item) => item.id === tab) || NAV_ITEMS[0];
}
