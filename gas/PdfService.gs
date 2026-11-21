/**
 * PdfService.gs — Perhitungan Rekap Bulanan & Ekspor PDF Resmi ke Google Drive
 * Web App Absensi Siswa Pro (Google Apps Script)
 */

var PDF_FOLDER_NAME = 'Rekap_Absensi_PDF';

/**
 * Menghitung matriks rekap kehadiran bulanan per siswa (tanggal 1 s.d. akhir bulan) + ringkasan kelas.
 * Dipanggil oleh: gasApi.getRekapBulanan(payload)
 */
function getRekapBulanan(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var req = payload || {};
    var bulan = Number(req.bulan);
    var tahun = Number(req.tahun);
    var kelas = String(req.kelas || '').trim();

    if (!bulan || bulan < 1 || bulan > 12 || !tahun || !kelas) {
      return {
        success: false,
        message: 'Bulan, Tahun, dan Kelas wajib dipilih dengan benar.'
      };
    }

    var jumlahHari = new Date(tahun, bulan, 0).getDate();
    var prefix = String(tahun) + '-' + pad2_(bulan) + '-';

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
    var logsByNisn = {};
    for (var j = 0; j < allLogs.length; j++) {
      var l = allLogs[j];
      if (l.kelas !== kelas) continue;
      if (l.tanggal.indexOf(prefix) !== 0) continue;

      if (!logsByNisn[l.nisn]) {
        logsByNisn[l.nisn] = [];
      }
      logsByNisn[l.nisn].push(l);
    }

    var sumH = 0;
    var sumT = 0;
    var sumS = 0;
    var sumI = 0;
    var sumA = 0;
    var sumPersen = 0;
    var rows = [];

    for (var k = 0; k < siswaKelas.length; k++) {
      var s = siswaKelas[k];
      var harian = {};
      for (var d = 1; d <= jumlahHari; d++) {
        harian[d] = '';
      }

      var siswaLogs = logsByNisn[s.nisn] || [];
      for (var m = 0; m < siswaLogs.length; m++) {
        var parts = siswaLogs[m].tanggal.split('-');
        var dayNum = Number(parts[2]);
        if (dayNum >= 1 && dayNum <= jumlahHari) {
          harian[dayNum] = siswaLogs[m].status;
        }
      }

      var totalH = 0;
      var totalT = 0;
      var totalS = 0;
      var totalI = 0;
      var totalA = 0;

      for (var day = 1; day <= jumlahHari; day++) {
        var st = harian[day];
        if (st === 'H') totalH++;
        else if (st === 'T') totalT++;
        else if (st === 'S') totalS++;
        else if (st === 'I') totalI++;
        else if (st === 'A') totalA++;
      }

      var totalTercatat = totalH + totalT + totalS + totalI + totalA;
      var persentaseHadir = totalTercatat > 0
        ? Math.round(((totalH + totalT) / totalTercatat) * 1000) / 10
        : 0;

      sumH += totalH;
      sumT += totalT;
      sumS += totalS;
      sumI += totalI;
      sumA += totalA;
      sumPersen += persentaseHadir;

      rows.push({
        nisn: String(s.nisn),
        nama: String(s.nama),
        jk: s.jk,
        harian: harian,
        totalH: totalH,
        totalT: totalT,
        totalS: totalS,
        totalI: totalI,
        totalA: totalA,
        persentaseHadir: persentaseHadir
      });
    }

    var allGuru = readAllGuru_();
    var waliKelas = '-';
    for (var g = 0; g < allGuru.length; g++) {
      if (allGuru[g].waliKelas === kelas && allGuru[g].status === 'Aktif') {
        waliKelas = allGuru[g].nama;
        break;
      }
    }

    return {
      success: true,
      data: {
        bulan: bulan,
        tahun: tahun,
        namaBulan: NAMA_BULAN_ID[bulan - 1] || String(bulan),
        jumlahHari: jumlahHari,
        kelas: kelas,
        waliKelas: waliKelas,
        rows: rows,
        ringkasan: {
          totalH: sumH,
          totalT: sumT,
          totalS: sumS,
          totalI: sumI,
          totalA: sumA,
          rataRataPersentase: rows.length > 0 ? Math.round((sumPersen / rows.length) * 10) / 10 : 0
        }
      }
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal menyusun rekap bulanan.'
    };
  }
}

/**
 * Menghasilkan file PDF Rekap Bulanan resmi (Kop Surat + Tabel 1-31 + Tanda Tangan Kepsek & Wali Kelas),
 * menyimpannya secara PRIVAT di folder Google Drive "Rekap_Absensi_PDF" (tanpa berbagi publik),
 * serta mengembalikan data PDF sebagai Base64 agar bisa diunduh aman langsung di browser.
 * Dipanggil oleh: gasApi.generateRekapPDF(payload)
 */
