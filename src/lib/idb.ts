const DB_NAME = "resona-audio";
const STORE = "audio";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export async function idbPutAudio(
  videoId: string,
  blob: Blob,
  mime: string
): Promise<void> {
  await tx("readwrite", (s) => s.put({ blob, mime }, videoId));
}

export async function idbGetAudio(
  videoId: string
): Promise<{ blob: Blob; mime: string } | null> {
  try {
    const v = await tx<{ blob: Blob; mime: string } | undefined>(
      "readonly",
      (s) => s.get(videoId)
    );
    return v || null;
  } catch {
    return null;
  }
}

export async function idbDeleteAudio(videoId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(videoId));
}

export async function idbListAudio(): Promise<string[]> {
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return keys.map(String);
  } catch {
    return [];
  }
}
