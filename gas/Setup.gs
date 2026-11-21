/**
 * Setup.gs — Inisialisasi Otomatis 4 Tab Google Sheets + Data Awal Realistis
 * Web App Absensi Siswa Pro (Google Apps Script)
 */

/**
 * Menambahkan menu kustom di Google Sheets agar Operator TU bisa menjalankan Setup 1 klik.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Absensi Siswa Pro')
      .addItem('Setup Database Otomatis (4 Tab)', 'buatDatabaseOtomatis')
      .addToUi();
  } catch (err) {
    // Abaikan jika dipanggil di luar konteks UI Spreadsheet
  }
}

/**
 * Membuat 4 tab wajib (Data_Siswa, Data_Guru, Log_Absensi, Pengaturan) lengkap dengan
 * header terformat, format kolom Plain Text (@) untuk NISN/PIN/No_WA, dan data contoh
 * jika sheet masih kosong.
 */
function buatDatabaseOtomatis() {
  return withScriptLock_(function () {
    var ss = getSpreadsheet_();

    // 1. Tab Data_Siswa
    var sheetSiswa = ensureSheetWithHeader_(
      ss,
      SHEET_NAMES.SISWA,
      ['NISN', 'Nama', 'Kelas', 'JK', 'Nama_Ortu', 'No_WA_Ortu', 'Status'],
      [1, 6] // Kolom NISN & No_WA_Ortu wajib teks (@)
    );
    if (sheetSiswa.getLastRow() < 2) {
      var dummySiswa = [
        ['0091234501', 'Aditya Pratama Putra', 'VII-A', 'L', 'Hendra Wijaya', '6281234567801', 'Aktif'],
        ['0091234502', 'Aisyah Putri Ramadhani', 'VII-A', 'P', 'Sri Wahyuni', '6281234567802', 'Aktif'],
        ['0091234503', 'Bagas Saputra', 'VII-A', 'L', 'Agus Setiawan', '6281234567803', 'Aktif'],
        ['0091234504', 'Citra Dewi Lestari', 'VII-A', 'P', 'Dedi Kurniawan', '6281234567804', 'Aktif'],
        ['0091234505', 'Dimas Arya Nugroho', 'VII-A', 'L', 'Bambang Hermawan', '6281234567805', 'Aktif'],
        ['0091234506', 'Fauzan Hakim', 'VII-A', 'L', 'Lukman Hakim', '6281234567806', 'Aktif'],
        ['0091234507', 'Nabila Khairunnisa', 'VII-A', 'P', 'Ratna Sari', '6281234567807', 'Aktif'],
        ['0091234508', 'Rizky Ramadhan', 'VII-A', 'L', 'Taufik Hidayat', '6281234567808', 'Aktif'],
        ['0091234509', 'Anisa Nurul Fadilah', 'VII-B', 'P', 'Mulyadi', '6281234567809', 'Aktif'],
        ['0091234510', 'Bayu Aji Santoso', 'VII-B', 'L', 'Slamet Riyadi', '6281234567810', 'Aktif'],
        ['0091234511', 'Dinda Permata Sari', 'VII-B', 'P', 'Yuniarti', '6281234567811', 'Aktif'],
        ['0091234512', 'Fajar Mahendra', 'VII-B', 'L', 'Eko Prasetyo', '6281234567812', 'Aktif'],
        ['0091234513', 'Gita Purnamasari', 'VII-B', 'P', 'Susanto', '6281234567813', 'Aktif'],
        ['0091234514', 'Ilham Akbar', 'VII-B', 'L', 'Syaiful Anwar', '6281234567814', 'Aktif'],
        ['0089876501', 'Alifia Zahra', 'VIII-A', 'P', 'Arif Budiman', '6281322334401', 'Aktif'],
        ['0089876502', 'Bima Sakti Wicaksono', 'VIII-A', 'L', 'Wahyu Widodo', '6281322334402', 'Aktif'],
        ['0089876503', 'Cahya Kamila Putri', 'VIII-A', 'P', 'Rudi Hartono', '6281322334403', 'Aktif'],
        ['0089876504', 'Dani Kurniawan', 'VIII-A', 'L', 'Supriyadi', '6281322334404', 'Aktif']
      ];
      var rangeSiswa = sheetSiswa.getRange(2, 1, dummySiswa.length, 7);
      rangeSiswa.setNumberFormat('@');
      rangeSiswa.setValues(dummySiswa);
    }

    // 2. Tab Data_Guru (8 kolom termasuk Email_Google)
    var sheetGuru = ensureSheetWithHeader_(
      ss,
      SHEET_NAMES.GURU,
      ['ID_Guru', 'Nama', 'Username', 'PIN', 'Role', 'Wali_Kelas', 'Status', 'Email_Google'],
      [1, 3, 4, 8] // ID_Guru, Username, PIN, Email_Google wajib teks (@)
    );
    if (sheetGuru.getLastRow() < 2) {
      var dummyGuru = [
        ['G001', 'Ahmad Fauzi, S.Pd.', 'admin', '1234', 'Admin', '-', 'Aktif', 'admin@sekolah.sch.id'],
        ['G002', 'Rina Kartika, S.Pd.', 'rina', '1111', 'Guru', 'VII-A', 'Aktif', 'rina@sekolah.sch.id'],
        ['G003', 'Budi Santoso, S.Pd.', 'budi', '2222', 'Guru', 'VII-B', 'Aktif', 'budi@sekolah.sch.id'],
        ['G004', 'Siti Rahmawati, M.Pd.', 'siti', '3333', 'Guru', 'VIII-A', 'Aktif', 'siti@sekolah.sch.id']
      ];
      var rangeGuru = sheetGuru.getRange(2, 1, dummyGuru.length, 8);
      rangeGuru.setNumberFormat('@');
      rangeGuru.setValues(dummyGuru);
    }

    // 3. Tab Log_Absensi
    var sheetLog = ensureSheetWithHeader_(
      ss,
      SHEET_NAMES.LOG,
      ['ID_Log', 'Tanggal', 'Jam', 'NISN', 'Nama', 'Kelas', 'Status', 'Metode', 'Keterangan', 'Penginput'],
      [1, 2, 3, 4] // ID_Log, Tanggal, Jam, NISN wajib teks (@)
    );
    if (sheetLog.getLastRow() < 2) {
      var todayStr = formatDateJakarta_(new Date());
      var dummyLogs = [
        ['LOG-00001', todayStr, '06:58', '0091234501', 'Aditya Pratama Putra', 'VII-A', 'H', 'QR', '', 'Rina Kartika, S.Pd.'],
        ['LOG-00002', todayStr, '07:03', '0091234502', 'Aisyah Putri Ramadhani', 'VII-A', 'H', 'QR', '', 'Rina Kartika, S.Pd.'],
        ['LOG-00003', todayStr, '07:22', '0091234503', 'Bagas Saputra', 'VII-A', 'T', 'QR', 'Terlambat 7 menit', 'Rina Kartika, S.Pd.'],
        ['LOG-00004', todayStr, '07:15', '0091234505', 'Dimas Arya Nugroho', 'VII-A', 'S', 'Checklist', 'Demam, izin orang tua', 'Rina Kartika, S.Pd.']
      ];
      var rangeLog = sheetLog.getRange(2, 1, dummyLogs.length, 10);
      rangeLog.setNumberFormat('@');
      rangeLog.setValues(dummyLogs);
    }

    // 4. Tab Pengaturan
    var sheetPengaturan = ensureSheetWithHeader_(
      ss,
      SHEET_NAMES.PENGATURAN,
      ['Key', 'Value'],
      [1, 2]
    );
    if (sheetPengaturan.getLastRow() < 2) {
      var defaultRows = [
        ['Nama_Sekolah', DEFAULT_PENGATURAN.Nama_Sekolah],
        ['Alamat_Sekolah', DEFAULT_PENGATURAN.Alamat_Sekolah],
        ['Nama_Kepsek', DEFAULT_PENGATURAN.Nama_Kepsek],
        ['NIP_Kepsek', DEFAULT_PENGATURAN.NIP_Kepsek],
        ['Tahun_Ajaran', DEFAULT_PENGATURAN.Tahun_Ajaran],
        ['Jam_Masuk', DEFAULT_PENGATURAN.Jam_Masuk],
        ['Logo_URL', DEFAULT_PENGATURAN.Logo_URL]
      ];
      var rangeSet = sheetPengaturan.getRange(2, 1, defaultRows.length, 2);
      rangeSet.setNumberFormat('@');
      rangeSet.setValues(defaultRows);
    }

    // Auto-resize kolom agar rapi dilihat di Google Sheets
    [sheetSiswa, sheetGuru, sheetLog, sheetPengaturan].forEach(function (sh) {
      var colCount = sh.getLastColumn();
      if (colCount > 0) {
        sh.autoResizeColumns(1, colCount);
      }
    });

    try {
      SpreadsheetApp.getUi().alert(
        'Setup Selesai!\n\n4 tab database (Data_Siswa, Data_Guru, Log_Absensi, Pengaturan) siap digunakan.\n\nAkun default:\n- Admin: admin / PIN 1234\n- Guru: rina / PIN 1111'
      );
    } catch (uiErr) {
      // Dijalankan dari editor Apps Script tanpa UI aktif
    }

    return {
      success: true,
      message: 'Database 4 tab berhasil diinisialisasi.'
    };
  });
}

