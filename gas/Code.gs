/**
 * Code.gs — Entry Point Web App & Shared Helper Utilities
 * Web App Absensi Siswa Pro (Google Apps Script)
 */

var APP_TIMEZONE = 'Asia/Jakarta';

var SHEET_NAMES = {
  SISWA: 'Data_Siswa',
  GURU: 'Data_Guru',
  LOG: 'Log_Absensi',
  PENGATURAN: 'Pengaturan'
};

var NAMA_BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

var DEFAULT_PENGATURAN = {
  Nama_Sekolah: 'SMP Negeri 1 Nusantara',
  Alamat_Sekolah: 'Jl. Pendidikan No. 45, Kec. Coblong, Kota Bandung, Jawa Barat 40132',
  Nama_Kepsek: 'Drs. H. Bambang Sutrisno, M.Pd.',
  NIP_Kepsek: '196805121994031008',
  Tahun_Ajaran: '2026/2027',
  Jam_Masuk: '07:15',
  Logo_URL: ''
};

/**
 * Entry point Web App Google Apps Script.
 * Merender file 'index.html' hasil build Vite (vite-plugin-singlefile).
 */
function doGet() {
  var title = 'Absensi Siswa Pro';
  try {
    var pengaturan = readPengaturanMap_();
    if (pengaturan && pengaturan.Nama_Sekolah) {
      title = 'Absensi — ' + pengaturan.Nama_Sekolah;
    }
  } catch (err) {
    // Fallback judul default jika database belum diinisialisasi
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * JSON API Dispatcher (doPost) untuk hosting frontend eksternal (misal Vercel HTTPS).
 * Menerima body JSON { action: string, args: any[] } dengan Content-Type text/plain;charset=utf-8.
 * Hanya fungsi yang terdaftar di allowlist eksplisit ALLOWED_API_ACTIONS yang dapat dieksekusi.
 */
function doPost(e) {
  try {
    var rawBody = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!rawBody) {
      return createJsonOutput_({ ok: false, error: 'Request body kosong.' });
    }

    var parsed = JSON.parse(rawBody);
    var action = parsed && typeof parsed.action === 'string' ? parsed.action.trim() : '';
    var args = parsed && Array.isArray(parsed.args) ? parsed.args : [];

    // Allowlist eksplisit untuk 23 fungsi backend yang valid (mencegah arbitrary function invocation)
    var ALLOWED_API_ACTIONS = {
      getPublicPengaturan: getPublicPengaturan,
      loginUser: loginUser,
      loginWithGoogle: loginWithGoogle,
      logoutUser: logoutUser,
      getDaftarKelas: getDaftarKelas,
      getDashboardData: getDashboardData,
      getChecklistData: getChecklistData,
      simpanChecklistAbsensi: simpanChecklistAbsensi,
      prosesScanQR: prosesScanQR,
      getLaporWAData: getLaporWAData,
      getSiswaBelumAbsen: getSiswaBelumAbsen,
      getRekapBulanan: getRekapBulanan,
      generateRekapPDF: generateRekapPDF,
      getSiswaList: getSiswaList,
      simpanSiswa: simpanSiswa,
      toggleStatusSiswa: toggleStatusSiswa,
      getGuruList: getGuruList,
      simpanGuru: simpanGuru,
      toggleStatusGuru: toggleStatusGuru,
      getLogAbsensi: getLogAbsensi,
      koreksiLogAbsensi: koreksiLogAbsensi,
      getPengaturan: getPengaturan,
      simpanPengaturan: simpanPengaturan
    };

    if (
      !action ||
      !Object.prototype.hasOwnProperty.call(ALLOWED_API_ACTIONS, action) ||
      typeof ALLOWED_API_ACTIONS[action] !== 'function'
    ) {
      return createJsonOutput_({
        ok: false,
        error: 'Action API "' + action + '" tidak diizinkan atau tidak ditemukan.'
      });
    }

    var result = ALLOWED_API_ACTIONS[action].apply(null, args);
    return createJsonOutput_({ ok: true, data: result });
  } catch (err) {
    return createJsonOutput_({
      ok: false,
      error: err && err.message ? String(err.message) : 'Terjadi kesalahan pada server API.'
    });
  }
}

/**
 * Helper internal: membuat TextOutput JSON standar untuk doPost().
 */
function createJsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Mengambil Spreadsheet aktif.
 */
function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Spreadsheet aktif tidak ditemukan. Pastikan skrip terikat (bound) ke Google Sheets.');
  }
  return ss;
}

/**
 * Mengambil sheet berdasarkan nama atau melempar pesan error yang ramah.
 */
function getSheetOrThrow_(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(
      'Tab "' + sheetName + '" belum ditemukan. Jalankan fungsi buatDatabaseOtomatis() di Setup.gs terlebih dahulu.'
    );
  }
  return sheet;
}

/**
 * Membungkus operasi tulis/ubah dengan LockService agar aman terhadap input bersamaan.
 */
