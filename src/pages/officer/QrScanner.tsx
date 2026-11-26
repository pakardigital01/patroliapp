import { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode, Camera, X, CheckCircle2, AlertCircle, Loader2, Navigation } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Input, Spinner } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import { calculateDistance, geolocationErrorMessage, type GpsSample } from '@/lib/gps';

interface Props {
  patrolId: string;
  checkpointId: string;
  checkpointName: string;
  checkpointLat: number | null;
  checkpointLng: number | null;
  radiusM: number;
  isLocked: boolean;
  onVerified: () => void;
}

type GpsState = { lat: number; lng: number; accuracy: number } | null;
type Rejection = {
  code: 'di_luar_radius' | 'gps_buruk';
  distance: number;
  radius: number;
  accuracy: number;
} | null;

const SAMPLING_MS = 5000;

/** Pilih sampel dengan akurasi terbaik dari jendela pengambilan. */
function bestSample(samples: GpsSample[]): GpsState {
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
}

export function QrScanner({ patrolId, checkpointId, checkpointName, checkpointLat, checkpointLng, radiusM, isLocked, onVerified }: Props) {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [gps, setGps] = useState<GpsState>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);
  const [samplingReady, setSamplingReady] = useState(false);
  const [rejection, setRejection] = useState<Rejection>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const samplesRef = useRef<GpsSample[]>([]);
  const sampleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraSupported, setCameraSupported] = useState(true);

  // Mulai watch GPS + jendela sampling. Sampel terbaik yang dipakai scan.
  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('GPS tidak tersedia di perangkat ini. Aktifkan layanan lokasi.');
      return;
    }
    setGpsError(null);
    setGps(null);
    setSamplingReady(false);
    setSampling(true);
    samplesRef.current = [];
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const s: GpsSample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        };
        samplesRef.current = [...samplesRef.current, s];
        setGps({ lat: s.lat, lng: s.lng, accuracy: s.accuracy });
      },
      (err) => {
        setSampling(false);
        setGpsError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
    if (sampleTimerRef.current) clearTimeout(sampleTimerRef.current);
    sampleTimerRef.current = setTimeout(() => {
      setSampling(false);
      setSamplingReady(true);
    }, SAMPLING_MS);
  }, []);

  const stopGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sampleTimerRef.current) {
      clearTimeout(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    setSampling(false);
  }, []);

  const stopCamera = useCallback(() => {
    if (detectorRef.current) {
      clearInterval(detectorRef.current);
      detectorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraSupported(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const BarcodeDetectorAny = (window as any).BarcodeDetector;
      if (BarcodeDetectorAny) {
        const detector = new BarcodeDetectorAny({ formats: ['qr_code'] });
        detectorRef.current = setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const code = barcodes[0].rawValue as string;
              if (code.startsWith('PTR1.')) {
                stopCamera();
                await submitScan(code);
              }
            }
          } catch {
            // ignore frame errors
          }
        }, 400);
      } else {
        show('Browser tidak mendukung pemindai QR otomatis. Gunakan kolom tempel kode.', 'warning');
      }
    } catch (err) {
      setCameraSupported(false);
      show('Tidak dapat mengakses kamera: ' + (err as Error).message + '. Gunakan kolom tempel kode.', 'warning');
    }
  }, [show, stopCamera]);

  const submitScan = useCallback(
    async (token: string) => {
      // Gunakan sampel GPS dengan akurasi terbaik dari jendela sampling
      const fix = bestSample(samplesRef.current) ?? gps;
      if (!fix) {
        show('GPS belum terbaca. Tunggu sampai GPS siap.', 'warning');
        return;
      }
      setScanning(true);
      const { data: session } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-qr`;
      try {
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session?.access_token ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, patrolId }),
        });
        const j = await resp.json();
        setScanning(false);
        if (resp.ok && j.success) {
          show(`Verifikasi berhasil · jarak ${j.distance?.toFixed(0)} m`, 'success');
          onVerified();
          setOpen(false);
        } else if (j.code === 'di_luar_radius' || j.code === 'gps_buruk') {
          setRejection({ code: j.code, distance: j.distance ?? 0, radius: j.radius ?? radiusM, accuracy: j.accuracy ?? fix.accuracy });
          stopCamera();
        } else {
          show('Verifikasi gagal: ' + (j.error ?? j.reason ?? 'kesalahan'), 'error');
          if (cameraSupported) startCamera();
        }
      } catch (err) {
        setScanning(false);
        show('Kesalahan jaringan: ' + (err as Error).message, 'error');
      }
    },
    [gps, patrolId, show, onVerified, cameraSupported, startCamera, stopCamera],
  );

  const tryAgain = () => {
    setRejection(null);
    startGps();
    if (cameraSupported) startCamera();
  };

  useEffect(() => {
    if (open) {
      startGps();
      startCamera();
    } else {
      stopGps();
      stopCamera();
    }
    return () => {
      stopGps();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const gpsReady = samplingReady && gps != null;
  const distInfo = () => {
    if (!gps || checkpointLat == null || checkpointLng == null) return null;
    const d = calculateDistance(gps.lat, gps.lng, checkpointLat, checkpointLng);
    return `${d.toFixed(1)} m dari titik (radius ${radiusM} m)`;
  };

  return (
    <>
      <Button variant="secondary" full onClick={() => { setRejection(null); setOpen(true); }}>
        <QrCode size={18} className="inline" /> Pindai QR Titik
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Verifikasi QR — ${checkpointName}`} maxWidth="max-w-md">
        {/* Layar penolakan: di luar radius / GPS buruk */}
        {rejection ? (
          <div className={`rounded-lg p-4 ${rejection.code === 'di_luar_radius' ? 'bg-bahaya/10 border border-bahaya/30' : 'bg-peringatan/10 border border-peringatan/30'}`}>
            <div className={`flex items-center gap-2 font-semibold ${rejection.code === 'di_luar_radius' ? 'text-bahaya' : 'text-peringatan'}`}>
              <AlertCircle size={20} />
              {rejection.code === 'di_luar_radius' ? 'Di luar radius titik patroli' : 'Sinyal GPS kurang akurat'}
            </div>
            {rejection.code === 'di_luar_radius' ? (
              <div className="mt-3 space-y-1 text-sm text-tinta">
                <p>Jarak Anda ke titik: <strong>{rejection.distance.toFixed(1)} meter</strong></p>
                <p>Radius yang diizinkan: <strong>{rejection.radius} meter</strong></p>
                <p>Akurasi GPS Anda: <strong>±{rejection.accuracy.toFixed(0)} meter</strong></p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-tinta">
                Sinyal GPS kurang akurat (±{rejection.accuracy.toFixed(0)} m), pindah ke area terbuka lalu coba lagi.
              </p>
            )}
            <p className="text-xs text-tintalight mt-2">
              Selfie dan simpan laporan tidak tersedia sampai Anda berada di titik.
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <Button full onClick={tryAgain}>
                <Navigation size={16} /> Coba Lagi
              </Button>
              <Button full variant="secondary" onClick={() => setOpen(false)}>
                Kembali
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-lg p-3 text-sm ${gpsReady ? 'bg-sukses/10 text-sukses' : gpsError ? 'bg-bahaya/10 text-bahaya' : 'bg-peringatan/10 text-peringatan'}`}>
              <div className="flex items-center gap-2 font-medium">
                {gpsReady ? <CheckCircle2 size={16} /> : gpsError ? <AlertCircle size={16} /> : <Loader2 size={16} className="animate-spin" />}
                {gpsError
                  ? gpsError
                  : gpsReady
                    ? `GPS siap · ±${gps!.accuracy.toFixed(0)} m`
                    : gps
                      ? `Mengumpulkan sampel GPS… (±${gps.accuracy.toFixed(0)} m)`
                      : 'Membaca GPS…'}
              </div>
              {gps && distInfo() && <p className="text-xs mt-1 opacity-80">{distInfo()}</p>}
              {sampling && !gpsError && <p className="text-[11px] mt-1 opacity-70">Tunggu beberapa detik untuk hasil terbaik.</p>}
            </div>

            {cameraSupported && (
              <div className="relative bg-tinta rounded-lg overflow-hidden aspect-square">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-2/3 h-2/3 border-2 border-aksen rounded-lg" />
                </div>
                {scanning && (
                  <div className="absolute inset-0 bg-tinta/60 flex items-center justify-center text-kertas text-sm">
                    <Loader2 size={20} className="animate-spin mr-2" /> Memverifikasi…
                  </div>
                )}
              </div>
            )}

            {!cameraSupported && (
              <div className="rounded-lg bg-kertasdark p-3 text-xs text-tintalight text-center">
                Kamera tidak tersedia. Tempel kode QR di bawah.
              </div>
            )}

            <div className="border-t border-border pt-3">
              <p className="text-xs text-tintalight mb-1.5">Atau tempel kode QR manual:</p>
              <div className="flex gap-2">
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="PTR1.…"
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  disabled={!manualCode.trim() || !gpsReady || scanning}
                  onClick={() => submitScan(manualCode.trim())}
                >
                  Kirim
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-tintalight">
              {sampling
                ? <span className="inline-flex items-center gap-1"><Spinner size={12} /> Mengumpulkan sampel GPS untuk akurasi terbaik…</span>
                : isLocked
                  ? 'Titik terkunci: Anda harus berada tepat di titik (radius kecil). Validasi dilakukan di server.'
                  : 'GPS harus berakurasi ≤ 10 m untuk verifikasi. Arahkan kamera ke QR titik.'}
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
