/*
# Patroli — Skema awal

Aplikasi patroli petugas keamanan multi-cabang dengan bukti selfie ber-GPS
dan verifikasi QR terenkripsi.

## Tabel baru
1. `branches` — cabang: nama, kode BA unik, alamat, email penerima laporan, active.
2. `checkpoints` — titik patroli per cabang.
3. `profiles` — profil pengguna terhubung ke auth.users.
4. `patrols` — patroli dengan snapshot data master.
5. `entries` — titik terisi dalam patroli.
6. `photos` — foto per entry.
7. `scans` — log semua percobaan scan QR.
8. `audit_log` — catatan aksi admin.

## Keamanan
- RLS di semua tabel; helper is_admin() membaca peran dari JWT.
- Petugas hanya akses data miliknya di cabangnya; admin boleh semua.
- Fungsi upsert_entry (SECURITY DEFINER) memvalidasi server-side.
*/

-- ---------- helper peran ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------- branches ----------
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  address text NOT NULL DEFAULT '',
  report_emails text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated, service_role;

DROP POLICY IF EXISTS "branches_admin_all" ON public.branches;
CREATE POLICY "branches_admin_all" ON public.branches
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "branches_officer_read_active" ON public.branches;
CREATE POLICY "branches_officer_read_active" ON public.branches
  FOR SELECT TO authenticated
  USING (NOT public.is_admin() AND active = true);

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'petugas' CHECK (role IN ('admin','petugas')),
  full_name text NOT NULL DEFAULT '',
  npk text UNIQUE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','inactive')),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'petugas');

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;
CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------- checkpoints ----------
CREATE TABLE IF NOT EXISTS public.checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  seq integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  lat double precision,
  lng double precision,
  radius_m integer NOT NULL DEFAULT 2 CHECK (radius_m BETWEEN 1 AND 10),
  qr_mode text NOT NULL DEFAULT 'dinamis' CHECK (qr_mode IN ('dinamis','statis')),
  qr_version integer NOT NULL DEFAULT 1,
  loc_accuracy double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkpoints TO authenticated, service_role;

DROP POLICY IF EXISTS "checkpoints_admin_all" ON public.checkpoints;
CREATE POLICY "checkpoints_admin_all" ON public.checkpoints
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "checkpoints_officer_read_own_branch" ON public.checkpoints;
CREATE POLICY "checkpoints_officer_read_own_branch" ON public.checkpoints
  FOR SELECT TO authenticated
  USING (NOT public.is_admin() AND branch_id = (
    SELECT branch_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ---------- patrols ----------
CREATE TABLE IF NOT EXISTS public.patrols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  shift text NOT NULL CHECK (shift IN ('Pagi','Siang','Malam')),
  shift_date date NOT NULL,
  status text NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','done')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  officer_name text NOT NULL DEFAULT '',
  officer_npk text NOT NULL DEFAULT '',
  branch_name text NOT NULL DEFAULT '',
  branch_code text NOT NULL DEFAULT '',
  branch_address text NOT NULL DEFAULT ''
);
ALTER TABLE public.patrols ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrols TO authenticated, service_role;

DROP POLICY IF EXISTS "patrols_officer_own" ON public.patrols;
CREATE POLICY "patrols_officer_own" ON public.patrols
  FOR ALL TO authenticated
  USING (NOT public.is_admin() AND officer_id = auth.uid())
  WITH CHECK (NOT public.is_admin() AND officer_id = auth.uid());

DROP POLICY IF EXISTS "patrols_admin_all" ON public.patrols;
CREATE POLICY "patrols_admin_all" ON public.patrols
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- entries ----------
CREATE TABLE IF NOT EXISTS public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patrol_id uuid NOT NULL REFERENCES public.patrols(id) ON DELETE CASCADE,
  checkpoint_id uuid NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
  condition text NOT NULL CHECK (condition IN ('aman','perhatian','temuan')),
  notes text NOT NULL DEFAULT '',
  qr_distance double precision,
  selfie_lat double precision,
  selfie_lng double precision,
  selfie_accuracy double precision,
  selfie_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  suspicious boolean NOT NULL DEFAULT false,
  UNIQUE (patrol_id, checkpoint_id)
);
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated, service_role;

DROP POLICY IF EXISTS "entries_officer_via_patrol" ON public.entries;
CREATE POLICY "entries_officer_via_patrol" ON public.entries
  FOR ALL TO authenticated
  USING (NOT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.patrols p WHERE p.id = entries.patrol_id AND p.officer_id = auth.uid()
  ))
  WITH CHECK (NOT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.patrols p WHERE p.id = entries.patrol_id AND p.officer_id = auth.uid()
  ));

DROP POLICY IF EXISTS "entries_admin_all" ON public.entries;
CREATE POLICY "entries_admin_all" ON public.entries
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- photos ----------
CREATE TABLE IF NOT EXISTS public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('kondisi','selfie')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated, service_role;

