import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { WifiOff } from 'lucide-react';
import AiCreateDocumentModal from './components/AiCreateDocumentModal';
import AuthModal, { AuthModalMode } from './components/AuthModal';
import DonationModal, { SupportModalTab } from './components/DonationModal';
import WpsEditorView from './components/WpsEditorView';
import WpsHomeView, { HomeTab } from './components/WpsHomeView';
import WpsPdfViewer from './components/WpsPdfViewer';
import WpsPptViewer from './components/WpsPptViewer';
import {
  INITIAL_WPS_DOCUMENTS,
  WpsDocument,
  WpsTemplate,
} from './data/wpsDocuments';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { parseUploadedOfficeFile } from './lib/wpsFileParser';
import {
  loadCachedDocuments,
  loadInitialDocumentsSync,
  saveCachedDocuments,
} from './lib/offlineDocStore';
import { stripDocCanvaLayerMarkup } from './lib/docCanvaLayers';
import { testFirestoreConnection } from './lib/firebase';
import {
  deleteCloudDocument,
  ensureUserProfile,
  sanitizeFirestoreId,
  subscribeUserDocuments,
  updateUserThemeInCloud,
  upsertCloudDocument,
} from './lib/firebaseSync';
import {
  getAccountUsername,
  logoutAccount,
  subscribeFirebaseAuth,
} from './lib/auth';

