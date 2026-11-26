export type Role = 'admin' | 'petugas';
export type AccountStatus = 'pending' | 'active' | 'rejected' | 'inactive';
export type PatrolStatus = 'ongoing' | 'done';
export type Condition = 'aman' | 'perhatian' | 'temuan';
export type QrMode = 'dinamis' | 'statis';
export type PhotoKind = 'kondisi' | 'selfie';
export type Shift = 'Pagi' | 'Siang' | 'Malam';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  report_emails: string;
  active: boolean;
  created_at: string;
}

export interface Checkpoint {
  id: string;
  branch_id: string;
  name: string;
  seq: number;
  active: boolean;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  qr_mode: QrMode;
  qr_version: number;
  loc_accuracy: number | null;
  keterangan: string | null;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  npk: string | null;
  branch_id: string | null;
  status: AccountStatus;
  rejection_reason: string | null;
  created_at: string;
}

export interface Patrol {
  id: string;
  officer_id: string;
  branch_id: string;
  shift: Shift;
  shift_date: string;
  status: PatrolStatus;
  started_at: string;
  finished_at: string | null;
  officer_name: string;
  officer_npk: string;
  branch_name: string;
  branch_code: string;
  branch_address: string;
}

export interface Entry {
  id: string;
  patrol_id: string;
  checkpoint_id: string;
  condition: Condition;
  notes: string;
  qr_distance: number | null;
  selfie_lat: number | null;
  selfie_lng: number | null;
  selfie_accuracy: number | null;
  selfie_at: string | null;
  created_at: string;
  suspicious: boolean;
}

export interface Photo {
  id: string;
  entry_id: string;
  storage_path: string;
  kind: PhotoKind;
  created_at: string;
}

export interface ScanRow {
  id: string;
  checkpoint_id: string;
  officer_id: string | null;
  patrol_id: string | null;
  success: boolean;
  reason: string;
  distance: number | null;
  accuracy: number | null;
  created_at: string;
}

export interface ScanLog {
  id: string;
  officer_id: string;
  checkpoint_id: string | null;
  patrol_id: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  distance: number | null;
  status: 'valid' | 'di_luar_radius' | 'gps_buruk' | 'ditolak';
  reason: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  admin_id: string | null;
  action: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  profile: Profile | null;
}
