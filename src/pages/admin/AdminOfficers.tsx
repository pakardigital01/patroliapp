import { useCallback, useEffect, useState } from 'react';
import { Users, Search, Pencil, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner, Field, Input, Select } from '@/components/ui';
import { Dialog, ConfirmDialog } from '@/components/Dialog';
import { formatWib } from '@/lib/time';
import type { Branch, Profile, AccountStatus } from '@/lib/types';

export function AdminOfficers() {
  const { show } = useToast();
  const [officers, setOfficers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editStatus, setEditStatus] = useState<AccountStatus>('active');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'petugas')
      .order('created_at', { ascending: false });
    setOfficers((data ?? []) as Profile[]);
    const { data: bs } = await supabase.from('branches').select('*').order('name');
    setBranches((bs ?? []) as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = officers.filter((o) => {
    const q = search.toLowerCase();
    return o.full_name.toLowerCase().includes(q) || (o.npk ?? '').toLowerCase().includes(q);
  });

  const openEdit = (p: Profile) => {
    setEditing(p);
    setEditName(p.full_name);
    setEditEmail('');
    setEditBranch(p.branch_id ?? '');
    setEditStatus(p.status);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    const { data: session } = await supabase.auth.getSession();
    const body: Record<string, unknown> = {
      action: 'update_officer',
      userId: editing.id,
      fullName: editName,
      branchId: editBranch || null,
      status: editStatus,
    };
    if (editEmail) body.email = editEmail;
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      show('Gagal: ' + (j.error ?? resp.status), 'error');
      return;
    }
    show('Petugas diperbarui', 'success');
    setEditing(null);
    load();
  };

  const doReset = async () => {
    if (!resetTarget || newPassword.length < 8) {
      show('Password minimal 8 karakter', 'error');
      return;
    }
    setBusy(true);
    const { data: session } = await supabase.auth.getSession();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'reset_password', userId: resetTarget.id, newPassword }),
    });
    setBusy(false);
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      show('Gagal: ' + (j.error ?? resp.status), 'error');
      return;
    }
    show('Password direset', 'success');
    setResetTarget(null);
    setNewPassword('');
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;

  const statusColor = (s: AccountStatus) =>
    s === 'active' ? 'success' : s === 'pending' ? 'warning' : s === 'rejected' ? 'danger' : 'neutral';

  return (
    <div className="px-4">
      <h2 className="font-semibold text-tinta text-lg mb-3">Petugas</h2>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tintalight" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau NPK…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={40} />} title="Tidak ada petugas" />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const br = branches.find((b) => b.id === o.branch_id);
            return (
              <div key={o.id} className="bg-white rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-tinta text-sm">{o.full_name}</p>
                    <p className="text-xs text-tintalight">NPK: {o.npk ?? '-'}</p>
                    <p className="text-xs text-tintalight mt-0.5">Cabang: {br?.name ?? '—'}</p>
                    {o.rejection_reason && <p className="text-xs text-bahaya mt-0.5">Ditolak: {o.rejection_reason}</p>}
                  </div>
                  <Badge color={statusColor(o.status)}>{o.status}</Badge>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(o)}>
                    <Pencil size={14} /> Ubah
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setResetTarget(o)}>
                    <KeyRound size={14} /> Reset Password
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Ubah Petugas" maxWidth="max-w-md">
        {editing && (
          <div className="space-y-0">
            <Field label="Nama Lengkap" required>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </Field>
            <Field label="Email" hint="Kosongkan jika tidak diubah">
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder={editing.id} />
            </Field>
            <Field label="Cabang">
              <Select value={editBranch} onChange={(e) => setEditBranch(e.target.value)}>
                <option value="">— Tidak ada —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as AccountStatus)}>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="rejected">Rejected</option>
              </Select>
            </Field>
            <Button full loading={busy} onClick={saveEdit}>Simpan</Button>
          </div>
        )}
      </Dialog>

      <Dialog open={!!resetTarget} onClose={() => { setResetTarget(null); setNewPassword(''); }} title="Reset Password" maxWidth="max-w-sm">
        {resetTarget && (
          <div className="space-y-0">
            <p className="text-sm text-tintalight mb-3">Reset password untuk <span className="font-medium text-tinta">{resetTarget.full_name}</span></p>
            <Field label="Password Baru" required hint="Minimal 8 karakter">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Button full loading={busy} onClick={doReset}>Reset Password</Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
