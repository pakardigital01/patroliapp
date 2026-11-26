import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ScanBody {
  token: string;
  lat: number;
  lng: number;
  accuracy: number;
  patrolId: string;
}

const AES_KEY_HEX = Deno.env.get('AES_KEY_HEX') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 2 ? '==' : input.length % 4 === 3 ? '=' : '';
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptToken(token: string): Promise<{ c: string; v: number; t: number } | null> {
  if (!token.startsWith('PTR1.')) return null;
  const raw = base64urlDecode(token.slice(5));
  if (raw.length < 12) return null;
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const keyHex = AES_KEY_HEX.trim();
  if (keyHex.length !== 64) return null;
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
    const text = new TextDecoder().decode(plain);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verifikasi JWT pengguna
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'Tidak terautentikasi' }, 401);
    const userId = userData.user.id;

    const body = (await req.json()) as ScanBody;
    if (!body.token || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      return json({ error: 'Data tidak lengkap' }, 400);
    }
    const accuracy = typeof body.accuracy === 'number' ? body.accuracy : 9999;

    // Rate limit: 20 percobaan per menit per petugas
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .eq('officer_id', userId)
      .gte('created_at', oneMinAgo);
    if ((count ?? 0) >= 20) return json({ error: 'Terlalu banyak percobaan scan. Tunggu sebentar.' }, 429);

    // Profil & patroli
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!profile || profile.status !== 'active' || profile.role !== 'petugas') {
      return json({ error: 'Akun tidak aktif atau bukan petugas' }, 403);
    }

    const { data: patrol } = await supabase
      .from('patrols')
      .select('*')
      .eq('id', body.patrolId)
      .eq('officer_id', userId)
      .eq('status', 'ongoing')
      .maybeSingle();
    if (!patrol) return json({ error: 'Tidak ada patroli berjalan' }, 400);

    const logScan = async (
      checkpointId: string | null,
      status: 'valid' | 'di_luar_radius' | 'gps_buruk' | 'ditolak',
      reason: string,
      distance: number | null,
    ) => {
      await supabase.from('scan_logs').insert({
        officer_id: userId,
        checkpoint_id: checkpointId,
        patrol_id: body.patrolId,
        lat: body.lat,
        lng: body.lng,
        accuracy,
        distance,
        status,
        reason,
      });
    };

    const fail = async (reason: string, checkpointId: string | null = null) => {
      await supabase.from('scans').insert({
        checkpoint_id: checkpointId,
        officer_id: userId,
        patrol_id: body.patrolId,
        success: false,
        reason,
        accuracy,
      });
      await logScan(checkpointId, 'ditolak', reason, null);
      return json({ success: false, reason }, 400);
    };

    // Token valid?
    const payload = await decryptToken(body.token);
    if (!payload) return await fail('Token QR tidak valid');

    // Titik aktif?
    const { data: cp } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('id', payload.c)
      .maybeSingle();
    if (!cp || !cp.active) return await fail('Titik tidak ditemukan atau tidak aktif');

    // Titik milik cabang petugas?
    if (cp.branch_id !== patrol.branch_id) return await fail('Titik bukan milik cabang Anda');

    // qr_version sama?
    if (payload.v !== cp.qr_version) return await fail('QR sudah dicabut');

    // Titik punya lokasi GPS?
    if (cp.lat == null || cp.lng == null) return await fail('Titik tidak memiliki lokasi GPS');

    // Dinamis belum kedaluwarsa (toleransi -10 detik)
    if (cp.qr_mode === 'dinamis') {
      if (payload.t === 0) return await fail('QR statis tidak berlaku untuk titik dinamis');
      const nowMs = Date.now();
      const ageSec = (nowMs - payload.t) / 1000;
      if (ageSec > 60 || ageSec < -10) return await fail('QR dinamis sudah kedaluwarsa');
    } else {
      if (payload.t !== 0) return await fail('Token tidak cocok untuk titik statis');
    }

    const dist = haversine(body.lat, body.lng, cp.lat, cp.lng);
    const allowed = Number(cp.radius_m);

    // ===== Validasi radius server-side =====
    if (cp.is_locked) {
      // Titik terkunci: radius kunci kecil. Akurasi lebih buruk dari radius
      // tidak langsung dianggap salah lokasi — minta GPS lebih akurat.
      if (accuracy > allowed) {
        await logScan(cp.id, 'gps_buruk', `Sinyal GPS kurang akurat (±${accuracy.toFixed(0)} m > radius ${allowed} m)`, dist);
        return json({
          success: false,
          code: 'gps_buruk',
          reason: 'Sinyal GPS kurang akurat',
          accuracy,
          radius: allowed,
          distance: dist,
        });
      }
      if (dist > allowed) {
        await logScan(cp.id, 'di_luar_radius', `Di luar radius ${allowed} m (jarak ${dist.toFixed(1)} m)`, dist);
        return json({
          success: false,
          code: 'di_luar_radius',
          reason: 'Di luar radius titik patroli',
          distance: dist,
          radius: allowed,
          accuracy,
        });
      }
    } else {
      // Titik belum terkunci: aturan lama (akurasi maks 10 m, radius biasa)
      if (accuracy > 10) {
        await logScan(cp.id, 'gps_buruk', `Akurasi GPS terlalu rendah (±${accuracy.toFixed(0)} m, maks 10 m)`, dist);
        return json({
          success: false,
          code: 'gps_buruk',
          reason: `Akurasi GPS terlalu rendah (±${accuracy.toFixed(0)} m, maks 10 m)`,
          accuracy,
          radius: allowed,
          distance: dist,
        });
      }
      if (dist > allowed) {
        await logScan(cp.id, 'di_luar_radius', `Jarak ${dist.toFixed(0)} m melebihi radius ${allowed} m`, dist);
        return json({
          success: false,
          code: 'di_luar_radius',
          reason: 'Di luar radius titik patroli',
          distance: dist,
          radius: allowed,
          accuracy,
        });
      }
    }

    // Sukses
    await supabase.from('scans').insert({
      checkpoint_id: cp.id,
      officer_id: userId,
      patrol_id: body.patrolId,
      success: true,
      reason: 'Berhasil',
      distance: dist,
      accuracy,
    });
    await logScan(cp.id, 'valid', 'Berhasil', dist);

    return json({ success: true, checkpointId: cp.id, distance: dist, checkpointName: cp.name });
  } catch (err) {
    return json({ error: 'Kesalahan server: ' + (err as Error).message }, 500);
  }
});
// Patroli edge function
