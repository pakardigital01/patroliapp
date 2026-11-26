import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Plus, Pencil, Trash2, Check, X, MapPin, Navigation,
  ListOrdered, ClipboardPaste, Loader2, Lock, LockOpen,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Badge, EmptyState, Spinner, Field, Input, Textarea } from '@/components/ui';
import { Dialog, ConfirmDialog } from '@/components/Dialog';
import { MiniMap } from '@/components/MiniMap';
import {
  weightedAverage, geolocationErrorMessage, parsePastedCoords,
  type GpsSample, type GpsFix,
} from '@/lib/gps';
import type { Branch, Checkpoint } from '@/lib/types';

type Quality = { label: string; color: string; dot: string } | null;

function qualityOf(acc: number): Quality {
  if (acc <= 10) return { label: 'Sangat baik', color: 'bg-sukses/10 text-sukses', dot: 'bg-sukses' };
  if (acc <= 25) return { label: 'Cukup', color: 'bg-peringatan/10 text-peringatan', dot: 'bg-peringatan' };
  return { label: 'Kurang akurat, pindah ke area terbuka', color: 'bg-bahaya/10 text-bahaya', dot: 'bg-bahaya' };
}

export function CheckpointsPage({ branch, onBack }: { branch: Branch; onBack: () => void }) {
  const { show } = useToast();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Checkpoint | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Checkpoint | null>(null);
  const [mapFor, setMapFor] = useState<Checkpoint | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState<Checkpoint | null>(null);
  const [lockBusyId, setLockBusyId] = useState<string | null>(null);

  const adminAction = async (action: string, checkpointId: string): Promise<boolean> => {
    const { data: session } = await supabase.auth.getSession();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, checkpointId }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      show('Gagal: ' + (j.error ?? resp.status), 'error');
      return false;
    }
    return true;
  };

  const lockCp = async (cp: Checkpoint) => {
    if (cp.lat == null || cp.lng == null) {
      show('Titik belum memiliki koordinat GPS. Ambil lokasi dulu sebelum mengunci.', 'warning');
      return;
    }
    setLockBusyId(cp.id);
    const ok = await adminAction('lock_checkpoint', cp.id);
    setLockBusyId(null);
    if (ok) {
      show('Titik dikunci sebagai acuan GPS', 'success');
      load();
    }
  };

  const unlockCp = async () => {
    if (!confirmUnlock) return;
    const cp = confirmUnlock;
    setConfirmUnlock(null);
    setLockBusyId(cp.id);
    const ok = await adminAction('unlock_checkpoint', cp.id);
    setLockBusyId(null);
    if (ok) {
      show('Kunci titik dibuka. Koordinat dapat diubah lagi.', 'success');
      load();
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('branch_id', branch.id)
      .order('seq');
    if (error) {
      show('Gagal memuat titik: ' + error.message, 'error');
    }
    setCheckpoints((data ?? []) as Checkpoint[]);
    setLoading(false);
  }, [branch.id, show]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (cp: Checkpoint) => {
    setTogglingId(cp.id);
    const { error } = await supabase.from('checkpoints').update({ active: !cp.active }).eq('id', cp.id);
    setTogglingId(null);
    if (error) { show('Gagal: ' + error.message, 'error'); return; }
    show(cp.active ? 'Titik dinonaktifkan' : 'Titik diaktifkan', 'success');
    load();
  };

  const deleteCp = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('checkpoints').delete().eq('id', confirmDelete.id);
    setConfirmDelete(null);
    if (error) { show('Gagal menghapus: ' + error.message, 'error'); return; }
    show('Titik dihapus', 'success');
    load();
  };

  const openAdd = () => {
    setEditing(null);
    setShowForm(true);
  };

  return (
    <div className="px-4">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="btn-touch p-2 rounded hover:bg-kertasdark" aria-label="Kembali ke Cabang">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-tinta text-base sm:text-lg truncate">
            Titik Patroli · {branch.name} ({branch.code})
          </h2>
          <p className="text-xs text-tintalight">{checkpoints.length} titik terdaftar</p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus size={15} /> Tambah Titik
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={32} /></div>
      ) : checkpoints.length === 0 ? (
        <EmptyState
          icon={<MapPin size={40} />}
          title="Belum ada titik patroli"
          message="Tambah titik patroli pertama untuk cabang ini. Berdiri di lokasi titik lalu gunakan tombol Ambil Lokasi Saat Ini."
        />
      ) : (
        <div className="space-y-2">
          {checkpoints.map((cp) => (
            <div key={cp.id} className="bg-white rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-tinta text-sm">
                    {cp.seq != null && cp.seq > 0 ? `${cp.seq}. ` : ''}{cp.name}
                  </p>
                  {cp.keterangan && <p className="text-xs text-tintalight mt-0.5">{cp.keterangan}</p>}
                  <p className="text-xs text-tintalight mt-1 font-mono">
                    {cp.lat != null ? `${cp.lat.toFixed(6)}, ${cp.lng?.toFixed(6)}` : 'Koordinat belum diisi'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {cp.is_locked && <Badge color="accent"><Lock size={11} /> Terkunci</Badge>}
                    <Badge color={cp.active ? 'success' : 'neutral'}>{cp.active ? 'Aktif' : 'Nonaktif'}</Badge>
                    {cp.radius_m != null && <Badge color="neutral">Radius {Number(cp.radius_m)} m</Badge>}
                    {cp.loc_accuracy != null && <Badge color="neutral">±{cp.loc_accuracy.toFixed(0)} m</Badge>}
                    <Badge color="neutral">{cp.qr_mode === 'dinamis' ? 'QR Dinamis' : 'QR Statis'}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="secondary" onClick={() => { setEditing(cp); setShowForm(true); }}>
                  <Pencil size={14} /> Ubah
                </Button>
                {cp.is_locked ? (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmUnlock(cp)} disabled={lockBusyId === cp.id}>
                    <LockOpen size={14} /> Buka Kunci
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => lockCp(cp)} disabled={lockBusyId === cp.id}>
                    <Lock size={14} /> Kunci Titik
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => toggleActive(cp)} disabled={togglingId === cp.id}>
                  {togglingId === cp.id ? <Loader2 size={14} className="animate-spin" /> : cp.active ? <X size={14} /> : <Check size={14} />}
                  {' '}{cp.active ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setMapFor(cp)}>
                  <MapPin size={14} /> Lihat di Peta
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(cp)}>
                  <Trash2 size={14} /> Hapus
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CheckpointFormDialog
          branch={branch}
          checkpoint={editing}
          nextSeq={checkpoints.length + 1}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {mapFor && (
        <Dialog open={true} onClose={() => setMapFor(null)} title={`Peta — ${mapFor.name}`} maxWidth="max-w-lg">
          {mapFor.lat != null && mapFor.lng != null ? (
            <div className="space-y-2">
              <MiniMap lat={mapFor.lat} lng={mapFor.lng} radiusM={mapFor.radius_m} />
              <p className="text-xs text-tintalight font-mono">
                {mapFor.lat.toFixed(6)}, {mapFor.lng.toFixed(6)} · radius {mapFor.radius_m} m
              </p>
            </div>
          ) : (
            <EmptyState title="Koordinat belum diisi" message="Ubah titik ini dan ambil lokasi GPS terlebih dahulu." />
          )}
        </Dialog>
      )}

      <ConfirmDialog
        open={!!confirmUnlock}
        title="Buka Kunci Titik?"
        message="Mengubah koordinat akan memengaruhi validasi scan. Lanjutkan?"
        confirmLabel="Buka Kunci"
        danger
        onConfirm={unlockCp}
        onCancel={() => setConfirmUnlock(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Hapus Titik?"
        message={`Hapus titik "${confirmDelete?.name}"? Data patroli lama yang terkait tetap tersimpan. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={deleteCp}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function CheckpointFormDialog({
  branch, checkpoint, nextSeq, onClose, onSaved,
}: {
  branch: Branch;
  checkpoint: Checkpoint | null;
  nextSeq: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { show } = useToast();
  const locked = checkpoint?.is_locked ?? false;
  const [name, setName] = useState(checkpoint?.name ?? '');
  const [keterangan, setKeterangan] = useState(checkpoint?.keterangan ?? '');
  const [seq, setSeq] = useState<string>(checkpoint?.seq != null && checkpoint.seq > 0 ? String(checkpoint.seq) : String(nextSeq));
  const [lat, setLat] = useState<string>(checkpoint?.lat != null ? checkpoint.lat.toFixed(7) : '');
  const [lng, setLng] = useState<string>(checkpoint?.lng != null ? checkpoint.lng.toFixed(7) : '');
  const [radius, setRadius] = useState<string>(String(checkpoint?.radius_m ?? 1));
  const [looseRadius, setLooseRadius] = useState<boolean>(
    checkpoint?.radius_m != null ? Number(checkpoint.radius_m) > 1 : false,
  );
  const [accuracy, setAccuracy] = useState<number | null>(checkpoint?.loc_accuracy ?? null);
  const [active, setActive] = useState(checkpoint?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // GPS capture
  const [capturing, setCapturing] = useState(false);
  const [liveFix, setLiveFix] = useState<GpsSample | null>(null);
  const [samples, setSamples] = useState<GpsSample[]>([]);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [result, setResult] = useState<GpsFix | null>(null);
  const samplesRef = useRef<GpsSample[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [watchId]);

  const startCapture = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('GPS tidak tersedia di perangkat ini.');
      return;
    }
    setGpsError(null);
    setResult(null);
    setSamples([]);
    samplesRef.current = [];
    setLiveFix(null);
    setCapturing(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const s: GpsSample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        };
        setLiveFix(s);
        samplesRef.current = [...samplesRef.current, s];
        setSamples(samplesRef.current);
      },
      (err) => {
        setCapturing(false);
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setGpsError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
    setWatchId(id);
    // Selesai otomatis setelah 30 detik
    timerRef.current = setTimeout(() => finishCaptureRef.current(true), 30000);
  };

  const finishCapture = (auto: boolean) => {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setCapturing(false);
    const fix = weightedAverage(samplesRef.current);
    if (!fix) {
      setGpsError(auto
        ? 'Belum ada sampel GPS yang cukup akurat (maksimal ±50 m). Coba lagi di area terbuka.'
        : 'Tidak ada sampel GPS yang dapat dipakai. Coba lagi di area terbuka.');
      return;
    }
    setResult(fix);
    setLat(fix.lat.toFixed(7));
    setLng(fix.lng.toFixed(7));
    setAccuracy(fix.accuracy);
    show(`Lokasi didapat dari ${fix.samples} sampel (±${fix.accuracy.toFixed(0)} m)`, 'success');
  };

  const finishCaptureRef = useRef(finishCapture);
  finishCaptureRef.current = finishCapture;

  const handlePaste = () => {
    const parsed = parsePastedCoords(pasteText);
    if (!parsed) {
      setErrors((e) => ({ ...e, paste: 'Format tidak dikenali. Contoh: -6.2345, 106.9876' }));
      return;
    }
    setLat(parsed.lat.toFixed(7));
    setLng(parsed.lng.toFixed(7));
    setAccuracy(null);
    setResult(null);
    setShowPaste(false);
    setPasteText('');
    setErrors((e) => { const c = { ...e }; delete c.paste; delete c.coords; return c; });
    show('Koordinat ditempel', 'success');
  };

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const coordsValid = !isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
  const radiusNum = parseFloat(radius);
  const radiusMax = looseRadius ? 10 : 1;
  const radiusValid = !isNaN(radiusNum) && radiusNum >= 0.5 && radiusNum <= radiusMax;
  const lowAccuracy = accuracy != null && accuracy > 25;

  const save = async () => {
    const fe: Record<string, string> = {};
    if (!name.trim()) fe.name = 'Nama titik wajib diisi';
    if (!lat.trim() || !lng.trim()) fe.coords = 'Koordinat wajib diisi. Gunakan tombol Ambil Lokasi Saat Ini.';
    if (!coordsValid) fe.coords = 'Koordinat tidak valid (latitude -90..90, longitude -180..180)';
    if (!radiusValid) fe.radius = `Radius harus angka 0,5-${radiusMax} meter`;
    setErrors(fe);
    if (Object.keys(fe).length > 0) return;

    setSaving(true);
    const payload = {
      branch_id: branch.id,
      name: name.trim(),
      keterangan: keterangan.trim() || null,
      seq: seq.trim() === '' ? 0 : parseInt(seq, 10),
      lat: latNum,
      lng: lngNum,
      radius_m: radiusNum,
      loc_accuracy: accuracy,
      active,
    };
    let error: { message: string } | null;
    if (checkpoint) {
      ({ error } = await supabase.from('checkpoints').update(payload).eq('id', checkpoint.id));
    } else {
      ({ error } = await supabase.from('checkpoints').insert(payload));
    }
    setSaving(false);
    if (error) { show('Gagal menyimpan: ' + error.message, 'error'); return; }
    show(checkpoint ? 'Titik diperbarui' : 'Titik ditambahkan', 'success');
    onSaved();
  };

  const q = liveFix ? qualityOf(liveFix.accuracy) : null;
  const progress = Math.min(100, Math.round((samples.length / 5) * 100));

  return (
    <Dialog open={true} onClose={onClose} title={checkpoint ? 'Ubah Titik' : 'Tambah Titik'} maxWidth="max-w-lg">
      <div className="space-y-0">
        <Field label="Nama Titik" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Pos Satpam Depan" />
        </Field>
        <Field label="Keterangan Lokasi">
          <Textarea value={keterangan ?? ''} onChange={(e) => setKeterangan(e.target.value)} rows={2} placeholder="Contoh: dekat gerbang utama, sebelah pos jaga" />
        </Field>
        <Field label="Urutan Patroli" hint="Opsional">
          <Input type="number" min={0} value={seq} onChange={(e) => setSeq(e.target.value)} />
        </Field>

        {/* GPS capture */}
        <div className="border border-border rounded-lg p-3 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-tinta flex items-center gap-1.5">
              <Navigation size={15} className="text-aksen" /> Lokasi GPS
            </p>
            <Button size="sm" variant="secondary" onClick={() => setShowPaste(true)} disabled={locked}>
              <ClipboardPaste size={14} /> Tempel dari Google Maps
            </Button>
          </div>

          {locked && (
            <div className="rounded-lg bg-peringatan/10 border border-peringatan/30 p-3 text-sm text-peringatan flex items-start gap-2">
              <Lock size={16} className="mt-0.5 flex-shrink-0" />
              <span>Koordinat titik ini terkunci sebagai acuan GPS permanen dan tidak dapat diubah. Buka kunci terlebih dahulu jika perlu koreksi.</span>
            </div>
          )}

          {capturing && (
            <div className="space-y-2">
              <div className="h-2 bg-kertasdark rounded-full overflow-hidden">
                <div className="h-full bg-aksen transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-tintalight">Mengumpulkan sampel GPS… {samples.length} sampel</p>
            </div>
          )}

          {liveFix && capturing && q && (
            <div className={`rounded-lg p-3 text-sm ${q.color}`}>
              <div className="flex items-center gap-2 font-medium">
                <span className={`w-2.5 h-2.5 rounded-full ${q.dot}`} />
                {q.label}
              </div>
              <p className="text-xs mt-1 font-mono">
                {liveFix.lat.toFixed(6)}, {liveFix.lng.toFixed(6)} · ±{liveFix.accuracy.toFixed(0)} m
              </p>
            </div>
          )}

          {result && (
            <div className={`rounded-lg p-3 text-sm ${qualityOf(result.accuracy)?.color ?? 'bg-kertasdark text-tinta'}`}>
              <p className="font-medium">Hasil: ±{result.accuracy.toFixed(0)} m ({result.samples} sampel)</p>
              {lowAccuracy && (
                <p className="text-xs mt-1">Akurasi kurang baik. Disarankan ulangi pengambilan, tetapi Anda tetap dapat menyimpan.</p>
              )}
            </div>
          )}

          {gpsError && (
            <div className="rounded-lg bg-bahaya/10 border border-bahaya/30 p-3 text-sm text-bahaya">{gpsError}</div>
          )}

          {!capturing ? (
            <Button full onClick={startCapture} disabled={locked}>
              <Navigation size={16} /> Ambil Lokasi Saat Ini
            </Button>
          ) : (
            <Button full variant="secondary" onClick={() => finishCapture(false)}>
              <Check size={16} /> Berhenti & Gunakan Hasil
            </Button>
          )}

          {result && lowAccuracy && (
            <Button full variant="secondary" size="sm" onClick={startCapture}>
              <Loader2 size={14} /> Ulangi Pengambilan
            </Button>
          )}

          <p className="text-[11px] text-tintalight">
            Berdiri di lokasi titik saat menekan tombol. Butuh HTTPS dan izin lokasi browser. Berlangsung sekitar 30 detik untuk hasil terbaik.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude" required error={errors.coords}>
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-6.2345000" inputMode="decimal" disabled={locked} />
          </Field>
          <Field label="Longitude" required error={errors.coords}>
            <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="106.9876000" inputMode="decimal" disabled={locked} />
          </Field>
        </div>
        {errors.coords && <p className="text-xs text-bahaya -mt-2 mb-3">{errors.coords}</p>}

        {coordsValid && (
          <div className="mb-4 space-y-1.5">
            <MiniMap
              lat={latNum}
              lng={lngNum}
              radiusM={radiusValid ? radiusNum : 1}
              draggable={!locked}
              onMove={(mlat, mlng) => {
                setLat(mlat.toFixed(7));
                setLng(mlng.toFixed(7));
                setAccuracy(null);
                setResult(null);
              }}
            />
            {!locked && <p className="text-[11px] text-tintalight">Geser penanda di peta untuk koreksi manual. Koordinat di form ikut berubah.</p>}
          </div>
        )}

        <Field label="Akurasi saat Pengambilan" hint="Terisi otomatis dari GPS">
          <Input value={accuracy != null ? `±${accuracy.toFixed(0)} m` : ''} readOnly placeholder="—" />
        </Field>

        <Field
          label="Radius Kunci (meter)"
          required
          error={errors.radius}
          hint={looseRadius ? 'Longgar: 0,5-10 m' : 'Ketat: 0,5-1 m, langkah 0,5'}
        >
          <Input
            type="number"
            min={0.5}
            max={looseRadius ? 10 : 1}
            step={0.5}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-tinta mb-1">
          <input
            type="checkbox"
            checked={looseRadius}
            onChange={(e) => {
              setLooseRadius(e.target.checked);
              if (!e.target.checked) setRadius('1');
            }}
            className="accent-aksen"
            disabled={locked}
          />
          Longgarkan radius (sampai 10 m)
        </label>
        {looseRadius && !locked && (
          <p className="text-[11px] text-peringatan bg-peringatan/10 rounded p-2 mb-2">
            Peringatan: akurasi GPS HP biasanya 3-10 m. Radius longgar menurunkan kepastian petugas benar-benar berada di titik.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-tinta mb-4">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-aksen" />
          Titik aktif
        </label>

        <Button full loading={saving} onClick={save}>Simpan Titik</Button>
      </div>

      <Dialog open={showPaste} onClose={() => setShowPaste(false)} title="Tempel Koordinat" maxWidth="max-w-sm">
        <div className="space-y-3">
          <Field label="Koordinat" error={errors.paste} hint="Salin dari Google Maps, contoh: -6.2345, 106.9876">
            <Input value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="-6.2345, 106.9876" />
          </Field>
          <Button full onClick={handlePaste}>Gunakan Koordinat</Button>
        </div>
      </Dialog>
    </Dialog>
  );
}
