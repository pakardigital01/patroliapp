import { useCallback, useEffect, useState } from 'react';
import { FileText, ChevronRight, Calendar, MapPin, Loader2, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatWib, formatWibDate } from '@/lib/time';
import { Badge, EmptyState, Spinner } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import type { Entry, Patrol, Photo } from '@/lib/types';

export function OfficerReports() {
  const { user } = useAuth();
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailPatrol, setDetailPatrol] = useState<Patrol | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('patrols')
      .select('*')
      .eq('officer_id', user.id)
      .order('started_at', { ascending: false });
    setPatrols((data ?? []) as Patrol[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;

  if (patrols.length === 0) {
    return <EmptyState icon={<FileText size={40} />} title="Belum ada laporan" message="Laporan patroli Anda akan muncul di sini." />;
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold text-tinta text-lg mb-1">Laporan Saya</h2>
      {patrols.map((p) => {
        const hasTemuan = false; // computed in detail
        return (
          <button
            key={p.id}
            onClick={() => setDetailPatrol(p)}
            className="w-full text-left bg-white rounded-lg border border-border p-4 hover:border-aksen transition-colors btn-touch"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-tinta text-sm truncate">{p.branch_name} ({p.branch_code})</p>
                <div className="flex flex-wrap gap-2 mt-1 text-xs text-tintalight">
                  <span className="flex items-center gap-1"><Calendar size={11} /> {formatWibDate(p.shift_date)}</span>
                  <span>· Shift {p.shift}</span>
                </div>
                <p className="text-xs text-tintalight mt-0.5">Mulai {formatWib(p.started_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge color={p.status === 'ongoing' ? 'accent' : 'success'}>
                  {p.status === 'ongoing' ? 'Berjalan' : 'Selesai'}
                </Badge>
                <ChevronRight size={18} className="text-tintalight" />
              </div>
            </div>
          </button>
        );
      })}

      {detailPatrol && (
        <PatrolDetail patrol={detailPatrol} onClose={() => setDetailPatrol(null)} />
      )}
    </div>
  );
}

function PatrolDetail({ patrol, onClose }: { patrol: Patrol; onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [photos, setPhotos] = useState<Record<string, { url: string; kind: string }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: ens } = await supabase.from('entries').select('*').eq('patrol_id', patrol.id).order('created_at');
      setEntries((ens ?? []) as Entry[]);
      if (ens && ens.length > 0) {
        const ids = (ens as Entry[]).map((e) => e.id);
        const { data: phs } = await supabase.from('photos').select('*').in('entry_id', ids);
        const map: Record<string, { url: string; kind: string }[]> = {};
        for (const ph of (phs as Photo[] | null) ?? []) {
          const { data } = await supabase.storage.from('photos').createSignedUrl(ph.storage_path, 3600);
          (map[ph.entry_id] ??= []).push({ url: data?.signedUrl ?? '', kind: ph.kind });
        }
        setPhotos(map);
      }
      setLoading(false);
    })();
  }, [patrol.id]);

  const hasTemuan = entries.some((e) => e.condition === 'temuan');
  const hasPerhatian = entries.some((e) => e.condition === 'perhatian');
  const overall = hasTemuan ? 'ADA TEMUAN' : hasPerhatian ? 'PERLU PERHATIAN' : 'AMAN';

  return (
    <Dialog open={true} onClose={onClose} title={`Laporan ${patrol.branch_code}`} maxWidth="max-w-lg">
      {loading ? (
        <div className="flex justify-center py-8"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-4">
          <div className="bg-kertasdark rounded-lg p-3 space-y-1 text-sm">
            <p className="font-medium text-tinta">{patrol.branch_name} ({patrol.branch_code})</p>
            <p className="text-tintalight">Petugas: {patrol.officer_name} (NPK {patrol.officer_npk})</p>
            <p className="text-tintalight">Shift {patrol.shift} — {formatWibDate(patrol.shift_date)}</p>
            <p className="text-tintalight">Mulai: {formatWib(patrol.started_at, true)}</p>
            {patrol.finished_at && <p className="text-tintalight">Selesai: {formatWib(patrol.finished_at, true)}</p>}
            <div className="pt-2">
              <Badge color={hasTemuan ? 'danger' : hasPerhatian ? 'warning' : 'success'}>{overall}</Badge>
            </div>
          </div>

          {entries.length === 0 ? (
            <EmptyState title="Tidak ada titik terisi" />
          ) : (
            <div className="space-y-3">
              {entries.map((e, i) => (
                <div key={e.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-tinta text-sm">Titik {i + 1}</p>
                    <Badge color={e.condition === 'aman' ? 'success' : e.condition === 'perhatian' ? 'warning' : 'danger'}>
                      {e.condition === 'aman' ? 'Aman' : e.condition === 'perhatian' ? 'Perhatian' : 'Temuan'}
                    </Badge>
                  </div>
                  {e.suspicious && (
                    <p className="text-[11px] text-bahaya mb-1 flex items-center gap-1">⚠ Mencurigakan</p>
                  )}
                  <p className="text-sm text-tintalight mb-2">{e.notes}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {photos[e.id]?.map((ph, j) => (
                      <a key={j} href={ph.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded overflow-hidden border border-border">
                        <img src={ph.url} alt={`Foto ${j + 1}`} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                  {e.selfie_lat != null && (
                    <p className="text-[10px] text-tintalight mt-2">
                      GPS selfie: {e.selfie_lat.toFixed(6)}, {e.selfie_lng?.toFixed(6)} (±{e.selfie_accuracy?.toFixed(0)} m)
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
