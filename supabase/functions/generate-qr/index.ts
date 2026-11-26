import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const AES_KEY_HEX = Deno.env.get('AES_KEY_HEX') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function encryptToken(checkpointId: string, version: number, mode: 'dinamis' | 'statis'): Promise<string> {
  const keyHex = AES_KEY_HEX.trim();
  if (keyHex.length !== 64) throw new Error('AES_KEY_HEX tidak valid');
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);

  const t = mode === 'dinamis' ? Date.now() : 0;
  const payload = JSON.stringify({ c: checkpointId, v: version, t });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(payload));
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return 'PTR1.' + base64url(combined);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'Tidak terautentikasi' }, 401);

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userData.user.id).maybeSingle();
    if (!profile || profile.role !== 'admin') return json({ error: 'Hanya admin' }, 403);

    const { checkpointId } = await req.json();
    if (!checkpointId) return json({ error: 'checkpointId wajib' }, 400);

    const { data: cp } = await supabase.from('checkpoints').select('*').eq('id', checkpointId).maybeSingle();
    if (!cp) return json({ error: 'Titik tidak ditemukan' }, 404);

    const token = await encryptToken(cp.id, cp.qr_version, cp.qr_mode);
    return json({ token, mode: cp.qr_mode, version: cp.qr_version });
  } catch (err) {
    return json({ error: 'Kesalahan server: ' + (err as Error).message }, 500);
  }
});
// Patroli edge function
