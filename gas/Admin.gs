/**
 * Admin.gs — CRUD Siswa, CRUD Guru, Koreksi Absensi, dan Pengaturan Sekolah
 * Seluruh operasi divalidasi dengan Server-Side Session Token (Admin), LockService,
 * dan sanitasi Anti-Formula Injection sebelum ditulis ke Google Sheets.
 * Web App Absensi Siswa Pro (Google Apps Script)
 */

// ============================================================================
// 1. KELOLA SISWA
// ============================================================================

/**
 * Mengambil daftar siswa dengan filter opsional (kelas, status, search).
 * Dipanggil oleh: gasApi.getSiswaList(payload)
 */
function getSiswaList(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var req = payload || {};
    var filterKelas = String(req.kelas || '').trim();
    var filterStatus = String(req.status || '').trim();
    var query = String(req.search || '').trim().toLowerCase();

    var allSiswa = readAllSiswa_();
    var result = [];

    for (var i = 0; i < allSiswa.length; i++) {
      var s = allSiswa[i];
      if (filterKelas && filterKelas !== 'Semua' && s.kelas !== filterKelas) continue;
      if (filterStatus && filterStatus !== 'Semua' && s.status !== filterStatus) continue;
      if (query) {
        var matchNama = s.nama.toLowerCase().indexOf(query) >= 0;
        var matchNisn = s.nisn.toLowerCase().indexOf(query) >= 0;
        var matchOrtu = s.namaOrtu.toLowerCase().indexOf(query) >= 0;
        if (!matchNama && !matchNisn && !matchOrtu) continue;
      }
      result.push(stripSiswaInternal_(s));
    }

    result.sort(function (a, b) {
      return a.kelas.localeCompare(b.kelas, 'id') || a.nama.localeCompare(b.nama, 'id');
    });

    return {
      success: true,
      data: result
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat daftar siswa.'
    };
  }
}

/**
 * Menambah atau memperbarui data siswa (NISN & No_WA_Ortu disimpan sebagai String murni).
 * Dipanggil oleh: gasApi.simpanSiswa(payload)
 */
function simpanSiswa(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var mode = req.mode === 'update' ? 'update' : 'create';
    var input = req.siswa || {};

    var sanitized = {
      nisn: sanitizeSheetInput_(toPlainText_(input.nisn)),
      nama: sanitizeSheetInput_(input.nama),
      kelas: sanitizeSheetInput_(input.kelas),
      jk: String(input.jk || 'L').trim().toUpperCase() === 'P' ? 'P' : 'L',
      namaOrtu: sanitizeSheetInput_(input.namaOrtu),
      noWaOrtu: sanitizeWaNumber_(input.noWaOrtu),
      status: String(input.status || 'Aktif').trim() === 'Nonaktif' ? 'Nonaktif' : 'Aktif'
    };

    if (!sanitized.nisn || !sanitized.nama || !sanitized.kelas) {
      return { success: false, message: 'NISN, Nama, dan Kelas wajib diisi.' };
    }

    var sheet = getSheetOrThrow_(SHEET_NAMES.SISWA);
    var allSiswa = readAllSiswa_();

    if (mode === 'create') {
      for (var i = 0; i < allSiswa.length; i++) {
        if (allSiswa[i].nisn === sanitized.nisn) {
          return { success: false, message: 'NISN ' + sanitized.nisn + ' sudah terdaftar.' };
        }
      }

      var newRow = sheet.getLastRow() + 1;
      var range = sheet.getRange(newRow, 1, 1, 7);
      range.setNumberFormat('@');
      range.setValues([[
        sanitized.nisn,
        sanitized.nama,
        sanitized.kelas,
        sanitized.jk,
        sanitized.namaOrtu,
        sanitized.noWaOrtu,
        sanitized.status
      ]]);

      return {
        success: true,
        data: sanitized,
        message: 'Data siswa berhasil ditambahkan.'
      };
    }

    // Mode update
    var targetNisn = toPlainText_(req.originalNisn || sanitized.nisn);
    var targetSiswa = null;

    for (var j = 0; j < allSiswa.length; j++) {
      if (allSiswa[j].nisn === targetNisn) {
        targetSiswa = allSiswa[j];
      }
      if (sanitized.nisn !== targetNisn && allSiswa[j].nisn === sanitized.nisn) {
        return { success: false, message: 'NISN ' + sanitized.nisn + ' sudah digunakan siswa lain.' };
      }
    }

    if (!targetSiswa) {
      return { success: false, message: 'Data siswa tidak ditemukan.' };
    }

    var updateRange = sheet.getRange(targetSiswa.rowNumber, 1, 1, 7);
    updateRange.setNumberFormat('@');
    updateRange.setValues([[
      sanitized.nisn,
      sanitized.nama,
      sanitized.kelas,
      sanitized.jk,
      sanitized.namaOrtu,
      sanitized.noWaOrtu,
      sanitized.status
    ]]);

    return {
      success: true,
      data: sanitized,
      message: 'Data siswa berhasil diperbarui.'
    };
  });
}

