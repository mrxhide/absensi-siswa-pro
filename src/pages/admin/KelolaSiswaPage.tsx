import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Loader2,
  Pencil,
  Phone,
  Power,
  Printer,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { getSiswaList, simpanSiswa, toggleStatusSiswa } from '../../services/gasApi';
import type {
  JenisKelamin,
  Pengaturan,
  Siswa,
  StatusAktif,
  UserSession,
} from '../../types';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { CardListSkeleton } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../components/ui/Toast';
import { KartuQRPrint } from '../../components/features/KartuQRPrint';

interface KelolaSiswaPageProps {
  user: UserSession;
  pengaturan: Pengaturan;
}

function normalizeWaInput(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

const EMPTY_FORM: Siswa = {
  nisn: '',
  nama: '',
  kelas: '',
  jk: 'L',
  namaOrtu: '',
  noWaOrtu: '',
  status: 'Aktif',
};

export function KelolaSiswaPage({ user, pengaturan }: KelolaSiswaPageProps) {
  const toast = useToast();
  const [allSiswa, setAllSiswa] = useState<Siswa[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [search, setSearch] = useState<string>('');
  const [filterKelas, setFilterKelas] = useState<string>('Semua');
  const [filterStatus, setFilterStatus] = useState<string>('Semua');

  // Modal Tambah/Edit
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'update'>('create');
  const [originalNisn, setOriginalNisn] = useState<string>('');
  const [form, setForm] = useState<Siswa>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Modal Konfirmasi Aktif/Nonaktif
  const [toggleTarget, setToggleTarget] = useState<Siswa | null>(null);
  const [toggling, setToggling] = useState<boolean>(false);

  // Pratinjau Cetak Kartu QR
  const [printOpen, setPrintOpen] = useState<boolean>(false);

  const loadSiswa = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSiswaList();
      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal memuat daftar siswa.');
        return;
      }
      setAllSiswa(res.data);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSiswa();
  }, [loadSiswa]);

  const daftarKelas = useMemo(() => {
    const set = new Set<string>();
    allSiswa.forEach((s) => {
      if (s.kelas) set.add(s.kelas);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [allSiswa]);

  const filteredSiswa = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSiswa.filter((s) => {
      if (filterKelas !== 'Semua' && s.kelas !== filterKelas) return false;
      if (filterStatus !== 'Semua' && s.status !== filterStatus) return false;
      if (
        q &&
        !s.nama.toLowerCase().includes(q) &&
        !s.nisn.toLowerCase().includes(q) &&
        !s.namaOrtu.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [allSiswa, search, filterKelas, filterStatus]);

  const openCreateModal = () => {
    setModalMode('create');
    setOriginalNisn('');
    setForm({
      ...EMPTY_FORM,
      kelas: filterKelas !== 'Semua' ? filterKelas : daftarKelas[0] || '',
    });
    setModalOpen(true);
  };

  const openEditModal = (siswa: Siswa) => {
    setModalMode('update');
    setOriginalNisn(siswa.nisn);
    setForm({ ...siswa });
    setModalOpen(true);
  };

  const handleSaveSiswa = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanNisn = String(form.nisn || '').trim();
    const cleanNama = String(form.nama || '').trim();
    const cleanKelas = String(form.kelas || '').trim();
    const normalizedWa = normalizeWaInput(form.noWaOrtu);

    if (!cleanNisn || !cleanNama || !cleanKelas) {
      toast.warning('NISN, Nama Siswa, dan Kelas wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const payloadSiswa: Siswa = {
        nisn: cleanNisn,
        nama: cleanNama,
        kelas: cleanKelas,
        jk: form.jk,
        namaOrtu: String(form.namaOrtu || '').trim(),
        noWaOrtu: normalizedWa,
        status: form.status,
      };

      const res = await simpanSiswa({
        mode: modalMode,
        originalNisn: modalMode === 'update' ? originalNisn : undefined,
        siswa: payloadSiswa,
        actorRole: user.role,
      });

      if (!res.success || !res.data) {
        toast.error(res.message || 'Gagal menyimpan data siswa.');
        return;
      }

      toast.success(res.message || 'Data siswa berhasil disimpan.');
      setModalOpen(false);
      await loadSiswa();
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    const nextStatus: StatusAktif = toggleTarget.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    setToggling(true);
    try {
      const res = await toggleStatusSiswa({
        nisn: toggleTarget.nisn,
        status: nextStatus,
        actorRole: user.role,
      });

      if (!res.success) {
        toast.error(res.message || 'Gagal mengubah status siswa.');
        return;
      }

      toast.success(res.message || `Status siswa diubah menjadi ${nextStatus}.`);
      setToggleTarget(null);
      await loadSiswa();
    } finally {
      setToggling(false);
    }
  };

  const previewWa = normalizeWaInput(form.noWaOrtu);

  return (
    <>
      <div className={`space-y-4 ${printOpen ? 'no-print' : ''}`}>
        {/* Header & Filter */}
        <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#0F4C81]" strokeWidth={1.75} />
                <span>Kelola Data Siswa</span>
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Total{' '}
                <span className="font-mono-num font-semibold text-[#0F172A]">
                  {allSiswa.length}
                </span>{' '}
                siswa terdaftar ·{' '}
                <span className="font-mono-num font-semibold text-[#15803D]">
                  {allSiswa.filter((s) => s.status === 'Aktif').length} Aktif
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={daftarKelas.length === 0}
                onClick={() => setPrintOpen(true)}
                className="flex-1 sm:flex-none h-10 px-3.5 rounded-xl border border-[#0F4C81]/30 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#0F4C81] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>Cetak Kartu QR</span>
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="flex-1 sm:flex-none h-10 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>Tambah Siswa</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search
                className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, NISN, atau ortu..."
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
            </div>

            <select
              aria-label="Filter kelas siswa"
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            >
              <option value="Semua">Semua Kelas</option>
              {daftarKelas.map((kls) => (
                <option key={kls} value={kls}>
                  Kelas {kls}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter status siswa"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            >
              <option value="Semua">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
            </select>
          </div>
        </section>

        {/* Tabel Desktop & Kartu Mobile */}
        {loading ? (
          <CardListSkeleton rows={6} />
        ) : filteredSiswa.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center">
            <p className="text-sm font-bold text-[#0F172A]">Data siswa tidak ditemukan</p>
            <p className="text-xs text-[#64748B] mt-1">
              Coba ubah filter pencarian atau tambahkan data siswa baru.
            </p>
          </div>
        ) : (
          <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                    <th className="py-3 px-4">NISN</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-3">Kelas</th>
                    <th className="py-3 px-3 text-center">JK</th>
                    <th className="py-3 px-4">Orang Tua & WA</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredSiswa.map((s) => (
                    <tr key={s.nisn} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-4 font-mono-num font-semibold text-[#334155]">
                        {s.nisn}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#0F172A]">{s.nama}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#334155] text-xs font-semibold">
                          {s.kelas}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-[#475569]">{s.jk}</td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-[#0F172A] font-medium">{s.namaOrtu || '-'}</p>
                        <p className="text-xs font-mono-num text-[#64748B]">
                          {s.noWaOrtu ? `+${s.noWaOrtu}` : 'Belum ada WA'}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                            s.status === 'Aktif'
                              ? 'bg-[#DCFCE7] text-[#15803D]'
                              : 'bg-slate-100 text-[#64748B]'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-xs font-semibold text-[#334155] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setToggleTarget(s)}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                              s.status === 'Aktif'
                                ? 'border-[#FECACA] text-[#B91C1C] bg-white hover:bg-[#FEE2E2]/50'
                                : 'border-[#BBF7D0] text-[#15803D] bg-white hover:bg-[#DCFCE7]/50'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>{s.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (< md) */}
            <div className="md:hidden divide-y divide-[#E2E8F0]">
              {filteredSiswa.map((s) => (
                <div key={s.nisn} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0F172A]">{s.nama}</p>
                      <p className="text-xs text-[#64748B] font-mono-num mt-0.5">
                        NISN {s.nisn} · {s.kelas} · {s.jk}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-semibold shrink-0 ${
                        s.status === 'Aktif'
                          ? 'bg-[#DCFCE7] text-[#15803D]'
                          : 'bg-slate-100 text-[#64748B]'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>

                  <div className="text-xs text-[#475569] flex items-center gap-2 flex-wrap">
                    <span>Ortu: {s.namaOrtu || '-'}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-mono-num">
                      <Phone className="w-3 h-3" strokeWidth={1.75} />
                      {s.noWaOrtu ? `+${s.noWaOrtu}` : '-'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(s)}
                      className="flex-1 h-9 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#334155] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToggleTarget(s)}
                      className={`flex-1 h-9 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        s.status === 'Aktif'
                          ? 'border-[#FECACA] text-[#B91C1C] bg-white'
                          : 'border-[#BBF7D0] text-[#15803D] bg-white'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>{s.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Modal Tambah / Edit Siswa */}
        <Modal
          open={modalOpen}
          onClose={() => !submitting && setModalOpen(false)}
          title={modalMode === 'create' ? 'Tambah Siswa Baru' : 'Edit Data Siswa'}
          description="Pastikan NISN dan nomor WhatsApp orang tua terisi dengan benar."
          size="md"
        >
          <form id="form-siswa" onSubmit={handleSaveSiswa} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  NISN <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={form.nisn}
                  onChange={(e) => setForm((f) => ({ ...f, nisn: e.target.value }))}
                  placeholder="0091234501"
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                />
                <p className="text-[11px] text-[#64748B] mt-1">
                  Disimpan sebagai teks (angka 0 di depan aman).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Kelas <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="text"
                  list="daftar-kelas-siswa"
                  required
                  value={form.kelas}
                  onChange={(e) => setForm((f) => ({ ...f, kelas: e.target.value }))}
                  placeholder="Contoh: VII-A"
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                />
                <datalist id="daftar-kelas-siswa">
                  {daftarKelas.map((kls) => (
                    <option key={kls} value={kls} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Nama Lengkap Siswa <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                type="text"
                required
                value={form.nama}
                onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                placeholder="Nama lengkap sesuai absen"
                className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Jenis Kelamin
                </label>
                <select
                  value={form.jk}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, jk: e.target.value as JenisKelamin }))
                  }
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                >
                  <option value="L">Laki-laki (L)</option>
                  <option value="P">Perempuan (P)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as StatusAktif }))
                  }
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Nonaktif">Nonaktif</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Nama Orang Tua / Wali
                </label>
                <input
                  type="text"
                  value={form.namaOrtu}
                  onChange={(e) => setForm((f) => ({ ...f, namaOrtu: e.target.value }))}
                  placeholder="Contoh: Hendra Wijaya"
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  No. WhatsApp Orang Tua
                </label>
                <input
                  type="text"
                  inputMode="tel"
                  value={form.noWaOrtu}
                  onChange={(e) => setForm((f) => ({ ...f, noWaOrtu: e.target.value }))}
                  placeholder="0812... atau 62812..."
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                />
                {previewWa && (
                  <p className="text-[11px] text-[#15803D] font-mono-num mt-1">
                    Format simpan: {previewWa}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E2E8F0]">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
                className="h-10 px-4 rounded-xl border border-[#E2E8F0] bg-white hover:bg-slate-50 text-sm font-semibold text-[#334155] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-5 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
                <span>{modalMode === 'create' ? 'Simpan Siswa' : 'Simpan Perubahan'}</span>
              </button>
            </div>
          </form>
        </Modal>

        {/* Confirm Modal Aktif/Nonaktif Siswa */}
        <ConfirmModal
          open={Boolean(toggleTarget)}
          onClose={() => !toggling && setToggleTarget(null)}
          onConfirm={() => void handleConfirmToggle()}
          title={
            toggleTarget?.status === 'Aktif' ? 'Nonaktifkan Siswa?' : 'Aktifkan Kembali Siswa?'
          }
          message={
            toggleTarget?.status === 'Aktif'
              ? `Siswa ${toggleTarget.nama} (${toggleTarget.kelas}) tidak akan muncul di daftar Checklist & Scan QR setelah dinonaktifkan.`
              : `Aktifkan kembali ${toggleTarget?.nama} agar dapat mengikuti pencatatan absensi?`
          }
          confirmLabel={toggleTarget?.status === 'Aktif' ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
          danger={toggleTarget?.status === 'Aktif'}
          loading={toggling}
        />
      </div>

      {/* Pratinjau Cetak Kartu QR A4 */}
      <KartuQRPrint
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        siswaList={allSiswa}
        daftarKelas={daftarKelas}
        initialKelas={filterKelas !== 'Semua' ? filterKelas : daftarKelas[0] || ''}
        pengaturan={pengaturan}
      />
    </>
  );
}
