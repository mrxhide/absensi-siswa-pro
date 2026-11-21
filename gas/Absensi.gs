/**
 * Absensi.gs — Dashboard Statistik, Checklist Cepat, Scan QR, Daftar Kelas, dan Lapor WA
 * Seluruh endpoint memvalidasi Server-Side Session Token dan mensanitasi teks input.
 * Web App Absensi Siswa Pro (Google Apps Script)
 */

/**
 * Mengambil daftar kelas unik terurut dari Data_Siswa.
 * Dipanggil oleh: gasApi.getDaftarKelas()
 */
function getDaftarKelas(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var siswaList = readAllSiswa_();
    var kelasSet = {};
    var daftarKelas = [];

    for (var i = 0; i < siswaList.length; i++) {
      var k = siswaList[i].kelas;
      if (k && !kelasSet[k]) {
        kelasSet[k] = true;
        daftarKelas.push(k);
      }
    }

    daftarKelas.sort(function (a, b) {
      return a.localeCompare(b, 'id');
    });

    return {
      success: true,
      data: daftarKelas
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat daftar kelas.'
    };
  }
}

/**
 * Helper internal: menghitung ringkasan statistik absensi dari array siswa aktif & log harian.
 */
function computeRingkasan_(siswaAktif, logsForDate) {
  var totalSiswa = siswaAktif.length;
  var nisnSet = {};
  for (var i = 0; i < siswaAktif.length; i++) {
    nisnSet[siswaAktif[i].nisn] = true;
  }

  var hadir = 0;
  var terlambat = 0;
  var sakit = 0;
  var izin = 0;
  var alfa = 0;
  var recordedNisn = {};

  for (var j = 0; j < logsForDate.length; j++) {
    var log = logsForDate[j];
    if (!nisnSet[log.nisn]) continue;
    recordedNisn[log.nisn] = log.status;
  }

  var recordedCount = 0;
  for (var nisn in recordedNisn) {
    if (!Object.prototype.hasOwnProperty.call(recordedNisn, nisn)) continue;
    recordedCount++;
    var st = recordedNisn[nisn];
    if (st === 'H') hadir++;
    else if (st === 'T') terlambat++;
    else if (st === 'S') sakit++;
    else if (st === 'I') izin++;
    else if (st === 'A') alfa++;
  }

  var belumAbsen = Math.max(0, totalSiswa - recordedCount);
  var totalMasuk = hadir + terlambat;
  var persentaseHadir = totalSiswa > 0 ? Math.round((totalMasuk / totalSiswa) * 1000) / 10 : 0;

  return {
    totalSiswa: totalSiswa,
    hadir: hadir,
    terlambat: terlambat,
    sakit: sakit,
    izin: izin,
    alfa: alfa,
    belumAbsen: belumAbsen,
    persentaseHadir: persentaseHadir
  };
}

/**
 * Mengambil data lengkap Dashboard (ringkasan, siswa tidak hadir, dan rekap per kelas).
 * Role & waliKelas dibaca langsung dari sesi server terverifikasi.
 * Dipanggil oleh: gasApi.getDashboardData(payload)
 */