const THEME_STORAGE_KEY = 'alx_office_theme_v1';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function App() {
  const [documents, setDocuments] = useState<WpsDocument[]>(() =>
    loadInitialDocumentsSync(INITIAL_WPS_DOCUMENTS),
  );
  const docsDirtyRef = useRef(false);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'saving' | 'saved'>('saved');

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<HomeTab>('recents');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'light') return false;
      if (savedTheme === 'dark') return true;
    } catch {
      // Ignore storage access errors
    }
    return true;
  });
  const isOnline = useOnlineStatus();
  const [statusNotice, setStatusNotice] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  // Firebase Auth & Firestore Cloud Sync state
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isFirebaseAuthReady, setIsFirebaseAuthReady] = useState(false);
  const [cloudProfileReady, setCloudProfileReady] = useState(false);
  const cloudDocIdsRef = useRef<Set<string>>(new Set());
  const cloudSeededUidRef = useRef<string | null>(null);
  const syncTimersRef = useRef<Map<string, number>>(new Map());
  const documentsRef = useRef<WpsDocument[]>(documents);

  // Account Auth Modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [aiCreateOpen, setAiCreateOpen] = useState(false);
  const [aiCreateFormat, setAiCreateFormat] = useState<'DOCX' | 'PPTX' | 'PDF'>('DOCX');
  const [donationModalOpen, setDonationModalOpen] = useState(false);
  const [donationModalTab, setDonationModalTab] = useState<SupportModalTab>('support');

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    void testFirestoreConnection();
    const unsubFirebase = subscribeFirebaseAuth((user) => {
      setFirebaseUser(user);
      setIsFirebaseAuthReady(true);
      if (!user) {
        setCloudProfileReady(false);
        cloudDocIdsRef.current.clear();
        cloudSeededUidRef.current = null;
      }
    });
    return () => {
      unsubFirebase();
    };
  }, []);

  const reportCloudSyncError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Quota exceeded')) {
      setStatusNotice({
        kind: 'error',
        text: 'Se alcanzó el límite diario de Firebase Firestore. La cuota se restablece mañana; tus documentos locales siguen guardados.',
      });
    }
  };

  useEffect(() => {
    if (!isFirebaseAuthReady || !firebaseUser || !isOnline) {
      return;
    }

    let cancelled = false;
    let unsubscribeDocs: (() => void) | null = null;
    const uid = firebaseUser.uid;
    const initialTheme: 'dark' | 'light' = darkMode ? 'dark' : 'light';

    void ensureUserProfile(firebaseUser, initialTheme)
      .then((remoteTheme) => {
        if (cancelled) return;
        setCloudProfileReady(true);
        setDarkMode(remoteTheme === 'dark');

        unsubscribeDocs = subscribeUserDocuments(
          uid,
          (remoteDocs) => {
            if (cancelled) return;
            const nextIds = new Set(remoteDocs.map((d) => sanitizeFirestoreId(d.id)));
            cloudDocIdsRef.current = nextIds;

            if (remoteDocs.length === 0) {
              if (cloudSeededUidRef.current !== uid && documentsRef.current.length > 0) {
                cloudSeededUidRef.current = uid;
                for (const localDoc of documentsRef.current) {
                  void upsertCloudDocument(uid, localDoc, false)
                    .then(() => {
                      cloudDocIdsRef.current.add(sanitizeFirestoreId(localDoc.id));
                    })
                    .catch(reportCloudSyncError);
                }
              }
              return;
            }

            cloudSeededUidRef.current = uid;
            setDocuments((prev) => {
              const localById = new Map(prev.map((d) => [sanitizeFirestoreId(d.id), d]));
              const merged: WpsDocument[] = remoteDocs.map((remoteDoc) => {
                const localMatch = localById.get(sanitizeFirestoreId(remoteDoc.id));
                return {
                  ...remoteDoc,
                  // Retain full local PDF blob in IndexedDB if omitted from Firestore 1MB limit
                  pdfBase64: remoteDoc.pdfBase64 ?? localMatch?.pdfBase64,
                };
              });
              const remoteIdSet = new Set(remoteDocs.map((d) => sanitizeFirestoreId(d.id)));
              for (const localDoc of prev) {
                if (!remoteIdSet.has(sanitizeFirestoreId(localDoc.id)) && docsDirtyRef.current) {
                  merged.push(localDoc);
                }
              }
              return merged;
            });
          },
          reportCloudSyncError,
        );
      })
      .catch(reportCloudSyncError);

    return () => {
      cancelled = true;
      if (unsubscribeDocs) {
        unsubscribeDocs();
      }
      for (const timer of syncTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      syncTimersRef.current.clear();
    };
  }, [isFirebaseAuthReady, firebaseUser, isOnline]);

  useEffect(() => {
    let active = true;
    loadCachedDocuments().then((cached) => {
      if (active && cached && cached.length > 0 && !docsDirtyRef.current) {
        setDocuments(cached);
      }
      if (active) {
        setCacheHydrated(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cacheHydrated) return;
    let cancelled = false;
    let settleTimer: number | undefined;
    const startedAt = Date.now();

    if (docsDirtyRef.current) {
      setSyncStatus('saving');
    }

    void saveCachedDocuments(documents).then(() => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 320 - elapsed);
      settleTimer = window.setTimeout(() => {
        if (!cancelled) {
          setSyncStatus('saved');
        }
      }, remaining);
    });

    return () => {
      cancelled = true;
      if (settleTimer !== undefined) {
        window.clearTimeout(settleTimer);
      }
    };
  }, [documents, cacheHydrated]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', darkMode ? '#0f172a' : '#ffffff');
    }
  }, [darkMode]);

  const activeDoc = documents.find((d) => d.id === activeDocId) ?? null;

  const scheduleCloudUpsert = (docToSync: WpsDocument, immediate = false) => {
    if (!firebaseUser || !cloudProfileReady || !isOnline) {
      return;
    }
    const uid = firebaseUser.uid;
    const key = sanitizeFirestoreId(docToSync.id);
    const existingTimer = syncTimersRef.current.get(key);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      syncTimersRef.current.delete(key);
    }

    const execute = () => {
      syncTimersRef.current.delete(key);
      const existsInCloud = cloudDocIdsRef.current.has(key);
      void upsertCloudDocument(uid, docToSync, existsInCloud)
        .then(() => {
          cloudDocIdsRef.current.add(key);
        })
        .catch(reportCloudSyncError);
    };

    if (immediate) {
      execute();
    } else {
      const timer = window.setTimeout(execute, 650);
      syncTimersRef.current.set(key, timer);
    }
  };

  const handleCreateFromTemplate = (template: WpsTemplate) => {
    docsDirtyRef.current = true;
    const id = `doc-${Date.now()}`;
    const created: WpsDocument = {
      id,
      title:
        template.id === 'tpl-blank'
          ? 'Documento sin título'
          : template.title,
      format: 'DOCX',
      folder: template.category === 'General' ? 'Borradores' : template.category,
      starred: false,
      updatedAt: 'Ahora mismo',
      contentHtml: template.contentHtml,
      comments: [],
    };
    const nextDocs = [created, ...documentsRef.current];
    documentsRef.current = nextDocs;
    setDocuments(nextDocs);
    setActiveDocId(id);
    scheduleCloudUpsert(created, true);
  };

  const handleCreateAiDocument = (created: WpsDocument) => {
    docsDirtyRef.current = true;
    const nextDocs = [created, ...documentsRef.current];
    documentsRef.current = nextDocs;
    setDocuments(nextDocs);
    setActiveDocId(created.id);
    scheduleCloudUpsert(created, true);
  };

  const handleUpdateDocument = (docId: string, patch: Partial<WpsDocument>) => {
    docsDirtyRef.current = true;
    setSyncStatus('saving');
    const current = documentsRef.current.find((d) => d.id === docId);
    const nextDoc = current ? { ...current, ...patch } : null;
    if (nextDoc) {
      const nextDocs = documentsRef.current.map((d) => (d.id === docId ? nextDoc : d));
      documentsRef.current = nextDocs;
      setDocuments(nextDocs);
      scheduleCloudUpsert(nextDoc, false);
    }
  };

  const handleToggleStar = (docId: string) => {
    docsDirtyRef.current = true;
    const current = documentsRef.current.find((d) => d.id === docId);
    const nextDoc = current ? { ...current, starred: !current.starred } : null;
    if (nextDoc) {
      const nextDocs = documentsRef.current.map((d) => (d.id === docId ? nextDoc : d));
      documentsRef.current = nextDocs;
      setDocuments(nextDocs);
      scheduleCloudUpsert(nextDoc, true);
    }
  };

  const handleRenameDocument = (docId: string, newTitle: string) => {
    handleUpdateDocument(docId, { title: newTitle, updatedAt: 'Ahora mismo' });
  };

  const handleDuplicateDocument = (docId: string) => {
    const source = documentsRef.current.find((d) => d.id === docId);
    if (!source) return;
    docsDirtyRef.current = true;
    const clonedSlides = source.slides
      ? (JSON.parse(JSON.stringify(source.slides)) as WpsDocument['slides'])
      : undefined;
    const copy: WpsDocument = {
      ...source,
      id: `doc-${Date.now()}`,
      title: `${source.title} (Copia)`,
      starred: false,
      updatedAt: 'Ahora mismo',
      comments: source.comments.map((c) => ({ ...c })),
      slides: clonedSlides,
    };
    const nextDocs = [copy, ...documentsRef.current];
    documentsRef.current = nextDocs;
    setDocuments(nextDocs);
    scheduleCloudUpsert(copy, true);
  };

  const handleDeleteDocument = (docId: string) => {
    docsDirtyRef.current = true;
    const nextDocs = documentsRef.current.filter((d) => d.id !== docId);
    documentsRef.current = nextDocs;
    setDocuments(nextDocs);
    if (activeDocId === docId) {
      setActiveDocId(null);
    }
    const key = sanitizeFirestoreId(docId);
    const pendingTimer = syncTimersRef.current.get(key);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      syncTimersRef.current.delete(key);
    }
    if (
      firebaseUser &&
      cloudProfileReady &&
      isOnline &&
      cloudDocIdsRef.current.has(key)
    ) {
      cloudDocIdsRef.current.delete(key);
      void deleteCloudDocument(firebaseUser.uid, key).catch(reportCloudSyncError);
    }
  };

  const handleExportDocument = (doc: WpsDocument, kind: 'doc' | 'html' | 'txt') => {
    const safeName =
      doc.title.replace(/[^\w\dáéíóúñÁÉÍÓÚÑ\-_ ]+/g, '').trim() || 'documento';
    const cleanBodyHtml = stripDocCanvaLayerMarkup(doc.contentHtml);

    if (kind === 'txt') {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(cleanBodyHtml, 'text/html');
      const plain = parsed.body.innerText || parsed.body.textContent || '';
      downloadBlob(`${safeName}.txt`, plain, 'text/plain;charset=utf-8');
      return;
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.title)}</title>
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 794px; margin: 40px auto; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
  th { background: #f1f5f9; }
  blockquote { border-left: 3px solid #94a3b8; padding-left: 12px; color: #334155; }
</style>
</head>
<body>${cleanBodyHtml}</body>
</html>`;

    if (kind === 'html') {
      downloadBlob(`${safeName}.html`, fullHtml, 'text/html;charset=utf-8');
      return;
    }

    const wordDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head>
<body>${cleanBodyHtml}</body>
</html>`;
    downloadBlob(`${safeName}.doc`, wordDoc, 'application/msword;charset=utf-8');
  };

  const handleImportFile = async (file: File) => {
    setStatusNotice(null);
    try {
      const imported = await parseUploadedOfficeFile(file);
      docsDirtyRef.current = true;
      const nextDocs = [imported, ...documentsRef.current];
      documentsRef.current = nextDocs;
      setDocuments(nextDocs);
      setActiveDocId(imported.id);
      scheduleCloudUpsert(imported, true);
    } catch (err) {
      setStatusNotice({
        kind: 'error',
        text:
          err instanceof Error
            ? `No se pudo abrir "${file.name}": ${err.message}`
            : `No se pudo abrir el archivo "${file.name}".`,
      });
    }
  };

  const handleImportFileRef = useRef(handleImportFile);
  handleImportFileRef.current = handleImportFile;

  useEffect(() => {
    const consumeNativePendingFile = () => {
      try {
        const bridge = (
          window as unknown as {
            AlxNativeBridge?: { consumePendingFile?: () => string | null };
          }
        ).AlxNativeBridge;
        const rawJson = bridge?.consumePendingFile?.();
        if (!rawJson) return;
        const parsed = JSON.parse(rawJson) as {
          name?: string;
          mimeType?: string;
          base64?: string;
        };
        if (!parsed.base64) return;
        const bin = atob(parsed.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        const fileName = parsed.name || 'documento.pdf';
        const file = new File([bytes], fileName, {
          type: parsed.mimeType || 'application/octet-stream',
        });
        void handleImportFileRef.current(file);
      } catch {
        // Ignore malformed native bridge payload
      }
    };

    consumeNativePendingFile();
    window.addEventListener('alx-native-file', consumeNativePendingFile);
    window.addEventListener('focus', consumeNativePendingFile);

    const winWithLaunch = window as unknown as {
      launchQueue?: {
        setConsumer?: (
          consumer: (launchParams: {
            files?: Array<{ getFile: () => Promise<File> }>;
          }) => void,
        ) => void;
      };
    };

    if (typeof winWithLaunch.launchQueue?.setConsumer === 'function') {
      winWithLaunch.launchQueue.setConsumer((launchParams) => {
        const files = launchParams?.files;
        if (!files || files.length === 0) return;
        void (async () => {
          for (const handle of files) {
            try {
              const file = await handle.getFile();
              await handleImportFileRef.current(file);
            } catch {
              // Ignore unreadable file handle
            }
          }
        })();
      });
    }

    return () => {
      window.removeEventListener('alx-native-file', consumeNativePendingFile);
      window.removeEventListener('focus', consumeNativePendingFile);
    };
  }, []);

  const handleAccountLogout = async () => {
    await logoutAccount();
    setStatusNotice({
      kind: 'success',
      text: 'Sesión cerrada. Tus documentos locales permanecen disponibles en este dispositivo.',
    });
  };

  const offlineBanner = !isOnline ? (
    <div
      role="status"
      className="no-print fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/95 px-3 py-2 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-md lg:bottom-4"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      <span>Modo sin conexión — Documentos y app guardados en caché</span>
    </div>
  ) : null;

  if (activeDoc) {
    if (activeDoc.format === 'PDF') {
      return (
        <>
          <WpsPdfViewer
            document={activeDoc}
            syncStatus={syncStatus}
            onBack={() => setActiveDocId(null)}
            onUpdateDocument={(patch) => handleUpdateDocument(activeDoc.id, patch)}
          />
          {offlineBanner}
        </>
      );
    }

    if (activeDoc.format === 'PPT' || activeDoc.format === 'PPTX') {
      return (
        <>
          <WpsPptViewer
            document={activeDoc}
            syncStatus={syncStatus}
            onBack={() => setActiveDocId(null)}
            onUpdateDocument={(patch) => handleUpdateDocument(activeDoc.id, patch)}
          />
          {offlineBanner}
        </>
      );
    }

    return (
      <>
        <WpsEditorView
          document={activeDoc}
          syncStatus={syncStatus}
          onBack={() => setActiveDocId(null)}
          onUpdateDocument={(patch) => handleUpdateDocument(activeDoc.id, patch)}
          onExportDocument={handleExportDocument}
        />
        {offlineBanner}
      </>
    );
  }

  return (
    <>
      {offlineBanner}
      {statusNotice && (
        <div
          className={`fixed left-1/2 top-4 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
            statusNotice.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/90 dark:text-emerald-200'
          }`}
        >
          <span>{statusNotice.text}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>
      )}

      <WpsHomeView
        documents={documents}
        activeTab={homeTab}
        onTabChange={setHomeTab}
        onOpenDocument={(id) => setActiveDocId(id)}
        onCreateFromTemplate={handleCreateFromTemplate}
        onToggleStar={handleToggleStar}
        onRenameDocument={handleRenameDocument}
        onDuplicateDocument={handleDuplicateDocument}
        onDeleteDocument={handleDeleteDocument}
        onExportDocument={handleExportDocument}
        onImportFile={handleImportFile}
        darkMode={darkMode}
        onToggleDarkMode={() => {
          setDarkMode((prev) => {
            const next = !prev;
            if (firebaseUser && cloudProfileReady && isOnline) {
              void updateUserThemeInCloud(
                firebaseUser.uid,
                next ? 'dark' : 'light',
              ).catch(reportCloudSyncError);
            }
            return next;
          });
        }}
        accountUsername={getAccountUsername(firebaseUser)}
        onOpenAuth={(mode) => {
          setAuthModalMode(mode);
          setAuthModalOpen(true);
        }}
        onLogout={() => {
          void handleAccountLogout();
        }}
        onOpenAiCreator={(format) => {
          setAiCreateFormat(format || 'DOCX');
          setAiCreateOpen(true);
        }}
        onOpenDonations={(tab = 'support') => {
          setDonationModalTab(tab);
          setDonationModalOpen(true);
        }}
      />

      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(mode, username) => {
          setStatusNotice({
            kind: 'success',
            text:
              mode === 'register'
                ? `¡Cuenta @${username} creada! Tus documentos se sincronizarán en la nube.`
                : `¡Bienvenido de nuevo, @${username}!`,
          });
        }}
      />

      <AiCreateDocumentModal
        key={aiCreateFormat}
        open={aiCreateOpen}
        initialFormat={aiCreateFormat}
        onClose={() => setAiCreateOpen(false)}
        onCreateDocument={handleCreateAiDocument}
      />

      <DonationModal
        open={donationModalOpen}
        initialTab={donationModalTab}
        onClose={() => setDonationModalOpen(false)}
      />
    </>
  );
}
