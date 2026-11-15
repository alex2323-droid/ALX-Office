import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  FileDown,
  Loader2,
  Monitor,
  Pencil,
  Printer,
  Redo2,
  Search,
  Smartphone,
  SpellCheck,
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
import WpsWordEditingBar, {
  ToolDrawerTab,
  WordActiveFormats,
} from './WpsWordEditingBar';

interface WpsEditorViewProps {
  document: WpsDocument;
  syncStatus?: 'saving' | 'saved';
  onBack: () => void;
  onUpdateDocument: (patch: Partial<WpsDocument>) => void;
  onExportDocument: (doc: WpsDocument, kind: 'doc' | 'html' | 'txt') => void;
}

export default function WpsEditorView({
  document: doc,
  syncStatus = 'saved',
  onBack,
  onUpdateDocument,
  onExportDocument,
}: WpsEditorViewProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
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
  const [activeFormats, setActiveFormats] = useState<WordActiveFormats>({
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

  const [printViewMode, setPrintViewMode] = useState(false);

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

  const persistEditorHtml = (): string | undefined => {
    if (!editorRef.current) return undefined;
    const html = editorRef.current.innerHTML;
    onUpdateDocument({
      contentHtml: html,
      updatedAt: 'Ahora mismo',
    });
    scheduleSpellScan();
    return html;
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

  const handleAddComment = (rawText: string) => {
    const text = rawText.trim();
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

  const triggerBrowserPrint = useCallback(() => {
    const previousTitle = window.document.title;
    window.document.title = doc.title?.trim() || 'ALX Office';
    const restoreTitle = () => {
      window.document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
    window.setTimeout(() => {
      window.document.title = previousTitle;
    }, 1000);
  }, [doc.title]);

  const handleEnterPrintView = () => {
    if (isEditing) {
      persistEditorHtml();
    }
    setDrawerOpen(false);
    setFindOpen(false);
    setSpellMenu(null);
    setPrintViewMode(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        triggerBrowserPrint();
      });
    });
  };

  const fontStack =
    fontFamily === 'serif'
      ? 'var(--font-serif)'
      : fontFamily === 'mono'
        ? 'var(--font-mono)'
        : 'var(--font-sans)';

  return (
    <div
      className={`wps-print-root flex min-h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 ${
        printViewMode ? 'alx-print-view' : ''
      }`}
    >

      {/* Compact Sticky Top Editor Bar (52px) */}
      {printViewMode ? (
        <header className="no-print sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md sm:px-5 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPrintViewMode(false)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver al editor</span>
            </button>
            <span className="truncate font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Vista de impresión · {doc.title}
            </span>
          </div>

          <button
            type="button"
            onClick={triggerBrowserPrint}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#EA3D2F] px-3.5 text-xs font-semibold text-white hover:bg-[#D63124] whitespace-nowrap shrink-0"
          >
            <Printer className="h-4 w-4" />
            <span>Imprimir / PDF</span>
          </button>
        </header>
      ) : (
        <header className="no-print sticky top-0 z-30 flex h-[52px] items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                persistEditorHtml();
                onBack();
              }}
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
              className="hidden shrink-0 items-center gap-1 whitespace-nowrap px-1.5 text-xs font-medium text-slate-500 sm:flex dark:text-slate-400"
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

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {isEditing && (
              <>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runFormatCommand('undo')}
                  aria-label="Deshacer"
                  className="flex min-h-[44px] min-w-[40px] sm:min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                !spellCheckEnabled
                  ? 'text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800'
                  : spellErrors.length > 0
                    ? 'bg-red-50 text-[#EA3D2F] hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-950/80'
                    : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
              }`}
            >
              <SpellCheck className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline font-mono tabular-nums">
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
              className={`flex min-h-[44px] min-w-[40px] sm:min-w-[44px] items-center justify-center rounded-xl transition-colors ${
                findOpen
                  ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleEnterPrintView}
              aria-label="Imprimir documento"
              title="Vista de impresión e imprimir"
              className="inline-flex min-h-[44px] min-w-[40px] sm:min-w-[44px] lg:px-2.5 items-center justify-center gap-1.5 rounded-xl text-slate-600 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Printer className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline text-xs font-medium">Imprimir</span>
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
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:px-3.5 ${
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
      )}

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
      <div className="wps-print-scroll flex-1 overflow-y-auto px-3 py-4 pb-32 sm:px-6 sm:py-8">
        <div
          className={`wps-print-sheet mx-auto transition-all ${
            layoutMode === 'page' || printViewMode ? 'max-w-[794px]' : 'max-w-[680px]'
          }`}
        >
          {/* Paper Sheet */}
          <div
            ref={paperRef}
            style={{
              fontFamily: fontStack,
              fontSize: printViewMode ? '11pt' : `${(16 * zoomPercent) / 100}px`,
              lineHeight: printViewMode ? '1.6' : lineSpacing,
            }}
            className={`wps-print-paper relative min-h-[68vh] rounded-2xl border p-5 shadow-sm sm:p-10 ${
              eyeCareMode && !printViewMode
                ? 'border-[#E6D8B8] bg-[#FBF5E6] text-[#3B2F21]'
                : 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
            }`}
          >
            {/* Non-destructive Spellcheck Wavy Underline Layer */}
            {spellCheckEnabled && !printViewMode && underlineRects.length > 0 && (
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
              contentEditable={isEditing && !printViewMode}
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

      {!printViewMode && (
        <WpsWordEditingBar
          drawerOpen={drawerOpen}
          onDrawerOpenChange={setDrawerOpen}
          drawerTab={drawerTab}
          onDrawerTabChange={setDrawerTab}
          activeFormats={activeFormats}
          onRunCommand={runFormatCommand}
          onInsertHtml={insertHtmlAtCursor}
          spellCheckEnabled={spellCheckEnabled}
          onToggleSpellCheck={() => setSpellCheckEnabled((v) => !v)}
          spellErrorCount={spellErrors.length}
          firstSpellErrorWord={spellErrors[0]?.word}
          onJumpToNextSpellError={handleJumpToNextSpellError}
          comments={doc.comments}
          onAddComment={handleAddComment}
          onToggleCommentResolved={toggleCommentResolved}
          onDeleteComment={deleteComment}
          viewTabContent={
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
          }
          exportSection={
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
                  onClick={handleEnterPrintView}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Printer className="h-4 w-4 text-[#EA3D2F]" />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}
