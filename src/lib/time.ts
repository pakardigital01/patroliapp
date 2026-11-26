export const WIB = 'Asia/Jakarta';

export function toWib(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatWib(date: Date | string | null | undefined, withSeconds = false): string {
  const d = toWib(date);
  if (!d) return '-';
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: WIB,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  };
  return new Intl.DateTimeFormat('id-ID', opts).format(d) + ' WIB';
}

export function formatWibTime(date: Date | string | null | undefined, withSeconds = false): string {
  const d = toWib(date);
  if (!d) return '-';
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: WIB,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  };
  return new Intl.DateTimeFormat('id-ID', opts).format(d) + ' WIB';
}

export function formatWibDate(date: Date | string | null | undefined): string {
  const d = toWib(date);
  if (!d) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export type Shift = 'Pagi' | 'Siang' | 'Malam';

export function defaultShift(now = new Date()): Shift {
  const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: WIB, hour: '2-digit', hour12: false }).format(now);
  const h = parseInt(hourStr, 10);
  if (h >= 7 && h < 15) return 'Pagi';
  if (h >= 15 && h < 23) return 'Siang';
  return 'Malam';
}

export function shiftDateFor(now = new Date(), shift: Shift = defaultShift(now)): string {
  // Untuk shift Malam sebelum jam 07:00, shift_date adalah tanggal sebelumnya.
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (shift === 'Malam') {
    const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: WIB, hour: '2-digit', hour12: false }).format(now);
    const h = parseInt(hourStr, 10);
    if (h < 7) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    }
  }
  return ymd;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
