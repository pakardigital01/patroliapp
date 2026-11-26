import { useCallback, useEffect, useState } from 'react';
import { QrCode, MapPin, Settings2, Download, Copy, Ban, Clock, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner, Field, Input, Select } from '@/components/ui';
import { Dialog, ConfirmDialog } from '@/components/Dialog';
import { generateQrDataUrl } from '@/lib/qr';
import { formatWib } from '@/lib/time';
import type { Branch, Checkpoint, ScanRow as ScanLog } from '@/lib/types';

export function AdminQrPoints() {
  const { show } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [manageCp, setManageCp] = useState<Checkpoint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: bs } = await supabase.from('branches').select('*').order('name');
    setBranches((bs ?? []) as Branch[]);
    if (!selectedBranch && bs && bs.length > 0) setSelectedBranch(bs[0].id);
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      if (!selectedBranch) { setCheckpoints([]); return; }
      const { data } = await supabase
        .from('checkpoints')
        .select('*')
        .eq('branch_id', selectedBranch)
        .order('seq');
      setCheckpoints((data ?? []) as Checkpoint[]);
      setSelected(new Set());
    })();
  }, [selectedBranch]);

  const toggleSelect = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(checkpoints.map((c) => c.id)));

  return (
    <div className="px-4">
      <h2 className="font-semibold text-tinta text-lg mb-3">QR Titik</h2>

      <div className="flex gap-2 items-center mb-3">
        <Select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="flex-1">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={selectAll}>Pilih Semua</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={32} /></div>
      ) : checkpoints.length === 0 ? (
        <EmptyState icon={<QrCode size={40} />} title="Belum ada titik" message="Tambahkan titik dari menu Cabang." />
      ) : (
        <div className="space-y-2">
          {checkpoints.map((cp) => (
            <div key={cp.id} className="bg-white rounded-lg border border-border p-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(cp.id)}
                  onChange={() => toggleSelect(cp.id)}
                  className="mt-1 accent-aksen"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-tinta text-sm">{cp.seq}. {cp.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge color={cp.lat != null ? 'success' : 'neutral'}>
                      <MapPin size={11} /> {cp.lat != null ? `${cp.lat.toFixed(5)}, ${cp.lng?.toFixed(5)}` : 'Tanpa GPS'}
                    </Badge>
                    <Badge color="accent">{cp.qr_mode === 'dinamis' ? 'Dinamis' : 'Statis'}</Badge>
                    <Badge color="neutral">Radius {cp.radius_m} m</Badge>
                    <Badge color="neutral">v{cp.qr_version}</Badge>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setManageCp(cp)}>
                  <Settings2 size={14} /> Kelola
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {manageCp && (
        <ManageQrDialog
          checkpoint={manageCp}
          branchName={branches.find((b) => b.id === manageCp.branch_id)?.name ?? ''}
          onClose={() => setManageCp(null)}
          onChanged={() => {
            (async () => {
              const { data } = await supabase.from('checkpoints').select('*').eq('branch_id', selectedBranch).order('seq');
              setCheckpoints((data ?? []) as Checkpoint[]);
            })();
          }}
        />
      )}
    </div>
  );
}

function ManageQrDialog({ checkpoint, branchName, onClose, onChanged }: { checkpoint: Checkpoint; branchName: string; onClose: () => void; onChanged: () => void }) {
  const { show } = useToast();
  const [lat, setLat] = useState(checkpoint.lat?.toString() ?? '');
  const [lng, setLng] = useState(checkpoint.lng?.toString() ?? '');
  const [radius, setRadius] = useState<string>(String(checkpoint.radius_m));
  const [mode, setMode] = useState(checkpoint.qr_mode);
  const [savingLoc, setSavingLoc] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loadingQr, setLoadingQr] = useState(false);
  const [scans, setScans] = useState<ScanLog[]>([]);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [gettingGps, setGettingGps] = useState(false);

  const generateQr = useCallback(async () => {
    setLoadingQr(true);
    const { data: session } = await supabase.auth.getSession();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-qr`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ checkpointId: checkpoint.id }),
    });
    setLoadingQr(false);
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      show('Gagal membuat QR: ' + (j.error ?? resp.status), 'error');
      return;
    }
    const j = await resp.json();
    setQrToken(j.token);
    const url = await generateQrDataUrl(j.token, 256);
    setQrUrl(url);
    if (j.mode === 'dinamis') setCountdown(60);
  }, [checkpoint.id, show]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('scans')
        .select('*')
        .eq('checkpoint_id', checkpoint.id)
        .order('created_at', { ascending: false })
        .limit(30);
      setScans((data ?? []) as ScanLog[]);
    })();
  }, [checkpoint.id]);

  useEffect(() => {
    if (mode !== 'dinamis' || !qrToken) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          generateQr();
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [mode, qrToken, generateQr]);

  useEffect(() => {
    generateQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveLocation = async () => {
    setSavingLoc(true);
    const { error } = await supabase.from('checkpoints').update({
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      radius_m: radius === '' ? checkpoint.radius_m : parseFloat(radius),
      qr_mode: mode,
    }).eq('id', checkpoint.id);
    setSavingLoc(false);
    if (error) { show('Gagal: ' + error.message, 'error'); return; }
    show('Lokasi & pengaturan QR disimpan', 'success');
    onChanged();
  };

  const getMyLocation = () => {
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
        setGettingGps(false);
        show(`Lokasi didapat (±${pos.coords.accuracy.toFixed(0)} m)`, 'success');
      },
      (err) => {
        setGettingGps(false);
        show('GPS error: ' + err.message, 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const revokeQr = async () => {
    setConfirmRevoke(false);
    setRevoking(true);
    const { data: session } = await supabase.auth.getSession();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'revoke_qr', checkpointId: checkpoint.id }),
    });
    setRevoking(false);
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      show('Gagal mencabut: ' + (j.error ?? resp.status), 'error');
      return;
    }
    const j = await resp.json();
    show(`QR dicabut. Versi baru: ${j.newVersion}`, 'success');
    onChanged();
    generateQr();
  };

  const downloadQr = () => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `qr_${checkpoint.name.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const copyToken = () => {
    if (!qrToken) return;
    navigator.clipboard.writeText(qrToken);
    show('Kode QR disalin', 'success');
  };

  return (
    <Dialog open={true} onClose={onClose} title={`Kelola & QR — ${checkpoint.name}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="bg-kertasdark rounded-lg p-3 text-sm">
          <p className="text-tintalight">Cabang: <span className="text-tinta font-medium">{branchName}</span></p>
          <p className="text-tintalight">Versi QR: <span className="text-tinta">v{checkpoint.qr_version}</span></p>
        </div>

        <div className="border border-border rounded-lg p-3 space-y-3">
          <p className="text-sm font-medium text-tinta">Lokasi GPS & Pengaturan</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-6.200000" />
            </Field>
            <Field label="Longitude">
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="106.816666" />
            </Field>
          </div>
          <Button size="sm" variant="secondary" onClick={getMyLocation} loading={gettingGps}>
            <MapPin size={14} /> Ambil Lokasi Saya
          </Button>
          <Field label="Radius (meter)" hint="0,5-200 m">
            <Input type="number" min={0.5} max={200} step={0.5} value={radius} onChange={(e) => setRadius(e.target.value)} />
          </Field>
          <Field label="Mode QR">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'dinamis' | 'statis')}>
              <option value="dinamis">Dinamis (berubah tiap 30 dtk, kedaluwarsa 60 dtk)</option>
              <option value="statis">Statis (tetap, untuk ditempel)</option>
            </Select>
          </Field>
          <Button size="sm" full onClick={saveLocation} loading={savingLoc}>Simpan Lokasi & Pengaturan</Button>
        </div>

        <div className="border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-tinta">Kode QR Terenkripsi</p>
            {mode === 'dinamis' && countdown > 0 && (
              <Badge color={countdown <= 10 ? 'danger' : 'accent'}>
                <Clock size={11} /> {countdown} dtk
              </Badge>
            )}
          </div>

          {mode === 'dinamis' && (
            <p className="text-[11px] text-peringatan bg-peringatan/10 rounded p-2">
              QR dinamis berubah otomatis dan tidak dapat dicetak. Tampilkan di layar untuk dipindai petugas.
            </p>
          )}

          {loadingQr ? (
            <div className="flex justify-center py-6"><Spinner size={28} /></div>
          ) : qrUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={qrUrl} alt="QR Code" className="w-48 h-48 border border-border rounded" />
              <div className="flex gap-2 flex-wrap justify-center">
                <Button size="sm" variant="secondary" onClick={downloadQr}>
                  <Download size={14} /> PNG
                </Button>
                <Button size="sm" variant="secondary" onClick={copyToken}>
                  <Copy size={14} /> Salin Kode
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmRevoke(true)} loading={revoking}>
                  <Ban size={14} /> Cabut QR
                </Button>
              </div>
              <p className="text-[10px] text-tintalight font-mono break-all max-w-xs">{qrToken.slice(0, 60)}…</p>
            </div>
          ) : (
            <EmptyState title="QR belum dibuat" />
          )}
        </div>

        <div className="border border-border rounded-lg p-3">
          <p className="text-sm font-medium text-tinta mb-2 flex items-center gap-1.5">
            <History size={15} /> Riwayat 30 Scan Terbaru
          </p>
          {scans.length === 0 ? (
            <p className="text-xs text-tintalight py-3 text-center">Belum ada scan</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {scans.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  <Badge color={s.success ? 'success' : 'danger'}>{s.success ? 'OK' : 'Gagal'}</Badge>
                  <span className="flex-1 truncate text-tintalight">{s.reason}</span>
                  {s.distance != null && <span className="text-tintalight">{s.distance.toFixed(0)} m</span>}
                  <span className="text-tintalight">{formatWib(s.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        title="Cabut QR?"
        message="QR lama tidak akan dapat dipindai lagi. Versi QR akan dinaikkan. Petugas harus memindai QR baru."
        confirmLabel="Cabut"
        danger
        onConfirm={revokeQr}
        onCancel={() => setConfirmRevoke(false)}
      />
    </Dialog>
  );
}