DROP POLICY IF EXISTS "photos_officer_via_entry" ON public.photos;
CREATE POLICY "photos_officer_via_entry" ON public.photos
  FOR ALL TO authenticated
  USING (NOT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.patrols p ON p.id = e.patrol_id
    WHERE e.id = photos.entry_id AND p.officer_id = auth.uid()
  ))
  WITH CHECK (NOT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.patrols p ON p.id = e.patrol_id
    WHERE e.id = photos.entry_id AND p.officer_id = auth.uid()
  ));

DROP POLICY IF EXISTS "photos_admin_all" ON public.photos;
CREATE POLICY "photos_admin_all" ON public.photos
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- scans ----------
CREATE TABLE IF NOT EXISTS public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id uuid NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
  officer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  patrol_id uuid REFERENCES public.patrols(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  distance double precision,
  accuracy double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated, service_role;

DROP POLICY IF EXISTS "scans_officer_own" ON public.scans;
CREATE POLICY "scans_officer_own" ON public.scans
  FOR ALL TO authenticated
  USING (NOT public.is_admin() AND officer_id = auth.uid())
  WITH CHECK (NOT public.is_admin() AND officer_id = auth.uid());

DROP POLICY IF EXISTS "scans_admin_all" ON public.scans;
CREATE POLICY "scans_admin_all" ON public.scans
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- audit_log ----------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO authenticated, service_role;

DROP POLICY IF EXISTS "audit_admin_all" ON public.audit_log;
CREATE POLICY "audit_admin_all" ON public.audit_log
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- index ----------
CREATE INDEX IF NOT EXISTS idx_patrols_officer ON public.patrols(officer_id);
CREATE INDEX IF NOT EXISTS idx_entries_patrol ON public.entries(patrol_id);
CREATE INDEX IF NOT EXISTS idx_photos_entry ON public.photos(entry_id);
CREATE INDEX IF NOT EXISTS idx_scans_checkpoint ON public.scans(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_branch ON public.checkpoints(branch_id);

-- ---------- fungsi upsert entry (server-side validation) ----------
CREATE OR REPLACE FUNCTION public.upsert_entry(
  p_patrol_id uuid,
  p_checkpoint_id uuid,
  p_condition text,
  p_notes text,
  p_qr_distance double precision,
  p_selfie_lat double precision,
  p_selfie_lng double precision,
  p_selfie_accuracy double precision
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_officer uuid := auth.uid();
  v_patrol public.patrols%ROWTYPE;
  v_cp public.checkpoints%ROWTYPE;
  v_scan_ok boolean;
  v_suspicious boolean := false;
  v_dist numeric;
  v_entry_id uuid;
BEGIN
  IF v_officer IS NULL THEN
    RAISE EXCEPTION 'Tidak terautentikasi';
  END IF;

  SELECT * INTO v_patrol FROM public.patrols WHERE id = p_patrol_id;
  IF NOT FOUND OR v_patrol.officer_id <> v_officer OR v_patrol.status <> 'ongoing' THEN
    RAISE EXCEPTION 'Patroli tidak valid atau bukan milik Anda';
  END IF;

  SELECT * INTO v_cp FROM public.checkpoints WHERE id = p_checkpoint_id;
  IF NOT FOUND OR v_cp.active = false OR v_cp.branch_id <> v_patrol.branch_id THEN
    RAISE EXCEPTION 'Titik tidak valid untuk cabang ini';
  END IF;

  IF p_selfie_lat IS NULL OR p_selfie_lng IS NULL OR p_selfie_accuracy IS NULL THEN
    RAISE EXCEPTION 'Selfie dan koordinat GPS wajib';
  END IF;
  IF p_selfie_accuracy > 50 THEN
    RAISE EXCEPTION 'Akurasi GPS selfie lebih buruk dari 50 m';
  END IF;

  IF v_cp.lat IS NOT NULL AND v_cp.lng IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.scans s
      WHERE s.checkpoint_id = p_checkpoint_id
        AND s.patrol_id = p_patrol_id
        AND s.success = true
    ) INTO v_scan_ok;
    IF v_scan_ok = false THEN
      RAISE EXCEPTION 'Titik belum diverifikasi scan QR';
    END IF;
  END IF;

  IF p_condition NOT IN ('aman','perhatian','temuan') THEN
    RAISE EXCEPTION 'Kondisi tidak valid';
  END IF;
  IF length(p_notes) < 10 THEN
    RAISE EXCEPTION 'Keterangan minimal 10 karakter';
  END IF;

  IF v_cp.lat IS NOT NULL AND v_cp.lng IS NOT NULL THEN
    SELECT 6371000 * 2 * asin(sqrt(
      power(sin(radians(v_cp.lat - p_selfie_lat)/2),2) +
      cos(radians(p_selfie_lat)) * cos(radians(v_cp.lat)) *
      power(sin(radians(v_cp.lng - p_selfie_lng)/2),2)
    )) INTO v_dist;
    IF v_dist > (v_cp.radius_m * 5) OR p_selfie_accuracy > 25 THEN
      v_suspicious := true;
    END IF;
  END IF;

  INSERT INTO public.entries (patrol_id, checkpoint_id, condition, notes, qr_distance,
    selfie_lat, selfie_lng, selfie_accuracy, selfie_at, suspicious)
  VALUES (p_patrol_id, p_checkpoint_id, p_condition, p_notes, p_qr_distance,
    p_selfie_lat, p_selfie_lng, p_selfie_accuracy, now(), v_suspicious)
  ON CONFLICT (patrol_id, checkpoint_id) DO UPDATE SET
    condition = EXCLUDED.condition,
    notes = EXCLUDED.notes,
    qr_distance = EXCLUDED.qr_distance,
    selfie_lat = EXCLUDED.selfie_lat,
    selfie_lng = EXCLUDED.selfie_lng,
    selfie_accuracy = EXCLUDED.selfie_accuracy,
    selfie_at = now(),
    suspicious = EXCLUDED.suspicious
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_entry(uuid,uuid,text,text,double precision,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_entry(uuid,uuid,text,text,double precision,double precision,double precision,double precision) TO authenticated;

-- ---------- seed: 2 cabang + beberapa titik ----------
INSERT INTO public.branches (name, code, address, report_emails)
SELECT 'Cabang Pusat', 'BA-001', 'Jl. Merdeka No. 1, Jakarta', 'pusat@patroli.id'
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE code = 'BA-001');

INSERT INTO public.branches (name, code, address, report_emails)
SELECT 'Cabang Bandung', 'BA-002', 'Jl. Asia Afrika No. 10, Bandung', 'bandung@patroli.id'
WHERE NOT EXISTS (SELECT 1 FROM public.branches WHERE code = 'BA-002');

INSERT INTO public.checkpoints (branch_id, name, seq, lat, lng, radius_m, qr_mode)
SELECT b.id, 'Pos Utama', 1, -6.200000, 106.816666, 2, 'dinamis'
FROM public.branches b WHERE b.code = 'BA-001'
AND NOT EXISTS (SELECT 1 FROM public.checkpoints c WHERE c.branch_id = b.id AND c.name = 'Pos Utama');

INSERT INTO public.checkpoints (branch_id, name, seq, lat, lng, radius_m, qr_mode)
SELECT b.id, 'Pos Parkir', 2, -6.200500, 106.817100, 3, 'statis'
FROM public.branches b WHERE b.code = 'BA-001'
AND NOT EXISTS (SELECT 1 FROM public.checkpoints c WHERE c.branch_id = b.id AND c.name = 'Pos Parkir');

INSERT INTO public.checkpoints (branch_id, name, seq, lat, lng, radius_m, qr_mode)
SELECT b.id, 'Pos Gudang', 3, -6.201000, 106.817500, 2, 'statis'
FROM public.branches b WHERE b.code = 'BA-001'
AND NOT EXISTS (SELECT 1 FROM public.checkpoints c WHERE c.branch_id = b.id AND c.name = 'Pos Gudang');

INSERT INTO public.checkpoints (branch_id, name, seq, lat, lng, radius_m, qr_mode)
SELECT b.id, 'Pos Depan', 1, -6.917500, 107.619100, 2, 'dinamis'
FROM public.branches b WHERE b.code = 'BA-002'
AND NOT EXISTS (SELECT 1 FROM public.checkpoints c WHERE c.branch_id = b.id AND c.name = 'Pos Depan');

INSERT INTO public.checkpoints (branch_id, name, seq, lat, lng, radius_m, qr_mode)
SELECT b.id, 'Pos Belakang', 2, -6.918000, 107.619500, 2, 'statis'
FROM public.branches b WHERE b.code = 'BA-002'
AND NOT EXISTS (SELECT 1 FROM public.checkpoints c WHERE c.branch_id = b.id AND c.name = 'Pos Belakang');

-- ---------- bucket storage foto (privat) ----------
INSERT INTO storage.buckets (id, name, public)
SELECT 'photos', 'photos', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'photos');

DROP POLICY IF EXISTS "photos_bucket_officer_own" ON storage.objects;
CREATE POLICY "photos_bucket_officer_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "photos_bucket_owner_read" ON storage.objects;
CREATE POLICY "photos_bucket_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "photos_bucket_admin_all" ON storage.objects;
CREATE POLICY "photos_bucket_admin_all" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND public.is_admin());

DROP POLICY IF EXISTS "photos_bucket_admin_delete" ON storage.objects;
CREATE POLICY "photos_bucket_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND public.is_admin());
