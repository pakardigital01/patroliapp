/*
# Perluasan kolom titik patroli untuk pengambilan GPS akurat

1. Kolom baru
- `checkpoints.keterangan` (text, nullable) — keterangan/lokasi titik.
2. Perubahan kolom
- `checkpoints.radius_m`: default menjadi 25 dan rentang valid 1-200 meter
  (sebelumnya 1-10). Data radius lama tidak diubah.
3. Keamanan
- Tidak ada perubahan RLS: hanya admin yang dapat menulis titik
  (policy "checkpoints_admin_all"), petugas hanya membaca titik cabangnya
  (policy "checkpoints_officer_read_own_branch").
4. Catatan
- Tidak ada data dihapus atau ditimpa.
*/

ALTER TABLE public.checkpoints ADD COLUMN IF NOT EXISTS keterangan text;

ALTER TABLE public.checkpoints ALTER COLUMN radius_m SET DEFAULT 25;

ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_radius_m_check;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_radius_m_check CHECK (radius_m BETWEEN 1 AND 200);
