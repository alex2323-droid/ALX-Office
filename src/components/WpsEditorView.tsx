import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Download,
  Eraser,
  Eye,
  FileDown,
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquarePlus,
  Minus,
  Monitor,
  Pencil,
  Printer,
  Redo2,
  Search,
  Smartphone,
  SpellCheck,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import { WpsComment, WpsDocument, computeDocStats } from '../data/wpsDocuments';
import {
  SpellErrorMatch,
  getSpellingSuggestions,
  loadCustomDictionary,
  saveCustomDictionary,
  scanElementSpelling,
} from '../lib/spellChecker';
import { SpellCheckMenu, SpellContextMenuState } from './SpellCheckMenu';

interface WpsEditorViewProps {
  document: WpsDocument;
  syncStatus?: 'saving' | 'saved';
  onBack: () => void;
  onUpdateDocument: (patch: Partial<WpsDocument>) => void;
  onExportDocument: (doc: WpsDocument, kind: 'doc' | 'html' | 'txt') => void;
}

type ToolDrawerTab = 'inicio' | 'insertar' | 'ver' | 'revisar';

const TEXT_COLORS = [
  { label: 'Negro', value: '#0f172a' },
  { label: 'Gris', value: '#475569' },
  { label: 'Rojo WPS', value: '#dc2626' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Ámbar', value: '#d97706' },
  { label: 'Morado', value: '#7c3aed' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Sin resaltado', value: 'transparent' },
  { label: 'Amarillo', value: '#fef08a' },
  { label: 'Verde suave', value: '#bbf7d0' },
  { label: 'Azul suave', value: '#bfdbfe' },
  { label: 'Rosa suave', value: '#fecdd3' },
];

export default function WpsEditorView({
  document: doc,
  syncStatus = 'saved',
  onBack,
  onUpdateDocument,
  onExportDocument,
}: WpsEditorViewProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const spellScanTimerRef = useRef<number | null>(null);

  const [isEditing, setIsEditing] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<ToolDrawerTab>('inicio');

  // View settings
  const [layoutMode, setLayoutMode] = useState<'mobile' | 'page'>('mobile');
  const [eyeCareMode, setEyeCareMode] = useState(false);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [lineSpacing, setLineSpacing] = useState<'1.4' | '1.65' | '1.95'>('1.65');

  // Active formatting feedback
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    unorderedList: false,
    orderedList: false,
  });

  // Find & Replace
  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [findFeedback, setFindFeedback] = useState<string | null>(null);

  // Insert Helpers
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');

  // Comments
  const [newCommentText, setNewCommentText] = useState('');

  // Spellchecker
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [ignoredWords, setIgnoredWords] = useState<Set<string>>(() => new Set());
  const [customWords, setCustomWords] = useState<Set<string>>(() =>
    loadCustomDictionary(),
  );
  const [spellErrors, setSpellErrors] = useState<SpellErrorMatch[]>([]);
  const [underlineRects, setUnderlineRects] = useState<
    { id: string; left: number; top: number; width: number }[]
  >([]);
  const [spellMenu, setSpellMenu] = useState<SpellContextMenuState | null>(null);

  const stats = useMemo(() => computeDocStats(doc.contentHtml), [doc.contentHtml]);

  const computeUnderlineRects = useCallback((errors: SpellErrorMatch[]) => {
    const container = paperRef.current;
    if (!container) {
      setUnderlineRects([]);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const rects: { id: string; left: number; top: number; width: number }[] = [];

    for (const err of errors) {
      if (!err.range.startContainer.isConnected) continue;
      const clientRects = err.range.getClientRects();
      for (let i = 0; i < clientRects.length; i++) {
        const r = clientRects[i];
        if (r.width <= 0 || r.height <= 0) continue;
        rects.push({
          id: `${err.id}-${i}`,
          left: r.left - containerRect.left,
          top: r.bottom - containerRect.top - 2,
          width: r.width,
        });
      }
    }
    setUnderlineRects(rects);
  }, []);

  const runSpellScan = useCallback(() => {
    if (!spellCheckEnabled || !editorRef.current) {
      setSpellErrors([]);
      setUnderlineRects([]);
      return;
    }
    const found = scanElementSpelling(editorRef.current, ignoredWords, customWords);
    setSpellErrors(found);
    computeUnderlineRects(found);
  }, [spellCheckEnabled, ignoredWords, customWords, computeUnderlineRects]);

  const scheduleSpellScan = useCallback(() => {
    if (spellScanTimerRef.current !== null) {
      window.clearTimeout(spellScanTimerRef.current);
    }
    spellScanTimerRef.current = window.setTimeout(() => {
      spellScanTimerRef.current = null;
      runSpellScan();
    }, 140);
  }, [runSpellScan]);

  // Sync contentHtml when opening a different document
  useEffect(() => {
    setIgnoredWords(new Set());
    setSpellMenu(null);
    if (editorRef.current && editorRef.current.innerHTML !== doc.contentHtml) {
      editorRef.current.innerHTML = doc.contentHtml;
    }
    const frame = window.requestAnimationFrame(() => {
      runSpellScan();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [doc.id]);

  // Re-scan when spellcheck settings or dictionaries change
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      runSpellScan();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [runSpellScan]);

  // Recompute underline positions on typography/layout/zoom changes or container resize
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      computeUnderlineRects(spellErrors);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fontFamily, zoomPercent, lineSpacing, layoutMode, spellErrors, computeUnderlineRects]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      computeUnderlineRects(spellErrors);
    });
    observer.observe(el);
    const handleResize = () => computeUnderlineRects(spellErrors);
    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [spellErrors, computeUnderlineRects]);

  useEffect(() => {
    return () => {
      if (spellScanTimerRef.current !== null) {
        window.clearTimeout(spellScanTimerRef.current);
      }
    };
  }, []);

  const syncFormatState = () => {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
      setActiveFormats({
        bold: window.document.queryCommandState('bold'),
        italic: window.document.queryCommandState('italic'),
        underline: window.document.queryCommandState('underline'),
        strikeThrough: window.document.queryCommandState('strikeThrough'),
        unorderedList: window.document.queryCommandState('insertUnorderedList'),
        orderedList: window.document.queryCommandState('insertOrderedList'),
      });
    } catch {
      // Ignore unsupported queryCommandState calls
    }
  };

  const restoreSelection = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const persistEditorHtml = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onUpdateDocument({
      contentHtml: html,
      updatedAt: 'Ahora mismo',
    });
    scheduleSpellScan();
  };

  const runFormatCommand = (command: string, value?: string) => {
    if (!isEditing) setIsEditing(true);
    restoreSelection();
    window.document.execCommand(command, false, value);
    persistEditorHtml();
    syncFormatState();
  };

  const insertHtmlAtCursor = (html: string) => {
    if (!isEditing) setIsEditing(true);
    restoreSelection();
    window.document.execCommand('insertHTML', false, html);
    persistEditorHtml();
    syncFormatState();
  };

  const handleInsertTable = () => {
    const headerCells = Array.from({ length: tableCols })
      .map((_, i) => `<th>Columna ${i + 1}</th>`)
      .join('');
    const bodyRows = Array.from({ length: Math.max(1, tableRows - 1) })
      .map(
        () =>
          `<tr>${Array.from({ length: tableCols })
            .map(() => '<td>Celda</td>')
            .join('')}</tr>`,
      )
      .join('');

    insertHtmlAtCursor(
      `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><p><br/></p>`,
    );
    setDrawerOpen(false);
  };

  const handleInsertChecklist = () => {
    insertHtmlAtCursor(
      `<p><input type="checkbox" style="margin-right:8px;" /> Elemento de verificación</p>`,
    );
  };

  const handleInsertLink = () => {
    const cleanUrl = linkUrl.trim();
    if (!cleanUrl) return;
    const safeUrl =
      cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')
        ? cleanUrl
        : `https://${cleanUrl}`;
    const label = linkLabel.trim() || safeUrl;
    insertHtmlAtCursor(`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a> `);
    setLinkUrl('');
    setLinkLabel('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        insertHtmlAtCursor(`<p><img src="${reader.result}" alt="${file.name}" /></p>`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setDrawerOpen(false);
  };

  // Find & Replace counting + replacement
  const findMatchesCount = useMemo(() => {
    const needle = findTerm.trim();
    if (!needle) return 0;
    const parser = new DOMParser();
    const parsed = parser.parseFromString(doc.contentHtml, 'text/html');
    const text = parsed.body.textContent || '';
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(escaped, 'gi'));
    return matches ? matches.length : 0;
  }, [doc.contentHtml, findTerm]);

  const handleReplaceAll = () => {
    const needle = findTerm.trim();
    if (!needle || !editorRef.current) return;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    const walker = window.document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
    );
    let replacedCount = 0;
    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }

    for (const node of nodes) {
      const val = node.nodeValue || '';
      const hits = val.match(regex);
      if (hits && hits.length > 0) {
        replacedCount += hits.length;
        node.nodeValue = val.replace(regex, replaceTerm);
      }
    }

    persistEditorHtml();
    runSpellScan();
    setFindFeedback(
      replacedCount > 0
        ? `Se reemplazaron ${replacedCount} coincidencia(s).`
        : 'Sin coincidencias para reemplazar.',
    );
  };

  const findSpellErrorAtPoint = (clientX: number, clientY: number): SpellErrorMatch | null => {
    for (const err of spellErrors) {
      if (!err.range.startContainer.isConnected) continue;
      const rects = err.range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (
          clientX >= r.left - 3 &&
          clientX <= r.right + 3 &&
          clientY >= r.top - 3 &&
          clientY <= r.bottom + 6
        ) {
          return err;
        }
      }
    }
    return null;
  };

  const openSpellMenuForError = (err: SpellErrorMatch, x: number, y: number) => {
    const suggestions = getSpellingSuggestions(err.word, 5);
    setSpellMenu({
      errorId: err.id,
      word: err.word,
      suggestions,
      x,
      y,
      range: err.range,
    });
  };

  const handleEditorContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!spellCheckEnabled) return;
    const matched = findSpellErrorAtPoint(e.clientX, e.clientY);
    if (!matched) {
      setSpellMenu(null);
      return;
    }
    e.preventDefault();
    openSpellMenuForError(matched, e.clientX, e.clientY + 6);
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!spellCheckEnabled) return;
    const isCoarsePointer =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarsePointer && isEditing) return;
    const matched = findSpellErrorAtPoint(e.clientX, e.clientY);
    if (matched) {
      openSpellMenuForError(matched, e.clientX, e.clientY + 8);
    }
  };

  const handleJumpToNextSpellError = () => {
    if (!spellCheckEnabled) {
      setSpellCheckEnabled(true);
      return;
    }
    if (spellErrors.length === 0) return;
    const target = spellErrors[0];
    if (!target.range.startContainer.isConnected) {
      runSpellScan();
      return;
    }
    const rect = target.range.getBoundingClientRect();
    const parentEl = target.range.startContainer.parentElement;
    parentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const updatedRect = target.range.getBoundingClientRect();
    const x = updatedRect.left || rect.left;
    const y = (updatedRect.bottom || rect.bottom) + 6;
    openSpellMenuForError(target, x, y);
  };

  const handleSelectSuggestion = (menu: SpellContextMenuState, replacement: string) => {
    setSpellMenu(null);
    if (!menu.range.startContainer.isConnected || !editorRef.current) return;

    if (!isEditing) {
      setIsEditing(true);
    }
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(menu.range);
    }

    const applied = window.document.execCommand('insertText', false, replacement);
    if (!applied) {
      menu.range.deleteContents();
      menu.range.insertNode(window.document.createTextNode(replacement));
    }

    persistEditorHtml();
    syncFormatState();
    window.requestAnimationFrame(() => runSpellScan());
  };

  const handleIgnoreSpellWord = (word: string) => {
    const lower = word.trim().toLowerCase();
    setIgnoredWords((prev) => {
      const next = new Set(prev);
      next.add(lower);
      return next;
    });
    setSpellMenu(null);
  };

  const handleAddWordToDictionary = (word: string) => {
    const lower = word.trim().toLowerCase();
    setCustomWords((prev) => {
      const next = new Set(prev);
      next.add(lower);
      saveCustomDictionary(next);
      return next;
    });
    setSpellMenu(null);
  };

  const handleAddComment = () => {
    const text = newCommentText.trim();
    if (!text) return;
    const selText = window.getSelection()?.toString().trim() || '';
    const comment: WpsComment = {
      id: `cm-${Date.now()}`,
      author: 'Usuario local',
      text,
      quote: selText.slice(0, 60),
      createdAt: 'Ahora',
      resolved: false,
    };
    onUpdateDocument({ comments: [comment, ...doc.comments] });
    setNewCommentText('');
  };

  const toggleCommentResolved = (id: string) => {
    onUpdateDocument({
      comments: doc.comments.map((c) =>
        c.id === id ? { ...c, resolved: !c.resolved } : c,
      ),
    });
  };

  const deleteComment = (id: string) => {
    onUpdateDocument({
      comments: doc.comments.filter((c) => c.id !== id),
    });
  };

  const fontStack =
    fontFamily === 'serif'
      ? 'var(--font-serif)'
      : fontFamily === 'mono'
        ? 'var(--font-mono)'
        : 'var(--font-sans)';

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Compact Sticky Top Editor Bar (52px) */}
      <header className="no-print sticky top-0 z-30 flex h-[52px] items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a documentos"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <input
            type="text"
            value={doc.title}
            onChange={(e) => onUpdateDocument({ title: e.target.value })}
            aria-label="Título del documento"
            className="min-w-[60px] flex-1 truncate rounded-lg bg-transparent px-2 py-1 font-display text-sm font-semibold text-slate-900 focus:bg-slate-100 focus:outline-none sm:text-base dark:text-slate-100 dark:focus:bg-slate-800"
          />

          <div
            role="status"
            aria-live="polite"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap px-1.5 text-[11px] font-medium text-slate-500 sm:text-xs dark:text-slate-400"
          >
            {syncStatus === 'saving' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>Guardado</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isEditing && (
            <>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runFormatCommand('undo')}
                aria-label="Deshacer"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runFormatCommand('redo')}
                aria-label="Rehacer"
                className="hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 sm:flex dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleJumpToNextSpellError}
            title={
              spellCheckEnabled
                ? spellErrors.length > 0
                  ? `${spellErrors.length} error(es) ortográfico(s) — Clic para revisar`
                  : 'Sin errores ortográficos'
                : 'Activar corrector ortográfico'
            }
            aria-label="Revisar ortografía"
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              !spellCheckEnabled
                ? 'text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800'
                : spellErrors.length > 0
                  ? 'bg-red-50 text-[#EA3D2F] hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-950/80'
                  : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
            }`}
          >
            <SpellCheck className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline font-mono tabular-nums">
              {!spellCheckEnabled
                ? 'Ortografía off'
                : spellErrors.length > 0
                  ? `${spellErrors.length}`
                  : 'OK'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFindOpen((v) => !v)}
            aria-label="Buscar y reemplazar"
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
              findOpen
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isEditing) {
                persistEditorHtml();
                setDrawerOpen(false);
              }
              setIsEditing((v) => !v);
            }}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              isEditing
                ? 'bg-[#EA3D2F] text-white hover:bg-[#D63124]'
                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
            }`}
          >
            {isEditing ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Listo</span>
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                <span>Editar</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Find & Replace Strip */}
      {findOpen && (
        <div className="no-print border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-4xl flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={findTerm}
                onChange={(e) => {
                  setFindTerm(e.target.value);
                  setFindFeedback(null);
                }}
                placeholder="Buscar texto..."
                className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {findMatchesCount} coincid.
              </span>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                placeholder="Reemplazar por..."
                className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleReplaceAll}
                className="h-10 rounded-lg bg-slate-900 px-3.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Reemplazar todo
              </button>
              <button
                type="button"
                onClick={() => setFindOpen(false)}
                aria-label="Cerrar buscador"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {findFeedback && (
            <div className="mx-auto mt-1.5 max-w-4xl text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {findFeedback}
            </div>
          )}
        </div>
      )}

      {/* Scrollable Document Sheet Area */}
      <div className="flex-1 overflow-y-auto px-3 py-4 pb-32 sm:px-6 sm:py-8">
        <div
          className={`wps-print-sheet mx-auto transition-all ${
            layoutMode === 'page' ? 'max-w-[794px]' : 'max-w-[680px]'
          }`}
        >
          {/* Paper Sheet */}
          <div
            ref={paperRef}
            style={{
              fontFamily: fontStack,
              fontSize: `${(16 * zoomPercent) / 100}px`,
              lineHeight: lineSpacing,
            }}
            className={`relative min-h-[68vh] rounded-2xl border p-5 shadow-sm sm:p-10 ${
              eyeCareMode
                ? 'border-[#E6D8B8] bg-[#FBF5E6] text-[#3B2F21]'
                : 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
            }`}
          >
            {/* Non-destructive Spellcheck Wavy Underline Layer */}
            {spellCheckEnabled && underlineRects.length > 0 && (
              <div
                aria-hidden="true"
                className="no-print pointer-events-none absolute inset-0 overflow-hidden"
              >
                {underlineRects.map((rect) => (
                  <span
                    key={rect.id}
                    style={{
                      left: `${rect.left}px`,
                      top: `${rect.top}px`,
                      width: `${rect.width}px`,
                      height: '4px',
                    }}
                    className="alx-spell-wave absolute block"
                  />
                ))}
              </div>
            )}

            <div
              ref={editorRef}
              contentEditable={isEditing}
              spellCheck={false}
              suppressContentEditableWarning
              onInput={persistEditorHtml}
              onKeyUp={syncFormatState}
              onMouseUp={syncFormatState}
              onTouchEnd={syncFormatState}
              onContextMenu={handleEditorContextMenu}
              onClick={handleEditorClick}
              className="wps-doc-canvas relative z-[1] min-h-[58vh]"
            />
          </div>

          {spellMenu && (
            <SpellCheckMenu
              menu={spellMenu}
              onSelectSuggestion={handleSelectSuggestion}
              onIgnoreWord={handleIgnoreSpellWord}
              onAddToDictionary={handleAddWordToDictionary}
              onClose={() => setSpellMenu(null)}
            />
          )}

          {/* Quiet Document Metadata Footer */}
          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            <span>
              {stats.words} palabras · {stats.chars} caracteres · {stats.paragraphs} párrafos · {stats.readMinutes} min lectura
            </span>
            <span>
              {layoutMode === 'mobile' ? 'Ajuste móvil' : 'Página A4'} · {zoomPercent}% ·{' '}
              {syncStatus === 'saving' ? 'Guardando...' : 'Guardado localmente'}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Bottom WPS Tool Sheet (Inicio / Insertar / Ver / Revisar) */}
      {drawerOpen && (
        <div className="no-print fixed bottom-[52px] left-0 right-0 z-30 border-t border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-5xl">
            {/* Sheet Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
              <div className="flex items-center gap-1 overflow-x-auto">
                {(
                  [
                    { id: 'inicio', label: 'Inicio' },
                    { id: 'insertar', label: 'Insertar' },
                    { id: 'ver', label: 'Ver' },
                    {
                      id: 'revisar',
                      label: `Revisar (${doc.comments.filter((c) => !c.resolved).length})`,
                    },
                  ] as { id: ToolDrawerTab; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDrawerTab(tab.id)}
                    className={`min-h-[44px] border-b-2 px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      drawerTab === tab.id
                        ? 'border-[#EA3D2F] text-[#EA3D2F] dark:text-red-400'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar panel de herramientas"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>

            {/* Sheet Body */}
            <div className="max-h-[42vh] overflow-y-auto p-4 sm:p-5">
              {/* TAB: INICIO */}
              {drawerTab === 'inicio' && (
                <div className="space-y-4">
                  {/* Heading Styles */}
                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Estilos de párrafo
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Normal', tag: 'P' },
                        { label: 'Título 1', tag: 'H1' },
                        { label: 'Título 2', tag: 'H2' },
                        { label: 'Título 3', tag: 'H3' },
                        { label: 'Cita', tag: 'BLOCKQUOTE' },
                      ].map((item) => (
                        <button
                          key={item.tag}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => runFormatCommand('formatBlock', item.tag)}
                          className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignment, Indent, Strike, Clear */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('justifyLeft')}
                      aria-label="Alinear a la izquierda"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('justifyCenter')}
                      aria-label="Centrar"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignCenter className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('justifyRight')}
                      aria-label="Alinear a la derecha"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('justifyFull')}
                      aria-label="Justificar"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignJustify className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('indent')}
                      aria-label="Aumentar sangría"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <IndentIncrease className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('outdent')}
                      aria-label="Disminuir sangría"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <IndentDecrease className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('strikeThrough')}
                      aria-label="Tachado"
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border ${
                        activeFormats.strikeThrough
                          ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <Strikethrough className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runFormatCommand('removeFormat')}
                      aria-label="Borrar formato"
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Eraser className="h-4 w-4" />
                      <span>Limpiar</span>
                    </button>
                  </div>

                  {/* Text & Highlight Colors */}
                  <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-800">
                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Color de fuente
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {TEXT_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => runFormatCommand('foreColor', c.value)}
                            aria-label={`Color ${c.label}`}
                            style={{ backgroundColor: c.value }}
                            className="h-9 w-9 rounded-full border border-slate-300 transition-transform active:scale-95 dark:border-slate-600"
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <Highlighter className="h-3.5 w-3.5" />
                        <span>Resaltado</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {HIGHLIGHT_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => runFormatCommand('hiliteColor', c.value)}
                            aria-label={c.label}
                            style={{ backgroundColor: c.value }}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-700 transition-transform active:scale-95 dark:border-slate-600"
                          >
                            {c.value === 'transparent' ? '×' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: INSERTAR */}
              {drawerTab === 'insertar' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Table Builder */}
                    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <Table2 className="h-4 w-4 text-blue-600" />
                          <span>Insertar tabla ({tableRows} × {tableCols})</span>
                        </span>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleInsertTable}
                          className="min-h-[36px] rounded-lg bg-[#EA3D2F] px-3 text-xs font-semibold text-white hover:bg-[#D63124]"
                        >
                          Insertar
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs">
                        <label className="flex items-center gap-2">
                          <span className="text-slate-500">Filas</span>
                          <input
                            type="number"
                            min={2}
                            max={8}
                            value={tableRows}
                            onChange={(e) =>
                              setTableRows(Math.max(2, Math.min(8, Number(e.target.value) || 2)))
                            }
                            className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono tabular-nums dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-slate-500">Columnas</span>
                          <input
                            type="number"
                            min={2}
                            max={6}
                            value={tableCols}
                            onChange={(e) =>
                              setTableCols(Math.max(2, Math.min(6, Number(e.target.value) || 2)))
                            }
                            className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono tabular-nums dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Link Builder */}
                    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <Link2 className="h-4 w-4 text-blue-600" />
                        <span>Insertar hipervínculo</span>
                      </div>
                      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={linkLabel}
                          onChange={(e) => setLinkLabel(e.target.value)}
                          placeholder="Texto"
                          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="https://..."
                          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleInsertLink}
                          className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white dark:bg-blue-600"
                        >
                          Añadir
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quick Insert Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <ImageIcon className="h-4 w-4 text-blue-600" />
                      <span>Imagen local</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleInsertChecklist}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                      <span>Casilla de verificación</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertHtmlAtCursor('<hr /><p><br/></p>')}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Minus className="h-4 w-4 text-slate-500" />
                      <span>Separador</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        insertHtmlAtCursor(
                          `${new Date().toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })} `,
                        )
                      }
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <span>Fecha actual</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: VER */}
              {drawerTab === 'ver' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Modo de vista
                    </div>
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setLayoutMode('mobile')}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
                          layoutMode === 'mobile'
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>Móvil</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayoutMode('page')}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
                          layoutMode === 'page'
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        <span>Página A4</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Tipografía de lectura
                    </div>
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                      {(['sans', 'serif', 'mono'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFontFamily(f)}
                          className={`min-h-[36px] rounded-lg px-3 text-xs font-medium capitalize ${
                            fontFamily === f
                              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Zoom del lienzo ({zoomPercent}%)
                    </div>
                    <div className="flex items-center gap-2">
                      {[85, 100, 115, 130].map((z) => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setZoomPercent(z)}
                          className={`min-h-[36px] rounded-lg border px-2.5 font-mono text-xs tabular-nums ${
                            zoomPercent === z
                              ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                              : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {z}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Protección ocular e interlineado
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEyeCareMode((v) => !v)}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                          eyeCareMode
                            ? 'border-amber-600 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Sepia</span>
                      </button>
                      <select
                        aria-label="Interlineado"
                        value={lineSpacing}
                        onChange={(e) =>
                          setLineSpacing(e.target.value as '1.4' | '1.65' | '1.95')
                        }
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="1.4">1.4x</option>
                        <option value="1.65">1.65x</option>
                        <option value="1.95">1.95x</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: REVISAR Y EXPORTAR */}
              {drawerTab === 'revisar' && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* Spellchecker & Export Options */}
                  <div className="space-y-4 lg:col-span-5">
                    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <SpellCheck className="h-4 w-4 text-[#EA3D2F] dark:text-red-400" />
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Corrector ortográfico
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSpellCheckEnabled((v) => !v)}
                          className={`min-h-[32px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                            spellCheckEnabled
                              ? 'bg-[#EA3D2F] text-white hover:bg-[#D63124]'
                              : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {spellCheckEnabled ? 'Activo' : 'Inactivo'}
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {spellCheckEnabled
                          ? spellErrors.length > 0
                            ? `${spellErrors.length} posible(s) error(es). Haz clic derecho sobre una palabra subrayada para ver sugerencias.`
                            : 'No se detectaron errores ortográficos en este documento.'
                          : 'Activa el corrector para subrayar errores y ver sugerencias contextuales.'}
                      </p>
                      {spellCheckEnabled && spellErrors.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setDrawerOpen(false);
                            handleJumpToNextSpellError();
                          }}
                          className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
                        >
                          <SpellCheck className="h-3.5 w-3.5" />
                          <span>Corregir primer error ({spellErrors[0].word})</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Exportar e Imprimir
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onExportDocument(doc, 'doc')}
                          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <FileDown className="h-4 w-4 text-blue-600" />
                          <span>Word (.doc)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onExportDocument(doc, 'html')}
                          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Download className="h-4 w-4 text-emerald-600" />
                          <span>Página (.html)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onExportDocument(doc, 'txt')}
                          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Download className="h-4 w-4 text-slate-500" />
                          <span>Texto (.txt)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Printer className="h-4 w-4 text-[#EA3D2F]" />
                          <span>Imprimir / PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="space-y-3 lg:col-span-7">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Comentarios de revisión ({doc.comments.length})
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                        placeholder="Añadir comentario sobre el documento..."
                        className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleAddComment}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#EA3D2F] px-3.5 text-xs font-semibold text-white hover:bg-[#D63124]"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        <span>Comentar</span>
                      </button>
                    </div>

                    {doc.comments.length > 0 && (
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                        {doc.comments.map((cm) => (
                          <div key={cm.id} className="flex items-start justify-between gap-3 p-3 text-xs">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {cm.author} · <span className="font-normal text-slate-400">{cm.createdAt}</span>
                                {cm.resolved && (
                                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                    Resuelto
                                  </span>
                                )}
                              </div>
                              {cm.quote && (
                                <div className="mt-0.5 italic text-slate-500">
                                  &ldquo;{cm.quote}&rdquo;
                                </div>
                              )}
                              <div
                                className={`mt-1 ${
                                  cm.resolved
                                    ? 'text-slate-400 line-through'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {cm.text}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleCommentResolved(cm.id)}
                                className="rounded px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                              >
                                {cm.resolved ? 'Reabrir' : 'Resolver'}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteComment(cm.id)}
                                aria-label="Eliminar comentario"
                                className="rounded p-1.5 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ergonomic Bottom Quick-Formatting Bar (52px) */}
      <footer className="no-print fixed bottom-0 left-0 right-0 z-40 flex h-[52px] items-center justify-between gap-1 border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center overflow-x-auto">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runFormatCommand('bold')}
            aria-label="Negrita"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.bold
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Bold className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runFormatCommand('italic')}
            aria-label="Cursiva"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.italic
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Italic className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runFormatCommand('underline')}
            aria-label="Subrayado"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.underline
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Underline className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runFormatCommand('insertUnorderedList')}
            aria-label="Lista con viñetas"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.unorderedList
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <List className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runFormatCommand('insertOrderedList')}
            aria-label="Lista numerada"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.orderedList
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <ListOrdered className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleInsertChecklist}
            aria-label="Insertar casilla"
            className="hidden min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 sm:flex dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <CheckSquare className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            drawerOpen
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          <span>Herramientas</span>
          {drawerOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
      </footer>
    </div>
  );
}
