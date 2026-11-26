const DB_NAME = 'patroli-drafts';
const DB_VERSION = 1;
const STORE = 'drafts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface DraftEntry {
  key: string; // `${patrolId}:${checkpointId}`
  patrolId: string;
  checkpointId: string;
  condition: 'aman' | 'perhatian' | 'temuan' | null;
  notes: string;
  photos: string[]; // dataURLs (condition photos)
  selfie: string | null; // dataURL
  selfieLat: number | null;
  selfieLng: number | null;
  selfieAccuracy: number | null;
  selfieAt: string | null;
  updatedAt: number;
}

export async function saveDraft(draft: DraftEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore — drafts are best-effort
  }
}

export async function getDraft(key: string): Promise<DraftEntry | null> {
  try {
    const db = await openDb();
    const result = await new Promise<DraftEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function deleteDraft(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function listDraftsForPatrol(patrolId: string): Promise<DraftEntry[]> {
  try {
    const db = await openDb();
    const result = await new Promise<DraftEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as DraftEntry[]).filter((d) => d.patrolId === patrolId));
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

// ---------- Outbox (antrean kirim ulang) ----------
const OUTBOX = 'outbox';

function openOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface OutboxItem {
  id?: number;
  type: 'entry';
  payload: unknown;
  createdAt: number;
  retries: number;
}

export async function enqueueOutbox(item: Omit<OutboxItem, 'id'>): Promise<void> {
  const db = await openOutboxDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX, 'readwrite');
    tx.objectStore(OUTBOX).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await openOutboxDb();
  const result = await new Promise<OutboxItem[]>((resolve, reject) => {
    const tx = db.transaction(OUTBOX, 'readonly');
    const req = tx.objectStore(OUTBOX).getAll();
    req.onsuccess = () => resolve(req.result as OutboxItem[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function removeOutbox(id: number): Promise<void> {
  const db = await openOutboxDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX, 'readwrite');
    tx.objectStore(OUTBOX).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
