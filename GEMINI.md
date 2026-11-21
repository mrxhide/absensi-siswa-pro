# GEMINI.md — Web App Absensi Siswa (React + Vite + Tailwind + Google Apps Script)

## 1. Peran & Tujuan Proyek
Bertindaklah sebagai **Senior Creative Frontend Engineer & Google Apps Script Architect**. Tugasmu adalah membangun **Web App Absensi Siswa v1.0** dengan tampilan sekelas aplikasi SaaS modern, menggunakan **React + TypeScript + Vite + Tailwind CSS** yang dikompilasi menjadi satu file HTML (`vite-plugin-singlefile`) untuk dijalankan di atas **Google Apps Script + Google Sheets**.

### Prinsip Produk Siap Jual (Model Beli Putus, 0 Biaya Hosting):
- **Zero-Code untuk Pembeli:** Operator TU/Guru tidak boleh menyentuh kode sama sekali. Semua identitas sekolah (Nama Sekolah, Alamat, Logo, Nama/NIP Kepsek, Jam Masuk, Tahun Ajaran) dikelola lewat halaman **Pengaturan** di dalam aplikasi.
- **Ramah Guru Senior:** Navigasi sederhana, tombol besar dan jelas di layar HP, kontras teks tinggi, dan bahasa Indonesia yang langsung dipahami.
- **Tahan Banting di Lapangan:** Mendukung **2 metode absensi sekaligus**—**Scan QR Code** (untuk gerbang/piket) dan **Checklist Manual** (untuk kelas/cadangan jika siswa lupa kartu).

---

## 2. Arah Visual & Sistem Desain (Modern EdTech SaaS — Anti-AI)
Gunakan gaya **Clean Institutional SaaS** (seperti kombinasi tampilan Linear/Stripe yang terang, rapi, dan formal untuk lingkungan pendidikan).

### Aturan Anti-AI (Wajib Dipatuhi):
- **DILARANG** menggunakan gradien neon gelap (`#0f172a` + ungu/pink glow), efek *glassmorphism* berlebihan, atau emoji (🚀, ✨, 🔥) sebagai ikon UI. Gunakan ikon vektor tipis dan konsisten dari `lucide-react` (`strokeWidth={1.75}`).
- **DILARANG** memakai `alert()` atau `confirm()` bawaan browser. Gunakan komponen **Toast Notification** dan **Custom Modal** yang halus.

### Palet Warna & Tipografi:
- **Background Utama:** `#F8FAFC` (Slate 50)
- **Surface / Kartu:** `#FFFFFF` dengan border halus `1px solid #E2E8F0` dan `rounded-2xl`
- **Teks Utama:** `#0F172A` (Slate 900) | **Teks Sekunder:** `#64748B` (Slate 500)
- **Warna Primer:** `#0F4C81` (Classic Navy Blue) — hover `#0C3D68`
- **Badge Status Absensi (Kontras & Konsisten):**
  - **Hadir (`H`):** Teks `#15803D` / Bg `#DCFCE7`
  - **Terlambat (`T`):** Teks `#C2410C` / Bg `#FFEDD5`
  - **Sakit (`S`):** Teks `#1D4ED8` / Bg `#DBEAFE`
  - **Izin (`I`):** Teks `#A16207` / Bg `#FEF9C3`
  - **Alfa (`A`):** Teks `#B91C1C` / Bg `#FEE2E2`
- **Font:** Muat Google Fonts `Plus Jakarta Sans` (UI & Heading) dan `JetBrains Mono` (NISN, Jam, Angka Statistik).

### Tata Letak & Animasi:
- **Responsif Mobile-First:**
  - Layar Mobile (`< md`): **Bottom Navigation Bar** tetap di bawah (maksimal 4–5 menu utama) + Header ringkas di atas.
  - Layar Desktop/Tablet (`>= md`): **Sidebar** tetap di kiri (`w-64`) + area konten utama dengan `max-w-6xl mx-auto`.
- **Animasi Halus:** Gunakan `framer-motion` hanya untuk transisi perpindahan halaman (`opacity` + `y: 8`, durasi `0.2s`), animasi modal, dan feedback klik tombol. Jangan buat animasi lambat yang menghambat kecepatan input guru.

---

## 3. Tech Stack & Aturan Teknis Khusus (Vite + GAS)
1. **Frontend:**
   - **React 18/19 + TypeScript + Vite**
   - **Tailwind CSS**
   - **`vite-plugin-singlefile`** (WAJIB dikonfigurasi di `vite.config.ts` agar hasil `npm run build` berupa **1 file `dist/index.html`** mandiri yang seluruh JS & CSS-nya sudah ter-inline, siap ditempel/di-push ke Google Apps Script).
   - **Library Pendukung:** `lucide-react`, `framer-motion`, `html5-qrcode` (scan kamera belakang HP), `qrcode` (generate gambar QR Code untuk Cetak Kartu Pelajar).