function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return {
      success: false,
      message: 'Server sedang sibuk memproses input guru lain. Silakan coba beberapa detik lagi.'
    };
  }

  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Terjadi kesalahan saat menyimpan data.'
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseErr) {
      // Abaikan error pelepasan lock
    }
  }
}

/**
 * Format tanggal saat ini (atau Date tertentu) ke YYYY-MM-DD (Asia/Jakarta).
 */
function formatDateJakarta_(dateObj) {
  var d = dateObj instanceof Date ? dateObj : new Date();
  return Utilities.formatDate(d, APP_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Format jam saat ini (atau Date tertentu) ke HH:mm (Asia/Jakarta).
 */
function formatTimeJakarta_(dateObj) {
  var d = dateObj instanceof Date ? dateObj : new Date();
  return Utilities.formatDate(d, APP_TIMEZONE, 'HH:mm');
}

/**
 * Konversi nilai sel menjadi String murni (tanpa menghilangkan angka 0 di depan).
 */
function asString_(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return formatDateJakarta_(val);
  }
  return String(val).trim();
}

/**
 * Normalisasi nilai sel tanggal (baik Date object maupun String) menjadi YYYY-MM-DD.
 */
function normalizeDateCell_(rawVal, displayVal) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return formatDateJakarta_(rawVal);
  }
  var str = String(displayVal !== undefined && displayVal !== null ? displayVal : rawVal || '').trim();
  if (!str) return '';

  // Jika sudah YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Jika format DD/MM/YYYY atau DD-MM-YYYY
  var dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    return dmy[3] + '-' + pad2_(Number(dmy[2])) + '-' + pad2_(Number(dmy[1]));
  }

  // Coba parse Date fallback
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatDateJakarta_(parsed);
  }
  return str;
}

/**
 * Normalisasi nilai sel jam (baik Date object maupun String) menjadi HH:mm.
 */
function normalizeTimeCell_(rawVal, displayVal) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return formatTimeJakarta_(rawVal);
  }
  var str = String(displayVal !== undefined && displayVal !== null ? displayVal : rawVal || '').trim();
  if (!str) return '';

  var hm = str.match(/^(\d{1,2}):(\d{2})/);
  if (hm) {
    return pad2_(Number(hm[1])) + ':' + hm[2];
  }
  return str;
}

function pad2_(num) {
  return num < 10 ? '0' + String(num) : String(num);
}

/**
 * Memastikan string ditulis sebagai teks murni di Google Sheets (mencegah hilangnya angka 0 di depan).
 */
function toPlainText_(val) {
  var s = String(val === null || val === undefined ? '' : val).trim();
  return s;
}

/**
 * Sanitasi Anti-Formula Injection untuk seluruh input teks sebelum ditulis ke Google Sheets.
 * Mencegah eksekusi formula jika teks diawali karakter '=', '+', '-', atau '@'.
 * Tanda '-' tunggal dipertahankan karena digunakan sebagai penanda kosong (misal Wali_Kelas).
 */
function sanitizeSheetInput_(val) {
  var str = String(val === null || val === undefined ? '' : val).trim();
  if (!str) return '';
  str = str.replace(/^[\t\r\n]+/, '');
  if (str !== '-' && /^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * Membersihkan nomor WA menjadi digit angka saja (format 628xxx).
 */
function sanitizeWaNumber_(val) {
  var digits = String(val === null || val === undefined ? '' : val).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.indexOf('0') === 0) {
    return '62' + digits.substring(1);
  }
  return digits;
}

/**
 * Membaca seluruh pengaturan dari tab Pengaturan sebagai objek Pengaturan.
 */
function readPengaturanMap_() {
  var result = {
    Nama_Sekolah: DEFAULT_PENGATURAN.Nama_Sekolah,
    Alamat_Sekolah: DEFAULT_PENGATURAN.Alamat_Sekolah,
    Nama_Kepsek: DEFAULT_PENGATURAN.Nama_Kepsek,
    NIP_Kepsek: DEFAULT_PENGATURAN.NIP_Kepsek,
    Tahun_Ajaran: DEFAULT_PENGATURAN.Tahun_Ajaran,
    Jam_Masuk: DEFAULT_PENGATURAN.Jam_Masuk,
    Logo_URL: DEFAULT_PENGATURAN.Logo_URL
  };

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.PENGATURAN);
  if (!sheet) return result;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;

  var rawValues = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var displayValues = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();

  for (var i = 0; i < displayValues.length; i++) {
    var key = String(displayValues[i][0] || '').trim();
    if (!key || !(key in result)) continue;

    if (key === 'Jam_Masuk') {
      result[key] = normalizeTimeCell_(rawValues[i][1], displayValues[i][1]) || DEFAULT_PENGATURAN.Jam_Masuk;
    } else {
      result[key] = String(displayValues[i][1] || '').trim();
    }
  }

  return result;
}

/**
 * Membaca seluruh baris Data_Siswa menjadi array objek Siswa (semua field aman & string).
 */
