import { formatWibTime } from './time';

export interface StampInfo {
  name: string;
  npk: string;
  lat: number;
  lng: number;
  accuracy: number;
  takenAt: string; // ISO
}

export async function compressImage(file: File | Blob, maxDim = 1280, quality = 0.82): Promise<string> {
  const dataUrl = await blobToDataUrl(file);
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = src;
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function drawStampOnSelfie(selfieDataUrl: string, info: StampInfo): Promise<string> {
  const img = await loadImage(selfieDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return selfieDataUrl;
  ctx.drawImage(img, 0, 0);

  const stampHeight = Math.round(canvas.height * 0.16);
  const pad = Math.round(canvas.height * 0.015);
  const fontSize = Math.max(11, Math.round(stampHeight / 5.5));
  ctx.fillStyle = 'rgba(22,35,46,0.78)';
  ctx.fillRect(0, canvas.height - stampHeight, canvas.width, stampHeight);

  ctx.fillStyle = '#F4F3EF';
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  const lines = [
    `${info.name} — NPK ${info.npk}`,
    `GPS: ${info.lat.toFixed(6)}, ${info.lng.toFixed(6)} (±${info.accuracy.toFixed(0)} m)`,
    `Waktu: ${formatWibTime(info.takenAt, true)}`,
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, canvas.height - stampHeight + pad * 1.5 + i * (fontSize * 1.3));
  });

  return canvas.toDataURL('image/jpeg', 0.85);
}
