import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Pencil,
  Power,
  Shield,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  getDaftarKelas,
  getGuruList,
  simpanGuru,
  toggleStatusGuru,
} from '../../services/gasApi';
import type { Guru, StatusAktif, UserRole, UserSession } from '../../types';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { CardListSkeleton } from '../../components/ui/SkeletonLoader';
import { useToast } from '../../components/ui/Toast';

interface KelolaGuruPageProps {
  user: UserSession;
}

interface GuruFormState {
  idGuru?: string;
  nama: string;
  username: string;
  pin: string;
  role: UserRole;
  waliKelas: string;
  status: StatusAktif;
  emailGoogle: string;
}

const EMPTY_GURU_FORM: GuruFormState = {
  nama: '',
  username: '',
  pin: '',
  role: 'Guru',
  waliKelas: '-',
  status: 'Aktif',
  emailGoogle: '',
};

export function KelolaGuruPage({ user }: KelolaGuruPageProps) {
  const toast = useToast();
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [daftarKelas, setDaftarKelas] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'update'>('create');
  const [form, setForm] = useState<GuruFormState>(EMPTY_GURU_FORM);
  const [showPin, setShowPin] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [toggleTarget, setToggleTarget] = useState<Guru | null>(null);
  const [toggling, setToggling] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [guruRes, kelasRes] = await Promise.all([
        getGuruList({ actorRole: user.role }),
        getDaftarKelas(),
      ]);

      if (!guruRes.success || !guruRes.data) {
        toast.error(guruRes.message || 'Gagal memuat daftar guru.');
      } else {
        setGuruList(guruRes.data);
      }

      if (kelasRes.success && kelasRes.data) {
        setDaftarKelas(kelasRes.data);
      }
    } finally {
      setLoading(false);
    }
  }, [user.role, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setModalMode('create');
    setForm(EMPTY_GURU_FORM);
    setShowPin(false);
    setModalOpen(true);
  };

  const openEditModal = (guru: Guru) => {
    setModalMode('update');
    setForm({
      idGuru: guru.idGuru,
      nama: guru.nama,
      username: guru.username,
      pin: guru.pin,
      role: guru.role,
      waliKelas: guru.waliKelas,
      status: guru.status,
      emailGoogle: guru.emailGoogle || '',
    });
    setShowPin(false);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.nama.trim() || !form.username.trim() || !form.pin.trim()) {
      toast.warning('Nama, Username, dan PIN wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await simpanGuru({
        mode: modalMode,
        guru: {
          idGuru: form.idGuru,
          nama: form.nama.trim(),
          username: form.username.trim().toLowerCase(),
          pin: String(form.pin).trim(),
          role: form.role,
          waliKelas: form.role === 'Admin' ? form.waliKelas.trim() || '-' : form.waliKelas.trim() || '-',
          status: form.status,
          emailGoogle: form.emailGoogle.trim().toLowerCase(),
        },
        actorRole: user.role,
      });

      if (!res.success) {
        toast.error(res.message || 'Gagal menyimpan akun guru.');
        return;
      }

      toast.success(res.message || 'Data akun guru berhasil disimpan.');
      setModalOpen(false);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    const nextStatus: StatusAktif = toggleTarget.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    setToggling(true);
    try {
      const res = await toggleStatusGuru({
        idGuru: toggleTarget.idGuru,
        status: nextStatus,
        actorRole: user.role,
      });

      if (!res.success) {
        toast.error(res.message || 'Gagal mengubah status akun.', 'Aksi Ditolak');
        setToggleTarget(null);
        return;
      }

      toast.success(res.message || `Status akun diubah menjadi ${nextStatus}.`);
      setToggleTarget(null);
      await loadData();
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#0F4C81]" strokeWidth={1.75} />
            <span>Kelola Akun Guru & Admin</span>
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Atur akun login, PIN, peran akses (Admin/Guru), dan penugasan wali kelas.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="h-10 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" strokeWidth={1.75} />
          <span>Tambah Guru</span>
        </button>
      </section>

      {/* Tabel Desktop & Kartu Mobile */}
      {loading ? (
        <CardListSkeleton rows={4} />
      ) : (
        <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Nama Guru</th>
                  <th className="py-3 px-4">Username & Email Google</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Wali Kelas</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {guruList.map((g) => (
                  <tr key={g.idGuru} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3.5 px-4 font-mono-num font-semibold text-[#64748B]">
                      {g.idGuru}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#0F172A]">{g.nama}</td>
                    <td className="py-3.5 px-4">
                      <p className="font-mono-num text-sm text-[#0F172A] font-medium">
                        @{g.username}
                      </p>
                      <p className="text-xs text-[#64748B] flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        <span className="truncate max-w-[220px]">
                          {g.emailGoogle || 'Belum ditautkan'}
                        </span>
                      </p>
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                          g.role === 'Admin'
                            ? 'bg-[#EFF6FF] text-[#0F4C81]'
                            : 'bg-slate-100 text-[#475569]'
                        }`}
                      >
                        {g.role === 'Admin' && <Shield className="w-3 h-3" strokeWidth={2} />}
                        {g.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-medium text-[#334155]">{g.waliKelas || '-'}</td>
                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                          g.status === 'Aktif'
                            ? 'bg-[#DCFCE7] text-[#15803D]'
                            : 'bg-slate-100 text-[#64748B]'
                        }`}
                      >
                        {g.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(g)}
                          className="px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-xs font-semibold text-[#334155] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setToggleTarget(g)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                            g.status === 'Aktif'
                              ? 'border-[#FECACA] text-[#B91C1C] bg-white hover:bg-[#FEE2E2]/50'
                              : 'border-[#BBF7D0] text-[#15803D] bg-white hover:bg-[#DCFCE7]/50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>{g.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-[#E2E8F0]">
            {guruList.map((g) => (
              <div key={g.idGuru} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0F172A]">{g.nama}</p>
                    <p className="text-xs text-[#64748B] font-mono-num mt-0.5">
                      {g.idGuru} · @{g.username}
                    </p>
                    {g.emailGoogle && (
                      <p className="text-xs text-[#475569] flex items-center gap-1 mt-1 truncate">
                        <Mail className="w-3 h-3 text-[#64748B] shrink-0" strokeWidth={1.75} />
                        <span className="truncate">{g.emailGoogle}</span>
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold shrink-0 ${
                      g.status === 'Aktif'
                        ? 'bg-[#DCFCE7] text-[#15803D]'
                        : 'bg-slate-100 text-[#64748B]'
                    }`}
                  >
                    {g.status}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-[#475569] flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-md font-semibold ${
                      g.role === 'Admin'
                        ? 'bg-[#EFF6FF] text-[#0F4C81]'
                        : 'bg-slate-100 text-[#475569]'
                    }`}
                  >
                    {g.role}
                  </span>
                  <span>Wali Kelas: {g.waliKelas || '-'}</span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(g)}
                    className="flex-1 h-9 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#334155] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setToggleTarget(g)}
                    className={`flex-1 h-9 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                      g.status === 'Aktif'
                        ? 'border-[#FECACA] text-[#B91C1C] bg-white'
                        : 'border-[#BBF7D0] text-[#15803D] bg-white'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{g.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal Tambah / Edit Guru */}
      <Modal
        open={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title={modalMode === 'create' ? 'Tambah Akun Guru / Admin' : 'Edit Akun Guru / Admin'}
        description="PIN disimpan sebagai teks sehingga angka 0 di awal tetap terjaga."
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Nama Lengkap & Gelar <span className="text-[#B91C1C]">*</span>
            </label>
            <input
              type="text"
              required
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
              placeholder="Contoh: Rina Kartika, S.Pd."
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Username <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                type="text"
                required
                autoCapitalize="none"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Contoh: rina"
                className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                PIN Login <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  required
                  value={form.pin}
                  onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                  placeholder="4–6 digit PIN"
                  className="w-full h-11 pl-3 pr-11 rounded-xl border border-[#CBD5E1] text-sm font-mono-num text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                >
                  {showPin ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">Role Akses</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              >
                <option value="Guru">Guru</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">Wali Kelas</label>
              <input
                type="text"
                list="daftar-kelas-guru"
                value={form.waliKelas}
                onChange={(e) => setForm((f) => ({ ...f, waliKelas: e.target.value }))}
                placeholder="- atau VII-A"
                className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
              <datalist id="daftar-kelas-guru">
                <option value="-" />
                {daftarKelas.map((kls) => (
                  <option key={kls} value={kls} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as StatusAktif }))}
                className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Email Google{' '}
              <span className="font-normal text-[#64748B]">
                (Opsional — untuk Login dengan Google)
              </span>
            </label>
            <div className="relative">
              <Mail
                className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                type="email"
                autoCapitalize="none"
                value={form.emailGoogle}
                onChange={(e) => setForm((f) => ({ ...f, emailGoogle: e.target.value }))}
                placeholder="Contoh: rina@sekolah.sch.id"
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
              />
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
              <span>{modalMode === 'create' ? 'Simpan Akun' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Modal Aktif/Nonaktif Guru */}
      <ConfirmModal
        open={Boolean(toggleTarget)}
        onClose={() => !toggling && setToggleTarget(null)}
        onConfirm={() => void handleConfirmToggle()}
        title={
          toggleTarget?.status === 'Aktif' ? 'Nonaktifkan Akun Guru?' : 'Aktifkan Kembali Akun?'
        }
        message={
          toggleTarget?.status === 'Aktif'
            ? `Akun ${toggleTarget.nama} (@${toggleTarget.username}) tidak akan dapat masuk ke aplikasi setelah dinonaktifkan.`
            : `Aktifkan kembali akun ${toggleTarget?.nama} (@${toggleTarget?.username})?`
        }
        confirmLabel={toggleTarget?.status === 'Aktif' ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
        danger={toggleTarget?.status === 'Aktif'}
        loading={toggling}
      />
    </div>
  );
}
