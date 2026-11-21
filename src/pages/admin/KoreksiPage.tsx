import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Calendar,
  ClipboardList,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  getDaftarKelas,
  getJakartaDateString,
  getLogAbsensi,
  koreksiLogAbsensi,
} from '../../services/gasApi';
import {
  STATUS_META,
  type LogAbsensi,
  type StatusAbsensi,
  type UserSession,
} from '../../types';
import { BadgeStatus } from '../../components/ui/BadgeStatus';
import { Modal } from '../../components/ui/Modal';
import { CardListSkeleton } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../components/ui/Toast';

interface KoreksiPageProps {
  user: UserSession;
}

const STATUS_OPTIONS: StatusAbsensi[] = ['H', 'T', 'S', 'I', 'A'];

export function KoreksiPage({ user }: KoreksiPageProps) {
  const toast = useToast();
  const [tanggal, setTanggal] = useState<string>(() => getJakartaDateString());
  const [daftarKelas, setDaftarKelas] = useState<string[]>([]);
  const [kelas, setKelas] = useState<string>('Semua');
  const [search, setSearch] = useState<string>('');

  const [logs, setLogs] = useState<LogAbsensi[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal Koreksi
  const [editTarget, setEditTarget] = useState<LogAbsensi | null>(null);
  const [newStatus, setNewStatus] = useState<StatusAbsensi>('H');
  const [newKeterangan, setNewKeterangan] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

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

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLogAbsensi({
        tanggal,
        kelas: kelas === 'Semua' ? undefined : kelas,
        actorRole: user.role,
      });
      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal memuat log absensi.');
        return;
      }
      setLogs(res.data);
    } finally {
      setLoading(false);
    }
  }, [tanggal, kelas, user.role, toast]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.nama.toLowerCase().includes(q) ||
        l.nisn.toLowerCase().includes(q) ||
        l.penginput.toLowerCase().includes(q)
    );
  }, [logs, search]);

  const openEditModal = (log: LogAbsensi) => {
    setEditTarget(log);
    setNewStatus(log.status);
    setNewKeterangan(log.keterangan);
  };

  const handleSaveKoreksi = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editTarget || saving) return;

    setSaving(true);
    try {
      const res = await koreksiLogAbsensi({
        idLog: editTarget.idLog,
        status: newStatus,
        keterangan: newKeterangan.trim(),
        penginput: user.nama,
        actorRole: user.role,
      });

      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal menyimpan koreksi absensi.');
        return;
      }

      const updated = res.data;
      setLogs((prev) => prev.map((item) => (item.idLog === updated.idLog ? updated : item)));
      toast.success(res.message || `Status ${updated.nama} berhasil diperbarui.`);
      setEditTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-[#0F4C81]" strokeWidth={1.75} />
              <span>Koreksi Log Absensi</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Perbaiki status atau catatan kehadiran siswa yang salah input pada tanggal tertentu.
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadLogs()}
            className="self-start sm:self-auto h-9 px-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-xs font-semibold text-[#334155] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            <span>Muat Ulang</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Calendar
              className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              strokeWidth={1.75}
            />
            <input
              type="date"
              aria-label="Filter tanggal log"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>

          <select
            aria-label="Filter kelas log"
            value={kelas}
            onChange={(e) => setKelas(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
          >
            <option value="Semua">Semua Kelas</option>
            {daftarKelas.map((kls) => (
              <option key={kls} value={kls}>
                Kelas {kls}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search
              className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama siswa / NISN..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>
        </div>
      </section>

      {/* Daftar Log */}
      {loading ? (
        <CardListSkeleton rows={5} />
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[#64748B] flex items-center justify-center mx-auto mb-3">
            <ClipboardList className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-bold text-[#0F172A]">Belum ada log absensi pada filter ini</p>
          <p className="text-xs text-[#64748B] mt-1">
            Pilih tanggal atau kelas lain untuk melihat riwayat pencatatan absensi.
          </p>
        </div>
      ) : (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  <th className="py-3 px-4">Siswa</th>
                  <th className="py-3 px-3">Kelas</th>
                  <th className="py-3 px-3">Jam & Metode</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4">Penginput</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredLogs.map((log) => (
                  <tr key={log.idLog} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-bold text-[#0F172A]">{log.nama}</p>
                      <p className="text-xs font-mono-num text-[#64748B]">{log.nisn}</p>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#334155] text-xs font-semibold">
                        {log.kelas}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <p className="font-mono-num text-xs font-semibold text-[#0F172A]">
                        {log.jam} WIB
                      </p>
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[10px] font-semibold text-[#475569]">
                        {log.metode}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <BadgeStatus status={log.status} display="both" size="sm" />
                    </td>
                    <td className="py-3 px-4 text-xs text-[#475569] max-w-xs break-words">
                      {log.keterangan || '-'}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#475569]">{log.penginput}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(log)}
                        className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#EFF6FF] hover:text-[#0F4C81] hover:border-[#0F4C81]/30 text-xs font-semibold text-[#334155] inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>Ubah</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-[#E2E8F0]">
            {filteredLogs.map((log) => (
              <div key={log.idLog} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0F172A]">{log.nama}</p>
                    <p className="text-xs font-mono-num text-[#64748B] mt-0.5">
                      {log.kelas} · {log.jam} WIB · {log.metode}
                    </p>
                  </div>
                  <BadgeStatus status={log.status} display="both" size="sm" />
                </div>

                {log.keterangan && (
                  <p className="text-xs text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5">
                    {log.keterangan}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-[#64748B] truncate">
                    Oleh: {log.penginput}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditModal(log)}
                    className="h-8 px-3 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#0F4C81] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Ubah</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal Koreksi Status */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => !saving && setEditTarget(null)}
        title="Koreksi Status Kehadiran"
        description={
          editTarget
            ? `${editTarget.nama} (${editTarget.kelas}) · ${editTarget.tanggal} pukul ${editTarget.jam} WIB`
            : undefined
        }
        size="sm"
      >
        {editTarget && (
          <form onSubmit={handleSaveKoreksi} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-2">
                Pilih Status Baru
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {STATUS_OPTIONS.map((code) => {
                  const meta = STATUS_META[code];
                  const active = newStatus === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setNewStatus(code)}
                      style={
                        active
                          ? {
                              backgroundColor: meta.bgColor,
                              color: meta.textColor,
                              borderColor: meta.textColor,
                            }
                          : undefined
                      }
                      className={`h-11 rounded-xl border text-center flex flex-col items-center justify-center transition-colors cursor-pointer ${
                        active
                          ? 'font-bold'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] font-semibold hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-sm font-mono-num leading-none">{code}</span>
                      <span className="text-[9px] leading-none mt-1">{meta.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Keterangan / Alasan Koreksi
              </label>
              <textarea
                rows={3}
                value={newKeterangan}
                onChange={(e) => setNewKeterangan(e.target.value)}
                placeholder="Contoh: Surat keterangan dokter baru diterima..."
                className="w-full p-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E2E8F0]">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditTarget(null)}
                className="h-10 px-4 rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#334155] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
                <span>Simpan Koreksi</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