function generateRekapPDF(payload) {
  var auth = requireAuthSession_(payload);
  if (!auth.ok) {
    return { success: false, message: auth.message, unauthorized: Boolean(auth.unauthorized) };
  }

  try {
    var req = payload || {};
    var rekapRes = getRekapBulanan(req);
    if (!rekapRes.success || !rekapRes.data) {
      return {
        success: false,
        message: rekapRes.message || 'Gagal menyiapkan data rekap bulanan.',
        unauthorized: Boolean(rekapRes.unauthorized)
      };
    }

    var rekap = rekapRes.data;
    var pengaturan = readPengaturanMap_();
    var waliKelasNama = String(req.namaWaliKelas || rekap.waliKelas || '........................').trim();
    if (!waliKelasNama || waliKelasNama === '-') {
      waliKelasNama = '........................';
    }

    var logoDataUri = fetchLogoAsDataUri_(pengaturan.Logo_URL);
    var tanggalCetak = formatTanggalIndonesia_(new Date());
    var htmlContent = buildRekapPdfHtml_(rekap, pengaturan, waliKelasNama, tanggalCetak, logoDataUri);

    var safeKelas = rekap.kelas.replace(/[^a-zA-Z0-9\-_]/g, '_');
    var fileName = 'Rekap_Absensi_' + safeKelas + '_' + rekap.namaBulan + '_' + rekap.tahun + '.pdf';

    var htmlBlob = Utilities.newBlob(htmlContent, 'text/html', fileName.replace(/\.pdf$/, '.html'));
    var pdfBlob = htmlBlob.getAs('application/pdf').setName(fileName);
    var pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());

    // Simpan arsip secara PRIVAT di Google Drive (tanpa berbagi publik)
    var folder = getOrCreatePdfFolder_();
    var file = folder.createFile(pdfBlob);

    var fileId = file.getId();
    var fileUrl = file.getUrl();

    return {
      success: true,
      data: {
        fileName: fileName,
        fileUrl: fileUrl,
        downloadUrl: '',
        fileId: fileId,
        pdfBase64: pdfBase64,
        mimeType: 'application/pdf'
      },
      message: 'PDF Rekap Bulanan berhasil dibuat (tersimpan privat di Drive & siap diunduh aman).'
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal mengekspor PDF ke Google Drive.'
    };
  }
}

/**
 * Mengambil atau membuat folder "Rekap_Absensi_PDF" di Google Drive.
 */