function getDashboardData(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var req = payload || {};
    var tanggal = req.tanggal ? String(req.tanggal).trim() : formatDateJakarta_(new Date());
    var role = auth.session.role;
    var waliKelas = auth.session.waliKelas;
    var filterKelas = String(req.filterKelas || '').trim();

    var allSiswa = readAllSiswa_();
    var allGuru = readAllGuru_();
    var allLogs = readAllLogs_();

    var siswaAktifAll = [];
    var siswaMap = {};
    var kelasSet = {};
    var daftarKelas = [];

    for (var i = 0; i < allSiswa.length; i++) {
      var s = allSiswa[i];
      siswaMap[s.nisn] = s;
      if (s.kelas && !kelasSet[s.kelas]) {
        kelasSet[s.kelas] = true;
        daftarKelas.push(s.kelas);
      }
      if (s.status === 'Aktif') {
        siswaAktifAll.push(s);
      }
    }
    daftarKelas.sort(function (a, b) {
      return a.localeCompare(b, 'id');
    });

    var logsDate = [];
    for (var j = 0; j < allLogs.length; j++) {
      if (allLogs[j].tanggal === tanggal) {
        logsDate.push(allLogs[j]);
      }
    }

    var targetKelas = filterKelas;
    if (role === 'Guru' && !targetKelas && waliKelas && waliKelas !== '-') {
      targetKelas = waliKelas;
    }

    var scopedSiswa = [];
    for (var k = 0; k < siswaAktifAll.length; k++) {
      if (!targetKelas || siswaAktifAll[k].kelas === targetKelas) {
        scopedSiswa.push(siswaAktifAll[k]);
      }
    }

    var ringkasan = computeRingkasan_(scopedSiswa, logsDate);

    var siswaTidakHadir = [];
    for (var m = 0; m < logsDate.length; m++) {
      var l = logsDate[m];
      if (l.status === 'H') continue;
      if (targetKelas && l.kelas !== targetKelas) continue;

      var infoSiswa = siswaMap[l.nisn];
      siswaTidakHadir.push({
        idLog: String(l.idLog),
        nisn: String(l.nisn),
        nama: String(l.nama),
        kelas: String(l.kelas),
        status: String(l.status),
        jam: String(l.jam),
        metode: l.metode === 'QR' ? 'QR' : 'Checklist',
        keterangan: String(l.keterangan),
        namaOrtu: infoSiswa ? String(infoSiswa.namaOrtu) : '-',
        noWaOrtu: infoSiswa ? String(infoSiswa.noWaOrtu) : ''
      });
    }

    siswaTidakHadir.sort(function (a, b) {
      return a.kelas.localeCompare(b.kelas, 'id') || a.nama.localeCompare(b.nama, 'id');
    });

    var waliMap = {};
    for (var gIdx = 0; gIdx < allGuru.length; gIdx++) {
      var guru = allGuru[gIdx];
      if (guru.status === 'Aktif' && guru.waliKelas && guru.waliKelas !== '-') {
        waliMap[guru.waliKelas] = guru.nama;
      }
    }

    var rekapPerKelas = [];
    for (var cIdx = 0; cIdx < daftarKelas.length; cIdx++) {
      var kls = daftarKelas[cIdx];
      var siswaKelas = [];
      for (var sIdx = 0; sIdx < siswaAktifAll.length; sIdx++) {
        if (siswaAktifAll[sIdx].kelas === kls) {
          siswaKelas.push(siswaAktifAll[sIdx]);
        }
      }
      var statKelas = computeRingkasan_(siswaKelas, logsDate);
      rekapPerKelas.push({
        kelas: kls,
        waliKelas: waliMap[kls] || '-',
        totalSiswa: statKelas.totalSiswa,
        hadir: statKelas.hadir,
        terlambat: statKelas.terlambat,
        sakit: statKelas.sakit,
        izin: statKelas.izin,
        alfa: statKelas.alfa,
        belumAbsen: statKelas.belumAbsen,
        persentaseHadir: statKelas.persentaseHadir
      });
    }

    return {
      success: true,
      data: {
        tanggal: tanggal,
        ringkasan: ringkasan,
        siswaTidakHadir: siswaTidakHadir,
        rekapPerKelas: rekapPerKelas,
        daftarKelas: daftarKelas
      }
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat data dashboard.'
    };
  }
}

/**
 * Memuat daftar siswa aktif suatu kelas untuk Checklist Cepat.
 * Dipanggil oleh: gasApi.getChecklistData(payload)
 */
