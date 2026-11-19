import { WpsDocument } from '../data/wpsDocuments';

const DB_NAME = 'alx_office_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const RECORD_KEY = 'workspace_docs_v1';
const CACHE_NAME = 'alx-office-documents-v1';
const CACHE_REQUEST_URL = '/offline-cache/documents.json';
const LOCAL_STORAGE_KEY = 'wps_office_docs_v2';

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open error'));
  });
}

async function readFromIndexedDb(): Promise<WpsDocument[] | null> {
  try {
    const db = await openOfflineDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(Array.isArray(req.result) ? (req.result as WpsDocument[]) : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

async function writeToIndexedDb(docs: WpsDocument[]): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(docs, RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore IndexedDB quota or private-mode restrictions
  }
}

async function readFromCacheApi(): Promise<WpsDocument[] | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(CACHE_REQUEST_URL);
    if (!response) return null;
    const parsed = await response.json();
    return Array.isArray(parsed) ? (parsed as WpsDocument[]) : null;
  } catch {
    return null;
  }
}

async function writeToCacheApi(docs: WpsDocument[]): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(docs), {
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'X-Offline-Saved-At': new Date().toISOString(),
      },
    });
    await cache.put(CACHE_REQUEST_URL, response);
  } catch {
    // Ignore Cache API errors if storage is restricted
  }
}

const SAMPLES_PURGED_KEY = 'alx_legacy_samples_purged_v1';

const LEGACY_SAMPLE_TIMESTAMPS = new Map<string, string>([
  ['doc-1', 'Hoy, 12:40'],
  ['doc-pdf-1', 'Hoy, 11:50'],
  ['doc-pptx-1', 'Hoy, 10:15'],
  ['doc-ppt-1', 'Ayer, 19:30'],
  ['doc-3', '10 nov 2026'],
  ['doc-2', 'Ayer, 17:05'],
  ['doc-4', '06 nov 2026'],
]);

function stripUntouchedLegacySamples(docs: WpsDocument[]): {
  docs: WpsDocument[];
  removedAny: boolean;
} {
  try {
    if (localStorage.getItem(SAMPLES_PURGED_KEY) === '1') {
      return { docs, removedAny: false };
    }
  } catch {
    // Ignore storage restriction
  }

  const filtered = docs.filter((d) => {
    const sampleStamp = LEGACY_SAMPLE_TIMESTAMPS.get(d.id);
    if (!sampleStamp) return true;
    return d.updatedAt !== sampleStamp;
  });

  try {
    localStorage.setItem(SAMPLES_PURGED_KEY, '1');
  } catch {
    // Ignore storage restriction
  }

  return { docs: filtered, removedAny: filtered.length !== docs.length };
}

export function loadInitialDocumentsSync(fallback: WpsDocument[]): WpsDocument[] {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const { docs } = stripUntouchedLegacySamples(parsed as WpsDocument[]);
        return docs;
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return fallback;
}

export async function loadCachedDocuments(): Promise<WpsDocument[] | null> {
  const fromIdb = await readFromIndexedDb();
  if (fromIdb !== null) {
    const { docs, removedAny } = stripUntouchedLegacySamples(fromIdb);
    if (removedAny) {
      await saveCachedDocuments(docs);
    }
    return docs;
  }

  const fromCache = await readFromCacheApi();
  if (fromCache !== null) {
    const { docs, removedAny } = stripUntouchedLegacySamples(fromCache);
    if (removedAny) {
      await saveCachedDocuments(docs);
    }
    return docs;
  }

  return null;
}

export async function saveCachedDocuments(docs: WpsDocument[]): Promise<void> {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(docs));
  } catch {
    // Ignore localStorage 5MB quota overflow on large PDFs/PPTXs; IndexedDB & Cache API hold full copies
  }

  await Promise.all([writeToIndexedDb(docs), writeToCacheApi(docs)]);
}
