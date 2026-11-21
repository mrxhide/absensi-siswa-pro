import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  History,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  QrCode,
  Send,
  ShieldAlert,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { isMockMode, prosesScanQR } from '../services/gasApi';
import type { Pengaturan, ScanQRResult, UserSession } from '../types';
import { BadgeStatus } from '../components/ui/BadgeStatus';
import { useToast } from '../components/ui/Toast';

interface ScanQRPageProps {
  user: UserSession;
  pengaturan: Pengaturan;
}

interface ScanHistoryEntry {
  id: string;
  timestamp: string;
  ok: boolean;
  result?: ScanQRResult;
  errorMessage?: string;
  rawCode: string;
}

interface LoadedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const COOLDOWN_MS = 2500;
const FRAME_SCAN_INTERVAL_MS = 120;

async function createBarcodeDetectorIfSupported(): Promise<BarcodeDetectorLike | null> {
  try {
    const DetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!DetectorCtor) return null;

    if (typeof DetectorCtor.getSupportedFormats === 'function') {
      const formats = await DetectorCtor.getSupportedFormats();
      if (!formats.includes('qr_code')) return null;
    }
    return new DetectorCtor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

async function loadImageForScan(file: File): Promise<LoadedImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => {
          try {
            bitmap.close();
          } catch {
            // Abaikan error pelepasan bitmap
          }
        },
      };
    } catch {
      // Lanjut ke fallback Image + ObjectURL
    }
  }

  return new Promise<LoadedImageSource>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal memuat berkas gambar.'));
    };
    img.src = objectUrl;
  });
}

function scanRegionWithJsQR(
  loaded: LoadedImageSource,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  maxDimension: number
): string | null {
  const safeSrcW = Math.max(1, Math.round(srcW));
  const safeSrcH = Math.max(1, Math.round(srcH));
  const scale = Math.min(1, maxDimension / Math.max(safeSrcW, safeSrcH));
  const targetW = Math.max(1, Math.round(safeSrcW * scale));
  const targetH = Math.max(1, Math.round(safeSrcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(
      loaded.source,
      Math.max(0, Math.round(srcX)),
      Math.max(0, Math.round(srcY)),
      safeSrcW,
      safeSrcH,
      0,
      0,
      targetW,
      targetH
    );

    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const decoded = jsQR(imageData.data, targetW, targetH, {
      inversionAttempts: 'attemptBoth',
    });

    return decoded?.data ? decoded.data.trim() : null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const loaded = await loadImageForScan(file);
  try {
    const { width, height } = loaded;
    if (!width || !height) return null;

    const pass1 = scanRegionWithJsQR(loaded, 0, 0, width, height, 1000);
    if (pass1) return pass1;

    const pass2 = scanRegionWithJsQR(loaded, 0, 0, width, height, 1600);
    if (pass2) return pass2;

    const cropW = width * 0.65;
    const cropH = height * 0.65;
    const cropX = (width - cropW) / 2;
    const cropY = (height - cropH) / 2;
    return scanRegionWithJsQR(loaded, cropX, cropY, cropW, cropH, 1000);
  } finally {
    loaded.cleanup();
  }
}

function playAudioBeep(kind: 'success' | 'warning' | 'error') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const tone = (freq: number, startOffset: number, duration: number, type: OscillatorType) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.14, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    if (kind === 'success') {
      tone(880, 0, 0.1, 'sine');
      tone(1174, 0.11, 0.14, 'sine');
    } else if (kind === 'warning') {
      tone(587, 0, 0.12, 'triangle');
      tone(523, 0.14, 0.14, 'triangle');
    } else {
      tone(240, 0, 0.24, 'sawtooth');
    }

    window.setTimeout(() => {
      void ctx.close();
    }, 500);
  } catch {
    // Abaikan jika browser memblokir autoplay audio
  }
}