function getChecklistData(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var req = payload || {};
    var tanggal = req.tanggal ? String(req.tanggal).trim() : formatDateJakarta_(new Date());
    var kelas = String(req.kelas || '').trim();

    if (!kelas) {
      return { success: false, message: 'Kelas wajib dipilih.' };
    }

    var allSiswa = readAllSiswa_();
    var siswaKelas = [];
    for (var i = 0; i < allSiswa.length; i++) {
      if (allSiswa[i].kelas === kelas && allSiswa[i].status === 'Aktif') {
        siswaKelas.push(allSiswa[i]);
      }
    }
    siswaKelas.sort(function (a, b) {
      return a.nama.localeCompare(b.nama, 'id');
    });

    var allLogs = readAllLogs_();
    var logByNisn = {};
    var sudahDiabsen = false;

    for (var j = 0; j < allLogs.length; j++) {
      var l = allLogs[j];
      if (l.tanggal === tanggal && l.kelas === kelas) {
        logByNisn[l.nisn] = l;
        sudahDiabsen = true;
      }
    }

    var items = [];
    for (var k = 0; k < siswaKelas.length; k++) {
      var s = siswaKelas[k];
      var existing = logByNisn[s.nisn];
      var rowObj = {
        nisn: String(s.nisn),
        nama: String(s.nama),
        kelas: String(s.kelas),
        jk: s.jk,
        status: existing ? String(existing.status) : 'H',
        keterangan: existing ? String(existing.keterangan) : ''
      };
      if (existing) {
        rowObj.idLog = String(existing.idLog);
        rowObj.jam = String(existing.jam);
        rowObj.metode = existing.metode;
      }
      items.push(rowObj);
    }

    return {
      success: true,
      data: {
        tanggal: tanggal,
        kelas: kelas,
        sudahDiabsen: sudahDiabsen,
        items: items
      }
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat daftar checklist siswa.'
    };
  }
}

/**
 * Menyimpan atau memperbarui absensi Checklist Cepat per kelas (anti-duplikat + LockService + Anti-Formula Injection).
 * Dipanggil oleh: gasApi.simpanChecklistAbsensi(payload)
 */
function simpanChecklistAbsensi(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var tanggal = sanitizeSheetInput_(req.tanggal);
    var kelas = sanitizeSheetInput_(req.kelas);
    var penginput = sanitizeSheetInput_(auth.session.nama || 'Guru');
    var items = req.items || [];

    if (!tanggal || !kelas) {
      return { success: false, message: 'Tanggal dan Kelas wajib diisi.' };
    }
    if (!items.length) {
      return { success: false, message: 'Tidak ada data siswa untuk disimpan.' };
    }

    var sheet = getSheetOrThrow_(SHEET_NAMES.LOG);
    var allLogs = readAllLogs_();
    var existingByNisn = {};

    for (var i = 0; i < allLogs.length; i++) {
      var log = allLogs[i];
      if (log.tanggal === tanggal) {
        existingByNisn[log.nisn] = log;
      }
    }

    var jamSekarang = formatTimeJakarta_(new Date());
    var savedCount = 0;
    var updatedCount = 0;
    var rowsToAppend = [];

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var nisn = sanitizeSheetInput_(toPlainText_(item.nisn));
      if (!nisn) continue;

      var statusRaw = String(item.status || 'H').trim().toUpperCase();
      var validStatus = ['H', 'T', 'S', 'I', 'A'].indexOf(statusRaw) >= 0 ? statusRaw : 'H';
      var nama = sanitizeSheetInput_(item.nama);
      var keterangan = sanitizeSheetInput_(item.keterangan);

      var existing = existingByNisn[nisn];
      if (existing) {
        var rowNum = existing.rowNumber;
        var updateRange = sheet.getRange(rowNum, 5, 1, 6);
        updateRange.setNumberFormat('@');
        updateRange.setValues([[
          nama || sanitizeSheetInput_(existing.nama),
          kelas,
          validStatus,
          existing.metode || 'Checklist',
          keterangan,
          penginput
        ]]);
        updatedCount++;
      } else {
        var newId = 'LOG-' + Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyyMMddHHmmss') + '-' + (j + 1);
        rowsToAppend.push([
          newId,
          tanggal,
          jamSekarang,
          nisn,
          nama,
          kelas,
          validStatus,
          'Checklist',
          keterangan,
          penginput
        ]);
        savedCount++;
      }
    }

    if (rowsToAppend.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      var appendRange = sheet.getRange(startRow, 1, rowsToAppend.length, 10);
      appendRange.setNumberFormat('@');
      appendRange.setValues(rowsToAppend);
    }

    var msg = updatedCount > 0
      ? 'Absensi kelas ' + kelas + ' berhasil diperbarui (' + updatedCount + ' diperbarui, ' + savedCount + ' baru).'
      : 'Absensi kelas ' + kelas + ' berhasil disimpan (' + savedCount + ' siswa).';

    return {
      success: true,
      data: {
        savedCount: savedCount,
        updatedCount: updatedCount,
        totalProcessed: savedCount + updatedCount
      },
      message: msg
    };
  });
}

