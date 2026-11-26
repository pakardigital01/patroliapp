import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, X, CheckCircle2, Loader2, ImagePlus, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { Button, Field, Textarea, Badge, Spinner } from '@/components/ui';
import { ConfirmDialog } from '@/components/Dialog';
import { compressImage, dataUrlToBlob } from '@/lib/photo';
import { saveDraft, getDraft, deleteDraft } from '@/lib/drafts';
import { entrySchema } from '@/lib/validation';
import type { Checkpoint, Entry, Patrol, Photo } from '@/lib/types';
import { QrScanner } from './QrScanner';
import { SelfieCapture } from './SelfieCapture';

interface Props {
  patrol: Patrol;
  checkpoint: Checkpoint;
  existingEntry: Entry | null;
  existingPhotos: Photo[];
  scanVerified: boolean;
  onClose: () => void;
}

type Condition = 'aman' | 'perhatian' | 'temuan';

export function CheckpointFill({ patrol, checkpoint, existingEntry, existingPhotos, scanVerified, onClose }: Props) {
  const { show } = useToast();
  const { user } = useAuthUnsafe();
  const [condition, setCondition] = useState<Condition>(existingEntry?.condition ?? 'aman');
  const [notes, setNotes] = useState(existingEntry?.notes ?? '');
  const [photos, setPhotos] = useState<string[]>([]); // condition photo dataUrls
  const [selfie, setSelfie] = useState<string | null>(null);
  const [selfieGps, setSelfieGps] = useState<{ lat: number; lng: number; accuracy: number; takenAt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSelfie, setShowSelfie] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!existingEntry);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftKey = `${patrol.id}:${checkpoint.id}`;

  const needsQr = checkpoint.lat != null && checkpoint.lng != null;
  const minPhotos = 2;
  const maxPhotos = 8;

  // Load existing photos + draft
  useEffect(() => {
    (async () => {
      // draft
      const draft = await getDraft(draftKey);
      if (draft) {
        if (draft.condition) setCondition(draft.condition);
        if (draft.notes) setNotes(draft.notes);
        if (draft.photos?.length) setPhotos(draft.photos);
        if (draft.selfie) {
          setSelfie(draft.selfie);
          if (draft.selfieLat != null && draft.selfieLng != null && draft.selfieAccuracy != null && draft.selfieAt) {
            setSelfieGps({ lat: draft.selfieLat, lng: draft.selfieLng, accuracy: draft.selfieAccuracy, takenAt: draft.selfieAt });
          }
        }
      }
      // existing photos from DB (signed URLs)
      if (existingEntry && existingPhotos.length > 0) {
        const urls: string[] = [];
        for (const ph of existingPhotos) {
          if (ph.kind === 'kondisi') {
            const { data } = await supabase.storage.from('photos').createSignedUrl(ph.storage_path, 3600);
            if (data?.signedUrl) urls.push(data.signedUrl);
          } else if (ph.kind === 'selfie' && !selfie) {
            const { data } = await supabase.storage.from('photos').createSignedUrl(ph.storage_path, 3600);
            if (data?.signedUrl) {
              setSelfie(data.signedUrl);
              setSelfieGps({
                lat: existingEntry.selfie_lat ?? 0,
                lng: existingEntry.selfie_lng ?? 0,
                accuracy: existingEntry.selfie_accuracy ?? 0,
                takenAt: existingEntry.selfie_at ?? '',
              });
            }
          }
        }
        if (urls.length > 0 && (!draft || !draft.photos?.length)) setPhotos(urls);
      }
      setLoadingExisting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft on changes
  useEffect(() => {
    if (loadingExisting) return;
    saveDraft({
      key: draftKey,
      patrolId: patrol.id,
      checkpointId: checkpoint.id,
      condition,
      notes,
      photos,
      selfie,
      selfieLat: selfieGps?.lat ?? null,
      selfieLng: selfieGps?.lng ?? null,
      selfieAccuracy: selfieGps?.accuracy ?? null,
      selfieAt: selfieGps?.takenAt ?? null,
      updatedAt: Date.now(),
    });
  }, [draftKey, patrol.id, checkpoint.id, condition, notes, photos, selfie, selfieGps, loadingExisting]);

  const handlePhotoAdd = useCallback(async (files: FileList) => {
    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) {
      show(`Maksimal ${maxPhotos} foto kondisi`, 'warning');
      return;
    }
    const toProcess = Array.from(files).slice(0, remaining);
    for (const f of toProcess) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        show('Hanya JPEG, PNG, atau WebP', 'error');
        continue;
      }
      if (f.size > 6 * 1024 * 1024) {
        show('Ukuran foto maks 6 MB', 'error');
        continue;
      }
      const compressed = await compressImage(f, 1280, 0.8);
      setPhotos((p) => [...p, compressed]);
    }
  }, [photos.length, show]);

  const removePhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  };

  const onSelfieCaptured = (result: { dataUrl: string; lat: number; lng: number; accuracy: number; takenAt: string }) => {
    setSelfie(result.dataUrl);
    setSelfieGps({ lat: result.lat, lng: result.lng, accuracy: result.accuracy, takenAt: result.takenAt });
    setShowSelfie(false);
  };

  const totalPhotos = photos.length + (selfie ? 1 : 0);
  const canSave = (needsQr ? scanVerified : true) && photos.length >= minPhotos && !!selfie && !!selfieGps && selfieGps.accuracy <= 50;

  const uploadPhoto = async (entryId: string, dataUrl: string, kind: 'kondisi' | 'selfie'): Promise<void> => {
    const blob = await dataUrlToBlob(dataUrl);
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const path = `${user?.id}/${entryId}/${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error('Upload foto gagal: ' + error.message);
    const { error: e2 } = await supabase.from('photos').insert({ entry_id: entryId, storage_path: path, kind });
    if (e2) throw new Error('Simpan metadata foto gagal: ' + e2.message);
  };

  const handleSave = async () => {
    const parsed = entrySchema.safeParse({ condition, notes });
    if (!parsed.success) {
      show(parsed.error.issues[0]?.message ?? 'Validasi gagal', 'error');
      return;
    }
    if (needsQr && !scanVerified) {
      show('Titik ini wajib diverifikasi QR dulu', 'warning');
      return;
    }
    if (photos.length < minPhotos) {
      show(`Minimal ${minPhotos} foto kondisi`, 'warning');
      return;
    }
    if (!selfie || !selfieGps) {
      show('Selfie wajib', 'warning');
      return;
    }
    if (selfieGps.accuracy > 50) {
      show('Akurasi GPS selfie lebih buruk dari 50 m', 'warning');
      return;
    }
    if (totalPhotos < 3) {
      show('Total minimal 3 foto per titik', 'warning');
      return;
    }

    setSaving(true);
    try {
      // upsert entry via RPC
      const { data: entryId, error } = await supabase.rpc('upsert_entry', {
        p_patrol_id: patrol.id,
        p_checkpoint_id: checkpoint.id,
        p_condition: condition,
        p_notes: notes,
        p_qr_distance: null,
        p_selfie_lat: selfieGps.lat,
        p_selfie_lng: selfieGps.lng,
        p_selfie_accuracy: selfieGps.accuracy,
      });
      if (error) throw new Error(error.message);
      if (!entryId) throw new Error('Entry ID kosong');

      // Delete old photos for this entry (if re-saving)
      const { data: oldPhotos } = await supabase.from('photos').select('storage_path').eq('entry_id', entryId);
      if (oldPhotos && oldPhotos.length > 0) {
        for (const op of oldPhotos) {
          await supabase.storage.from('photos').remove([op.storage_path]);
        }
        await supabase.from('photos').delete().eq('entry_id', entryId);
      }

      // Upload condition photos
      for (const p of photos) {
        await uploadPhoto(entryId, p, 'kondisi');
      }
      // Upload selfie
      await uploadPhoto(entryId, selfie, 'selfie');

      await deleteDraft(draftKey);
      show('Titik berhasil disimpan', 'success');
      onClose();
    } catch (err) {
      show('Gagal menyimpan: ' + (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) return <div className="flex justify-center py-12"><Spinner size={32} /></div>;

  return (
    <div className="min-h-screen bg-kertas max-w-[720px] mx-auto pb-28">
      <header className="bg-tinta text-kertas sticky top-0 z-30 no-print">
        <div className="px-3 py-3 flex items-center gap-2">
          <button onClick={() => setConfirmExit(true)} className="btn-touch p-1.5 rounded hover:bg-tintasoft" aria-label="Kembali">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{checkpoint.name}</p>
            <p className="text-[11px] text-kertas/60">{patrol.branch_name} · {patrol.shift}</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-5">
        {/* QR Verification */}
        {needsQr && (
          <div className="bg-white rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-tinta mb-2">Verifikasi QR</p>
            {scanVerified ? (
              <div className="flex items-center gap-2 text-sukses">
                <CheckCircle2 size={20} />
                <span className="text-sm font-medium">Titik terverifikasi QR</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-tintalight mb-3">
                  Titik ini terkunci GPS. Pindai QR untuk memverifikasi keberadaan Anda di lokasi.
                </p>
                <QrScanner
                  patrolId={patrol.id}
                  checkpointId={checkpoint.id}
                  checkpointName={checkpoint.name}
                  checkpointLat={checkpoint.lat}
                  checkpointLng={checkpoint.lng}
                  radiusM={Number(checkpoint.radius_m)}
                  isLocked={checkpoint.is_locked}
                  onVerified={() => { /* parent will reload via onClose */ }}
                />
              </>
            )}
          </div>
        )}

        {/* Condition */}
        <div className="bg-white rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-tinta mb-3">Kondisi Titik</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: 'aman', label: 'Aman', color: 'sukses' },
              { v: 'perhatian', label: 'Perlu Perhatian', color: 'peringatan' },
              { v: 'temuan', label: 'Ada Temuan', color: 'bahaya' },
            ] as const).map((c) => (
              <button
                key={c.v}
                onClick={() => setCondition(c.v)}
                className={`btn-touch rounded border text-xs font-medium py-3 px-1 transition-colors ${
                  condition === c.v
                    ? c.v === 'aman' ? 'border-sukses bg-sukses/10 text-sukses'
                      : c.v === 'perhatian' ? 'border-peringatan bg-peringatan/10 text-peringatan'
                      : 'border-bahaya bg-bahaya/10 text-bahaya'
                    : 'border-border bg-kertas text-tintalight'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg border border-border p-4">
          <Field label="Keterangan" required hint="Minimal 10 karakter">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Jelaskan kondisi titik patroli…"
              maxLength={2000}
            />
          </Field>
          <p className="text-[11px] text-tintalight -mt-2">{notes.length}/10 karakter minimum</p>
        </div>

        {/* Condition Photos */}
        <div className="bg-white rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-tinta">Foto Kondisi</p>
            <Badge color={photos.length >= minPhotos ? 'success' : 'neutral'}>{photos.length}/{maxPhotos}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square rounded overflow-hidden border border-border">
                <img src={p} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 bg-tinta/70 text-kertas rounded p-0.5 btn-touch"
                  aria-label="Hapus foto"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < maxPhotos && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded border-2 border-dashed border-border flex flex-col items-center justify-center text-tintalight hover:border-aksen hover:text-aksen transition-colors btn-touch"
              >
                <ImagePlus size={22} />
                <span className="text-[10px] mt-1">Tambah</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) handlePhotoAdd(e.target.files); e.target.value = ''; }}
          />
          <p className="text-[11px] text-tintalight mt-2">Minimal {minPhotos} foto kondisi (JPEG/PNG/WebP, maks 6 MB). Dikompres otomatis.</p>
        </div>

        {/* Selfie */}
        <div className="bg-white rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-tinta">Selfie Ber-GPS</p>
            {selfieGps && <Badge color={selfieGps.accuracy <= 50 ? 'success' : 'danger'}>±{selfieGps.accuracy.toFixed(0)} m</Badge>}
          </div>
          {selfie ? (
            <div className="space-y-2">
              <div className="relative rounded overflow-hidden border border-border">
                <img src={selfie} alt="Selfie" className="w-full object-cover" />
              </div>
              <Button variant="secondary" full size="sm" onClick={() => setShowSelfie(true)}>
                <Camera size={16} /> Ambil Ulang Selfie
              </Button>
            </div>
          ) : (
            <Button full onClick={() => setShowSelfie(true)}>
              <Camera size={18} /> Ambil Selfie
            </Button>
          )}
          {selfieGps && (
            <p className="text-[11px] text-tintalight mt-2">
              GPS: {selfieGps.lat.toFixed(6)}, {selfieGps.lng.toFixed(6)}
            </p>
          )}
        </div>

        {/* Summary */}
        <div className="bg-kertasdark rounded-lg p-3 text-xs text-tintalight">
          <p>Total foto: {totalPhotos} (minimal 3) · {needsQr ? (scanVerified ? 'QR terverifikasi' : 'QR belum diverifikasi') : 'Tanpa GPS'}</p>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[720px] bg-white border-t border-border p-3 no-print z-30">
        <Button full size="lg" disabled={!canSave || saving} onClick={handleSave}>
          {saving ? <Loader2 size={18} className="inline animate-spin" /> : <CheckCircle2 size={18} className="inline" />}
          {' '}Simpan Titik
        </Button>
        {!canSave && !saving && (
          <p className="text-[11px] text-tintalight text-center mt-1">
            {needsQr && !scanVerified ? 'Verifikasi QR dulu · ' : ''}
            {!selfie ? 'Selfie wajib · ' : ''}
            {photos.length < minPhotos ? `Minimal ${minPhotos} foto kondisi` : ''}
          </p>
        )}
      </div>

      <SelfieCapture
        open={showSelfie}
        officerName={patrol.officer_name}
        officerNpk={patrol.officer_npk}
        onCapture={onSelfieCaptured}
        onClose={() => setShowSelfie(false)}
      />

      <ConfirmDialog
        open={confirmExit}
        title="Keluar tanpa menyimpan?"
        message="Perubahan akan tersimpan sebagai draf di perangkat ini."
        confirmLabel="Keluar"
        onConfirm={onClose}
        onCancel={() => setConfirmExit(false)}
      />
    </div>
  );
}

// Helper to get auth user without importing context (avoid circular)
import { useAuth } from '@/lib/auth';
function useAuthUnsafe() { return useAuth(); }
