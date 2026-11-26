import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MapPin, QrCode, Camera, CheckCircle2, Circle, AlertTriangle, Eye, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, Spinner, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/Dialog';
import { formatWib, formatWibDate } from '@/lib/time';
import type { Checkpoint, Entry, Patrol, Photo } from '@/lib/types';
import { CheckpointFill } from './CheckpointFill';

interface Props {
  patrolId: string;
  onExit: () => void;
}

export function OfficerPatrol({ patrolId, onExit }: Props) {
  const { show } = useToast();
  const [patrol, setPatrol] = useState<Patrol | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [photos, setPhotos] = useState<Record<string, Photo[]>>({});
  const [scansOk, setScansOk] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fillCp, setFillCp] = useState<Checkpoint | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: p } = await supabase.from('patrols').select('*').eq('id', patrolId).maybeSingle();
    setPatrol(p as Patrol | null);
    if (p) {
      const { data: cps } = await supabase
        .from('checkpoints')
        .select('*')
        .eq('branch_id', (p as Patrol).branch_id)
        .eq('active', true)
        .order('seq');
      setCheckpoints((cps ?? []) as Checkpoint[]);
      const { data: ens } = await supabase
        .from('entries')
        .select('*')
        .eq('patrol_id', patrolId);
      setEntries((ens ?? []) as Entry[]);
      // photos
      if (ens && ens.length > 0) {
        const ids = (ens as Entry[]).map((e) => e.id);
        const { data: phs } = await supabase.from('photos').select('*').in('entry_id', ids);
        const map: Record<string, Photo[]> = {};
        (phs as Photo[] | null)?.forEach((ph) => {
          (map[ph.entry_id] ??= []).push(ph);
        });
        setPhotos(map);
      }
      // scans sukses
      const { data: scans } = await supabase
        .from('scans')
        .select('checkpoint_id')
        .eq('patrol_id', patrolId)
        .eq('success', true);
      setScansOk(new Set((scans ?? []).map((s: { checkpoint_id: string }) => s.checkpoint_id)));
    }
    setLoading(false);
  }, [patrolId]);

  useEffect(() => {
    load();
  }, [load]);

  const entryFor = (cpId: string) => entries.find((e) => e.checkpoint_id === cpId);
  const isComplete = (cpId: string) => !!entryFor(cpId);
  const allComplete = checkpoints.length > 0 && checkpoints.every((c) => isComplete(c.id));

  const finishPatrol = async () => {
    setConfirmFinish(false);
    setFinishing(true);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`;
    const { data: session } = await supabase.auth.getSession();
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'finish_patrol', patrolId }),
    });
    setFinishing(false);
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      show('Gagal menyelesaikan: ' + (j.error ?? resp.status), 'error');
      return;
    }
    show('Patroli selesai', 'success');
    // kirim laporan email
    setSendingReport(true);
    const resp2 = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ patrolId }),
    });
    setSendingReport(false);
    if (resp2.ok) {
      show('Laporan terkirim ke email penerima cabang', 'success');
    } else {
      const j = await resp2.json().catch(() => ({}));
      show('Laporan selesai tapi email belum terkirim: ' + (j.error ?? 'kesalahan'), 'warning');
    }
    onExit();
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;
  if (!patrol) return <EmptyState title="Patroli tidak ditemukan" />;

  if (fillCp) {
    return (
      <CheckpointFill
        patrol={patrol}
        checkpoint={fillCp}
        existingEntry={entryFor(fillCp.id) ?? null}
        existingPhotos={photos[entryFor(fillCp.id)?.id ?? ''] ?? []}
        scanVerified={scansOk.has(fillCp.id)}
        onClose={() => { setFillCp(null); load(); }}
      />
    );
  }

  const done = entries.length;
  const total = checkpoints.length;
  const hasTemuan = entries.some((e) => e.condition === 'temuan');
  const hasPerhatian = entries.some((e) => e.condition === 'perhatian');

  return (
    <div className="min-h-screen bg-kertas max-w-[720px] mx-auto pb-24">
      <header className="bg-tinta text-kertas sticky top-0 z-30 no-print">
        <div className="px-3 py-3 flex items-center gap-2">
          <button onClick={onExit} className="btn-touch p-1.5 rounded hover:bg-tintasoft" aria-label="Kembali">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">Patroli {patrol.branch_code}</p>
            <p className="text-[11px] text-kertas/60">{patrol.branch_name} · Shift {patrol.shift}</p>
          </div>
          <Badge color={patrol.status === 'ongoing' ? 'accent' : 'success'}>
            {patrol.status === 'ongoing' ? 'Berjalan' : 'Selesai'}
          </Badge>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-lg border border-border p-4">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-medium text-tinta">Progres</p>
            <p className="text-sm font-semibold text-aksen">{done}/{total}</p>
          </div>
          <div className="h-2 bg-kertasdark rounded-full overflow-hidden">
            <div className="h-full bg-aksen transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <p className="text-xs text-tintalight">{formatWibDate(patrol.shift_date)}</p>
            <span className="text-xs text-tintalight">·</span>
            <p className="text-xs text-tintalight">Mulai {formatWib(patrol.started_at)}</p>
          </div>
          {patrol.status === 'done' && (
            <div className="mt-2">
              <Badge color={hasTemuan ? 'danger' : hasPerhatian ? 'warning' : 'success'}>
                {hasTemuan ? 'ADA TEMUAN' : hasPerhatian ? 'PERLU PERHATIAN' : 'AMAN'}
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {checkpoints.map((cp, i) => {
            const entry = entryFor(cp.id);
            const complete = isComplete(cp.id);
            const needsQr = cp.lat != null && cp.lng != null;
            const scanned = scansOk.has(cp.id);
            return (
              <button
                key={cp.id}
                onClick={() => setFillCp(cp)}
                className="w-full text-left bg-white rounded-lg border border-border p-3 hover:border-aksen transition-colors btn-touch"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {complete ? (
                      <CheckCircle2 size={22} className="text-sukses" />
                    ) : (
                      <Circle size={22} className="text-border" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-tinta text-sm">{i + 1}. {cp.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {needsQr ? (
                        <Badge color={scanned ? 'success' : 'neutral'}>
                          <QrCode size={11} /> {scanned ? 'Terverifikasi' : 'Perlu QR'}
                        </Badge>
                      ) : (
                        <Badge color="neutral"><MapPin size={11} /> Tanpa GPS</Badge>
                      )}
                      {entry && (
                        <Badge color={entry.condition === 'aman' ? 'success' : entry.condition === 'perhatian' ? 'warning' : 'danger'}>
                          {entry.condition === 'aman' ? 'Aman' : entry.condition === 'perhatian' ? 'Perhatian' : 'Temuan'}
                        </Badge>
                      )}
                      {entry?.suspicious && (
                        <Badge color="danger"><AlertTriangle size={11} /> Mencurigakan</Badge>
                      )}
                    </div>
                  </div>
                  <Eye size={18} className="text-tintalight flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>

        {patrol.status === 'ongoing' && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[720px] bg-white border-t border-border p-3 no-print z-30">
            <Button
              full
              size="lg"
              variant="success"
              disabled={!allComplete || finishing}
              onClick={() => setConfirmFinish(true)}
            >
              {finishing ? <Loader2 size={18} className="inline animate-spin" /> : <CheckCircle2 size={18} className="inline" />}
              {' '}Selesaikan Patroli
            </Button>
            {!allComplete && (
              <p className="text-[11px] text-tintalight text-center mt-1">
                Semua titik harus terisi untuk menyelesaikan
              </p>
            )}
            {sendingReport && (
              <p className="text-[11px] text-aksen text-center mt-1 flex items-center justify-center gap-1">
                <Send size={11} /> Mengirim laporan email…
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmFinish}
        title="Selesaikan Patroli?"
        message={`Anda akan menyelesaikan patroli ${patrol.branch_code} shift ${patrol.shift}. Laporan akan dibuat dan dikirim ke email penerima cabang. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Selesaikan"
        onConfirm={finishPatrol}
        onCancel={() => setConfirmFinish(false)}
      />
    </div>
  );
}