/**
 * Memproses hasil scan QR Code (NISN), membandingkan jam dengan Pengaturan.Jam_Masuk,
 * mencegah scan ganda di hari yang sama, dan menyimpan ke Log_Absensi dengan LockService.
 * Dipanggil oleh: gasApi.prosesScanQR(payload)
 */
function prosesScanQR(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  return withScriptLock_(function () {
    var req = payload || {};
    var cleanNisn = toPlainText_(req.nisn);
    var penginput = sanitizeSheetInput_(auth.session.nama || 'Petugas Piket');

    if (!cleanNisn) {
      return { success: false, message: 'Kode QR kosong atau tidak valid.' };
    }

    var allSiswa = readAllSiswa_();
    var siswa = null;
    for (var i = 0; i < allSiswa.length; i++) {
      if (allSiswa[i].nisn === cleanNisn) {
        siswa = allSiswa[i];
        break;
      }
    }

    if (!siswa) {
      return {
        success: false,
        message: 'NISN "' + cleanNisn + '" tidak terdaftar di database siswa.'
      };
    }

    if (siswa.status !== 'Aktif') {
      return {
        success: false,
        message: 'Siswa ' + siswa.nama + ' (' + siswa.nisn + ') berstatus Nonaktif.'
      };
    }

    var now = new Date();
    var tanggal = req.tanggal ? sanitizeSheetInput_(req.tanggal) : formatDateJakarta_(now);
    var jamSekarang = formatTimeJakarta_(now);
    var pengaturan = readPengaturanMap_();
    var jamMasuk = pengaturan.Jam_Masuk || '07:15';

    var allLogs = readAllLogs_();
    for (var j = 0; j < allLogs.length; j++) {
      var existing = allLogs[j];
      if (existing.tanggal === tanggal && existing.nisn === cleanNisn) {
        return {
          success: true,
          data: {
            nisn: String(siswa.nisn),
            nama: String(siswa.nama),
            kelas: String(siswa.kelas),
            status: String(existing.status),
            jam: String(existing.jam),
            tanggal: tanggal,
            jamMasuk: jamMasuk,
            alreadyScanned: true,
            keterangan: 'Sudah tercatat pada pukul ' + existing.jam
          },
          message: siswa.nama + ' sudah tercatat absen hari ini (' + existing.jam + ').'
        };
      }
    }

    var isTerlambat = jamSekarang > jamMasuk;
    var status = isTerlambat ? 'T' : 'H';
    var keterangan = isTerlambat ? 'Scan QR melewati jam masuk (' + jamMasuk + ')' : '';
    var newId = 'LOG-' + Utilities.formatDate(now, APP_TIMEZONE, 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);

    var sheet = getSheetOrThrow_(SHEET_NAMES.LOG);
    var targetRow = sheet.getLastRow() + 1;
    var writeRange = sheet.getRange(targetRow, 1, 1, 10);
    writeRange.setNumberFormat('@');
    writeRange.setValues([[
      newId,
      tanggal,
      jamSekarang,
      sanitizeSheetInput_(siswa.nisn),
      sanitizeSheetInput_(siswa.nama),
      sanitizeSheetInput_(siswa.kelas),
      status,
      'QR',
      sanitizeSheetInput_(keterangan),
      penginput
    ]]);

    return {
      success: true,
      data: {
        nisn: String(siswa.nisn),
        nama: String(siswa.nama),
        kelas: String(siswa.kelas),
        status: status,
        jam: jamSekarang,
        tanggal: tanggal,
        jamMasuk: jamMasuk,
        alreadyScanned: false,
        keterangan: keterangan
      },
      message: isTerlambat
        ? siswa.nama + ' tercatat Terlambat (' + jamSekarang + ').'
        : siswa.nama + ' tercatat Hadir (' + jamSekarang + ').'
    };
  });
}

/**
 * Mengambil daftar siswa berstatus A/T/S/I pada tanggal terpilih lengkap dengan data WA Orang Tua.
 * Dipanggil oleh: gasApi.getLaporWAData(payload)
 */