export function ScanQRPage({ user, pengaturan }: ScanQRPageProps) {
  const toast = useToast();
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [startingCamera, setStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [cooldownActive, setCooldownActive] = useState<boolean>(false);
  const [scanFlash, setScanFlash] = useState<boolean>(false);

  const [muted, setMuted] = useState<boolean>(false);
  const [decodingImage, setDecodingImage] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);

  const [manualNisn, setManualNisn] = useState<string>('');
  const [lastEntry, setLastEntry] = useState<ScanHistoryEntry | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameCheckRef = useRef<number>(0);
  const lastScanTimeRef = useRef<number>(0);
  const cooldownTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const scanningLoopRunningRef = useRef<boolean>(false);

  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const processingRef = useRef<boolean>(false);
  const mutedRef = useRef<boolean>(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const stopLiveCamera = useCallback(() => {
    scanningLoopRunningRef.current = false;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    if (liveCanvasRef.current) {
      liveCanvasRef.current.width = 0;
      liveCanvasRef.current.height = 0;
    }

    setCameraActive(false);
    setStartingCamera(false);
  }, []);

  // Cleanup otomatis saat berpindah halaman agar kamera berhenti segera
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      stopLiveCamera();
    };
  }, [stopLiveCamera]);

  const submitNisnScan = useCallback(
    async (nisnValue: string, fromLiveCamera: boolean, refocusManualInput = false) => {
      const cleanCode = nisnValue.trim();
      if (!cleanCode) return;

      if (fromLiveCamera) {
        const now = Date.now();
        if (processingRef.current || now - lastScanTimeRef.current < COOLDOWN_MS) {
          return;
        }
        lastScanTimeRef.current = now;
        setCooldownActive(true);
        setScanFlash(true);

        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setScanFlash(false), 450);

        if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = window.setTimeout(() => {
          setCooldownActive(false);
        }, COOLDOWN_MS);
      } else if (processingRef.current) {
        return;
      }

      processingRef.current = true;
      setProcessing(true);

      try {
        const res = await prosesScanQR({
          nisn: cleanCode,
          penginput: user.nama,
        });

        const nowLabel = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date());

        if (!res.success || !res.data) {
          const errMsg = res.message || 'NISN tidak ditemukan.';
          if (!mutedRef.current) playAudioBeep('error');
          toast.error(errMsg, 'Scan Gagal');

          const entry: ScanHistoryEntry = {
            id: `scan-${Date.now()}`,
            timestamp: nowLabel,
            ok: false,
            errorMessage: errMsg,
            rawCode: cleanCode,
          };
          setLastEntry(entry);
          setHistory((prev) => [entry, ...prev].slice(0, 30));
          return;
        }

        const data = res.data;
        if (data.alreadyScanned) {
          if (!mutedRef.current) playAudioBeep('warning');
          toast.warning(`${data.nama} sudah tercatat absen hari ini (${data.jam}).`);
        } else if (data.status === 'T') {
          if (!mutedRef.current) playAudioBeep('warning');
          toast.warning(`${data.nama} tercatat Terlambat (${data.jam}).`);
        } else {
          if (!mutedRef.current) playAudioBeep('success');
          toast.success(`${data.nama} (${data.kelas}) tercatat Hadir.`);
        }

        const entry: ScanHistoryEntry = {
          id: `scan-${Date.now()}`,
          timestamp: nowLabel,
          ok: true,
          result: data,
          rawCode: cleanCode,
        };
        setLastEntry(entry);
        setHistory((prev) => [entry, ...prev].slice(0, 30));
      } finally {
        processingRef.current = false;
        setProcessing(false);
        if (refocusManualInput) {
          window.setTimeout(() => {
            manualInputRef.current?.focus();
          }, 50);
        }
      }
    },
    [user.nama, toast]
  );

  // Loop pembacaan QR real-time dari frame <video>: BarcodeDetector jika tersedia, fallback ke jsQR
  const runLiveDetectionLoop = useCallback(() => {
    if (!scanningLoopRunningRef.current) return;

    const tick = async (timestamp: number) => {
      if (!scanningLoopRunningRef.current) return;

      const video = videoRef.current;
      const inCooldown = Date.now() - lastScanTimeRef.current < COOLDOWN_MS;

      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !processingRef.current &&
        !inCooldown &&
        timestamp - lastFrameCheckRef.current >= FRAME_SCAN_INTERVAL_MS
      ) {
        lastFrameCheckRef.current = timestamp;
        let detectedValue: string | null = null;

        // 1. Gunakan native BarcodeDetector jika tersedia (akselerasi hardware di Android Chrome)
        if (detectorRef.current) {
          try {
            const barcodes = await detectorRef.current.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              detectedValue = String(barcodes[0].rawValue).trim();
            }
          } catch {
            // Jika BarcodeDetector gagal pada frame ini, lanjut ke fallback jsQR
          }
        }

        // 2. Fallback ke jsQR pada offscreen <canvas> (iPhone Safari, Firefox, Desktop)
        if (!detectedValue) {
          if (!liveCanvasRef.current) {
            liveCanvasRef.current = document.createElement('canvas');
          }
          const canvas = liveCanvasRef.current;
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          const w = Math.max(1, Math.round(video.videoWidth * scale));
          const h = Math.max(1, Math.round(video.videoHeight * scale));

          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const code = jsQR(imageData.data, w, h, {
              inversionAttempts: 'attemptBoth',
            });
            if (code?.data) {
              detectedValue = code.data.trim();
            }
          }
        }

        if (detectedValue && scanningLoopRunningRef.current) {
          void submitNisnScan(detectedValue, true, false);
        }
      }

      if (scanningLoopRunningRef.current) {
        rafIdRef.current = requestAnimationFrame((nextTs) => {
          void tick(nextTs);
        });
      }
    };

    rafIdRef.current = requestAnimationFrame((ts) => {
      void tick(ts);
    });
  }, [submitNisnScan]);

  const handleStartLiveCamera = async () => {
    if (cameraActive || startingCamera) return;
    setCameraError('');
    setStartingCamera(true);

    try {
      stopLiveCamera();

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Browser ini tidak mendukung akses kamera langsung (getUserMedia).');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (constraintErr) {
        const errName =
          constraintErr && typeof constraintErr === 'object' && 'name' in constraintErr
            ? String((constraintErr as { name?: unknown }).name || '')
            : '';
        if (errName === 'OverconstrainedError' || errName === 'NotFoundError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw constraintErr;
        }
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stopLiveCamera();
        return;
      }

      // Wajib untuk iPhone Safari agar tidak membuka pemutar layar penuh
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play();

      detectorRef.current = await createBarcodeDetectorIfSupported();
      scanningLoopRunningRef.current = true;
      setCameraActive(true);
      runLiveDetectionLoop();
    } catch (err) {
      stopLiveCamera();
      const errName =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: unknown }).name || '')
          : '';
      const rawMsg = err instanceof Error ? err.message : String(err || '');
      const isDenied =
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        rawMsg.toLowerCase().includes('permission') ||
        rawMsg.toLowerCase().includes('notallowed');

      const msg = isDenied
        ? 'Izin kamera ditolak oleh browser. Aktifkan izin kamera pada ikon gembok di alamat URL, atau gunakan Scan via Foto di bawah.'
        : 'Kamera tidak dapat diakses pada perangkat ini. Gunakan opsi cadangan Scan via Foto atau Input NISN Manual di bawah.';
      setCameraError(msg);
      toast.warning(msg, 'Kamera Tidak Tersedia');
    } finally {
      setStartingCamera(false);
    }
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.target;
    const file = inputEl.files?.[0];
    if (!file) {
      inputEl.value = '';
      return;
    }

    setDecodingImage(true);
    try {
      const decodedNisn = await decodeQrFromImageFile(file);
      if (!decodedNisn) {
        if (!mutedRef.current) playAudioBeep('warning');
        toast.warning(
          'QR Code tidak terbaca. Pastikan kartu terlihat jelas dan coba foto ulang.',
          'QR Tidak Terbaca'
        );
        return;
      }

      await submitNisnScan(decodedNisn, false, false);
    } catch {
      if (!mutedRef.current) playAudioBeep('warning');
      toast.warning(
        'QR Code tidak terbaca. Pastikan kartu terlihat jelas dan coba foto ulang.',
        'QR Tidak Terbaca'
      );
    } finally {
      inputEl.value = '';
      setDecodingImage(false);
    }
  };

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualNisn.trim() || processing) return;
    const code = manualNisn.trim();
    setManualNisn('');
    void submitNisnScan(code, false, true);
  };

  const isBusy = decodingImage || processing;
  const mockMode = isMockMode();

  return (
    <div className="space-y-5">
      {/* Input file cadangan (Foto Kamera & Galeri) */}
      <input
        ref={cameraFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleFileSelected(e)}
        className="hidden"
        aria-label="Foto kartu QR menggunakan kamera"
      />
      <input
        ref={galleryFileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => void handleFileSelected(e)}
        className="hidden"
        aria-label="Pilih gambar QR dari galeri"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Kolom Kiri: Live Camera Scanner (Utama) + Cadangan Foto & Input Manual/USB */}
        <div className="lg:col-span-6 space-y-4">
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#0F4C81] shrink-0" strokeWidth={1.75} />
                  <span>Live Camera Scan QR</span>
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Batas jam masuk:{' '}
                  <span className="font-mono-num font-semibold text-[#0F172A]">
                    {pengaturan.Jam_Masuk} WIB
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMuted((prev) => !prev)}
                aria-label={muted ? 'Aktifkan suara beep' : 'Bisukan suara beep'}
                className={`h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  muted
                    ? 'bg-slate-100 border-[#CBD5E1] text-[#64748B]'
                    : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F4C81]'
                }`}
              >
                {muted ? (
                  <>
                    <VolumeX className="w-4 h-4" strokeWidth={1.75} />
                    <span>Senyap</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" strokeWidth={1.75} />
                    <span>Suara Aktif</span>
                  </>
                )}
              </button>
            </div>

            {/* Viewport Live Camera dengan Viewfinder */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-[#E2E8F0] aspect-[4/3] sm:aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />

              {/* Bingkai Kotak Bidik (Viewfinder) saat kamera aktif */}
              {cameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl transition-all duration-200 ${
                      scanFlash
                        ? 'ring-4 ring-[#22C55E] bg-[#22C55E]/15 scale-[1.03]'
                        : 'ring-2 ring-white/40 shadow-[0_0_0_9999px_rgba(15,23,42,0.42)]'
                    }`}
                  >
                    {/* Sudut Viewfinder */}
                    <span className="absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 border-white rounded-tl-xl" />
                    <span className="absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 border-white rounded-tr-xl" />
                    <span className="absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 border-white rounded-bl-xl" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 border-white rounded-br-xl" />
                  </div>

                  {/* Pill Status Bawah Viewfinder */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-slate-900/80 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
                    {cooldownActive ? (
                      <>
                        <Clock className="w-3.5 h-3.5 text-[#FDE047]" strokeWidth={2} />
                        <span>Jeda 2,5 detik...</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-3.5 h-3.5 text-[#93C5FD]" strokeWidth={2} />
                        <span>Arahkan QR ke kotak bidik</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* State Kamera Belum Aktif */}
              {!cameraActive && !startingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#F8FAFC]">
                  <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#0F4C81] flex items-center justify-center mb-3">
                    <Camera className="w-7 h-7" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-bold text-[#0F172A]">Kamera Live Siap Digunakan</p>
                  <p className="text-xs text-[#64748B] mt-1 max-w-xs leading-relaxed">
                    Tekan <strong>Mulai Kamera</strong> di bawah untuk memindai kartu pelajar
                    siswa secara otomatis dan real-time.
                  </p>
                </div>
              )}

              {/* State Loading Kamera */}
              {startingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#F8FAFC]/95">
                  <Loader2
                    className="w-8 h-8 text-[#0F4C81] animate-spin mb-2"
                    strokeWidth={1.75}
                  />
                  <p className="text-sm font-semibold text-[#0F172A]">Menghubungkan kamera...</p>
                </div>
              )}
            </div>

            {/* Pesan Error Kamera */}
            {cameraError && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2.5 p-3.5 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] text-[#9A3412]"
              >
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#C2410C]" strokeWidth={1.75} />
                <p className="text-xs font-medium leading-relaxed">{cameraError}</p>
              </div>
            )}

            {/* Tombol Utama Mulai / Stop Kamera */}
            <div className="mt-4">
              {!cameraActive ? (
                <button
                  type="button"
                  disabled={startingCamera}
                  onClick={() => void handleStartLiveCamera()}
                  className="w-full h-12 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] active:scale-[0.99] text-white font-semibold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  <Camera className="w-5 h-5" strokeWidth={1.75} />
                  <span>Mulai Kamera</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLiveCamera}
                  className="w-full h-12 rounded-xl bg-[#FEE2E2] hover:bg-[#FECACA] text-[#B91C1C] font-semibold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <CameraOff className="w-5 h-5" strokeWidth={1.75} />
                  <span>Stop Kamera</span>
                </button>
              )}
            </div>
          </section>

          {/* Opsi Cadangan: Scan via Foto + Input NISN Manual / Scanner USB */}
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4">
            {/* Sub-opsi 1: Scan via Foto */}
            <div className="pb-4 border-b border-[#E2E8F0]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-2">
                Opsi Cadangan: Scan via Foto
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => cameraFileInputRef.current?.click()}
                  className="h-10 px-3.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-slate-100 text-[#0F172A] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {decodingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Camera className="w-4 h-4 text-[#0F4C81]" strokeWidth={1.75} />
                  )}
                  <span>{decodingImage ? 'Memindai Foto...' : 'Foto Kartu QR'}</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => galleryFileInputRef.current?.click()}
                  className="h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#475569] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ImageIcon className="w-4 h-4" strokeWidth={1.75} />
                  <span>Pilih dari Galeri</span>
                </button>
              </div>
            </div>

            {/* Sub-opsi 2: Input NISN Manual / Scanner USB & Bluetooth */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Keyboard className="w-4 h-4 text-[#0F4C81] shrink-0" strokeWidth={1.75} />
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Input NISN Manual / Scanner USB & Bluetooth
                </h3>
              </div>
              <p className="text-xs text-[#64748B] mb-3 leading-relaxed">
                Mendukung scanner QR/Barcode USB atau Bluetooth (langsung tercatat saat Enter).
              </p>

              <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-2">
                <input
                  ref={manualInputRef}
                  type="text"
                  inputMode="numeric"
                  value={manualNisn}
                  onChange={(e) => setManualNisn(e.target.value)}
                  placeholder="Scan USB atau ketik 10 digit NISN..."
                  disabled={processing}
                  className="flex-1 h-11 px-3.5 rounded-xl border border-[#CBD5E1] bg-white text-sm font-mono-num text-[#0F172A] placeholder:font-sans placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81]"
                />
                <button
                  type="submit"
                  disabled={isBusy || !manualNisn.trim()}
                  className="h-11 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#0C3D68] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {processing ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Send className="w-4 h-4" strokeWidth={1.75} />
                  )}
                  <span>Catat</span>
                </button>
              </form>

              {mockMode && (
                <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
                  <p className="text-[11px] font-semibold text-[#64748B] mb-2">
                    Simulasi Cepat NISN (Preview Lokal):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { nisn: '0091234504', label: '0091234504 (Citra)' },
                      { nisn: '0091234506', label: '0091234506 (Fauzan)' },
                      { nisn: '0089876506', label: '0089876506 (Galih)' },
                    ].map((sample) => (
                      <button
                        key={sample.nisn}
                        type="button"
                        disabled={isBusy}
                        onClick={() => void submitNisnScan(sample.nisn, false, true)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-[#E2E8F0] hover:border-[#0F4C81]/30 text-xs font-mono-num text-[#334155] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Kolom Kanan: Kartu Hasil Scan Terakhir + Riwayat Sesi */}
        <div className="lg:col-span-6 space-y-4">
          <section className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-3">
              Hasil Scan Terakhir
            </p>

            {!lastEntry ? (
              <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center">
                <QrCode className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-[#475569]">Menunggu hasil scan</p>
                <p className="text-xs text-[#64748B] mt-1">
                  Data kehadiran siswa akan langsung tampil di sini setelah QR terpindai.
                </p>
              </div>
            ) : !lastEntry.ok ? (
              <div className="rounded-2xl bg-[#FEE2E2] border border-[#FECACA] p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className="w-6 h-6 text-[#B91C1C] shrink-0 mt-0.5"
                    strokeWidth={1.75}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#B91C1C]">Scan Tidak Valid</p>
                    <p className="text-sm text-[#7F1D1D] mt-0.5 break-words">
                      {lastEntry.errorMessage}
                    </p>
                    <p className="text-xs font-mono-num text-[#991B1B] mt-2">
                      Kode terbaca: {lastEntry.rawCode} · {lastEntry.timestamp}
                    </p>
                  </div>
                </div>
              </div>
            ) : lastEntry.result ? (
              <div
                className={`rounded-2xl border p-4 ${
                  lastEntry.result.alreadyScanned
                    ? 'bg-[#EFF6FF] border-[#BFDBFE]'
                    : lastEntry.result.status === 'T'
                      ? 'bg-[#FFEDD5]/70 border-[#FED7AA]'
                      : 'bg-[#DCFCE7]/70 border-[#BBF7D0]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-5 h-5 shrink-0 ${
                          lastEntry.result.alreadyScanned
                            ? 'text-[#0F4C81]'
                            : lastEntry.result.status === 'T'
                              ? 'text-[#C2410C]'
                              : 'text-[#15803D]'
                        }`}
                        strokeWidth={2}
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#334155]">
                        {lastEntry.result.alreadyScanned
                          ? 'Sudah Absen Hari Ini'
                          : 'Berhasil Tercatat'}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#0F172A] mt-2 leading-snug">
                      {lastEntry.result.nama}
                    </h3>
                    <p className="text-sm text-[#334155] mt-0.5">
                      Kelas <span className="font-semibold">{lastEntry.result.kelas}</span> · NISN{' '}
                      <span className="font-mono-num">{lastEntry.result.nisn}</span>
                    </p>
                  </div>
                  <BadgeStatus status={lastEntry.result.status} display="both" size="md" />
                </div>

                <div className="mt-3 pt-3 border-t border-black/10 flex items-center justify-between gap-2 text-xs text-[#334155] flex-wrap">
                  <span className="font-mono-num font-semibold">
                    Jam Tercatat: {lastEntry.result.jam} WIB
                  </span>
                  {lastEntry.result.keterangan && (
                    <span className="font-medium">{lastEntry.result.keterangan}</span>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#0F4C81]" strokeWidth={1.75} />
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Riwayat Scan Sesi Ini ({history.length})
                </h3>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    setLastEntry(null);
                  }}
                  className="text-xs font-semibold text-[#64748B] hover:text-[#B91C1C] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Bersihkan</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="p-5 text-xs text-center text-[#64748B]">
                Belum ada riwayat scan pada sesi ini.
              </p>
            ) : (
              <ul className="divide-y divide-[#E2E8F0] max-h-80 overflow-y-auto">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      {entry.ok && entry.result ? (
                        <>
                          <p className="text-sm font-semibold text-[#0F172A] truncate">
                            {entry.result.nama}
                          </p>
                          <p className="text-xs text-[#64748B] font-mono-num mt-0.5">
                            {entry.result.kelas} · {entry.result.jam}
                            {entry.result.alreadyScanned ? ' (Sudah tercatat)' : ''}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-[#B91C1C] truncate">
                            Kode: {entry.rawCode}
                          </p>
                          <p className="text-xs text-[#64748B] truncate mt-0.5">
                            {entry.errorMessage}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="shrink-0">
                      {entry.ok && entry.result ? (
                        <BadgeStatus status={entry.result.status} display="label" size="sm" />
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C]">
                          Gagal
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