/**
 * Helper internal: memastikan tab ada, memiliki header terformat, dan kolom teks diset '@'.
 */
function ensureSheetWithHeader_(ss, name, headers, textColumns) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground('#0F4C81');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setVerticalAlignment('middle');
    sheet.setRowHeight(1, 32);
    sheet.setFrozenRows(1);
  } else {
    // Aman untuk sheet lama: tambahkan kolom header baru (misal Email_Google) jika belum ada
    var existingColCount = Math.max(sheet.getLastColumn(), 1);
    var existingHeaders = sheet.getRange(1, 1, 1, existingColCount).getDisplayValues()[0];
    for (var h = 0; h < headers.length; h++) {
      var targetCol = h + 1;
      var currentHeader = String(existingHeaders[h] || '').trim();
      if (!currentHeader) {
        var missingCell = sheet.getRange(1, targetCol);
        missingCell.setValue(headers[h]);
        missingCell.setBackground('#0F4C81');
        missingCell.setFontColor('#FFFFFF');
        missingCell.setFontWeight('bold');
        missingCell.setVerticalAlignment('middle');
      }
    }
  }

  if (textColumns && textColumns.length > 0) {
    var maxRows = Math.max(sheet.getMaxRows(), 100);
    for (var i = 0; i < textColumns.length; i++) {
      sheet.getRange(2, textColumns[i], maxRows - 1, 1).setNumberFormat('@');
    }
  }

  return sheet;
}