/**
 * Mengubah status siswa (Aktif / Nonaktif).
 * Dipanggil oleh: gasApi.toggleStatusSiswa(payload)
 */
function toggleStatusSiswa(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var nisn = toPlainText_(req.nisn);
    var newStatus = String(req.status || 'Aktif').trim() === 'Nonaktif' ? 'Nonaktif' : 'Aktif';

    var sheet = getSheetOrThrow_(SHEET_NAMES.SISWA);
    var allSiswa = readAllSiswa_();
    var target = null;

    for (var i = 0; i < allSiswa.length; i++) {
      if (allSiswa[i].nisn === nisn) {
        target = allSiswa[i];
        break;
      }
    }

    if (!target) {
      return { success: false, message: 'Siswa tidak ditemukan.' };
    }

    var cell = sheet.getRange(target.rowNumber, 7);
    cell.setNumberFormat('@');
    cell.setValue(newStatus);
    target.status = newStatus;

    return {
      success: true,
      data: stripSiswaInternal_(target),
      message: 'Status ' + target.nama + ' diubah menjadi ' + newStatus + '.'
    };
  });
}

// ============================================================================
// 2. KELOLA GURU
// ============================================================================

/**
 * Mengambil daftar seluruh akun Guru & Admin.
 * Dipanggil oleh: gasApi.getGuruList(payload)
 */
function getGuruList(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var allGuru = readAllGuru_();
    var result = [];
    for (var i = 0; i < allGuru.length; i++) {
      result.push(stripGuruInternal_(allGuru[i]));
    }
    return {
      success: true,
      data: result
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat daftar guru.'
    };
  }
}

/**
 * Menambah atau memperbarui akun Guru/Admin (PIN & Email_Google disimpan sebagai String murni).
 * Dipanggil oleh: gasApi.simpanGuru(payload)
 */
function simpanGuru(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var mode = req.mode === 'update' ? 'update' : 'create';
    var input = req.guru || {};

    var nama = sanitizeSheetInput_(input.nama);
    var username = sanitizeSheetInput_(String(input.username || '').trim().toLowerCase());
    var pin = sanitizeSheetInput_(toPlainText_(input.pin));
    var role = String(input.role || 'Guru').trim() === 'Admin' ? 'Admin' : 'Guru';
    var waliKelas = sanitizeSheetInput_(String(input.waliKelas || '-').trim() || '-');
    var status = String(input.status || 'Aktif').trim() === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
    var emailGoogle = sanitizeSheetInput_(String(input.emailGoogle || '').trim().toLowerCase());

    if (!nama || !username || !pin) {
      return { success: false, message: 'Nama, Username, dan PIN wajib diisi.' };
    }

    var sheet = getSheetOrThrow_(SHEET_NAMES.GURU);
    var headerCol8 = String(sheet.getRange(1, 8).getDisplayValue() || '').trim();
    if (!headerCol8) {
      var hCell = sheet.getRange(1, 8);
      hCell.setValue('Email_Google');
      hCell.setBackground('#0F4C81');
      hCell.setFontColor('#FFFFFF');
      hCell.setFontWeight('bold');
      hCell.setVerticalAlignment('middle');
    }

    var allGuru = readAllGuru_();

    if (mode === 'create') {
      var maxNum = 0;
      for (var i = 0; i < allGuru.length; i++) {
        if (allGuru[i].username.toLowerCase() === username) {
          return { success: false, message: 'Username "' + username + '" sudah digunakan.' };
        }
        if (emailGoogle && allGuru[i].emailGoogle && allGuru[i].emailGoogle.toLowerCase() === emailGoogle) {
          return { success: false, message: 'Email Google "' + emailGoogle + '" sudah terdaftar pada akun lain.' };
        }
        var numMatch = allGuru[i].idGuru.match(/(\d+)$/);
        if (numMatch) {
          var parsedNum = Number(numMatch[1]);
          if (parsedNum > maxNum) maxNum = parsedNum;
        }
      }

      var nextId = 'G' + ('000' + String(maxNum + 1)).slice(-3);
      var created = {
        idGuru: nextId,
        nama: nama,
        username: username,
        pin: pin,
        role: role,
        waliKelas: waliKelas,
        status: status,
        emailGoogle: emailGoogle
      };

      var newRow = sheet.getLastRow() + 1;
      var range = sheet.getRange(newRow, 1, 1, 8);
      range.setNumberFormat('@');
      range.setValues([[
        created.idGuru,
        created.nama,
        created.username,
        created.pin,
        created.role,
        created.waliKelas,
        created.status,
        created.emailGoogle
      ]]);

      return {
        success: true,
        data: created,
        message: 'Akun guru berhasil ditambahkan.'
      };
    }

    // Mode update
    var idGuru = toPlainText_(input.idGuru);
    var target = null;

    for (var j = 0; j < allGuru.length; j++) {
      if (allGuru[j].idGuru === idGuru) {
        target = allGuru[j];
      } else {
        if (allGuru[j].username.toLowerCase() === username) {
          return { success: false, message: 'Username "' + username + '" sudah digunakan akun lain.' };
        }
        if (emailGoogle && allGuru[j].emailGoogle && allGuru[j].emailGoogle.toLowerCase() === emailGoogle) {
          return { success: false, message: 'Email Google "' + emailGoogle + '" sudah terdaftar pada akun lain.' };
        }
      }
    }

    if (!target) {
      return { success: false, message: 'Data guru tidak ditemukan.' };
    }

    var updated = {
      idGuru: target.idGuru,
      nama: nama,
      username: username,
      pin: pin,
      role: role,
      waliKelas: waliKelas,
      status: status,
      emailGoogle: emailGoogle
    };

    var updateRange = sheet.getRange(target.rowNumber, 1, 1, 8);
    updateRange.setNumberFormat('@');
    updateRange.setValues([[
      updated.idGuru,
      updated.nama,
      updated.username,
      updated.pin,
      updated.role,
      updated.waliKelas,
      updated.status,
      updated.emailGoogle
    ]]);

    return {
      success: true,
      data: updated,
      message: 'Data guru berhasil diperbarui.'
    };
  });
}

