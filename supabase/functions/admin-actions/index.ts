import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    const { data: adminProfile } = await supabase.from('profiles').select('*').eq('id', userData.user.id).maybeSingle();
    if (!adminProfile || adminProfile.role !== 'admin') return json({ error: 'Hanya admin' }, 403);

    const body = await req.json();
    const action: string = body.action;

    // ---- Approve petugas ----
    if (action === 'approve') {
      const { userId, branchId } = body;
      if (!userId || !branchId) return json({ error: 'userId dan branchId wajib' }, 400);
      // Update profile
      const { error: e1 } = await supabase
        .from('profiles')
        .update({ status: 'active', branch_id: branchId, rejection_reason: null })
        .eq('id', userId);
      if (e1) return json({ error: e1.message }, 400);
      // Set app_metadata role=petugas
      await supabase.auth.admin.updateUserById(userId, { app_metadata: { role: 'petugas' } });
      await supabase.from('audit_log').insert({ admin_id: adminProfile.id, action: 'approve_petugas', target_id: userId, details: { branchId } });
      return json({ success: true });
    }

    // ---- Reject petugas ----
    if (action === 'reject') {
      const { userId, reason } = body;
      if (!userId) return json({ error: 'userId wajib' }, 400);
      const { error: e1 } = await supabase
        .from('profiles')
        .update({ status: 'rejected', rejection_reason: reason ?? null })
        .eq('id', userId);
      if (e1) return json({ error: e1.message }, 400);
      await supabase.from('audit_log').insert({ admin_id: adminProfile.id, action: 'reject_petugas', target_id: userId, details: { reason } });
      return json({ success: true });
    }

    // ---- Update petugas ----
    if (action === 'update_officer') {
      const { userId, fullName, email, branchId, status } = body;
      if (!userId) return json({ error: 'userId wajib' }, 400);
      const updates: Record<string, unknown> = {};
      if (fullName != null) updates.full_name = fullName;
      if (branchId != null) updates.branch_id = branchId;
      if (status != null) updates.status = status;
      if (Object.keys(updates).length > 0) {
        const { error: e1 } = await supabase.from('profiles').update(updates).eq('id', userId);
        if (e1) return json({ error: e1.message }, 400);
      }
      if (email != null) {
        await supabase.auth.admin.updateUserById(userId, { email });
      }
      await supabase.from('audit_log').insert({ admin_id: adminProfile.id, action: 'update_officer', target_id: userId, details: body });
      return json({ success: true });
    }

    // ---- Reset password ----
    if (action === 'reset_password') {
      const { userId, newPassword } = body;
      if (!userId || !newPassword || newPassword.length < 8) return json({ error: 'Password minimal 8 karakter' }, 400);
      await supabase.auth.admin.updateUserById(userId, { password: newPassword });
      await supabase.from('audit_log').insert({ admin_id: adminProfile.id, action: 'reset_password', target_id: userId });
      return json({ success: true });
    }

    // ---- Revoke QR (naikkan qr_version) ----
    if (action === 'revoke_qr') {
      const { checkpointId } = body;
      if (!checkpointId) return json({ error: 'checkpointId wajib' }, 400);
      const { data: cp } = await supabase.from('checkpoints').select('qr_version').eq('id', checkpointId).maybeSingle();
      if (!cp) return json({ error: 'Titik tidak ditemukan' }, 404);
      const { error: e1 } = await supabase.from('checkpoints').update({ qr_version: cp.qr_version + 1 }).eq('id', checkpointId);
      if (e1) return json({ error: e1.message }, 400);
      await supabase.from('audit_log').insert({ admin_id: adminProfile.id, action: 'revoke_qr', target_id: checkpointId });
      return json({ success: true, newVersion: cp.qr_version + 1 });
    }

    // ---- Kunci titik (koordinat jadi acuan permanen) ----
    if (action === 'lock_checkpoint') {
      const { checkpointId } = body;
      if (!checkpointId) return json({ error: 'checkpointId wajib' }, 400);
      const { data: cp } = await supabase.from('checkpoints').select('lat, lng, is_locked').eq('id', checkpointId).maybeSingle();
      if (!cp) return json({ error: 'Titik tidak ditemukan' }, 404);
      if (cp.lat == null || cp.lng == null) return json({ error: 'Titik belum memiliki koordinat GPS. Ambil lokasi dulu sebelum mengunci.' }, 400);
      if (cp.is_locked) return json({ error: 'Titik sudah terkunci' }, 400);
      const { error: e1 } = await supabase
        .from('checkpoints')
        .update({ is_locked: true, locked_at: new Date().toISOString(), locked_by: adminProfile.id })
        .eq('id', checkpointId);
      if (e1) return json({ error: e1.message }, 400);
      await supabase.from('audit_log').insert({
        admin_id: adminProfile.id,
        action: 'lock_checkpoint',
        target_id: checkpointId,
        details: { lat: cp.lat, lng: cp.lng },
      });
      return json({ success: true });
    }

    // ---- Buka kunci titik ----
    if (action === 'unlock_checkpoint') {
      const { checkpointId } = body;
      if (!checkpointId) return json({ error: 'checkpointId wajib' }, 400);
      const { data: cp } = await supabase.from('checkpoints').select('is_locked').eq('id', checkpointId).maybeSingle();
      if (!cp) return json({ error: 'Titik tidak ditemukan' }, 404);
      if (!cp.is_locked) return json({ error: 'Titik tidak sedang terkunci' }, 400);
      const { error: e1 } = await supabase
        .from('checkpoints')
        .update({ is_locked: false, locked_at: null, locked_by: null })
        .eq('id', checkpointId);
      if (e1) return json({ error: e1.message }, 400);
      await supabase.from('audit_log').insert({
        admin_id: adminProfile.id,
        action: 'unlock_checkpoint',
        target_id: checkpointId,
      });
      return json({ success: true });
    }

    // ---- Finish patrol ----
    if (action === 'finish_patrol') {
      const { patrolId } = body;
      if (!patrolId) return json({ error: 'patrolId wajib' }, 400);
      const { error: e1 } = await supabase.from('patrols').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', patrolId);
      if (e1) return json({ error: e1.message }, 400);
      return json({ success: true });
    }

    return json({ error: 'Aksi tidak dikenal' }, 400);
  } catch (err) {
    return json({ error: 'Kesalahan server: ' + (err as Error).message }, 500);
  }
});
// Patroli edge function
