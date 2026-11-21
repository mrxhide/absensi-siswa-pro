import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  title?: string;
}

interface ToastContextValue {
  showToast: (variant: ToastVariant, message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; border: string; iconColor: string; titleColor: string }
> = {
  success: {
    bg: 'bg-white',
    border: 'border-[#BBF7D0]',
    iconColor: 'text-[#15803D]',
    titleColor: 'text-[#0F172A]',
  },
  error: {
    bg: 'bg-white',
    border: 'border-[#FECACA]',
    iconColor: 'text-[#B91C1C]',
    titleColor: 'text-[#0F172A]',
  },
  warning: {
    bg: 'bg-white',
    border: 'border-[#FED7AA]',
    iconColor: 'text-[#C2410C]',
    titleColor: 'text-[#0F172A]',
  },
  info: {
    bg: 'bg-white',
    border: 'border-[#BFDBFE]',
    iconColor: 'text-[#0F4C81]',
    titleColor: 'text-[#0F172A]',
  },
};

function ToastIcon({ variant, className }: { variant: ToastVariant; className: string }) {
  if (variant === 'success') return <CheckCircle2 className={className} strokeWidth={1.75} />;
  if (variant === 'error') return <AlertCircle className={className} strokeWidth={1.75} />;
  if (variant === 'warning') return <AlertTriangle className={className} strokeWidth={1.75} />;
  return <Info className={className} strokeWidth={1.75} />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (variant: ToastVariant, message: string, title?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, variant, message, title }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 3800);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      success: (message, title) => showToast('success', message, title),
      error: (message, title) => showToast('error', message, title),
      warning: (message, title) => showToast('warning', message, title),
      info: (message, title) => showToast('info', message, title),
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="no-print fixed top-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 flex flex-col gap-2.5 pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const style = VARIANT_STYLES[item.variant];
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border shadow-lg shadow-slate-900/5 ${style.bg} ${style.border}`}
              >
                <ToastIcon variant={item.variant} className={`w-5 h-5 shrink-0 mt-0.5 ${style.iconColor}`} />
                <div className="flex-1 min-w-0">
                  {item.title && (
                    <p className={`text-sm font-semibold ${style.titleColor}`}>{item.title}</p>
                  )}
                  <p className="text-sm text-[#334155] leading-snug break-words">{item.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Tutup notifikasi"
                  className="p-1 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast harus digunakan di dalam ToastProvider.');
  }
  return ctx;
}
