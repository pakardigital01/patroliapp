import { useCallback, useEffect, useState } from 'react';
import { UserCheck, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner, Field, Select, Textarea } from '@/components/ui';
import { Dialog, ConfirmDialog } from '@/components/Dialog';
import { formatWib } from '@/lib/time';
import type { Branch, Profile } from '@/lib/types';

interface Props {
  onCountChange: (n: number) => void;
}

export function AdminApproval({ onCountChange }: Props) {
  const { show } = useToast();
  const [pending, setPending] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState<Profile | null>(null);
  const [actionMode, setActionMode] = useState<'approve' | 'reject' | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ps } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setPending((ps ?? []) as Profile[]);
    onCountChange(ps?.length ?? 0);
    const { data: bs } = await supabase.from('branches').select('*').eq('active', true).order('name');
    setBranches((bs ?? []) as Branch[]);
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const openApprove = (p: Profile) => {
    setActionTarget(p);
    setActionMode('approve');
    setSelectedBranch(branches[0]?.id ?? '');
  };

  const openReject = (p: Profile) => {
    setActionTarget(p);
    setActionMode('reject');
    setRejectReason('');
  };

  const doAction = async () => {
    if (!actionTarget || !actionMode) return;
    setBusy(true);
    const { data: session } = await supabase.auth.getSession();
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`;
    const body =
      actionMode === 'approve'
        ? { action: 'approve', userId: actionTarget.id, branchId: selectedBranch }
        : { action: 'reject', userId: actionTarget.id, reason: rejectReason };
    const resp = await fetch(apiUrl, {
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
    show(actionMode === 'approve' ? 'Petugas disetujui' : 'Petugas ditolak', 'success');
    setActionTarget(null);
    setActionMode(null);
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;

  return (
    <div className="px-4">
      <h2 className="font-semibold text-tinta text-lg mb-3">Antrean Persetujuan</h2>
      {pending.length === 0 ? (
        <EmptyState icon={<UserCheck size={40} />} title="Tidak ada pendaftaran menunggu" message="Semua pendaftaran telah ditinjau." />
      ) : (
        <div className="space-y-2">
          {pending.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-tinta">{p.full_name}</p>
                  <p className="text-sm text-tintalight">NPK: {p.npk}</p>
                  <p className="text-xs text-tintalight mt-1">Daftar: {formatWib(p.created_at)}</p>
                </div>
                <Badge color="warning">Menunggu</Badge>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="success" onClick={() => openApprove(p)}>
                  <Check size={15} /> Setujui
                </Button>
                <Button size="sm" variant="danger" onClick={() => openReject(p)}>
                  <X size={15} /> Tolak
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!actionTarget && actionMode === 'approve'}
        onClose={() => { setActionTarget(null); setActionMode(null); }}
        title="Setujui Petugas"
      >
        {actionTarget && (
          <div className="space-y-4">
            <div className="bg-kertasdark rounded-lg p-3 text-sm">
              <p className="font-medium text-tinta">{actionTarget.full_name}</p>
              <p className="text-tintalight">NPK: {actionTarget.npk}</p>
            </div>
            <Field label="Pilih Cabang" required>
              <Select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </Select>
            </Field>
            <Button full loading={busy} onClick={doAction}>
              <Check size={16} /> Setujui & Tetapkan Cabang
            </Button>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!actionTarget && actionMode === 'reject'}
        onClose={() => { setActionTarget(null); setActionMode(null); }}
        title="Tolak Petugas"
      >
        {actionTarget && (
          <div className="space-y-4">
            <Field label="Alasan Penolakan (opsional)">
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Alasan penolakan…" />
            </Field>
            <Button full variant="danger" loading={busy} onClick={doAction}>
              <X size={16} /> Tolak Petugas
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
