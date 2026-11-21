import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getPublicPengaturan,
  logoutUser,
  setAuthToken,
  setUnauthorizedHandler,
} from './services/gasApi';
import type { ActiveTab, Pengaturan, UserSession } from './types';
import { ToastProvider, useToast } from './components/ui/Toast';
import { ConfirmModal } from './components/ui/Modal';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { Header } from './components/layout/Header';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChecklistPage, type ChecklistPreset } from './pages/ChecklistPage';
import { ScanQRPage } from './pages/ScanQRPage';
import { LaporWAPage } from './pages/LaporWAPage';
import { RekapPDFPage } from './pages/RekapPDFPage';
import { KelolaSiswaPage } from './pages/admin/KelolaSiswaPage';
import { KelolaGuruPage } from './pages/admin/KelolaGuruPage';
import { KoreksiPage } from './pages/admin/KoreksiPage';
import { PengaturanPage } from './pages/admin/PengaturanPage';

const SESSION_STORAGE_KEY = 'absensi_siswa_pro_session_v1';

const FALLBACK_PENGATURAN: Pengaturan = {
  Nama_Sekolah: 'Absensi Siswa Pro',
  Alamat_Sekolah: '',
  Nama_Kepsek: '',
  NIP_Kepsek: '',
  Tahun_Ajaran: '2026/2027',
  Jam_Masuk: '07:15',
  Logo_URL: '',
};

function readSavedSession(): UserSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    if (parsed && parsed.username && parsed.role && parsed.token) {
      setAuthToken(parsed.token);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function isAdminTab(tab: ActiveTab): boolean {
  return tab.startsWith('admin-');
}

function AppShell() {
  const toast = useToast();
  const [session, setSession] = useState<UserSession | null>(() => readSavedSession());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [checklistPreset, setChecklistPreset] = useState<ChecklistPreset | null>(null);
  const [pengaturan, setPengaturan] = useState<Pengaturan>(FALLBACK_PENGATURAN);
  const [loadingPengaturan, setLoadingPengaturan] = useState<boolean>(true);
  const [logoutModalOpen, setLogoutModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    void getPublicPengaturan().then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setPengaturan(res.data);
        document.title = `Absensi — ${res.data.Nama_Sekolah}`;
      }
      setLoadingPengaturan(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // Tangani kadaluwarsa sesi server-side secara otomatis
  useEffect(() => {
    setUnauthorizedHandler((msg) => {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Abaikan
      }
      setAuthToken(null);
      setSession(null);
      setActiveTab('dashboard');
      toast.warning(msg || 'Sesi Anda telah berakhir. Silakan masuk kembali.', 'Sesi Berakhir');
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [toast]);

  // Proteksi role: jika sesi bukan Admin mencoba membuka tab admin-*, kembalikan ke Dashboard
  useEffect(() => {
    if (session && session.role !== 'Admin' && isAdminTab(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [session, activeTab]);

  const handleSelectTab = (
    tab: ActiveTab,
    options?: { kelas?: string; tanggal?: string; onlyBelumAbsen?: boolean }
  ) => {
    if (session && session.role !== 'Admin' && isAdminTab(tab)) {
      setActiveTab('dashboard');
      return;
    }
    if (tab === 'checklist' && options) {
      setChecklistPreset({
        kelas: options.kelas,
        tanggal: options.tanggal,
        onlyBelumAbsen: options.onlyBelumAbsen,
        nonce: Date.now(),
      });
    } else if (tab !== 'checklist') {
      setChecklistPreset(null);
    }
    setActiveTab(tab);
  };

  const handleLoginSuccess = (newSession: UserSession) => {
    setAuthToken(newSession.token);
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    } catch {
      // Abaikan jika sessionStorage dibatasi
    }
    setSession(newSession);
    setChecklistPreset(null);
    setActiveTab('dashboard');
  };

  const handlePengaturanUpdated = (updated: Pengaturan) => {
    setPengaturan(updated);
    if (updated.Nama_Sekolah) {
      document.title = `Absensi — ${updated.Nama_Sekolah}`;
    }
  };

  const handleConfirmLogout = () => {
    void logoutUser();
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Abaikan
    }
    setAuthToken(null);
    setLogoutModalOpen(false);
    setSession(null);
    setChecklistPreset(null);
    setActiveTab('dashboard');
    toast.info('Anda telah keluar dari aplikasi.');
  };

  if (!session) {
    return (
      <LoginPage
        pengaturan={pengaturan}
        loadingPengaturan={loadingPengaturan}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const effectiveTab: ActiveTab =
    session.role !== 'Admin' && isAdminTab(activeTab) ? 'dashboard' : activeTab;

  const renderActivePage = () => {
    switch (effectiveTab) {
      case 'dashboard':
        return (
          <DashboardPage
            user={session}
            pengaturan={pengaturan}
            onNavigate={handleSelectTab}
          />
        );
      case 'checklist':
        return <ChecklistPage user={session} preset={checklistPreset} />;
      case 'scan-qr':
        return <ScanQRPage user={session} pengaturan={pengaturan} />;
      case 'lapor-wa':
        return <LaporWAPage user={session} pengaturan={pengaturan} />;
      case 'rekap-pdf':
        return <RekapPDFPage user={session} pengaturan={pengaturan} />;
      case 'admin-siswa':
        return session.role === 'Admin' ? (
          <KelolaSiswaPage user={session} pengaturan={pengaturan} />
        ) : (
          <DashboardPage
            user={session}
            pengaturan={pengaturan}
            onNavigate={handleSelectTab}
          />
        );
      case 'admin-guru':
        return session.role === 'Admin' ? (
          <KelolaGuruPage user={session} />
        ) : (
          <DashboardPage
            user={session}
            pengaturan={pengaturan}
            onNavigate={handleSelectTab}
          />
        );
      case 'admin-koreksi':
        return session.role === 'Admin' ? (
          <KoreksiPage user={session} />
        ) : (
          <DashboardPage
            user={session}
            pengaturan={pengaturan}
            onNavigate={handleSelectTab}
          />
        );
      case 'admin-pengaturan':
        return session.role === 'Admin' ? (
          <PengaturanPage
            user={session}
            initialPengaturan={pengaturan}
            onPengaturanUpdated={handlePengaturanUpdated}
          />
        ) : (
          <DashboardPage
            user={session}
            pengaturan={pengaturan}
            onNavigate={handleSelectTab}
          />
        );
      default:
        return (
          <DashboardPage
            user={session}
            pengaturan={pengaturan}
            onNavigate={handleSelectTab}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <Sidebar
        activeTab={effectiveTab}
        onSelectTab={(tab) => handleSelectTab(tab)}
        user={session}
        pengaturan={pengaturan}
        onRequestLogout={() => setLogoutModalOpen(true)}
      />

      <div className="md:pl-64 flex flex-col min-h-screen min-w-0 print:pl-0">
        <Header
          activeTab={effectiveTab}
          user={session}
          pengaturan={pengaturan}
          onRequestLogout={() => setLogoutModalOpen(true)}
        />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-8 min-w-0 print:max-w-none print:p-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={effectiveTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="min-w-0"
            >
              {renderActivePage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav
        activeTab={effectiveTab}
        onSelectTab={(tab) => handleSelectTab(tab)}
        user={session}
      />

      <ConfirmModal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Konfirmasi Keluar"
        message={`Apakah Anda yakin ingin keluar dari akun ${session.nama}?`}
        confirmLabel="Ya, Keluar"
        cancelLabel="Batal"
        danger
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