function readAllSiswa_() {
  var sheet = getSheetOrThrow_(SHEET_NAMES.SISWA);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var displayValues = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
  var list = [];

  for (var i = 0; i < displayValues.length; i++) {
    var row = displayValues[i];
    var nisn = String(row[0] || '').trim();
    if (!nisn) continue;

    var jkRaw = String(row[3] || 'L').trim().toUpperCase();
    var statusRaw = String(row[6] || 'Aktif').trim();

    list.push({
      rowNumber: i + 2,
      nisn: nisn,
      nama: String(row[1] || '').trim(),
      kelas: String(row[2] || '').trim(),
      jk: jkRaw === 'P' ? 'P' : 'L',
      namaOrtu: String(row[4] || '').trim(),
      noWaOrtu: String(row[5] || '').trim(),
      status: statusRaw === 'Nonaktif' ? 'Nonaktif' : 'Aktif'
    });
  }

  return list;
}

/**
 * Menghapus properti internal rowNumber sebelum mengembalikan objek Siswa ke frontend.
 */
function stripSiswaInternal_(s) {
  return {
    nisn: String(s.nisn),
    nama: String(s.nama),
    kelas: String(s.kelas),
    jk: s.jk === 'P' ? 'P' : 'L',
    namaOrtu: String(s.namaOrtu),
    noWaOrtu: String(s.noWaOrtu),
    status: s.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif'
  };
}

/**
 * Membaca seluruh baris Data_Guru menjadi array objek Guru (mendukung 7 maupun 8 kolom).
 */
function readAllGuru_() {
  var sheet = getSheetOrThrow_(SHEET_NAMES.GURU);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var colCount = Math.min(Math.max(sheet.getLastColumn(), 7), 8);
  var displayValues = sheet.getRange(2, 1, lastRow - 1, colCount).getDisplayValues();
  var list = [];

  for (var i = 0; i < displayValues.length; i++) {
    var row = displayValues[i];
    var idGuru = String(row[0] || '').trim();
    if (!idGuru) continue;

    var roleRaw = String(row[4] || 'Guru').trim();
    var statusRaw = String(row[6] || 'Aktif').trim();
    var emailGoogle = colCount >= 8 ? String(row[7] || '').trim().toLowerCase() : '';

    list.push({
      rowNumber: i + 2,
      idGuru: idGuru,
      nama: String(row[1] || '').trim(),
      username: String(row[2] || '').trim(),
      pin: String(row[3] || '').trim(),
      role: roleRaw === 'Admin' ? 'Admin' : 'Guru',
      waliKelas: String(row[5] || '-').trim() || '-',
      status: statusRaw === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
      emailGoogle: emailGoogle
    });
  }

  return list;
}

function stripGuruInternal_(g) {
  return {
    idGuru: String(g.idGuru),
    nama: String(g.nama),
    username: String(g.username),
    pin: String(g.pin),
    role: g.role === 'Admin' ? 'Admin' : 'Guru',
    waliKelas: String(g.waliKelas),
    status: g.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
    emailGoogle: String(g.emailGoogle || '').trim().toLowerCase()
  };
}

/**
 * Membaca seluruh baris Log_Absensi menjadi array objek LogAbsensi (tanpa objek Date mentah).
 */
function readAllLogs_() {
  var sheet = getSheetOrThrow_(SHEET_NAMES.LOG);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var rawValues = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var displayValues = sheet.getRange(2, 1, lastRow - 1, 10).getDisplayValues();
  var list = [];

  for (var i = 0; i < displayValues.length; i++) {
    var disp = displayValues[i];
    var raw = rawValues[i];
    var idLog = String(disp[0] || '').trim();
    if (!idLog) continue;

    var statusRaw = String(disp[6] || 'H').trim().toUpperCase();
    var validStatus = ['H', 'T', 'S', 'I', 'A'].indexOf(statusRaw) >= 0 ? statusRaw : 'H';
    var metodeRaw = String(disp[7] || 'Checklist').trim();

    list.push({
      rowNumber: i + 2,
      idLog: idLog,
      tanggal: normalizeDateCell_(raw[1], disp[1]),
      jam: normalizeTimeCell_(raw[2], disp[2]),
      nisn: String(disp[3] || '').trim(),
      nama: String(disp[4] || '').trim(),
      kelas: String(disp[5] || '').trim(),
      status: validStatus,
      metode: metodeRaw === 'QR' ? 'QR' : 'Checklist',
      keterangan: String(disp[8] || '').trim(),
      penginput: String(disp[9] || '').trim()
    });
  }

  return list;
}

function stripLogInternal_(l) {
  return {
    idLog: String(l.idLog),
    tanggal: String(l.tanggal),
    jam: String(l.jam),
    nisn: String(l.nisn),
    nama: String(l.nama),
    kelas: String(l.kelas),
    status: String(l.status),
    metode: l.metode === 'QR' ? 'QR' : 'Checklist',
    keterangan: String(l.keterangan),
    penginput: String(l.penginput)
  };
}

/**
 * Escape karakter khusus HTML untuk mencegah XSS / broken HTML saat render PDF.
 */
function escapeHtml_(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
