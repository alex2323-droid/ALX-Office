import { useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  FolderOpen,
  LayoutTemplate,
  LogOut,
  Moon,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  WPS_TEMPLATES,
  WpsDocument,
  WpsFormat,
  WpsTemplate,
  computeDocStats,
} from '../data/wpsDocuments';
import { PWAInstallButton } from './PWAInstallButton';
import {
  TemplatePageThumbnail,
  TemplatePreviewModal,
} from './TemplatePreview';
import { isNativeCapacitorApp } from '../lib/googleAuth';

const FORMAT_FILTERS: ('ALL' | WpsFormat)[] = ['ALL', 'DOCX', 'DOC', 'PDF', 'PPTX', 'PPT', 'TXT'];

function getFormatTileStyle(format: WpsFormat) {
  switch (format) {
    case 'PDF':
      return {
        label: 'PDF',
        classes: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400',
      };
    case 'PPT':
    case 'PPTX':
      return {
        label: 'P',
        classes: 'bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400',
      };
    case 'TXT':
      return {
        label: 'T',
        classes: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
    default:
      return {
        label: 'W',
        classes: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
      };
  }
}

export type HomeTab = 'recents' | 'starred' | 'templates';

interface WpsHomeViewProps {
  documents: WpsDocument[];
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  onOpenDocument: (docId: string) => void;
  onCreateFromTemplate: (template: WpsTemplate) => void;
  onToggleStar: (docId: string) => void;
  onRenameDocument: (docId: string, newTitle: string) => void;
  onDuplicateDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onExportDocument: (doc: WpsDocument, kind: 'doc' | 'html' | 'txt') => void;
  onImportFile: (file: File) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  needsGoogleAuth: boolean;
  googleUserEmail: string | null;
  isGoogleLoggingIn: boolean;
  isPickerBusy: boolean;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  onOpenGooglePicker: () => void;
  onRequestSaveToDrive: (doc: WpsDocument) => void;
}

function GoogleSignInButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gsi-material-button"
    >
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            style={{ display: 'block' }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        </div>
        <span className="gsi-material-button-contents">Sign in with Google</span>
      </div>
    </button>
  );
}

