/**
 * Auth.gs — Autentikasi Hybrid (Google & Username/PIN), Server-Side Session Token,
 * Rate Limiting Login, dan Verifikasi Hak Akses Server-Side
 * Web App Absensi Siswa Pro (Google Apps Script)
 */

var SESSION_CACHE_PREFIX = 'ABSENSI_SESS_';
var SESSION_TTL_SECONDS = 21600; // 6 jam (batas maksimum CacheService GAS)

var LOGIN_FAIL_PREFIX = 'ABSENSI_LOGIN_FAIL_';
var LOGIN_LOCK_PREFIX = 'ABSENSI_LOGIN_LOCK_';
var LOGIN_MAX_ATTEMPTS = 5;
var LOGIN_LOCK_SECONDS = 600; // 10 menit

/**
 * Mengambil pengaturan publik sekolah (untuk ditampilkan pada halaman Login).
 * Satu-satunya endpoint data sekolah yang boleh dipanggil sebelum login.
 * Dipanggil oleh: gasApi.getPublicPengaturan()
 */
function getPublicPengaturan() {
  try {
    var data = readPengaturanMap_();
    return {
      success: true,
      data: data
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Gagal memuat identitas sekolah.'
    };
  }
}

/**
 * Membuat dan menyimpan Server-Side Session Token di CacheService selama 6 jam.
 */
function createServerSession_(guru) {
  var token = Utilities.getUuid();
  var sessionData = {
    idGuru: String(guru.idGuru),
    nama: String(guru.nama),
    username: String(guru.username),
    role: guru.role === 'Admin' ? 'Admin' : 'Guru',
    waliKelas: String(guru.waliKelas || '-'),
    issuedAt: Date.now()
  };

  var cache = CacheService.getScriptCache();
  cache.put(SESSION_CACHE_PREFIX + token, JSON.stringify(sessionData), SESSION_TTL_SECONDS);

  return {
    idGuru: sessionData.idGuru,
    nama: sessionData.nama,
    username: sessionData.username,
    role: sessionData.role,
    waliKelas: sessionData.waliKelas,
    token: token
  };
}

/**
 * Menghapus Session Token dari CacheService saat pengguna keluar (Logout).
 * Dipanggil oleh: gasApi.logoutUser(payload)
 */
function logoutUser(payload) {
  try {
    var token = extractTokenFromPayload_(payload);
    if (token) {
      CacheService.getScriptCache().remove(SESSION_CACHE_PREFIX + token);
    }
    return {
      success: true,
      message: 'Sesi berhasil diakhiri di server.'
    };
  } catch (err) {
    return {
      success: true,
      message: 'Sesi lokal diakhiri.'
    };
  }
}

/**
 * Verifikasi login menggunakan Username + PIN (String) dengan Rate Limiting:
 * 5 kali salah PIN berturut-turut untuk username yang sama -> blokir 10 menit.
 * Dipanggil oleh: gasApi.loginUser(username, pin)
 */
function loginUser(username, pin) {
  try {
    var cleanUser = String(username || '').trim().toLowerCase();
    var cleanPin = String(pin || '').trim();

    if (!cleanUser || !cleanPin) {
      return {
        success: false,
        message: 'Username dan PIN wajib diisi.'
      };
    }

    var cache = CacheService.getScriptCache();
    var lockKey = LOGIN_LOCK_PREFIX + cleanUser;
    var failKey = LOGIN_FAIL_PREFIX + cleanUser;

    // 1. Cek apakah username sedang terblokir akibat rate limiting
    var lockedUntilRaw = cache.get(lockKey);
    if (lockedUntilRaw) {
      var lockedUntilMs = Number(lockedUntilRaw) || 0;
      var remainingMinutes = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 60000));
      return {
        success: false,
        message:
          'Terlalu banyak percobaan PIN salah. Akun sementara diblokir selama ' +
          remainingMinutes +
          ' menit lagi.'
      };
    }

    var guruList = readAllGuru_();
    var matched = null;

    for (var i = 0; i < guruList.length; i++) {
      var g = guruList[i];
      if (g.username.toLowerCase() === cleanUser && String(g.pin) === cleanPin) {
        matched = g;
        break;
      }
    }

    // 2. Jika gagal, catat jumlah percobaan gagal untuk username ini
    if (!matched) {
      var prevFails = Number(cache.get(failKey) || '0') || 0;
      var currentFails = prevFails + 1;

      if (currentFails >= LOGIN_MAX_ATTEMPTS) {
        var lockUntil = Date.now() + LOGIN_LOCK_SECONDS * 1000;
        cache.put(lockKey, String(lockUntil), LOGIN_LOCK_SECONDS);
        cache.remove(failKey);
        return {
          success: false,
          message:
            'Salah PIN 5 kali berturut-turut. Login untuk username ini diblokir selama 10 menit.'
        };
      }

      cache.put(failKey, String(currentFails), LOGIN_LOCK_SECONDS);
      var remainingAttempts = LOGIN_MAX_ATTEMPTS - currentFails;
      return {
        success: false,
        message:
          'Username atau PIN tidak sesuai. Sisa percobaan sebelum blokir sementara: ' +
          remainingAttempts +
          ' kali.'
      };
    }

    if (matched.status !== 'Aktif') {
      return {
        success: false,
        message: 'Akun Anda sedang dinonaktifkan. Hubungi Operator TU / Admin.'
      };
    }

    // 3. Login berhasil -> reset counter gagal & terbitkan token server-side
    cache.remove(failKey);
    cache.remove(lockKey);

    var session = createServerSession_(matched);
    return {
      success: true,
      data: session
    };
  } catch (err) {
    return {
      success: false,
      message: err && err.message ? String(err.message) : 'Terjadi kesalahan saat memproses login.'
    };
  }
}

