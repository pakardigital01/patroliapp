import { useCallback, useEffect, useState } from 'react';
import { FileText, Eye, Trash2, FileDown, FileSpreadsheet, Share2, Filter, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner, Select, Input } from '@/components/ui';
import { Dialog, ConfirmDialog } from '@/components/Dialog';
import { formatWib, formatWibDate, formatWibTime } from '@/lib/time';
import type { Branch, Patrol, Entry, Photo, ScanLog } from '@/lib/types';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';

export function AdminReports() {
  const { show } = useToast();
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailPatrol, setDetailPatrol] = useState<Patrol | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Set<string> | null>(null);
  const [exporting, setExporting] = useState(false);

  const [fBranch, setFBranch] = useState('all');
  const [fShift, setFShift] = useState('all');
  const [fCondition, setFCondition] = useState('all');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ps } = await supabase.from('patrols').select('*').order('started_at', { ascending: false });
    setPatrols((ps ?? []) as Patrol[]);
    const { data: bs } = await supabase.from('branches').select('*').order('name');
    setBranches((bs ?? []) as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = patrols.filter((p) => {
    if (fBranch !== 'all' && p.branch_id !== fBranch) return false;
    if (fShift !== 'all' && p.shift !== fShift) return false;
    if (fDateFrom && p.shift_date < fDateFrom) return false;
    if (fDateTo && p.shift_date > fDateTo) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAllFiltered = () => setSelected(new Set(filtered.map((p) => p.id)));

  const collectReportData = async (patrolIds: string[]) => {
    const result: { patrol: Patrol; entries: (Entry & { photos: { url: string; kind: string }[]; checkpointName: string })[] }[] = [];
    for (const pid of patrolIds) {
      const patrol = patrols.find((p) => p.id === pid);
      if (!patrol) continue;
      const { data: ens } = await supabase.from('entries').select('*, checkpoint:checkpoints(name, seq)').eq('patrol_id', pid).order('created_at');
      const entries: (Entry & { photos: { url: string; kind: string }[]; checkpointName: string })[] = [];
      for (const e of (ens ?? []) as any[]) {
        const { data: phs } = await supabase.from('photos').select('*').eq('entry_id', e.id);
        const photos: { url: string; kind: string }[] = [];
        for (const ph of (phs as Photo[] | null) ?? []) {
          const { data } = await supabase.storage.from('photos').createSignedUrl(ph.storage_path, 3600);
          photos.push({ url: data?.signedUrl ?? '', kind: ph.kind });
        }
        entries.push({ ...e, photos, checkpointName: e.checkpoint?.name ?? '-' });
      }
      result.push({ patrol, entries });
    }
    return result;
  };

  const exportPdf = async (patrolIds: string[]) => {
    setExporting(true);
    try {
      const reports = await collectReportData(patrolIds);
      const doc = new jsPDF();
      let y = 15;
      reports.forEach((r, idx) => {
        if (idx > 0) { doc.addPage(); y = 15; }
        const hasTemuan = r.entries.some((e) => e.condition === 'temuan');
        const hasPerhatian = r.entries.some((e) => e.condition === 'perhatian');
        const overall = hasTemuan ? 'ADA TEMUAN' : hasPerhatian ? 'PERLU PERHATIAN' : 'AMAN';
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text(`Laporan Patroli — ${r.patrol.branch_name} (${r.patrol.branch_code})`, 14, y); y += 7;
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Petugas: ${r.patrol.officer_name} (NPK ${r.patrol.officer_npk})`, 14, y); y += 5;
        doc.text(`Shift: ${r.patrol.shift} — ${r.patrol.shift_date}`, 14, y); y += 5;
        doc.text(`Mulai: ${formatWib(r.patrol.started_at, true)}`, 14, y); y += 5;
        if (r.patrol.finished_at) { doc.text(`Selesai: ${formatWib(r.patrol.finished_at, true)}`, 14, y); y += 5; }
        doc.setFont('helvetica', 'bold');
        doc.text(`Status: ${overall}`, 14, y); y += 8;
        doc.setFont('helvetica', 'normal');
        r.entries.forEach((e, i) => {
          if (y > 270) { doc.addPage(); y = 15; }
          const condLabel = e.condition === 'aman' ? 'Aman' : e.condition === 'perhatian' ? 'Perlu Perhatian' : 'Ada Temuan';
          doc.setFont('helvetica', 'bold');
          doc.text(`${i + 1}. ${e.checkpointName} — ${condLabel}${e.suspicious ? ' (MENCURIGAKAN)' : ''}`, 14, y); y += 5;
          doc.setFont('helvetica', 'normal');
          const notes = doc.splitTextToSize(e.notes, 180);
          doc.text(notes, 14, y); y += notes.length * 5;
          if (e.selfie_lat != null) {
            doc.setFontSize(8);
            doc.text(`GPS selfie: ${e.selfie_lat.toFixed(6)}, ${e.selfie_lng?.toFixed(6)} (±${e.selfie_accuracy?.toFixed(0)} m)`, 14, y);
            y += 4;
            doc.setFontSize(10);
          }
          y += 2;
        });
      });
      doc.save(`laporan_patroli_${Date.now()}.pdf`);
      show('PDF berhasil diunduh', 'success');
    } catch (err) {
      show('Gagal membuat PDF: ' + (err as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async (patrolIds: string[]) => {
    setExporting(true);
    try {
      const reports = await collectReportData(patrolIds);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Laporan Patroli');
      ws.columns = [
        { header: 'Cabang', key: 'branch', width: 20 },
        { header: 'Kode BA', key: 'code', width: 12 },
        { header: 'Petugas', key: 'officer', width: 20 },
        { header: 'NPK', key: 'npk', width: 12 },
        { header: 'Shift', key: 'shift', width: 10 },
        { header: 'Tanggal', key: 'date', width: 14 },
        { header: 'Mulai', key: 'start', width: 18 },
        { header: 'Selesai', key: 'end', width: 18 },
        { header: 'Titik', key: 'checkpoint', width: 20 },
        { header: 'Kondisi', key: 'condition', width: 14 },
        { header: 'Keterangan', key: 'notes', width: 40 },
        { header: 'GPS Selfie', key: 'gps', width: 30 },
        { header: 'Mencurigakan', key: 'suspicious', width: 12 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const r of reports) {
        if (r.entries.length === 0) {
          ws.addRow({
            branch: r.patrol.branch_name, code: r.patrol.branch_code, officer: r.patrol.officer_name,
            npk: r.patrol.officer_npk, shift: r.patrol.shift, date: r.patrol.shift_date,
            start: formatWib(r.patrol.started_at, true), end: r.patrol.finished_at ? formatWib(r.patrol.finished_at, true) : '-',
            checkpoint: '-', condition: '-', notes: '-', gps: '-', suspicious: '-',
          });
        } else {
          for (const e of r.entries) {
            ws.addRow({
              branch: r.patrol.branch_name, code: r.patrol.branch_code, officer: r.patrol.officer_name,
              npk: r.patrol.officer_npk, shift: r.patrol.shift, date: r.patrol.shift_date,
              start: formatWib(r.patrol.started_at, true), end: r.patrol.finished_at ? formatWib(r.patrol.finished_at, true) : '-',
              checkpoint: e.checkpointName,
              condition: e.condition === 'aman' ? 'Aman' : e.condition === 'perhatian' ? 'Perlu Perhatian' : 'Ada Temuan',
              notes: e.notes,
              gps: e.selfie_lat != null ? `${e.selfie_lat.toFixed(6)}, ${e.selfie_lng?.toFixed(6)} (±${e.selfie_accuracy?.toFixed(0)} m)` : '-',
              suspicious: e.suspicious ? 'Ya' : 'Tidak',
            });
          }
        }
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `laporan_patroli_${Date.now()}.xlsx`;
      a.click();
      show('Excel berhasil diunduh', 'success');
    } catch (err) {
      show('Gagal membuat Excel: ' + (err as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const shareWhatsApp = (patrolIds: string[]) => {
    const reports = patrols.filter((p) => patrolIds.includes(p.id));
    let text = '*Laporan Patroli*\n\n';
    reports.forEach((p) => {
      text += `Cabang: ${p.branch_name} (${p.branch_code})\n`;
      text += `Petugas: ${p.officer_name} (NPK ${p.officer_npk})\n`;
      text += `Shift: ${p.shift} — ${p.shift_date}\n`;
      text += `Mulai: ${formatWib(p.started_at)}\n`;
      if (p.finished_at) text += `Selesai: ${formatWib(p.finished_at)}\n`;
      text += '\n';
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    for (const pid of confirmDelete) {
      const { error } = await supabase.from('patrols').delete().eq('id', pid);
      if (error) { show('Gagal menghapus: ' + error.message, 'error'); break; }
    }
    setConfirmDelete(null);
    setSelected(new Set());
    show('Laporan dihapus', 'success');
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-tinta text-lg">Laporan</h2>
        <Button size="sm" variant="secondary" onClick={() => setShowFilters((s) => !s)}>
          <Filter size={15} /> Filter
        </Button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg border border-border p-3 mb-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
              <option value="all">Semua Cabang</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Select value={fShift} onChange={(e) => setFShift(e.target.value)}>
              <option value="all">Semua Shift</option>
              <option value="Pagi">Pagi</option>
              <option value="Siang">Siang</option>
              <option value="Malam">Malam</option>
            </Select>
            <Select value={fCondition} onChange={(e) => setFCondition(e.target.value)}>
              <option value="all">Semua Kondisi</option>
              <option value="aman">Aman</option>
              <option value="perhatian">Perlu Perhatian</option>
              <option value="temuan">Ada Temuan</option>
            </Select>
            <Button size="sm" variant="secondary" onClick={() => { setFBranch('all'); setFShift('all'); setFCondition('all'); setFDateFrom(''); setFDateTo(''); }}>
              <X size={14} /> Reset
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-tintalight block mb-1">Dari tanggal</label>
              <Input type="date" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-tintalight block mb-1">Sampai tanggal</label>
              <Input type="date" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<FileText size={40} />} title="Tidak ada laporan" message="Belum ada laporan patroli yang sesuai filter." />
      ) : (
        <>
          <div className="flex gap-2 mb-3 text-xs">
            <button onClick={selectAllFiltered} className="text-aksen font-medium">Pilih semua ({filtered.length})</button>
            <span className="text-tintalight">·</span>
            <span className="text-tintalight">{selected.size} dipilih</span>
          </div>

          <div className="space-y-2 mb-4">
            {filtered.map((p) => (
              <div key={p.id} className="bg-white rounded-lg border border-border p-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="mt-1 accent-aksen" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-tinta text-sm">{p.branch_name} ({p.branch_code})</p>
                    <p className="text-xs text-tintalight">{p.officer_name} · NPK {p.officer_npk}</p>
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-tintalight">
                      <span>{formatWibDate(p.shift_date)}</span>
                      <span>· Shift {p.shift}</span>
                    </div>
                  </div>
                  <Badge color={p.status === 'ongoing' ? 'accent' : 'success'}>
                    {p.status === 'ongoing' ? 'Berjalan' : 'Selesai'}
                  </Badge>
                  <button onClick={() => setDetailPatrol(p)} className="btn-touch p-1.5 rounded hover:bg-kertasdark" aria-label="Lihat detail">
                    <Eye size={18} className="text-tintalight" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 bg-kertas py-3 no-print flex flex-wrap gap-2 border-t border-border">
            <Button size="sm" onClick={() => exportPdf([...selected])} disabled={selected.size === 0 || exporting} loading={exporting}>
              <FileDown size={15} /> PDF ({selected.size})
            </Button>
            <Button size="sm" variant="secondary" onClick={() => exportExcel([...selected])} disabled={selected.size === 0 || exporting} loading={exporting}>
              <FileSpreadsheet size={15} /> Excel ({selected.size})
            </Button>
            <Button size="sm" variant="secondary" onClick={() => shareWhatsApp([...selected])} disabled={selected.size === 0}>
              <Share2 size={15} /> WhatsApp
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(selected)} disabled={selected.size === 0}>
              <Trash2 size={15} /> Hapus ({selected.size})
            </Button>
          </div>
        </>
      )}

      {detailPatrol && (
        <PatrolDetailDialog patrolId={detailPatrol.id} onClose={() => setDetailPatrol(null)} />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Hapus Laporan?"
        message={`Hapus ${confirmDelete?.size} laporan? Foto terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function PatrolDetailDialog({ patrolId, onClose }: { patrolId: string; onClose: () => void }) {
  const [patrol, setPatrol] = useState<Patrol | null>(null);
  const [entries, setEntries] = useState<(Entry & { photos: { url: string; kind: string }[]; checkpointName: string })[]>([]);
  const [outsideScans, setOutsideScans] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('patrols').select('*').eq('id', patrolId).maybeSingle();
      setPatrol(p as Patrol | null);
      const { data: ens } = await supabase.from('entries').select('*, checkpoint:checkpoints(name, seq)').eq('patrol_id', patrolId).order('created_at');
      const result: (Entry & { photos: { url: string; kind: string }[]; checkpointName: string })[] = [];
      for (const e of (ens ?? []) as any[]) {
        const { data: phs } = await supabase.from('photos').select('*').eq('entry_id', e.id);
        const photos: { url: string; kind: string }[] = [];
        for (const ph of (phs as Photo[] | null) ?? []) {
          const { data } = await supabase.storage.from('photos').createSignedUrl(ph.storage_path, 3600);
          photos.push({ url: data?.signedUrl ?? '', kind: ph.kind });
        }
        result.push({ ...e, photos, checkpointName: e.checkpoint?.name ?? '-' });
      }
      setEntries(result);
      const { data: sl } = await supabase
        .from('scan_logs')
        .select('*, checkpoint:checkpoints(name)')
        .eq('patrol_id', patrolId)
        .in('status', ['di_luar_radius', 'gps_buruk'])
        .order('created_at', { ascending: false });
      setOutsideScans((sl ?? []) as ScanLog[]);
      setLoading(false);
    })();
  }, [patrolId]);

  if (loading) return <Dialog open={true} onClose={onClose} title="Detail Laporan"><div className="flex justify-center py-8"><Spinner size={28} /></div></Dialog>;
  if (!patrol) return <Dialog open={true} onClose={onClose} title="Laporan"><EmptyState title="Tidak ditemukan" /></Dialog>;

  const hasTemuan = entries.some((e) => e.condition === 'temuan');
  const hasPerhatian = entries.some((e) => e.condition === 'perhatian');
  const overall = hasTemuan ? 'ADA TEMUAN' : hasPerhatian ? 'PERLU PERHATIAN' : 'AMAN';

  return (
    <Dialog open={true} onClose={onClose} title={`Detail — ${patrol.branch_code}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="bg-kertasdark rounded-lg p-3 space-y-1 text-sm">
          <p className="font-medium text-tinta">{patrol.branch_name} ({patrol.branch_code})</p>
          <p className="text-tintalight">Petugas: {patrol.officer_name} (NPK {patrol.officer_npk})</p>
          <p className="text-tintalight">Shift {patrol.shift} — {formatWibDate(patrol.shift_date)}</p>
          <p className="text-tintalight">Mulai: {formatWib(patrol.started_at, true)}</p>
          {patrol.finished_at && <p className="text-tintalight">Selesai: {formatWib(patrol.finished_at, true)}</p>}
          <div className="pt-2"><Badge color={hasTemuan ? 'danger' : hasPerhatian ? 'warning' : 'success'}>{overall}</Badge></div>
        </div>

        {outsideScans.length > 0 && (
          <div className="border border-bahaya/30 rounded-lg p-3">
            <p className="text-sm font-medium text-bahaya mb-2">Percobaan Scan di Luar Radius ({outsideScans.length})</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {outsideScans.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs flex-wrap">
                  <Badge color="danger">Di luar radius</Badge>
                  <span className="text-tintalight">{(s as any).checkpoint?.name ?? 'Titik'}</span>
                  {s.distance != null && <span className="text-tintalight">{s.distance.toFixed(1)} m</span>}
                  {s.accuracy != null && <span className="text-tintalight">±{s.accuracy.toFixed(0)} m</span>}
                  <span className="text-tintalight ml-auto">{formatWib(s.created_at, true)}</span>
                </div>
              ))}
            </div>
          </div>
 )}

        {entries.length === 0 ? (
          <EmptyState title="Tidak ada titik terisi" />
        ) : (
          <div className="space-y-3">
            {entries.map((e, i) => (
              <div key={e.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-tinta text-sm">{i + 1}. {e.checkpointName}</p>
                  <Badge color={e.condition === 'aman' ? 'success' : e.condition === 'perhatian' ? 'warning' : 'danger'}>
                    {e.condition === 'aman' ? 'Aman' : e.condition === 'perhatian' ? 'Perhatian' : 'Temuan'}
                  </Badge>
                </div>
                {e.suspicious && (
                  <p className="text-[11px] text-bahaya mb-1">Mencurigakan (akurasi tidak wajar atau lokasi jauh)</p>
                )}
                <p className="text-sm text-tintalight mb-2">{e.notes}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {e.photos.map((ph, j) => (
                    <a key={j} href={ph.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded overflow-hidden border border-border relative">
                      <img src={ph.url} alt={`Foto ${j + 1}`} className="w-full h-full object-cover" />
                      {ph.kind === 'selfie' && <span className="absolute bottom-0 left-0 right-0 bg-tinta/70 text-kertas text-[8px] py-0.5 text-center">Selfie</span>}
                    </a>
                  ))}
                </div>
                {e.selfie_lat != null && (
                  <p className="text-[10px] text-tintalight mt-2">
                    GPS selfie: {e.selfie_lat.toFixed(6)}, {e.selfie_lng?.toFixed(6)} (±{e.selfie_accuracy?.toFixed(0)} m) · {formatWibTime(e.selfie_at, true)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
