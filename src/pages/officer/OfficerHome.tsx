import { useCallback, useEffect, useState } from 'react';
import { Play, MapPin, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner } from '@/components/ui';
import { defaultShift, shiftDateFor, formatWib, formatWibDate, type Shift } from '@/lib/time';
import type { Branch, Patrol } from '@/lib/types';

interface Props {
  onOpenPatrol: (id: string) => void;
}

export function OfficerHome({ onOpenPatrol }: Props) {
  const { user } = useAuth();
  const { show } = useToast();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [ongoing, setOngoing] = useState<Patrol | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [shift, setShift] = useState<Shift>(defaultShift());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: b } = await supabase
      .from('branches')
      .select('*')
      .eq('id', user.profile?.branch_id)
      .maybeSingle();
    setBranch(b as Branch | null);
    const { data: p } = await supabase
      .from('patrols')
      .select('*')
      .eq('officer_id', user.id)
      .eq('status', 'ongoing')
      .maybeSingle();
    setOngoing(p as Patrol | null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const startPatrol = async () => {
    if (!user || !branch) return;
    if (ongoing) {
      show('Anda masih punya patroli berjalan', 'warning');
      return;
    }
    setStarting(true);
    const sd = shiftDateFor(new Date(), shift);
    const { data, error } = await supabase
      .from('patrols')
      .insert({
        officer_id: user.id,
        branch_id: branch.id,
        shift,
        shift_date: sd,
        status: 'ongoing',
        started_at: new Date().toISOString(),
        officer_name: user.profile?.full_name ?? '',
        officer_npk: user.profile?.npk ?? '',
        branch_name: branch.name,
        branch_code: branch.code,
        branch_address: branch.address,
      })
      .select()
      .single();
    setStarting(false);
    if (error) {
      show('Gagal memulai patroli: ' + error.message, 'error');
      return;
    }
    setOngoing(data as Patrol);
    onOpenPatrol(data.id);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner size={32} /></div>;
  }

  if (!branch) {
    return (
      <EmptyState
        icon={<MapPin size={40} />}
        title="Belum ada cabang"
        message="Hubungi admin untuk menetapkan cabang Anda."
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-lg border border-border p-4">
        <p className="text-xs text-tintalight">Cabang Anda</p>
        <p className="font-semibold text-tinta text-lg">{branch.name}</p>
        <p className="text-sm text-tintalight">{branch.code} · {branch.address}</p>
      </div>

      {ongoing ? (
        <div className="bg-aksen/10 border border-aksen/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={18} className="text-aksen" />
            <p className="font-semibold text-tinta">Patroli berjalan</p>
          </div>
          <p className="text-sm text-tintalight">Shift {ongoing.shift} — {formatWibDate(ongoing.shift_date)}</p>
          <p className="text-sm text-tintalight">Mulai: {formatWib(ongoing.started_at)}</p>
          <Button full className="mt-3" onClick={() => onOpenPatrol(ongoing.id)}>
            Lanjutkan Patroli <ChevronRight size={16} className="inline" />
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-border p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-tinta mb-2">Pilih Shift</p>
            <div className="grid grid-cols-3 gap-2">
              {(['Pagi', 'Siang', 'Malam'] as Shift[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setShift(s)}
                  className={`btn-touch rounded border text-xs font-medium py-2.5 px-1 transition-colors ${
                    shift === s ? 'border-aksen bg-aksen/10 text-aksen' : 'border-border bg-kertas text-tintalight'
                  }`}
                >
                  <div className="font-semibold">{s}</div>
                  <div className="text-[10px] mt-0.5">
                    {s === 'Pagi' ? '07-15' : s === 'Siang' ? '15-23' : '23-07'}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-tintalight mt-2">
              Tanggal patroli: {formatWibDate(shiftDateFor(new Date(), shift))}
            </p>
          </div>
          <Button full size="lg" onClick={startPatrol} disabled={starting}>
            {starting ? <Loader2 size={18} className="inline animate-spin" /> : <Play size={18} className="inline" />}
            {' '}Mulai Patroli
          </Button>
        </div>
      )}
    </div>
  );
}