export default function WpsHomeView({
  documents,
  activeTab,
  onTabChange,
  onOpenDocument,
  onCreateFromTemplate,
  onToggleStar,
  onRenameDocument,
  onDuplicateDocument,
  onDeleteDocument,
  onExportDocument,
  onImportFile,
  darkMode,
  onToggleDarkMode,
  needsGoogleAuth,
  googleUserEmail,
  isGoogleLoggingIn,
  isPickerBusy,
  onGoogleLogin,
  onGoogleLogout,
  onOpenGooglePicker,
  onRequestSaveToDrive,
}: WpsHomeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [formatFilter, setFormatFilter] = useState<'ALL' | WpsFormat>('ALL');
  const [actionSheetDoc, setActionSheetDoc] = useState<WpsDocument | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<WpsDocument | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<WpsTemplate | null>(
    null,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      if (activeTab === 'starred' && !doc.starred) return false;
      if (formatFilter !== 'ALL' && doc.format !== formatFilter) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.folder.toLowerCase().includes(q) ||
        doc.format.toLowerCase().includes(q)
      );
    });
  }, [documents, activeTab, formatFilter, searchQuery]);

  const startRename = (doc: WpsDocument) => {
    setActionSheetDoc(null);
    setRenamingDoc(doc);
    setRenameValue(doc.title);
  };

  const commitRename = () => {
    if (renamingDoc && renameValue.trim()) {
      onRenameDocument(renamingDoc.id, renameValue.trim());
    }
    setRenamingDoc(null);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.html,.htm"
        onChange={handleFilePick}
        className="hidden"
      />

      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden w-[264px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
            <img
              src="/assets/aistudio/1794708396591_f43e1352.png"
              alt="ALX Office"
              className="h-8 w-8 shrink-0 rounded-lg object-cover shadow-xs"
            />
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
              ALX Office
            </span>
          </div>

          <div className="p-4">
            <button
              type="button"
              onClick={() => onCreateFromTemplate(WPS_TEMPLATES[0])}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#EA3D2F] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#D63124] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo documento</span>
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-4" aria-label="Navegación principal">
            <button
              type="button"
              onClick={() => onTabChange('recents')}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-medium transition-colors ${
                activeTab === 'recents'
                  ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span>Recientes</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('starred')}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-medium transition-colors ${
                activeTab === 'starred'
                  ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <Star className="h-4 w-4 shrink-0" />
              <span>Destacados</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('templates')}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-medium transition-colors ${
                activeTab === 'templates'
                  ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutTemplate className="h-4 w-4 shrink-0" />
              <span>Plantillas Writer</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Upload className="h-4 w-4 shrink-0" />
              <span>Importar archivo local</span>
            </button>
            <button
              type="button"
              disabled={isPickerBusy}
              onClick={onOpenGooglePicker}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Cloud className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>{isPickerBusy ? 'Abriendo Drive...' : 'Google Picker'}</span>
            </button>
          </nav>

          <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {documents.length} documentos en caché local
            </div>
            <PWAInstallButton />
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span>{darkMode ? 'Tema oscuro' : 'Tema claro'}</span>
              {darkMode ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-500" />
              )}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
          {/* Mobile Top App Bar (52px) */}
          <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-3 backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/assets/aistudio/1794708396591_f43e1352.png"
                alt="ALX Office"
                className="h-7 w-7 shrink-0 rounded-lg object-cover shadow-xs"
              />
              <span className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                ALX Office
              </span>
            </div>

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setMobileSearchOpen((v) => !v)}
                aria-label="Buscar documentos"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Importar archivo"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <FolderOpen className="h-5 w-5" />
              </button>
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={onToggleDarkMode}
                aria-label="Cambiar tema"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {darkMode ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
              </button>
            </div>
          </header>

          {/* Desktop Top Header */}
          <header className="hidden h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white px-8 lg:flex dark:border-slate-800 dark:bg-slate-900">
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {activeTab === 'recents'
                ? 'Documentos recientes'
                : activeTab === 'starred'
                  ? 'Documentos destacados'
                  : 'Plantillas de ALX Writer'}
            </h1>
            <button
              type="button"
              onClick={() => onCreateFromTemplate(WPS_TEMPLATES[0])}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#EA3D2F] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D63124] whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="h-4 w-4" />
              <span>Crear documento</span>
            </button>
          </header>

          {/* Main Scrollable Viewport */}
          <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
            {/* Google Drive & Google Picker Strip */}
            <section className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <Cloud className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Google Drive y Google Picker
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {needsGoogleAuth
                      ? isNativeCapacitorApp()
                        ? 'En la APK local (localhost), usa la versión Web/PWA en Chrome para conectar Google Drive.'
                        : 'Conecta tu cuenta de Google para abrir PDF, PPT, PPTX, DOC o DOCX desde Drive.'
                      : `Conectado como ${googleUserEmail || 'Cuenta de Google'}`}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {needsGoogleAuth ? (
                  <GoogleSignInButton
                    onClick={onGoogleLogin}
                    disabled={isGoogleLoggingIn}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isPickerBusy}
                      onClick={onOpenGooglePicker}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Cloud className="h-4 w-4" />
                      <span>
                        {isPickerBusy ? 'Cargando archivo...' : 'Abrir desde Google Drive'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onGoogleLogout}
                      aria-label="Cerrar sesión de Google"
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Salir</span>
                    </button>
                  </>
                )}
              </div>
            </section>

            {/* Search & Filter Row */}
            {(mobileSearchOpen || activeTab !== 'templates') && (
              <div
                className={`${
                  mobileSearchOpen ? 'flex' : 'hidden lg:flex'
                } flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
              >
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por título o carpeta..."
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Limpiar búsqueda"
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {activeTab !== 'templates' && (
                  <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 self-start dark:bg-slate-800">
                    {FORMAT_FILTERS.map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormatFilter(fmt)}
                        className={`min-h-[36px] rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          formatFilter === fmt
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {fmt === 'ALL' ? 'Todos' : fmt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Templates Section */}
            {activeTab === 'templates' ? (
              <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {WPS_TEMPLATES.map((tpl) => (
                  <article
                    key={tpl.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-colors hover:border-[#EA3D2F]/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-red-500/40"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(tpl)}
                      aria-label={`Ampliar vista previa de ${tpl.title}`}
                      className="group relative w-full text-left focus:outline-none"
                    >
                      <TemplatePageThumbnail template={tpl} size="md" />
                      <span className="pointer-events-none absolute bottom-2.5 right-3 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <Eye className="h-3 w-3" />
                        <span>Ampliar</span>
                      </span>
                    </button>

                    <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                      <div>
                        <div className="text-xs font-medium text-[#EA3D2F] dark:text-red-400">
                          {tpl.category}
                        </div>
                        <h2 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                          {tpl.title}
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {tpl.description}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewTemplate(tpl)}
                          className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Vista previa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onCreateFromTemplate(tpl)}
                          className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-[#EA3D2F] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#D63124] active:scale-[0.98] whitespace-nowrap"
                        >
                          Usar plantilla
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <>
                {/* Quick Templates Carousel (Recents View) */}
                {activeTab === 'recents' && !searchQuery && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Crear rápido
                      </h2>
                      <button
                        type="button"
                        onClick={() => onTabChange('templates')}
                        className="min-h-[44px] px-2 text-xs font-medium text-[#EA3D2F] hover:underline dark:text-red-400"
                      >
                        Ver plantillas
                      </button>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {WPS_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => onCreateFromTemplate(tpl)}
                          className="flex w-40 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition-colors hover:border-[#EA3D2F]/50 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900"
                        >
                          <TemplatePageThumbnail template={tpl} size="sm" />
                          <div className="w-full p-3">
                            <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {tpl.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              {tpl.category}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Document List */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {activeTab === 'starred' ? 'Destacados' : 'Documentos'}
                    </h2>
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {filteredDocs.length} archivos
                    </span>
                  </div>

                  {filteredDocs.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {searchQuery
                          ? `No se encontraron documentos para "${searchQuery}".`
                          : 'No hay documentos en esta vista.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => onCreateFromTemplate(WPS_TEMPLATES[0])}
                        className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#EA3D2F] px-5 text-xs font-semibold text-white hover:bg-[#D63124]"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Crear nuevo documento</span>
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredDocs.map((doc) => {
                        const tile = getFormatTileStyle(doc.format);
                        const stats = computeDocStats(doc.contentHtml);
                        const detailMetric =
                          doc.format === 'PDF'
                            ? 'Visor PDF'
                            : doc.format === 'PPT' || doc.format === 'PPTX'
                              ? `${doc.slides?.length ?? 0} diapositivas`
                              : `${stats.words} palabras`;

                        return (
                          <div
                            key={doc.id}
                            className="flex min-h-[68px] items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenDocument(doc.id)}
                              className="flex min-w-0 flex-1 items-center gap-3.5 py-1.5 text-left"
                            >
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold ${tile.classes}`}
                              >
                                {tile.label}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {doc.title}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-slate-500 tabular-nums dark:text-slate-400">
                                  {doc.format} · {doc.folder} · {doc.updatedAt} · {detailMetric}
                                </div>
                              </div>
                            </button>

                            <div className="flex items-center shrink-0">
                              <button
                                type="button"
                                onClick={() => onToggleStar(doc.id)}
                                aria-label={
                                  doc.starred ? 'Quitar de destacados' : 'Marcar como destacado'
                                }
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Star
                                  className={`h-5 w-5 ${
                                    doc.starred
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-400'
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => setActionSheetDoc(doc)}
                                aria-label={`Opciones de ${doc.title}`}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              >
                                <MoreVertical className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-4 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
              <span>ALX Office · Suite documental offline y Drive</span>
              <div className="flex items-center gap-4">
                <a
                  href="/privacy.html"
                  className="hover:text-slate-800 hover:underline dark:hover:text-slate-200"
                >
                  Política de privacidad
                </a>
                <a
                  href="/terms.html"
                  className="hover:text-slate-800 hover:underline dark:hover:text-slate-200"
                >
                  Condiciones del servicio
                </a>
              </div>
            </footer>
          </main>
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (64px) */}
      <nav
        aria-label="Navegación móvil ALX Office"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-4 items-center border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <button
          type="button"
          onClick={() => onTabChange('recents')}
          className={`flex h-full flex-col items-center justify-center ${
            activeTab === 'recents'
              ? 'text-[#EA3D2F] dark:text-red-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <FileText className="h-5 w-5" />
          <span className="mt-1 text-[11px] font-medium tracking-tight">Recientes</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('starred')}
          className={`flex h-full flex-col items-center justify-center ${
            activeTab === 'starred'
              ? 'text-[#EA3D2F] dark:text-red-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Star className="h-5 w-5" />
          <span className="mt-1 text-[11px] font-medium tracking-tight">Destacados</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('templates')}
          className={`flex h-full flex-col items-center justify-center ${
            activeTab === 'templates'
              ? 'text-[#EA3D2F] dark:text-red-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <LayoutTemplate className="h-5 w-5" />
          <span className="mt-1 text-[11px] font-medium tracking-tight">Plantillas</span>
        </button>

        <button
          type="button"
          onClick={() => onCreateFromTemplate(WPS_TEMPLATES[0])}
          className="flex h-full flex-col items-center justify-center text-[#EA3D2F] dark:text-red-400"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EA3D2F] text-white">
            <Plus className="h-4 w-4" />
          </div>
          <span className="mt-0.5 text-[11px] font-semibold tracking-tight">Nuevo</span>
        </button>
      </nav>

      {/* Bottom Sheet: Document Actions */}
      {actionSheetDoc && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setActionSheetDoc(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
            <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {actionSheetDoc.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {actionSheetDoc.format} · {actionSheetDoc.updatedAt}
              </div>
            </div>

            <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              <button
                type="button"
                onClick={() => {
                  const id = actionSheetDoc.id;
                  setActionSheetDoc(null);
                  onOpenDocument(id);
                }}
                className="flex h-12 w-full items-center gap-3 text-left text-sm font-medium text-slate-800 hover:text-[#EA3D2F] dark:text-slate-200"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                <span>Abrir archivo</span>
              </button>
              <button
                type="button"
                onClick={() => startRename(actionSheetDoc)}
                className="flex h-12 w-full items-center gap-3 text-left text-sm font-medium text-slate-800 hover:text-[#EA3D2F] dark:text-slate-200"
              >
                <Pencil className="h-4 w-4 text-slate-400" />
                <span>Renombrar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDuplicateDocument(actionSheetDoc.id);
                  setActionSheetDoc(null);
                }}
                className="flex h-12 w-full items-center gap-3 text-left text-sm font-medium text-slate-800 hover:text-[#EA3D2F] dark:text-slate-200"
              >
                <Copy className="h-4 w-4 text-slate-400" />
                <span>Duplicar archivo</span>
              </button>
              {(actionSheetDoc.format === 'DOCX' ||
                actionSheetDoc.format === 'DOC' ||
                actionSheetDoc.format === 'TXT') && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onExportDocument(actionSheetDoc, 'doc');
                      setActionSheetDoc(null);
                    }}
                    className="flex h-12 w-full items-center gap-3 text-left text-sm font-medium text-slate-800 hover:text-[#EA3D2F] dark:text-slate-200"
                  >
                    <Download className="h-4 w-4 text-slate-400" />
                    <span>Exportar como Word (.doc)</span>
                  </button>
                  {!needsGoogleAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        const docToSave = actionSheetDoc;
                        setActionSheetDoc(null);
                        onRequestSaveToDrive(docToSave);
                      }}
                      className="flex h-12 w-full items-center gap-3 text-left text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200"
                    >
                      <Cloud className="h-4 w-4 text-blue-500" />
                      <span>Guardar copia en Google Drive</span>
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  onDeleteDocument(actionSheetDoc.id);
                  setActionSheetDoc(null);
                }}
                className="flex h-12 w-full items-center gap-3 text-left text-sm font-medium text-red-600 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                <span>Eliminar documento</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renamingDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setRenamingDoc(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Renombrar documento
            </h3>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
              className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenamingDoc(null)}
                className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={commitRename}
                className="h-11 rounded-xl bg-[#EA3D2F] px-4 text-xs font-semibold text-white hover:bg-[#D63124]"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={onCreateFromTemplate}
      />
    </div>
  );
}
