import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'patroli@resend.dev';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface SendReportBody {
  patrolId: string;
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

    const { patrolId } = (await req.json()) as SendReportBody;
    if (!patrolId) return json({ error: 'patrolId wajib' }, 400);

    const { data: patrol } = await supabase
      .from('patrols')
      .select('*')
      .eq('id', patrolId)
      .maybeSingle();
    if (!patrol) return json({ error: 'Patroli tidak ditemukan' }, 404);

    // Hanya pemilik atau admin
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userData.user.id).maybeSingle();
    if (!profile) return json({ error: 'Profil tidak ditemukan' }, 403);
    if (profile.role !== 'admin' && patrol.officer_id !== userData.user.id) {
      return json({ error: 'Tidak berhak' }, 403);
    }

    const { data: branch } = await supabase.from('branches').select('*').eq('id', patrol.branch_id).maybeSingle();
    const emails = (branch?.report_emails ?? '')
      .split(/[,;\s]+/)
      .map((e: string) => e.trim())
      .filter((e: string) => e.length > 0);
    if (emails.length === 0) return json({ error: 'Cabang tidak memiliki email penerima laporan' }, 400);

    const { data: entries } = await supabase
      .from('entries')
      .select('*, checkpoint:checkpoints(name, seq)')
      .eq('patrol_id', patrolId)
      .order('created_at');

    const condLabel = (c: string) => (c === 'aman' ? 'Aman' : c === 'perhatian' ? 'Perlu Perhatian' : 'Ada Temuan');
    const overall = (entries ?? []).some((e: any) => e.condition === 'temuan')
      ? 'ADA TEMUAN'
      : (entries ?? []).some((e: any) => e.condition === 'perhatian')
      ? 'PERLU PERHATIAN'
      : 'AMAN';

    const rows = (entries ?? [])
      .map(
        (e: any, i: number) =>
          `${i + 1}. ${e.checkpoint?.name ?? '-'} — ${condLabel(e.condition)}${e.suspicious ? ' (MENCURIGAKAN)' : ''}\n   Keterangan: ${e.notes}`,
      )
      .join('\n');

    const subject = `Laporan Patroli ${patrol.branch_code} — ${patrol.shift}, ${patrol.shift_date} [${overall}]`;
    const text = `LAPORAN PATROLI
Cabang: ${patrol.branch_name} (${patrol.branch_code})
Petugas: ${patrol.officer_name} (NPK ${patrol.officer_npk})
Shift: ${patrol.shift} — ${patrol.shift_date}
Mulai: ${patrol.started_at}
Selesai: ${patrol.finished_at ?? '-'}
Status keseluruhan: ${overall}

TITIK PATROLI:
${rows || '(tidak ada)'}

---
Laporan ini dibuat otomatis oleh sistem Patroli.`;

    if (!RESEND_API_KEY) {
      return json({ error: 'RESEND_API_KEY belum dikonfigurasi. Email tidak terkirim.' }, 500);
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: emails,
        subject,
        text,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: 'Gagal mengirim email via Resend: ' + errText }, 502);
    }

    return json({ success: true, sentTo: emails });
  } catch (err) {
    return json({ error: 'Kesalahan server: ' + (err as Error).message }, 500);
  }
});
// Patroli edge function
