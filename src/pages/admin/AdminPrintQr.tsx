import { useCallback, useEffect, useState } from 'react';
import { Printer, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner, Select } from '@/components/ui';
import { generateQrDataUrl } from '@/lib/qr';
import type { Branch, Checkpoint } from '@/lib/types';

interface PrintCard {
  checkpoint: Checkpoint;
  branch: Branch;
  qrUrl: string;
}

export function AdminPrintQr() {
  const { show } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [printCards, setPrintCards] = useState<PrintCard[]>([]);
  const [printMode, setPrintMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: bs } = await supabase.from('branches').select('*').order('name');
    setBranches((bs ?? []) as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      let query = supabase.from('checkpoints').select('*').eq('active', true).eq('qr_mode', 'statis').order('seq');
      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }
      const { data } = await query;
      const filtered = ((data ?? []) as Checkpoint[]).filter((c) => c.lat != null && c.lng != null);
      setCheckpoints(filtered);
      setSelected(new Set());
    })();
  }, [selectedBranch]);

  const toggleSelect = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(checkpoints.map((c) => c.id)));

  const generateAndPrint = async (cards: PrintCard[]) => {
    setPrintCards(cards);
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintMode(false), 500);
    }, 300);
  };

  const generateCards = async (cps: Checkpoint[]): Promise<PrintCard[]> => {
    const cards: PrintCard[] = [];
    const { data: session } = await supabase.auth.getSession();
    for (const cp of cps) {
      const branch = branches.find((b) => b.id === cp.branch_id);
      if (!branch) continue;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-qr`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ checkpointId: cp.id }),
      });
      const j = await resp.json();
      const qrUrl = await generateQrDataUrl(j.token, 200);
      cards.push({ checkpoint: cp, branch, qrUrl });
    }
    return cards;
  };

  const printChecked = async () => {
    if (selected.size === 0) { show('Pilih minimal satu titik', 'warning'); return; }
    setGenerating(true);
    const cards = await generateCards(checkpoints.filter((c) => selected.has(c.id)));
    setGenerating(false);
    await generateAndPrint(cards);
  };

  const printAll = async () => {
    setGenerating(true);
    const cards = await generateCards(checkpoints);
    setGenerating(false);
    await generateAndPrint(cards);
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;

  return (
    <div className="px-4">
      <h2 className="font-semibold text-tinta text-lg mb-1">Cetak QR</h2>
      <p className="text-xs text-tintalight mb-3">
        Hanya titik bermode <span className="font-medium">statis</span> yang sudah dikunci GPS yang dapat dicetak.
        QR dinamis tidak bisa dicetak.
      </p>

      <div className="flex gap-2 items-center mb-3">
        <Select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="flex-1">
          <option value="all">Semua Cabang</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={selectAll}>Pilih Semua</Button>
      </div>

      {checkpoints.length === 0 ? (
        <EmptyState icon={<Printer size={40} />} title="Tidak ada titik statis" message="Tidak ada titik bermode statis dengan GPS yang dapat dicetak. QR dinamis tidak dapat dicetak." />
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {checkpoints.map((cp) => {
              const br = branches.find((b) => b.id === cp.branch_id);
              return (
                <button
                  key={cp.id}
                  onClick={() => toggleSelect(cp.id)}
                  className="w-full text-left bg-white rounded-lg border border-border p-3 flex items-center gap-3 btn-touch"
                >
                  {selected.has(cp.id) ? <CheckSquare size={18} className="text-aksen" /> : <Square size={18} className="text-border" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-tinta text-sm">{cp.name}</p>
                    <div className="flex gap-1.5 mt-1">
                      <Badge color="accent">Statis</Badge>
                      <span className="text-xs text-tintalight">{br?.name} ({br?.code})</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sticky bottom-0 bg-kertas py-3 no-print">
            <Button full onClick={printChecked} disabled={selected.size === 0 || generating} loading={generating}>
              <Printer size={16} /> Cetak yang dicentang ({selected.size})
            </Button>
            <Button full variant="secondary" onClick={printAll} disabled={generating}>
              <Printer size={16} /> Cetak semua QR statis{selectedBranch !== 'all' ? ' cabang ini' : ''}
            </Button>
          </div>
        </>
      )}

      {printMode && (
        <div className="print-grid fixed inset-0 bg-white z-[200]">
          {printCards.map((card, i) => (
            <div key={i} className="print-card">
              <p className="font-bold text-base">{card.checkpoint.name}</p>
              <p className="text-sm">{card.branch.name}</p>
              <p className="text-xs text-gray-500">Kode: {card.branch.code}</p>
              <img src={card.qrUrl} alt="QR" className="mx-auto my-3 w-40 h-40" />
              <p className="text-[10px] text-gray-600 mt-2">
                QR terenkripsi, jangan difoto atau dibagikan.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
