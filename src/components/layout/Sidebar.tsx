import { GraduationCap, LogOut } from 'lucide-react';
import type { ActiveTab, Pengaturan, UserSession } from '../../types';
import { getNavItemsForRole } from './navConfig';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  user: UserSession;
  pengaturan: Pengaturan;
  onRequestLogout: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  user,
  pengaturan,
  onRequestLogout,
}: SidebarProps) {
  const allItems = getNavItemsForRole(user.role);
  const absensiItems = allItems.filter((item) => item.section === 'absensi');
  const adminItems = allItems.filter((item) => item.section === 'admin');

  const initials = user.nama
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  return (
    <aside className="no-print hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 bg-white border-r border-[#E2E8F0] z-30">
      {/* Brand / School Identity */}
      <div className="px-4 py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          {pengaturan.Logo_URL ? (
            <img
              src={pengaturan.Logo_URL}
              alt={pengaturan.Nama_Sekolah}
              className="w-10 h-10 rounded-xl object-contain bg-[#F8FAFC] border border-[#E2E8F0] p-1 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-[#0F4C81] text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" strokeWidth={1.75} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#0F172A] leading-tight truncate">
              {pengaturan.Nama_Sekolah}
            </p>
            <p className="text-xs text-[#64748B] mt-0.5 font-mono-num">
              TA {pengaturan.Tahun_Ajaran}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div>
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Absensi Harian
          </p>
          <ul className="space-y-1">
            {absensiItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#0F4C81]/10 text-[#0F4C81] font-semibold'
                        : 'text-[#475569] font-medium hover:bg-slate-100/80 hover:text-[#0F172A]'
                    }`}
                  >
                    <Icon
                      className={`w-[18px] h-[18px] shrink-0 ${
                        isActive ? 'text-[#0F4C81]' : 'text-[#64748B]'
                      }`}
                      strokeWidth={1.75}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {adminItems.length > 0 && (
          <div>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
              Administrasi TU
            </p>
            <ul className="space-y-1">
              {adminItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#0F4C81]/10 text-[#0F4C81] font-semibold'
                          : 'text-[#475569] font-medium hover:bg-slate-100/80 hover:text-[#0F172A]'
                      }`}
                    >
                      <Icon
                        className={`w-[18px] h-[18px] shrink-0 ${
                          isActive ? 'text-[#0F4C81]' : 'text-[#64748B]'
                        }`}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* User Card & Logout */}
      <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC]/70">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-9 h-9 rounded-xl bg-[#0F4C81]/10 text-[#0F4C81] font-bold text-xs flex items-center justify-center shrink-0">
            {initials || 'GR'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#0F172A] truncate">{user.nama}</p>
            <p className="text-xs text-[#64748B] truncate">
              {user.role === 'Admin'
                ? 'Admin / Operator TU'
                : user.waliKelas && user.waliKelas !== '-'
                  ? `Wali Kelas ${user.waliKelas}`
                  : 'Guru'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRequestLogout}
          className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#475569] bg-white border border-[#E2E8F0] hover:text-[#B91C1C] hover:border-[#FECACA] hover:bg-[#FEE2E2]/40 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
          <span>Keluar Akun</span>
        </button>
      </div>
    </aside>
  );
}
