export interface GpsSample {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number;
  samples: number;
}

/**
 * Rata-rata berbobot sampel GPS (bobot = 1 / akurasi²).
 * Sampel dengan akurasi > 50 m dibuang.
 */
export function weightedAverage(samples: GpsSample[]): GpsFix | null {
  const usable = samples.filter((s) => s.accuracy > 0 && s.accuracy <= 50);
  if (usable.length === 0) return null;
  let weightSum = 0;
  let latSum = 0;
  let lngSum = 0;
  let bestAccuracy = Infinity;
  for (const s of usable) {
    const w = 1 / (s.accuracy * s.accuracy);
    weightSum += w;
    latSum += s.lat * w;
    lngSum += s.lng * w;
    if (s.accuracy < bestAccuracy) bestAccuracy = s.accuracy;
  }
  if (weightSum === 0) return null;
  return {
    lat: latSum / weightSum,
    lng: lngSum / weightSum,
    accuracy: bestAccuracy,
    samples: usable.length,
  };
}

export const EARTH_RADIUS_M = 6371000;

/** Jarak Haversine dua koordinat dalam meter. Dipakai validasi scan petugas. */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function formatCoord(value: number, digits = 6): string {
  return value.toFixed(digits);
}

/** Parse teks koordinat gaya Google Maps: "-6.2345, 106.9876" */
export function parsePastedCoords(text: string): { lat: number; lng: number } | null {
  const cleaned = text.trim().replace(/[;]/g, ',').replace(/\s+/g, ' ');
  const match = cleaned.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function geolocationErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser (ikon gembok di bilah alamat), lalu coba lagi. Fitur ini membutuhkan HTTPS.';
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return 'GPS tidak tersedia. Pastikan layanan lokasi perangkat aktif dan Anda berada di area terbuka.';
  }
  if (err.code === err.TIMEOUT) {
    return 'Waktu pengambilan GPS habis. Coba lagi di area yang lebih terbuka.';
  }
  return 'Gagal mengambil lokasi: ' + (err.message || 'kesalahan tidak diketahui');
}
