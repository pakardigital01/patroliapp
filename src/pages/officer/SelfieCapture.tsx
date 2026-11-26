import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, Loader2, Smartphone } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import { compressImage, blobToDataUrl, drawStampOnSelfie, type StampInfo } from '@/lib/photo';
import { formatWibTime } from '@/lib/time';

interface Props {
  open: boolean;
  officerName: string;
  officerNpk: string;
  onCapture: (result: { dataUrl: string; lat: number; lng: number; accuracy: number; takenAt: string }) => void;
  onClose: () => void;
}

type GpsState = { lat: number; lng: number; accuracy: number } | null;

export function SelfieCapture({ open, officerName, officerNpk, onCapture, onClose }: Props) {
  const { show } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [gps, setGps] = useState<GpsState>(null);
  const [gpsReady, setGpsReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gpsTimeout, setGpsTimeout] = useState(false);
  const [saveCopy, setSaveCopy] = useState(true);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (face: 'user' | 'environment') => {
    setCameraError(null);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setCameraError((err as Error).message);
    }
  }, [stopCamera]);

  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setCameraError('GPS tidak tersedia');
      return;
    }
    setGps(null);
    setGpsReady(false);
    setGpsTimeout(false);
    const startTime = Date.now();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const g = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setGps(g);
        if (g.accuracy <= 50) setGpsReady(true);
        if (Date.now() - startTime > 6000 && !gpsReady) {
          // allow but warn
        }
      },
      (err) => {
        show('GPS error: ' + err.message, 'error');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 },
    );
    setTimeout(() => {
      setGps((g) => {
        if (!g || g.accuracy > 50) setGpsTimeout(true);
        return g;
      });
    }, 6500);
  }, [show, gpsReady]);

  useEffect(() => {
    if (open) {
      startCamera(facing);
      startGps();
    } else {
      stopCamera();
      stopGps();
    }
    return () => {
      stopCamera();
      stopGps();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const takePhoto = useCallback(async () => {
    if (!gps || gps.accuracy > 50) {
      show('Akurasi GPS lebih buruk dari 50 m. Tidak dapat memotret.', 'error');
      return;
    }
    if (!videoRef.current || !streamRef.current) return;
    setCapturing(true);
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setCapturing(false); return; }
    // mirror for front camera
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const raw = canvas.toDataURL('image/jpeg', 0.9);
    const compressed = await compressImage(await (await fetch(raw)).blob(), 1280, 0.85);
    const takenAt = new Date().toISOString();
    const stamp: StampInfo = { name: officerName, npk: officerNpk, lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, takenAt };
    const stamped = await drawStampOnSelfie(compressed, stamp);
    setCapturing(false);
    if (saveCopy) {
      try {
        const a = document.createElement('a');
        a.href = stamped;
        a.download = `selfie_${officerNpk}_${Date.now()}.jpg`;
        a.click();
      } catch { /* ignore */ }
    }
    onCapture({ dataUrl: stamped, lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, takenAt });
  }, [gps, facing, officerName, officerNpk, show, saveCopy, onCapture]);

  const handleFileFallback = useCallback(async (file: File) => {
    if (!gps || gps.accuracy > 50) {
      show('GPS belum siap (≤50 m). Tunggu sebentar lalu coba lagi.', 'warning');
      return;
    }
    setCapturing(true);
    const compressed = await compressImage(file, 1280, 0.85);
    const takenAt = new Date().toISOString();
    const stamp: StampInfo = { name: officerName, npk: officerNpk, lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, takenAt };
    const stamped = await drawStampOnSelfie(compressed, stamp);
    setCapturing(false);
    onCapture({ dataUrl: stamped, lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, takenAt });
  }, [gps, officerName, officerNpk, show, onCapture]);

  return (
    <Dialog open={open} onClose={onClose} title="Ambil Selfie Ber-GPS" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className={`rounded-lg p-3 text-sm ${gpsReady ? 'bg-sukses/10 text-sukses' : gpsTimeout ? 'bg-bahaya/10 text-bahaya' : 'bg-peringatan/10 text-peringatan'}`}>
          <div className="flex items-center gap-2 font-medium">
            {gpsReady ? <CheckCircle2 size={16} /> : <Loader2 size={16} className="animate-spin" />}
            {gpsReady ? `GPS siap · ±${gps!.accuracy.toFixed(0)} m` : gpsTimeout ? 'GPS terlalu lambat/jelek' : 'Membaca GPS (maks ±50 m)…'}
          </div>
        </div>

        {cameraError ? (
          <div className="rounded-lg bg-bahaya/10 border border-bahaya/30 p-3 text-sm text-bahaya">
            <div className="flex items-center gap-2 mb-2"><AlertCircle size={16} /> Kamera gagal: {cameraError}</div>
            <label className="block">
              <span className="text-xs text-tintalight block mb-1.5">Pakai aplikasi Kamera HP:</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileFallback(f); }}
                className="block w-full text-xs"
              />
            </label>
          </div>
        ) : (
          <div className="relative bg-tinta rounded-lg overflow-hidden aspect-[3/4]">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {capturing && (
              <div className="absolute inset-0 bg-tinta/60 flex items-center justify-center text-kertas">
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}
          </div>
        )}

        {!cameraError && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
              <RefreshCw size={16} /> Balik Kamera
            </Button>
            <Button size="sm" full disabled={!gpsReady || capturing} onClick={takePhoto}>
              <Camera size={16} /> Ambil Selfie
            </Button>
          </div>
        )}

        {cameraError && (
          <Button size="sm" full onClick={() => startCamera(facing)}>Coba Kamera Lagi</Button>
        )}

        <label className="flex items-center gap-2 text-sm text-tintalight">
          <input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} className="accent-aksen" />
          Simpan juga salinan foto ke HP
        </label>

        {cameraError && (
          <label className="block border-t border-border pt-3">
            <span className="text-xs text-tintalight block mb-1.5 flex items-center gap-1"><Smartphone size={13} /> Cadangan: pakai aplikasi kamera HP</span>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileFallback(f); }}
              className="block w-full text-xs"
            />
          </label>
        )}

        <p className="text-[11px] text-tintalight">
          Selfie wajib diambil langsung dari kamera dengan GPS aktif. Tombol ambil nonaktif sampai GPS berakurasi ≤ 50 m. Stempel nama, NPK, koordinat, dan waktu WIB akan dicantumkan.
        </p>
      </div>
    </Dialog>
  );
}