2. **Routing Aman untuk Iframe GAS:**
   - **DILARANG** menggunakan `BrowserRouter` (akan rusak di dalam iframe Google Apps Script). Gunakan navigasi berbasis **React State** (misal `activeTab`).
3. **Jembatan API & Mode Preview Lokal (`src/services/gasApi.ts`):**
   - Buat wrapper Promise untuk `google.script.run`.
   - **WAJIB sediakan Mock Mode otomatis:** Jika aplikasi dijalankan di `localhost` (`typeof google === 'undefined'`), `gasApi.ts` otomatis mengembalikan data dummy realistis (dengan simulasi delay `300ms`) agar seluruh UI, Login, Checklist, Admin, dan Cetak Kartu bisa dites dan dipreview penuh secara lokal lewat `npm run dev`.
4. **Aturan Backend Google Apps Script (`/gas`):**
   - Tidak boleh memakai sintaks `import`/`export` di file `.gs`.
   - `doGet()` wajib mengatur `.addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')` dan `.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)`.
   - Wajib gunakan `LockService.getScriptLock()` pada setiap fungsi tulis data agar aman saat banyak guru input bersamaan.
   - Wajib gunakan timezone `Asia/Jakarta` (`Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd')`).
   - Pastikan `NISN`, `PIN`, dan `No_WA_Ortu` selalu diproses sebagai **String** agar angka `0` di depan tidak hilang.

---

## 4. Skema Database (Google Sheets — 4 Tab)
1. **`Data_Siswa`**: `NISN` | `Nama` | `Kelas` | `JK` (`L`/`P`) | `Nama_Ortu` | `No_WA_Ortu` (`628xxx`) | `Status` (`Aktif`/`Nonaktif`)
2. **`Data_Guru`**: `ID_Guru` | `Nama` | `Username` | `PIN` | `Role` (`Admin`/`Guru`) | `Wali_Kelas` | `Status`
3. **`Log_Absensi`**: `ID_Log` | `Tanggal` | `Jam` | `NISN` | `Nama` | `Kelas` | `Status` (`H`/`T`/`S`/`I`/`A`) | `Metode` (`Checklist`/`QR`) | `Keterangan` | `Penginput`
4. **`Pengaturan`**: `Key` | `Value` (`Nama_Sekolah`, `Alamat_Sekolah`, `Nama_Kepsek`, `NIP_Kepsek`, `Tahun_Ajaran`, `Jam_Masuk`, `Logo_URL`)

---

## 5. Struktur Folder Proyek
```text
/
├── gas/                      # Kode Backend Google Apps Script (siap copy/push ke GAS)
│   ├── appsscript.json       # Timezone Asia/Jakarta & OAuth scopes
│   ├── Setup.gs              # Fungsi buatDatabaseOtomatis() (generate 4 sheet + dummy)
│   ├── Code.gs               # doGet() merender file 'index' hasil build Vite
│   ├── Auth.gs               # loginUser() & verifikasi role server-side
│   ├── Absensi.gs            # Checklist, Scan QR, Dashboard Stats, Lapor WA
│   ├── Admin.gs              # CRUD Siswa, CRUD Guru, Koreksi Absensi, Pengaturan
│   └── PdfService.gs         # Generate Rekap Bulanan PDF (Kop Surat + TTD) ke Drive
├── src/                      # Kode Frontend React + TypeScript
│   ├── types/index.ts        # Tipe data Siswa, Guru, LogAbsensi, Pengaturan, UserSession
│   ├── services/gasApi.ts    # Wrapper google.script.run + Mock Data untuk localhost
│   ├── components/
│   │   ├── layout/           # Sidebar, BottomNav, Header
│   │   ├── ui/               # Toast, Modal, BadgeStatus, SkeletonLoader
│   │   └── features/         # KartuQRPrint, ScannerModal
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── ChecklistPage.tsx
│   │   ├── ScanQRPage.tsx
│   │   ├── LaporWAPage.tsx
│   │   ├── RekapPDFPage.tsx
│   │   └── admin/            # KelolaSiswaPage, KelolaGuruPage, KoreksiPage, PengaturanPage
│   ├── App.tsx
│   └── main.tsx
├── vite.config.ts            # Konfigurasi React + Tailwind + viteSingleFile()
└── package.json
```

---

## 6. Spesifikasi Fitur Lengkap (Multi-Role)

