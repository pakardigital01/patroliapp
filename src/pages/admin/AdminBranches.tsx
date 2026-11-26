import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, Check, X, ListOrdered } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner, Field, Input, Textarea } from '@/components/ui';
import { Dialog, ConfirmDialog } from '@/components/Dialog';
import { branchSchema, parseEmailList } from '@/lib/validation';
import type { Branch } from '@/lib/types';
import { CheckpointsPage } from './CheckpointsPage';

export function AdminBranches() {
  const { show } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [activeOfficers, setActiveOfficers] = useState<Record<string, number>>({});
  const [checkpointsBranch, setCheckpointsBranch] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('branches').select('*').order('name');
    setBranches((data ?? []) as Branch[]);
    const counts: Record<string, number> = {};
    for (const b of (data ?? []) as Branch[]) {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', b.id)
        .eq('status', 'active');
      counts[b.id] = count ?? 0;
    }
    setActiveOfficers(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (b: Branch) => {
    if (b.active && (activeOfficers[b.id] ?? 0) > 0) {
      show('Tidak dapat menonaktifkan cabang yang masih punya petugas aktif', 'error');
      return;
    }
    const { error } = await supabase.from('branches').update({ active: !b.active }).eq('id', b.id);
    if (error) { show('Gagal: ' + error.message, 'error'); return; }
    show(b.active ? 'Cabang dinonaktifkan' : 'Cabang diaktifkan', 'success');
    load();
  };

  const deleteBranch = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('branches').delete().eq('id', confirmDelete.id);
    setConfirmDelete(null);
    if (error) { show('Gagal menghapus: ' + error.message, 'error'); return; }
    show('Cabang dihapus', 'success');
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;

  if (checkpointsBranch) {
    return <CheckpointsPage branch={checkpointsBranch} onBack={() => setCheckpointsBranch(null)} />;
  }

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-tinta text-lg">Cabang</h2>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus size={16} /> Tambah
        </Button>
      </div>

      {branches.length === 0 ? (
        <EmptyState icon={<Building2 size={40} />} title="Belum ada cabang" />
      ) : (
        <div className="space-y-2">
          {branches.map((b) => (
            <div key={b.id} className="bg-white rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-tinta">{b.name}</p>
                    <Badge color={b.active ? 'success' : 'neutral'}>{b.active ? 'Aktif' : 'Nonaktif'}</Badge>
                  </div>
                  <p className="text-sm text-tintalight mt-0.5">{b.code}</p>
                  {b.address && <p className="text-xs text-tintalight mt-1">{b.address}</p>}
                  {b.report_emails && <p className="text-xs text-tintalight mt-1">Email laporan: {b.report_emails}</p>}
                  <p className="text-xs text-tintalight mt-1">Petugas aktif: {activeOfficers[b.id] ?? 0}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => { setEditing(b); setShowForm(true); }}>
                  <Pencil size={14} /> Ubah
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toggleActive(b)}>
                  {b.active ? <X size={14} /> : <Check size={14} />} {b.active ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setCheckpointsBranch(b)}>
                  <ListOrdered size={14} /> Titik Patroli
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(b)}>
                  <Trash2 size={14} /> Hapus
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BranchForm
        open={showForm}
        branch={editing}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); load(); }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Hapus Cabang?"
        message={`Hapus ${confirmDelete?.name}? Semua titik patroli akan ikut terhapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={deleteBranch}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function BranchForm({ open, branch, onClose, onSaved }: { open: boolean; branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const { show } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [reportEmails, setReportEmails] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(branch?.name ?? '');
      setCode(branch?.code ?? '');
      setAddress(branch?.address ?? '');
      setReportEmails(branch?.report_emails ?? '');
      setActive(branch?.active ?? true);
      setErrors({});
    }
  }, [open, branch]);

  const save = async () => {
    const parsed = branchSchema.safeParse({ name, code, address, report_emails: reportEmails, active });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (fe[i.path[0] as string] = i.message));
      setErrors(fe);
      return;
    }
    if (reportEmails && parseEmailList(reportEmails).length === 0) {
      setErrors({ report_emails: 'Format email tidak valid (pisahkan koma)' });
      return;
    }
    setSaving(true);
    if (branch) {
      const { error } = await supabase.from('branches').update(parsed.data).eq('id', branch.id);
      setSaving(false);
      if (error) { show('Gagal: ' + error.message, 'error'); return; }
      show('Cabang diperbarui', 'success');
    } else {
      const { error } = await supabase.from('branches').insert(parsed.data);
      setSaving(false);
      if (error) { show('Gagal: ' + error.message, 'error'); return; }
      show('Cabang ditambahkan', 'success');
    }
    onSaved();
  };

  return (
    <Dialog open={open} onClose={onClose} title={branch ? 'Ubah Cabang' : 'Tambah Cabang'} maxWidth="max-w-md">
      <div className="space-y-0">
        <Field label="Nama Cabang" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Nama cabang" />
        </Field>
        <Field label="Kode Cabang (BA)" required error={errors.code} hint="Huruf/angka, unik">
          <Input value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} placeholder="BA-001" />
        </Field>
        <Field label="Alamat">
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Alamat cabang" />
        </Field>
        <Field label="Email Penerima Laporan" hint="Boleh beberapa, pisahkan koma" error={errors.report_emails}>
          <Input value={reportEmails} onChange={(e) => setReportEmails(e.target.value)} error={errors.report_emails} placeholder="a@perusahaan.id, b@perusahaan.id" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-tinta mb-4">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-aksen" />
          Cabang aktif
        </label>
        <Button full loading={saving} onClick={save}>Simpan</Button>
      </div>
    </Dialog>
  );
}