function getOrCreatePdfFolder_() {
  var folders = DriveApp.getFoldersByName(PDF_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(PDF_FOLDER_NAME);
}

/**
 * Mengonversi Logo_URL (jika diisi) menjadi base64 data URI agar tampil pasti di PDF.
 */
function fetchLogoAsDataUri_(logoUrl) {
  var cleanUrl = String(logoUrl || '').trim();
  if (!cleanUrl) return '';
  if (cleanUrl.indexOf('data:image/') === 0) return cleanUrl;
  if (cleanUrl.indexOf('http://') !== 0 && cleanUrl.indexOf('https://') !== 0) return '';

  try {
    var resp = UrlFetchApp.fetch(cleanUrl, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return '';
    var blob = resp.getBlob();
    var contentType = blob.getContentType() || 'image/png';
    if (contentType.indexOf('image/') !== 0) return '';
    return 'data:' + contentType + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    return '';
  }
}

/**
 * Format tanggal bahasa Indonesia (contoh: 22 November 2026) dalam zona Asia/Jakarta.
 */
function formatTanggalIndonesia_(dateObj) {
  var iso = formatDateJakarta_(dateObj || new Date());
  var parts = iso.split('-');
  var day = Number(parts[2]);
  var monthIdx = Number(parts[1]) - 1;
  var year = parts[0];
  return String(day) + ' ' + (NAMA_BULAN_ID[monthIdx] || '') + ' ' + year;
}

/**
 * Menyusun dokumen HTML siap cetak A4 Landscape untuk konversi PDF.
 */
function buildRekapPdfHtml_(rekap, pengaturan, waliKelasNama, tanggalCetak, logoDataUri) {
  var dayHeaders = '';
  for (var d = 1; d <= rekap.jumlahHari; d++) {
    dayHeaders += '<th class="col-day">' + d + '</th>';
  }

  var bodyRows = '';
  if (rekap.rows.length === 0) {
    bodyRows =
      '<tr><td colspan="' + (rekap.jumlahHari + 10) + '" style="text-align:center;padding:16px;color:#64748B;">' +
      'Belum ada data siswa aktif pada kelas ini.' +
      '</td></tr>';
  } else {
    for (var i = 0; i < rekap.rows.length; i++) {
      var r = rekap.rows[i];
      var dayCells = '';
      for (var day = 1; day <= rekap.jumlahHari; day++) {
        var code = r.harian[day] || '';
        var cls = code ? 'st-' + code : 'st-empty';
        dayCells += '<td class="col-day ' + cls + '">' + (code || '-') + '</td>';
      }

      bodyRows +=
        '<tr>' +
          '<td class="text-center">' + (i + 1) + '</td>' +
          '<td class="mono text-center">' + escapeHtml_(r.nisn) + '</td>' +
          '<td class="nama-cell">' + escapeHtml_(r.nama) + '</td>' +
          '<td class="text-center">' + escapeHtml_(r.jk) + '</td>' +
          dayCells +
          '<td class="text-center bold st-H">' + r.totalH + '</td>' +
          '<td class="text-center bold st-T">' + r.totalT + '</td>' +
          '<td class="text-center bold st-S">' + r.totalS + '</td>' +
          '<td class="text-center bold st-I">' + r.totalI + '</td>' +
          '<td class="text-center bold st-A">' + r.totalA + '</td>' +
          '<td class="text-center mono bold">' + r.persentaseHadir + '%</td>' +
        '</tr>';
    }
  }

  var logoHtml = logoDataUri
    ? '<td class="kop-logo"><img src="' + logoDataUri + '" alt="Logo Sekolah" /></td>'
    : '';

  return (
    '<!DOCTYPE html>' +
    '<html lang="id">' +
    '<head>' +
    '<meta charset="UTF-8" />' +
    '<style>' +
      '@page { size: A4 landscape; margin: 10mm 10mm 12mm 10mm; }' +
      'body { font-family: Arial, Helvetica, sans-serif; color: #0F172A; font-size: 9px; margin: 0; padding: 0; }' +
      '.kop-table { width: 100%; border-collapse: collapse; border-bottom: 3px double #0F4C81; padding-bottom: 8px; margin-bottom: 10px; }' +
      '.kop-logo { width: 64px; vertical-align: middle; text-align: center; padding-right: 10px; padding-bottom: 6px; }' +
      '.kop-logo img { max-width: 56px; max-height: 56px; object-fit: contain; }' +
      '.kop-text { text-align: center; vertical-align: middle; padding-bottom: 6px; }' +
      '.kop-nama { font-size: 15px; font-weight: bold; color: #0F4C81; text-transform: uppercase; letter-spacing: 0.4px; margin: 0 0 3px 0; }' +
      '.kop-alamat { font-size: 9.5px; color: #334155; margin: 0 0 2px 0; }' +
      '.kop-ta { font-size: 9px; color: #475569; margin: 0; font-weight: bold; }' +
      '.doc-title { text-align: center; font-size: 12px; font-weight: bold; text-transform: uppercase; margin: 8px 0 6px 0; color: #0F172A; }' +
      '.meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9.5px; }' +
      '.meta-table td { padding: 2px 4px; }' +
      'table.rekap { width: 100%; border-collapse: collapse; table-layout: fixed; }' +
      'table.rekap th, table.rekap td { border: 1px solid #CBD5E1; padding: 3px 2px; word-wrap: break-word; }' +
      'table.rekap thead th { background-color: #0F4C81; color: #FFFFFF; font-weight: bold; text-align: center; font-size: 8.5px; }' +
      'table.rekap tfoot td { background-color: #F1F5F9; font-weight: bold; border-top: 1.5px solid #0F4C81; }' +
      '.col-no { width: 22px; }' +
      '.col-nisn { width: 68px; }' +
      '.col-nama { width: 135px; }' +
      '.col-jk { width: 20px; }' +
      '.col-day { width: 15px; text-align: center; font-size: 8px; }' +
      '.col-sum { width: 21px; }' +
      '.col-pct { width: 38px; }' +
      '.nama-cell { text-align: left; padding-left: 4px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
      '.text-center { text-align: center; }' +
      '.mono { font-family: "Courier New", Courier, monospace; }' +
      '.bold { font-weight: bold; }' +
      '.st-H { color: #15803D; background-color: #DCFCE7; }' +
      '.st-T { color: #C2410C; background-color: #FFEDD5; }' +
      '.st-S { color: #1D4ED8; background-color: #DBEAFE; }' +
      '.st-I { color: #A16207; background-color: #FEF9C3; }' +
      '.st-A { color: #B91C1C; background-color: #FEE2E2; }' +
      '.st-empty { color: #94A3B8; background-color: #FFFFFF; }' +
      '.legend { margin-top: 8px; font-size: 8.5px; color: #475569; }' +
      '.legend span { display: inline-block; padding: 1px 5px; border-radius: 3px; font-weight: bold; margin-right: 8px; }' +
      '.ttd-table { width: 100%; border-collapse: collapse; margin-top: 22px; page-break-inside: avoid; }' +
      '.ttd-table td { width: 50%; vertical-align: top; text-align: center; font-size: 9.5px; }' +
      '.ttd-space { height: 52px; }' +
      '.ttd-name { font-weight: bold; text-decoration: underline; margin-bottom: 2px; }' +
      '.ttd-nip { font-size: 8.5px; color: #334155; }' +
    '</style>' +
    '</head>' +
    '<body>' +
      '<table class="kop-table">' +
        '<tr>' +
          logoHtml +
          '<td class="kop-text">' +
            '<div class="kop-nama">' + escapeHtml_(pengaturan.Nama_Sekolah) + '</div>' +
            '<div class="kop-alamat">' + escapeHtml_(pengaturan.Alamat_Sekolah) + '</div>' +
            '<div class="kop-ta">Tahun Ajaran ' + escapeHtml_(pengaturan.Tahun_Ajaran) + '</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +

      '<div class="doc-title">Rekapitulasi Absensi Siswa Bulanan</div>' +

      '<table class="meta-table">' +
        '<tr>' +
          '<td style="width:12%;"><strong>Kelas</strong></td>' +
          '<td style="width:38%;">: ' + escapeHtml_(rekap.kelas) + '</td>' +
          '<td style="width:14%;"><strong>Bulan / Tahun</strong></td>' +
          '<td style="width:36%;">: ' + escapeHtml_(rekap.namaBulan) + ' ' + escapeHtml_(rekap.tahun) + '</td>' +
        '</tr>' +
        '<tr>' +
          '<td><strong>Wali Kelas</strong></td>' +
          '<td>: ' + escapeHtml_(waliKelasNama) + '</td>' +
          '<td><strong>Jumlah Siswa</strong></td>' +
          '<td>: ' + rekap.rows.length + ' siswa aktif</td>' +
        '</tr>' +
      '</table>' +

      '<table class="rekap">' +
        '<thead>' +
          '<tr>' +
            '<th class="col-no" rowspan="2">No</th>' +
            '<th class="col-nisn" rowspan="2">NISN</th>' +
            '<th class="col-nama" rowspan="2">Nama Siswa</th>' +
            '<th class="col-jk" rowspan="2">JK</th>' +
            '<th colspan="' + rekap.jumlahHari + '">Tanggal (' + escapeHtml_(rekap.namaBulan) + ' ' + escapeHtml_(rekap.tahun) + ')</th>' +
            '<th colspan="5">Total</th>' +
            '<th class="col-pct" rowspan="2">% Hadir</th>' +
          '</tr>' +
          '<tr>' +
            dayHeaders +
            '<th class="col-sum">H</th>' +
            '<th class="col-sum">T</th>' +
            '<th class="col-sum">S</th>' +
            '<th class="col-sum">I</th>' +
            '<th class="col-sum">A</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
        '<tfoot>' +
          '<tr>' +
            '<td colspan="' + (rekap.jumlahHari + 4) + '" style="text-align:right;padding-right:8px;">TOTAL KESELURUHAN / RATA-RATA KEHADIRAN</td>' +
            '<td class="text-center">' + rekap.ringkasan.totalH + '</td>' +
            '<td class="text-center">' + rekap.ringkasan.totalT + '</td>' +
            '<td class="text-center">' + rekap.ringkasan.totalS + '</td>' +
            '<td class="text-center">' + rekap.ringkasan.totalI + '</td>' +
            '<td class="text-center">' + rekap.ringkasan.totalA + '</td>' +
            '<td class="text-center mono">' + rekap.ringkasan.rataRataPersentase + '%</td>' +
          '</tr>' +
        '</tfoot>' +
      '</table>' +

      '<div class="legend">' +
        'Keterangan: ' +
        '<span class="st-H">H = Hadir</span>' +
        '<span class="st-T">T = Terlambat</span>' +
        '<span class="st-S">S = Sakit</span>' +
        '<span class="st-I">I = Izin</span>' +
        '<span class="st-A">A = Alfa</span>' +
      '</div>' +

      '<table class="ttd-table">' +
        '<tr>' +
          '<td>' +
            'Mengetahui,<br />Kepala Sekolah' +
            '<div class="ttd-space"></div>' +
            '<div class="ttd-name">' + escapeHtml_(pengaturan.Nama_Kepsek) + '</div>' +
            '<div class="ttd-nip">NIP. ' + escapeHtml_(pengaturan.NIP_Kepsek || '-') + '</div>' +
          '</td>' +
          '<td>' +
            'Dicetak tanggal ' + escapeHtml_(tanggalCetak) + '<br />Wali Kelas ' + escapeHtml_(rekap.kelas) +
            '<div class="ttd-space"></div>' +
            '<div class="ttd-name">' + escapeHtml_(waliKelasNama) + '</div>' +
            '<div class="ttd-nip">&nbsp;</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</body>' +
    '</html>'
  );
}