### A. Autentikasi
- Halaman Login bersih (Logo & Nama Sekolah otomatis diambil dari `Pengaturan`, input `Username` + `PIN`).
- Simpan sesi di `sessionStorage`. Di mode preview lokal (`localhost`), tampilkan tombol bantu kecil untuk uji cepat sebagai `Admin` (`admin`/`1234`) atau `Guru` (`rina`/`1111`).

### B. Fitur Guru / Wali Kelas
1. **Dashboard:** Kartu ringkasan hari ini (Total Siswa, Hadir, Terlambat, Sakit, Izin, Alfa) + persentase kehadiran + daftar cepat siswa tidak hadir.
2. **Checklist Cepat:** Pilih Tanggal & Kelas → seluruh siswa otomatis berstatus `H` (Hadir) → guru cukup ketuk tombol status (`T`/`S`/`I`/`A`) untuk yang tidak hadir + catatan singkat → klik **Simpan**. Jika tanggal & kelas sudah pernah diabsen, muat data lama dan lakukan *update* (cegah duplikat).
3. **Scan QR Code:** Buka kamera belakang HP (`html5-qrcode`) → scan QR berisi `NISN` → bandingkan jam scan dengan `Jam_Masuk` (otomatis `H` atau `T`) → cegah scan ganda di hari yang sama → bunyi *beep* via Web Audio API + kartu hasil scan instan.
4. **Lapor WA Orang Tua (1 Klik):** Daftar siswa berstatus `A`, `T`, `S`, atau `I` di tanggal terpilih dengan tombol kirim WA langsung (`https://wa.me/{No_WA_Ortu}?text=...`) berisi pesan sopan otomatis mencantumkan nama orang tua, sekolah, nama siswa, kelas, tanggal, dan status.
5. **Rekap PDF Bulanan:** Pilih Bulan, Tahun, dan Kelas → `PdfService.gs` menyusun tabel tanggal 1–31 + total H/T/S/I/A + persentase + **Kop Surat Sekolah** + **Kolom Tanda Tangan Kepsek & Wali Kelas** → ekspor PDF ke folder Drive `Rekap_Absensi_PDF` → tampilkan tombol buka/unduh PDF.

### C. Fitur Khusus Admin / Operator TU
1. **Dashboard Sekolah:** Rekap gabungan seluruh kelas + tabel rincian per kelas.
2. **Kelola Siswa & Cetak Kartu QR:** Pencarian, filter kelas, Tambah/Edit/Nonaktifkan siswa, dan tombol **Cetak Kartu QR per Kelas** (tampilan grid A4 siap print via `window.print()` dengan `@media print`).
3. **Kelola Guru:** Tambah/Edit akun, atur PIN, Role (`Admin`/`Guru`), dan `Wali_Kelas`.
4. **Koreksi Absensi:** Filter log berdasarkan Tanggal & Kelas untuk mengubah status kehadiran.
5. **Pengaturan Sekolah:** Form ubah seluruh key di tab `Pengaturan`.

---

## 7. Alur Kerja Agen (Antigravity Build Rules)
1. **Kerjakan Bertahap (Jangan Sekaligus):**
   - **Tahap 1:** Inisialisasi proyek Vite + React + TypeScript + Tailwind CSS + `vite-plugin-singlefile`, buat `src/types/index.ts`, dan `src/services/gasApi.ts` (lengkap dengan Mock Mode).
   - **Tahap 2:** Bangun seluruh file backend di folder `/gas` (`appsscript.json`, `Setup.gs`, `Code.gs`, `Auth.gs`, `Absensi.gs`, `Admin.gs`, `PdfService.gs`).
   - **Tahap 3:** Bangun UI Layout (`LoginPage`, `Sidebar`, `BottomNav`, `DashboardPage`) dan verifikasi tampilan di `npm run dev`.
   - **Tahap 4:** Bangun fitur inti Guru (`ChecklistPage`, `ScanQRPage`, `LaporWAPage`, `RekapPDFPage`).
   - **Tahap 5:** Bangun Panel Admin (`KelolaSiswaPage` + Cetak Kartu QR, `KelolaGuruPage`, `KoreksiPage`, `PengaturanPage`) lalu jalankan `npm run build` untuk memastikan `dist/index.html` terkompilasi bersih tanpa error TypeScript.
2. **Kode Lengkap:** Dilarang menulis placeholder seperti `// TODO` atau `// lanjutkan logika di sini`.
3. **Verifikasi Akhir:** Pastikan `npm run build` sukses menghasilkan satu file `dist/index.html`, tidak ada *horizontal overflow* di lebar layar `360px`, dan seluruh nama fungsi di `gasApi.ts` cocok 100% dengan fungsi di folder `/gas`.