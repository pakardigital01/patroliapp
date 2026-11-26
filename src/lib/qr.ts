import QRCode from 'qrcode';

export async function generateQrDataUrl(text: string, size = 256): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#16232E', light: '#FFFFFF' },
  });
}