/**
 * Mengubah status akun Guru (Aktif / Nonaktif).
 * Dipanggil oleh: gasApi.toggleStatusGuru(payload)
 */
function toggleStatusGuru(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var idGuru = toPlainText_(req.idGuru);
    var newStatus = String(req.status || 'Aktif').trim() === 'Nonaktif' ? 'Nonaktif' : 'Aktif';

    var sheet = getSheetOrThrow_(SHEET_NAMES.GURU);
    var allGuru = readAllGuru_();
    var target = null;
    var activeAdminCount = 0;

    for (var i = 0; i < allGuru.length; i++) {
      if (allGuru[i].role === 'Admin' && allGuru[i].status === 'Aktif') {
        activeAdminCount++;
      }
      if (allGuru[i].idGuru === idGuru) {
        target = allGuru[i];
      }
    }

    if (!target) {
      return { success: false, message: 'Guru tidak ditemukan.' };
    }

    if (target.role === 'Admin' && newStatus === 'Nonaktif' && activeAdminCount <= 1) {
      return {
        success: false,
        message: 'Tidak dapat menonaktifkan satu-satunya akun Admin yang aktif.'
      };
    }

    var cell = sheet.getRange(target.rowNumber, 7);
    cell.setNumberFormat('@');
    cell.setValue(newStatus);
    target.status = newStatus;

    return {
      success: true,
      data: stripGuruInternal_(target),
      message: 'Status akun ' + target.nama + ' diubah menjadi ' + newStatus + '.'
    };
  });
}

// ============================================================================
// 3. KOREKSI ABSENSI
// ============================================================================

/**
 * Mengambil log absensi pada tanggal & kelas terpilih untuk halaman Koreksi Absensi.
 * Dipanggil oleh: gasApi.getLogAbsensi(payload)
 */
function getLogAbsensi(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var req = payload || {};
    var tanggal = req.tanggal ? String(req.tanggal).trim() : formatDateJakarta_(new Date());
    var kelas = String(req.kelas || '').trim();

    var allLogs = readAllLogs_();
    var result = [];

    for (var i = 0; i < allLogs.length; i++) {
      var l = allLogs[i];
      if (l.tanggal !== tanggal) continue;
      if (kelas && kelas !== 'Semua' && l.kelas !== kelas) continue;
      result.push(stripLogInternal_(l));
    }

    result.sort(function (a, b) {
      return a.kelas.localeCompare(b.kelas, 'id') || a.nama.localeCompare(b.nama, 'id');
    });

    return {
      success: true,
      data: result
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat log absensi.'
    };
  }
}