function getLaporWAData(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var req = payload || {};
    var tanggal = req.tanggal ? String(req.tanggal).trim() : formatDateJakarta_(new Date());
    var kelas = String(req.kelas || '').trim();

    var allSiswa = readAllSiswa_();
    var siswaMap = {};
    for (var i = 0; i < allSiswa.length; i++) {
      siswaMap[allSiswa[i].nisn] = allSiswa[i];
    }

    var allLogs = readAllLogs_();
    var items = [];

    for (var j = 0; j < allLogs.length; j++) {
      var l = allLogs[j];
      if (l.tanggal !== tanggal) continue;
      if (l.status === 'H') continue;
      if (kelas && kelas !== 'Semua' && l.kelas !== kelas) continue;

      var s = siswaMap[l.nisn];
      items.push({
        idLog: String(l.idLog),
        tanggal: String(l.tanggal),
        jam: String(l.jam),
        nisn: String(l.nisn),
        nama: String(l.nama),
        kelas: String(l.kelas),
        status: String(l.status),
        keterangan: String(l.keterangan),
        namaOrtu: s && s.namaOrtu ? String(s.namaOrtu) : 'Bapak/Ibu Orang Tua',
        noWaOrtu: s && s.noWaOrtu ? String(s.noWaOrtu) : ''
      });
    }

    items.sort(function (a, b) {
      return a.kelas.localeCompare(b.kelas, 'id') || a.nama.localeCompare(b.nama, 'id');
    });

    return {
      success: true,
      data: items
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat daftar laporan WhatsApp.'
    };
  }
}

/**
 * Membandingkan siswa berstatus Aktif di Data_Siswa dengan catatan di Log_Absensi pada tanggal tertentu,
 * lalu mengembalikan daftar siswa yang belum tercatat absensinya.
 * Jika role Guru, otomatis difilter ke waliKelas-nya. Jika role Admin & kelas kosong/'Semua', tampilkan semua kelas.
 * Dipanggil oleh: gasApi.getSiswaBelumAbsen(tanggal, kelas) -> getSiswaBelumAbsen(token, tanggal, kelas)
 */
function getSiswaBelumAbsen(token, tanggal, kelas) {
  var auth = requireAuthSession_(token);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var targetTanggal = tanggal ? String(tanggal).trim() : formatDateJakarta_(new Date());
    var requestedKelas = String(kelas || '').trim();
    var effectiveKelas = '';

    if (auth.session.role === 'Guru') {
      if (auth.session.waliKelas && auth.session.waliKelas !== '-') {
        effectiveKelas = auth.session.waliKelas;
      } else if (requestedKelas && requestedKelas !== 'Semua') {
        effectiveKelas = requestedKelas;
      }
    } else if (requestedKelas && requestedKelas !== 'Semua') {
      effectiveKelas = requestedKelas;
    }

    var allSiswa = readAllSiswa_();
    var activeScoped = [];
    for (var i = 0; i < allSiswa.length; i++) {
      var s = allSiswa[i];
      if (s.status !== 'Aktif') continue;
      if (effectiveKelas && s.kelas !== effectiveKelas) continue;
      activeScoped.push(s);
    }

    var allLogs = readAllLogs_();
    var recordedNisn = {};
    for (var j = 0; j < allLogs.length; j++) {
      if (allLogs[j].tanggal === targetTanggal) {
        recordedNisn[allLogs[j].nisn] = true;
      }
    }

    var belumAbsen = [];
    for (var k = 0; k < activeScoped.length; k++) {
      var siswa = activeScoped[k];
      if (recordedNisn[siswa.nisn]) continue;
      belumAbsen.push({
        nisn: String(siswa.nisn),
        nama: String(siswa.nama),
        kelas: String(siswa.kelas),
        jk: siswa.jk,
        namaOrtu: String(siswa.namaOrtu || ''),
        noWaOrtu: String(siswa.noWaOrtu || '')
      });
    }

    belumAbsen.sort(function (a, b) {
      return a.kelas.localeCompare(b.kelas, 'id') || a.nama.localeCompare(b.nama, 'id');
    });

    return {
      success: true,
      data: {
        tanggal: targetTanggal,
        kelas: effectiveKelas,
        totalBelumAbsen: belumAbsen.length,
        totalSiswaAktif: activeScoped.length,
        items: belumAbsen
      }
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat daftar siswa belum absen.'
    };
  }
}
