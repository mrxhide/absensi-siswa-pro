import { GraduationCap, LogOut } from 'lucide-react';
import { isMockMode } from '../../services/gasApi';
import type { ActiveTab, Pengaturan, UserSession } from '../../types';
import { getNavItemByTab } from './navConfig';

interface HeaderProps {
  activeTab: ActiveTab;
  user: UserSession;
  pengaturan: Pengaturan;
  onRequestLogout: () => void;
}

export function Header({ activeTab, user, pengaturan, onRequestLogout }: HeaderProps) {
  const currentNav = getNavItemByTab(activeTab);
  const mockActive = isMockMode();

  return (
    <header className="no-print sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-[#E2E8F0]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Mobile: Logo & School Name; Desktop: Active Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="md:hidden shrink-0">
            {pengaturan.Logo_URL ? (
              <img
                src={pengaturan.Logo_URL}
                alt={pengaturan.Nama_Sekolah}
                className="w-9 h-9 rounded-xl object-contain bg-[#F8FAFC] border border-[#E2E8F0] p-1"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-[#0F4C81] text-white flex items-center justify-center">
                <GraduationCap className="w-5 h-5" strokeWidth={1.75} />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-[#0F172A] truncate leading-tight">
              <span className="md:hidden">{pengaturan.Nama_Sekolah}</span>
              <span className="hidden md:inline">{currentNav.label}</span>
            </h1>
            <p className="text-xs text-[#64748B] truncate leading-tight mt-0.5">
              <span className="md:hidden">{currentNav.label}</span>
              <span className="hidden md:inline">{currentNav.description}</span>
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {mockActive && (
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#0F4C81] text-xs font-semibold">
              Mode Preview Lokal
            </span>
          )}

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-xs font-semibold text-[#0F172A]">{user.nama}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#0F4C81]/10 text-[#0F4C81]">
              {user.role}
            </span>
          </div>

          <button
            type="button"
            onClick={onRequestLogout}
            aria-label="Keluar dari aplikasi"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#475569] bg-white border border-[#E2E8F0] hover:text-[#B91C1C] hover:border-[#FECACA] hover:bg-[#FEE2E2]/40 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
}
