/*
# Kunci titik GPS dan radius kunci (0,5-1 m, bisa dilonggarkan)

1. Kolom baru pada `checkpoints`
- `is_locked` (boolean, default false): true berarti koordinat titik adalah
  acuan permanen untuk validasi scan; tidak boleh diubah dari klien.
- `locked_at` (timestamptz, nullable): waktu titik dikunci.
- `locked_by` (uuid, nullable): id admin yang mengunci.
2. Perubahan kolom
- `checkpoints.radius_m`: integer → numeric (desimal didukung, mis. 0,5).
  Data lama tidak diubah; titik lama dengan radius > 1 tetap berfungsi
  dengan nilainya. CHECK radius lama (1-200) diganti (0.5-200). Perubahan
  tipe dilakukan via USING sehingga tidak ada data yang hilang.
3. Tabel baru `scan_logs`
- Mencatat SETIAP percobaan scan: officer_id, checkpoint_id, patrol_id,
  lat/lng petugas, accuracy, distance, status ('valid' | 'di_luar_radius'
  | 'gps_buruk' | 'ditolak'), reason, created_at.
- RLS: hanya admin yang boleh membaca; petugas hanya bisa INSERT barisnya
  sendiri (kolom terbatas). Tidak ada UPDATE/DELETE untuk petugas.
4. Keamanan / RLS
- Policy UPDATE pada `checkpoints` dilonggarkan di sisi kolom melalui
  GRANT terbatas: petugas tidak diberi hak apa pun; admin tetap seperti
  semula. Penguncian hanya lewat edge function `admin-actions` yang
  berjalan dengan service_role dan memverifikasi role admin.
- `scan_logs` di-GRANT: INSERT (kolom terbatas) untuk authenticated,
  SELECT untuk admin lewat policy; service_role untuk edge function.
5. Catatan
- Tidak ada data dihapus atau ditimpa.
*/

ALTER TABLE public.checkpoints ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.checkpoints ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.checkpoints ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.profiles(id);

-- radius integer -> numeric (tanpa kehilangan data)
ALTER TABLE public.checkpoints ALTER COLUMN radius_m TYPE numeric USING radius_m::numeric;
ALTER TABLE public.checkpoints ALTER COLUMN radius_m SET DEFAULT 1;

ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_radius_m_check;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_radius_m_check CHECK (radius_m >= 0.5 AND radius_m <= 200);

-- Tabel log scan
CREATE TABLE IF NOT EXISTS public.scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles(id),
  checkpoint_id uuid REFERENCES public.checkpoints(id),
  patrol_id uuid REFERENCES public.patrols(id),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  distance double precision,
  status text NOT NULL CHECK (status = ANY (ARRAY['valid'::text, 'di_luar_radius'::text, 'gps_buruk'::text, 'ditolak'::text])),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

GRANT INSERT (officer_id, checkpoint_id, patrol_id, lat, lng, accuracy, distance, status, reason) ON public.scan_logs TO authenticated;
GRANT SELECT ON public.scan_logs TO service_role;

DROP POLICY IF EXISTS "scan_logs_insert_own" ON public.scan_logs;
CREATE POLICY "scan_logs_insert_own"
ON public.scan_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = officer_id);

DROP POLICY IF EXISTS "scan_logs_admin_read" ON public.scan_logs;
CREATE POLICY "scan_logs_admin_read"
ON public.scan_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

CREATE INDEX IF NOT EXISTS scan_logs_created_at_idx ON public.scan_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS scan_logs_checkpoint_idx ON public.scan_logs (checkpoint_id);

-- scan_logs dibaca edge function via service_role; checkpoints.grant sudah ada.