/**
 * Verifikasi login otomatis menggunakan akun Google aktif (Session.getActiveUser().getEmail()).
 * Mencocokkan email aktif ke kolom Email_Google pada tab Data_Guru yang berstatus Aktif,
 * lalu menerbitkan Server-Side Session Token selama 6 jam.
 * Dipanggil oleh: gasApi.loginWithGoogle()
 */
function loginWithGoogle() {
  try {
    var activeEmail = '';
    try {
      activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    } catch (sessionErr) {
      activeEmail = '';
    }

    if (!activeEmail) {
      return {
        success: false,
        message:
          'Akun Google tidak terdeteksi otomatis (biasanya terjadi pada akun Gmail pribadi non-Workspace). Silakan masuk menggunakan Username & PIN.'
      };
    }

    var guruList = readAllGuru_();
    var matched = null;

    for (var i = 0; i < guruList.length; i++) {
      var g = guruList[i];
      if (g.emailGoogle && g.emailGoogle.toLowerCase() === activeEmail) {
        matched = g;
        break;
      }
    }

    if (!matched) {
      return {
        success: false,
        message:
          'Email ' + activeEmail + ' belum terdaftar sebagai Admin atau Guru di sekolah ini. Hubungi Operator TU.'
      };
    }

    if (matched.status !== 'Aktif') {
      return {
        success: false,
        message:
          'Akun dengan email ' + activeEmail + ' sedang dinonaktifkan. Hubungi Operator TU / Admin.'
      };
    }

    var session = createServerSession_(matched);
    return {
      success: true,
      data: session
    };
  } catch (err) {
    return {
      success: false,
      message:
        err && err.message ? String(err.message) : 'Terjadi kesalahan saat memproses login Google.'
    };
  }
}

/**
 * Helper internal: mengekstrak token dari payload objek atau string langsung.
 */
function extractTokenFromPayload_(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return String(payload).trim();
  if (typeof payload === 'object' && payload.token) {
    return String(payload.token).trim();
  }
  return '';
}

/**
 * Helper internal server-side: memvalidasi Server-Side Session Token dari CacheService
 * dan memastikan akun pemilik token masih berstatus Aktif di sheet Data_Guru.
 * Jika requiredRole === 'Admin', juga memverifikasi bahwa peran asli di server adalah Admin.
 */
function requireAuthSession_(payload, requiredRole) {
  var token = extractTokenFromPayload_(payload);
  if (!token) {
    return {
      ok: false,
      unauthorized: true,
      message: 'Sesi login tidak ditemukan. Silakan masuk kembali.'
    };
  }

  var cache = CacheService.getScriptCache();
  var rawSession = cache.get(SESSION_CACHE_PREFIX + token);
  if (!rawSession) {
    return {
      ok: false,
      unauthorized: true,
      message: 'Sesi Anda telah berakhir atau tidak valid. Silakan masuk kembali.'
    };
  }

  var parsed = null;
  try {
    parsed = JSON.parse(rawSession);
  } catch (parseErr) {
    cache.remove(SESSION_CACHE_PREFIX + token);
    return {
      ok: false,
      unauthorized: true,
      message: 'Sesi tidak valid. Silakan masuk kembali.'
    };
  }

  // Verifikasi ulang akun & peran langsung terhadap sheet Data_Guru (instant revocation)
  var guruList = readAllGuru_();
  var liveGuru = null;
  for (var i = 0; i < guruList.length; i++) {
    if (guruList[i].idGuru === String(parsed.idGuru || '')) {
      liveGuru = guruList[i];
      break;
    }
  }

  if (!liveGuru || liveGuru.status !== 'Aktif') {
    cache.remove(SESSION_CACHE_PREFIX + token);
    return {
      ok: false,
      unauthorized: true,
      message: 'Akun Anda sudah tidak aktif. Silakan hubungi Operator TU.'
    };
  }

  var liveRole = liveGuru.role === 'Admin' ? 'Admin' : 'Guru';
  if (requiredRole === 'Admin' && liveRole !== 'Admin') {
    return {
      ok: false,
      unauthorized: false,
      message: 'Akses ditolak. Fitur ini hanya dapat diakses oleh Admin / Operator TU.'
    };
  }

  return {
    ok: true,
    session: {
      idGuru: String(liveGuru.idGuru),
      nama: String(liveGuru.nama),
      username: String(liveGuru.username),
      role: liveRole,
      waliKelas: String(liveGuru.waliKelas || '-'),
      token: token
    }
  };
}

/**
 * Shorthand verifikasi sesi khusus Admin di sisi server (mengabaikan actorRole dari klien).
 */
function requireAdminSession_(payload) {
  return requireAuthSession_(payload, 'Admin');
}