/**
 * Mengoreksi status dan keterangan log absensi tertentu berdasarkan ID_Log.
 * Dipanggil oleh: gasApi.koreksiLogAbsensi(payload)
 */
function koreksiLogAbsensi(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var idLog = toPlainText_(req.idLog);
    var statusRaw = String(req.status || 'H').trim().toUpperCase();
    var validStatus = ['H', 'T', 'S', 'I', 'A'].indexOf(statusRaw) >= 0 ? statusRaw : 'H';
    var keterangan = sanitizeSheetInput_(req.keterangan);
    var actorName = sanitizeSheetInput_(auth.session.nama || 'Admin');

    if (!idLog) {
      return { success: false, message: 'ID Log tidak valid.' };
    }

    var sheet = getSheetOrThrow_(SHEET_NAMES.LOG);
    var allLogs = readAllLogs_();
    var target = null;

    for (var i = 0; i < allLogs.length; i++) {
      if (allLogs[i].idLog === idLog) {
        target = allLogs[i];
        break;
      }
    }

    if (!target) {
      return { success: false, message: 'Log absensi tidak ditemukan.' };
    }

    var penginputLabel = actorName.indexOf('(Koreksi)') >= 0 ? actorName : actorName + ' (Koreksi)';

    sheet.getRange(target.rowNumber, 7).setNumberFormat('@').setValue(validStatus);
    sheet.getRange(target.rowNumber, 9).setNumberFormat('@').setValue(keterangan);
    sheet.getRange(target.rowNumber, 10).setNumberFormat('@').setValue(penginputLabel);

    target.status = validStatus;
    target.keterangan = keterangan;
    target.penginput = penginputLabel;

    return {
      success: true,
      data: stripLogInternal_(target),
      message: 'Status kehadiran ' + target.nama + ' berhasil dikoreksi.'
    };
  });
}

// ============================================================================
// 4. PENGATURAN SEKOLAH
// ============================================================================

/**
 * Mengambil seluruh konfigurasi sekolah dari tab Pengaturan (khusus Admin).
 * Dipanggil oleh: gasApi.getPengaturan()
 */
function getPengaturan(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    return {
      success: true,
      data: readPengaturanMap_()
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat pengaturan sekolah.'
    };
  }
}

/**
 * Menyimpan perubahan seluruh key pada tab Pengaturan (khusus Admin + Anti-Formula Injection).
 * Dipanggil oleh: gasApi.simpanPengaturan(payload)
 */
function simpanPengaturan(payload) {
  var auth = requireAdminSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var input = req.pengaturan || {};

    var sanitized = {
      Nama_Sekolah: sanitizeSheetInput_(input.Nama_Sekolah),
      Alamat_Sekolah: sanitizeSheetInput_(input.Alamat_Sekolah),
      Nama_Kepsek: sanitizeSheetInput_(input.Nama_Kepsek),
      NIP_Kepsek: sanitizeSheetInput_(toPlainText_(input.NIP_Kepsek)),
      Tahun_Ajaran: sanitizeSheetInput_(input.Tahun_Ajaran),
      Jam_Masuk: normalizeTimeCell_(input.Jam_Masuk, input.Jam_Masuk) || '07:15',
      Logo_URL: sanitizeSheetInput_(input.Logo_URL)
    };

    if (!sanitized.Nama_Sekolah) {
      return { success: false, message: 'Nama Sekolah wajib diisi.' };
    }

    var sheet = getSheetOrThrow_(SHEET_NAMES.PENGATURAN);
    var keys = [
      'Nama_Sekolah',
      'Alamat_Sekolah',
      'Nama_Kepsek',
      'NIP_Kepsek',
      'Tahun_Ajaran',
      'Jam_Masuk',
      'Logo_URL'
    ];

    var existingRowMap = {};
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var existingKeys = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < existingKeys.length; i++) {
        var k = String(existingKeys[i][0] || '').trim();
        if (k) existingRowMap[k] = i + 2;
      }
    }

    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      var val = sanitized[key];
      if (existingRowMap[key]) {
        var cell = sheet.getRange(existingRowMap[key], 2);
        cell.setNumberFormat('@');
        cell.setValue(val);
      } else {
        var nextRow = sheet.getLastRow() + 1;
        var rowRange = sheet.getRange(nextRow, 1, 1, 2);
        rowRange.setNumberFormat('@');
        rowRange.setValues([[key, val]]);
      }
    }

    return {
      success: true,
      data: sanitized,
      message: 'Pengaturan identitas sekolah berhasil disimpan.'
    };
  });
}
