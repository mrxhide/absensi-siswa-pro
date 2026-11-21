import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, X } from 'lucide-react';
import type { ActiveTab, UserSession } from '../../types';
import { getNavItemsForRole, type NavMenuItem } from './navConfig';

interface BottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  user: UserSession;
}

const ADMIN_PRIMARY_TABS: ActiveTab[] = ['dashboard', 'checklist', 'scan-qr', 'admin-siswa'];

export function BottomNav({ activeTab, onSelectTab, user }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const allItems = getNavItemsForRole(user.role);

  const isAdmin = user.role === 'Admin';

  // Guru: 5 menu langsung. Admin: 4 menu utama + 1 tombol "Lainnya" (total 5 item ramah ibu jari)
  const primaryItems: NavMenuItem[] = isAdmin
    ? ADMIN_PRIMARY_TABS.map((id) => allItems.find((item) => item.id === id)!).filter(Boolean)
    : allItems.slice(0, 5);

  const overflowItems: NavMenuItem[] = isAdmin
    ? allItems.filter((item) => !ADMIN_PRIMARY_TABS.includes(item.id))
    : [];

  const isOverflowActive = overflowItems.some((item) => item.id === activeTab);

  const handleSelect = (tab: ActiveTab) => {
    setMoreOpen(false);
    onSelectTab(tab);
  };

  return (
    <>
      {/* Admin Slide-up Drawer untuk menu tambahan di mobile */}
      <AnimatePresence>
        {isAdmin && moreOpen && (
          <div className="no-print md:hidden fixed inset-0 z-40">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 bg-slate-900/40"
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-[68px] left-3 right-3 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl p-4 z-50"
            >
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E2E8F0]">
                <p className="text-sm font-bold text-[#0F172A]">Menu Lainnya</p>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Tutup menu"
                  className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {overflowItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#0F4C81]/10 border-[#0F4C81]/30 text-[#0F4C81]'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                      <span className="text-xs font-semibold truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fixed Bottom Bar */}
      <nav
        aria-label="Navigasi utama mobile"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E2E8F0] shadow-[0_-4px_16px_rgba(15,23,42,0.04)]"
      >
        <div className="grid grid-cols-5 h-16 px-1">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer min-w-0 px-0.5 ${
                  isActive ? 'text-[#0F4C81]' : 'text-[#64748B] active:bg-slate-100'
                }`}
              >
                <div
                  className={`px-3 py-1 rounded-full transition-colors ${
                    isActive ? 'bg-[#0F4C81]/10' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.75} />
                </div>
                <span
                  className={`text-[10px] leading-none truncate max-w-full ${
                    isActive ? 'font-bold text-[#0F4C81]' : 'font-medium'
                  }`}
                >
                  {item.shortLabel}
                </span>
              </button>
            );
          })}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setMoreOpen((prev) => !prev)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer min-w-0 px-0.5 ${
                moreOpen || isOverflowActive
                  ? 'text-[#0F4C81]'
                  : 'text-[#64748B] active:bg-slate-100'
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full transition-colors ${
                  moreOpen || isOverflowActive ? 'bg-[#0F4C81]/10' : ''
                }`}
              >
                <LayoutGrid className="w-5 h-5" strokeWidth={moreOpen || isOverflowActive ? 2 : 1.75} />
              </div>
              <span
                className={`text-[10px] leading-none truncate max-w-full ${
                  moreOpen || isOverflowActive ? 'font-bold text-[#0F4C81]' : 'font-medium'
                }`}
              >
                Lainnya
              </span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
