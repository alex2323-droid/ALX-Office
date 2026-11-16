import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Eraser,
  Eye,
  FilePlus2,
  FileText,
  Grid,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Loader2,
  Minus,
  Moon,
  MousePointer,
  PanelLeft,
  Pencil,
  PenTool,
  Printer,
  Redo2,
  RotateCw,
  Save,
  Search,
  Sparkles,
  SpellCheck,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { WpsComment, WpsDocument } from '../data/wpsDocuments';
import { useDocumentHistory } from '../hooks/useDocumentHistory';
import {
  hideSoftKeyboard,
  isRangeInsideElement,
  prepareSelectionForBlockInsert,
  runCommandWithoutKeyboardPopup,
  syncCheckboxAttribute,
} from '../lib/editorDom';
import PdfThumbnailSidebar from './PdfThumbnailSidebar';
import {
  applyPdfEdits,
  buildPdfBytesFromPageHtmls,
  deletePdfPage,
  extractStructuredHtmlPerPage,
  insertBlankPdfPage,
  movePdfPage,
  PdfAnnotation,
  PdfDrawAnnotation,
  PdfImageAnnotation,
  PdfRectAnnotation,
  PdfTextAnnotation,
  rotatePdfPage,
} from '../lib/pdfEditor';
import { buildSamplePdfBytes } from '../lib/samplePdfGenerator';
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
import { CANVA_COLORS, CanvaColorSwatchRow } from './CanvaControls';
import { base64ToUint8, uint8ToBase64 } from '../lib/wpsFileParser';
import AiEditAssistantModal from './AiEditAssistantModal';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfHistorySnapshot {
  pdfBase64?: string;
  pageHtmls: Record<number, string>;
  textDirty: boolean;
  draftAnnotations: PdfAnnotation[];
  title: string;
}

function arePageHtmlMapsEqual(
  a: Record<number, string>,
  b: Record<number, string>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    const numKey = Number(k);
    if (a[numKey] !== b[numKey]) return false;
  }
  return true;
}

interface WpsPdfViewerProps {
  document: WpsDocument;
  syncStatus?: 'saving' | 'saved';
  onBack: () => void;
  onUpdateDocument: (patch: Partial<WpsDocument>) => void;
}

interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

type PdfTool =
  | 'select'
  | 'text'
  | 'draw'
  | 'highlight'
  | 'redact'
  | 'box'
  | 'circle'
  | 'arrow'
  | 'line';
type EditSubMode = 'text' | 'annotate';

const TEXT_COLORS = CANVA_COLORS.slice(0, 8);
const HIGHLIGHT_COLORS = ['#FACC15', '#4ADE80', '#38BDF8', '#F472B6', '#FB923C', '#C084FC'];

interface SpellUnderlineRect {
  id: string;
  left: number;
  top: number;
  width: number;
}

interface PdfEditablePageProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  nightFilter: boolean;
  sepiaFilter: boolean;
  editMode: boolean;
  editSubMode: EditSubMode;
  pageHtml: string;
  spellCheckEnabled: boolean;
  customDict: Set<string>;
  ignoredSpellWords: Set<string>;
  onPageHtmlChange: (pageNumber: number, html: string, immediate?: boolean) => void;
  onRegisterEditorElement: (pageNumber: number, el: HTMLDivElement | null) => void;
  onEditorFocusOrSelect: (pageNumber: number, el: HTMLDivElement) => void;
  onSpellErrorsChange: (pageNumber: number, matches: SpellErrorMatch[]) => void;
  onOpenSpellMenu: (menu: SpellContextMenuState, pageNumber: number, targetEl: HTMLDivElement) => void;
  activeTool: PdfTool;
  activeColor: string;
  activeFontSize: number;
  activeBold: boolean;
  activeWhiteBg: boolean;
  annotations: PdfAnnotation[];
  selectedId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onAddAnnotation: (ann: PdfAnnotation) => void;
  onUpdateAnnotation: (id: string, patch: Partial<PdfAnnotation>) => void;
}

function PdfEditablePage({
  pdfDoc,
  pageNumber,
  scale,
  nightFilter,
  sepiaFilter,
  editMode,
  editSubMode,
  pageHtml,
  spellCheckEnabled,
  customDict,
  ignoredSpellWords,
  onPageHtmlChange,
  onRegisterEditorElement,
  onEditorFocusOrSelect,
  onSpellErrorsChange,
  onOpenSpellMenu,
  activeTool,
  activeColor,
  activeFontSize,
  activeBold,
  activeWhiteBg,
  annotations,
  selectedId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
}: PdfEditablePageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const spellScanTimerRef = useRef<number | null>(null);

  const [rendering, setRendering] = useState(true);
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: 840,
  });
  const [spellErrors, setSpellErrors] = useState<SpellErrorMatch[]>([]);
  const [underlineRects, setUnderlineRects] = useState<SpellUnderlineRect[]>([]);

  const [draftStroke, setDraftStroke] = useState<
    { xPct: number; yPct: number }[] | null
  >(null);
  const [draftRect, setDraftRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  const dragTextRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origXPct: number;
    origYPct: number;
    moved: boolean;
  } | null>(null);

  const boxTransformRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startClientX: number;
    startClientY: number;
    origXPct: number;
    origYPct: number;
    origWPct: number;
    origHPct: number;
  } | null>(null);

  const isTextEditActive = editMode && editSubMode === 'text';

  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    async function draw() {
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        const cssW = Math.max(120, Math.floor(viewport.width));
        const cssH = Math.max(120, Math.floor(viewport.height));
        setPageSize({ width: cssW, height: cssH });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
      } catch {
        // Ignore cancelled render tasks during rapid zoom/page switch
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    draw();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  const lastEmittedHtmlRef = useRef<string>(pageHtml);

  // Register and sync inline editor HTML reliably (handles undo/redo & external updates without clobbering active typing)
  useEffect(() => {
    const el = editorRef.current;
    onRegisterEditorElement(pageNumber, isTextEditActive ? el : null);
    if (!isTextEditActive || !el) return;

    if (pageHtml !== lastEmittedHtmlRef.current || el.innerHTML === '') {
      const targetHtml = pageHtml || '<p></p>';
      if (el.innerHTML !== targetHtml) {
        el.innerHTML = targetHtml;
      }
      lastEmittedHtmlRef.current = pageHtml;
    } else if (window.document.activeElement !== el) {
      const targetHtml = pageHtml || '<p></p>';
      if (el.innerHTML !== targetHtml) {
        el.innerHTML = targetHtml;
      }
    }
  }, [isTextEditActive, pageNumber, pageHtml, onRegisterEditorElement]);

  useEffect(() => {
    return () => {
      onRegisterEditorElement(pageNumber, null);
    };
  }, [pageNumber, onRegisterEditorElement]);

  const computeUnderlineRects = useCallback((matches: SpellErrorMatch[]) => {
    const paperEl = paperRef.current;
    if (!paperEl || matches.length === 0) {
      setUnderlineRects([]);
      return;
    }
    const paperRect = paperEl.getBoundingClientRect();
    const rects: SpellUnderlineRect[] = [];

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      try {
        const clientRects = m.range.getClientRects();
        for (let rIdx = 0; rIdx < clientRects.length; rIdx++) {
          const r = clientRects[rIdx];
          if (r.width < 2 || r.height < 2) continue;
          rects.push({
            id: `${m.id}-${rIdx}`,
            left: r.left - paperRect.left,
            top: r.bottom - paperRect.top - 2,
            width: r.width,
          });
        }
      } catch {
        // Ignore stale text nodes
      }
    }

    setUnderlineRects(rects);
  }, []);

  const runSpellScan = useCallback(() => {
    if (!isTextEditActive || !spellCheckEnabled || !editorRef.current) {
      setSpellErrors([]);
      setUnderlineRects([]);
      onSpellErrorsChange(pageNumber, []);
      return;
    }
    const matches = scanElementSpelling(
      editorRef.current,
      ignoredSpellWords,
      customDict,
    );
    setSpellErrors(matches);
    onSpellErrorsChange(pageNumber, matches);
    computeUnderlineRects(matches);
  }, [
    isTextEditActive,
    spellCheckEnabled,
    customDict,
    ignoredSpellWords,
    computeUnderlineRects,
    onSpellErrorsChange,
    pageNumber,
  ]);

  const scheduleSpellScan = useCallback(() => {
    if (spellScanTimerRef.current !== null) {
      window.clearTimeout(spellScanTimerRef.current);
    }
    spellScanTimerRef.current = window.setTimeout(() => {
      spellScanTimerRef.current = null;
      runSpellScan();
    }, 240);
  }, [runSpellScan]);

  useEffect(() => {
    runSpellScan();
  }, [runSpellScan, pageHtml, scale]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || !isTextEditActive) return;
    const reposition = () => computeUnderlineRects(spellErrors);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(reposition)
        : null;
    observer?.observe(el);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [isTextEditActive, spellErrors, computeUnderlineRects]);

  useEffect(() => {
    return () => {
      if (spellScanTimerRef.current !== null) {
        window.clearTimeout(spellScanTimerRef.current);
      }
    };
  }, []);

  const openSpellContextFromPoint = (
    clientX: number,
    clientY: number,
    requireExplicitContext: boolean,
  ): boolean => {
    if (!isTextEditActive || !spellCheckEnabled || !editorRef.current || spellErrors.length === 0) {
      return false;
    }
    if (!requireExplicitContext && window.innerWidth >= 768) return false;

    const match =
      spellErrors.find((m) => {
        const rects = m.range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (
            clientX >= r.left - 3 &&
            clientX <= r.right + 3 &&
            clientY >= r.top - 4 &&
            clientY <= r.bottom + 6
          ) {
            return true;
          }
        }
        return false;
      }) ?? null;

    if (!match) return false;

    const suggestions = getSpellingSuggestions(match.word);
    onOpenSpellMenu(
      {
        errorId: match.id,
        word: match.word,
        suggestions,
        x: clientX,
        y: clientY,
        range: match.range,
      },
      pageNumber,
      editorRef.current,
    );
    return true;
  };

  const getRelPoint = (clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return { xPct: 0, yPct: 0 };
    const rect = el.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const yPct = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { xPct, yPct };
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode || editSubMode !== 'annotate') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (activeTool === 'select') {
      onSelectAnnotation(null);
      return;
    }

    if (activeTool === 'text') {
      e.preventDefault();
      const pt = getRelPoint(e.clientX, e.clientY);
      const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newText: PdfTextAnnotation = {
        id,
        kind: 'text',
        pageNumber,
        xPct: Math.min(0.88, pt.xPct),
        yPct: Math.min(0.92, pt.yPct),
        text: 'Nuevo texto',
        fontSize: activeFontSize,
        color: activeColor,
        bold: activeBold,
        bgFill: activeWhiteBg ? '#FFFFFF' : undefined,
      };
      onAddAnnotation(newText);
      onSelectAnnotation(id);
      return;
    }

    if (activeTool === 'draw') {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = getRelPoint(e.clientX, e.clientY);
      setDraftStroke([pt]);
      return;
    }

    if (
      activeTool === 'highlight' ||
      activeTool === 'redact' ||
      activeTool === 'box' ||
      activeTool === 'circle' ||
      activeTool === 'arrow' ||
      activeTool === 'line'
    ) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = getRelPoint(e.clientX, e.clientY);
      setDraftRect({
        startX: pt.xPct,
        startY: pt.yPct,
        endX: pt.xPct,
        endY: pt.yPct,
      });
    }
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (boxTransformRef.current) {
      const tr = boxTransformRef.current;
      if (pageSize.width <= 0 || pageSize.height <= 0) return;
      const dxPct = (e.clientX - tr.startClientX) / pageSize.width;
      const dyPct = (e.clientY - tr.startClientY) / pageSize.height;
      if (tr.mode === 'move') {
        const nextX = Math.max(0, Math.min(1 - tr.origWPct, tr.origXPct + dxPct));
        const nextY = Math.max(0, Math.min(1 - tr.origHPct, tr.origYPct + dyPct));
        onUpdateAnnotation(tr.id, { xPct: nextX, yPct: nextY });
      } else {
        const nextW = Math.max(0.04, Math.min(1 - tr.origXPct, tr.origWPct + dxPct));
        const nextH = Math.max(0.025, Math.min(1 - tr.origYPct, tr.origHPct + dyPct));
        onUpdateAnnotation(tr.id, { wPct: nextW, hPct: nextH });
      }
      return;
    }

    if (dragTextRef.current) {
      const drag = dragTextRef.current;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      if (drag.moved && pageSize.width > 0 && pageSize.height > 0) {
        const nextX = Math.max(0, Math.min(0.92, drag.origXPct + dx / pageSize.width));
        const nextY = Math.max(0, Math.min(0.95, drag.origYPct + dy / pageSize.height));
        onUpdateAnnotation(drag.id, { xPct: nextX, yPct: nextY });
      }
      return;
    }

    if (draftStroke) {
      const pt = getRelPoint(e.clientX, e.clientY);
      setDraftStroke((prev) => {
        if (!prev || prev.length === 0) return [pt];
        const last = prev[prev.length - 1];
        if (Math.hypot(pt.xPct - last.xPct, pt.yPct - last.yPct) < 0.0025) {
          return prev;
        }
        return [...prev, pt];
      });
      return;
    }

    if (draftRect) {
      const pt = getRelPoint(e.clientX, e.clientY);
      setDraftRect((prev) =>
        prev ? { ...prev, endX: pt.xPct, endY: pt.yPct } : null,
      );
    }
  };

  const handleOverlayPointerUp = () => {
    if (boxTransformRef.current) {
      boxTransformRef.current = null;
      return;
    }

    if (dragTextRef.current) {
      dragTextRef.current = null;
      return;
    }

    if (draftStroke) {
      if (draftStroke.length >= 2) {
        const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const drawAnn: PdfDrawAnnotation = {
          id,
          kind: 'draw',
          pageNumber,
          points: draftStroke,
          color: activeColor,
          strokeWidth: 2.2,
          opacity: 1,
          zIndex: annotations.length + 1,
        };
        onAddAnnotation(drawAnn);
        onSelectAnnotation(id);
      }
      setDraftStroke(null);
      return;
    }

    if (draftRect) {
      const xPct = Math.min(draftRect.startX, draftRect.endX);
      const yPct = Math.min(draftRect.startY, draftRect.endY);
      const wPct = Math.abs(draftRect.endX - draftRect.startX);
      const hPctRaw = Math.abs(draftRect.endY - draftRect.startY);
      const isLineLike = activeTool === 'arrow' || activeTool === 'line';
      const hPct = isLineLike ? Math.max(0.035, hPctRaw) : hPctRaw;
      const minW = 0.015;
      const minH = isLineLike ? 0.001 : 0.008;
      if (wPct >= minW && hPctRaw >= minH) {
        const kind: PdfRectAnnotation['kind'] =
          activeTool === 'highlight' ||
          activeTool === 'redact' ||
          activeTool === 'circle' ||
          activeTool === 'arrow' ||
          activeTool === 'line'
            ? activeTool
            : 'box';
        const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const rectAnn: PdfRectAnnotation = {
          id,
          kind,
          pageNumber,
          xPct,
          yPct,
          wPct,
          hPct,
          color: kind === 'redact' ? '#FFFFFF' : activeColor,
          strokeWidth: 2,
          opacity: 1,
          zIndex: annotations.length + 1,
        };
        onAddAnnotation(rectAnn);
        onSelectAnnotation(id);
      }
      setDraftRect(null);
    }
  };

  const filterStyle = nightFilter
    ? 'invert(0.9) hue-rotate(180deg)'
    : sepiaFilter
      ? 'sepia(0.28) brightness(0.97)'
      : 'none';

  const pageAnns = annotations
    .filter((a) => a.pageNumber === pageNumber)
    .slice()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const svgAnns = pageAnns.filter(
    (a): a is PdfDrawAnnotation | PdfRectAnnotation =>
      a.kind !== 'text' && a.kind !== 'image',
  );
  const imageAnns = pageAnns.filter(
    (a): a is PdfImageAnnotation => a.kind === 'image',
  );
  const textAnns = pageAnns.filter(
    (a): a is PdfTextAnnotation => a.kind === 'text',
  );

  const isAnnotating = editMode && editSubMode === 'annotate';
  const cursorClass = !isAnnotating
    ? 'cursor-default'
    : activeTool === 'text'
      ? 'cursor-text'
      : activeTool === 'select'
        ? 'cursor-default'
        : 'cursor-crosshair';

  const marginPad = Math.max(18, Math.round(48 * scale));

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 print:rounded-none print:border-0 print:shadow-none"
      style={{
        width: pageSize.width,
        minHeight: pageSize.height,
        height: isTextEditActive ? 'auto' : pageSize.height,
      }}
    >
      {/* Underlying rendered PDF canvas (hidden cleanly under inline Word paper while editing text) */}
      <canvas
        ref={canvasRef}
        style={{ filter: filterStyle }}
        className={isTextEditActive ? 'hidden' : 'block'}
      />

      {/* In-Place Word-Style Page Text Editor right inside the PDF page frame */}
      {isTextEditActive && (
        <div
          ref={paperRef}
          style={{
            filter: filterStyle,
            minHeight: pageSize.height,
            padding: `${marginPad}px ${marginPad}px`,
            fontSize: `${Math.max(11, 13.8 * scale)}px`,
            lineHeight: 1.56,
          }}
          className="relative flex flex-col justify-between bg-white text-slate-900"
        >
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
            contentEditable
            spellCheck={false}
            suppressContentEditableWarning
            onFocus={() => {
              if (editorRef.current) {
                onEditorFocusOrSelect(pageNumber, editorRef.current);
              }
            }}
            onInput={() => {
              if (!editorRef.current) return;
              editorRef.current
                .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
                .forEach(syncCheckboxAttribute);
              const nextHtml = editorRef.current.innerHTML;
              lastEmittedHtmlRef.current = nextHtml;
              onPageHtmlChange(pageNumber, nextHtml, false);
              onEditorFocusOrSelect(pageNumber, editorRef.current);
              scheduleSpellScan();
            }}
            onKeyUp={() => {
              if (editorRef.current) {
                onEditorFocusOrSelect(pageNumber, editorRef.current);
              }
            }}
            onMouseUp={() => {
              if (editorRef.current) {
                onEditorFocusOrSelect(pageNumber, editorRef.current);
              }
            }}
            onTouchEnd={() => {
              if (editorRef.current) {
                onEditorFocusOrSelect(pageNumber, editorRef.current);
              }
            }}
            onContextMenu={(e) => {
              if (openSpellContextFromPoint(e.clientX, e.clientY, true)) {
                e.preventDefault();
              }
            }}
            onClick={(e) => {
              const target = e.target;
              if (target instanceof HTMLInputElement && target.type === 'checkbox') {
                syncCheckboxAttribute(target);
                hideSoftKeyboard();
                if (editorRef.current) {
                  const nextHtml = editorRef.current.innerHTML;
                  lastEmittedHtmlRef.current = nextHtml;
                  onPageHtmlChange(pageNumber, nextHtml, true);
                }
                return;
              }
              if (openSpellContextFromPoint(e.clientX, e.clientY, false)) {
                e.preventDefault();
                hideSoftKeyboard();
              }
            }}
            style={{ minHeight: Math.max(160, pageSize.height - marginPad * 2 - 28) }}
            className="wps-doc-canvas relative z-[1] min-w-0 outline-none"
          />

          <div className="mt-4 select-none border-t border-slate-100 pt-2 font-mono text-[10px] text-slate-400">
            Página {pageNumber} · Edición directa estilo Word
          </div>
        </div>
      )}

      {/* Interactive Canvas Annotation Overlay (signatures, highlights, whiteouts, floating text) */}
      {!isTextEditActive && (
        <div
          ref={overlayRef}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerCancel={handleOverlayPointerUp}
          style={{
            touchAction:
              isAnnotating && activeTool !== 'select' ? 'none' : 'pan-x pan-y',
          }}
          className={`absolute inset-0 select-none ${cursorClass} ${
            isAnnotating ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
          >
            {svgAnns.map((ann) => {
              const isSelected = selectedId === ann.id;
              if (ann.kind === 'draw') {
                const d = ann.points
                  .map(
                    (pt, idx) =>
                      `${idx === 0 ? 'M' : 'L'} ${(pt.xPct * pageSize.width).toFixed(1)} ${(pt.yPct * pageSize.height).toFixed(1)}`,
                  )
                  .join(' ');
                return (
                  <g
                    key={ann.id}
                    onPointerDown={(e) => {
                      if (!isAnnotating || activeTool !== 'select') return;
                      e.stopPropagation();
                      onSelectAnnotation(ann.id);
                    }}
                    className={isAnnotating && activeTool === 'select' ? 'cursor-pointer' : ''}
                  >
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={ann.color}
                      strokeWidth={ann.strokeWidth * scale}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.95}
                    />
                    {isSelected && (
                      <path
                        d={d}
                        fill="none"
                        stroke="#EA3D2F"
                        strokeWidth={ann.strokeWidth * scale + 3}
                        strokeDasharray="4 3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.55}
                      />
                    )}
                  </g>
                );
              }

              const rx = ann.xPct * pageSize.width;
              const ry = ann.yPct * pageSize.height;
              const rw = ann.wPct * pageSize.width;
              const rh = ann.hPct * pageSize.height;
              const annOpacity = ann.opacity ?? 1;
              const strokeW = (ann.strokeWidth ?? 2) * scale;
              const midY = ry + rh / 2;

              return (
                <g
                  key={ann.id}
                  opacity={annOpacity}
                  onPointerDown={(e) => {
                    if (!isAnnotating || activeTool !== 'select') return;
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                    boxTransformRef.current = {
                      id: ann.id,
                      mode: 'move',
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origXPct: ann.xPct,
                      origYPct: ann.yPct,
                      origWPct: ann.wPct,
                      origHPct: ann.hPct,
                    };
                  }}
                  className={isAnnotating && activeTool === 'select' ? 'cursor-move' : ''}
                >
                  {ann.kind === 'highlight' && (
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      fill={ann.color}
                      fillOpacity={0.34}
                    />
                  )}
                  {ann.kind === 'redact' && (
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      fill={ann.color || '#FFFFFF'}
                      stroke={isAnnotating ? '#cbd5e1' : 'none'}
                      strokeWidth={isAnnotating ? 1 : 0}
                      strokeDasharray={isAnnotating ? '3 2' : undefined}
                    />
                  )}
                  {ann.kind === 'box' && (
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      fill={
                        ann.fillColor && ann.fillColor !== 'transparent'
                          ? ann.fillColor
                          : 'transparent'
                      }
                      stroke={ann.color}
                      strokeWidth={strokeW}
                    />
                  )}
                  {ann.kind === 'circle' && (
                    <ellipse
                      cx={rx + rw / 2}
                      cy={ry + rh / 2}
                      rx={Math.max(2, rw / 2)}
                      ry={Math.max(2, rh / 2)}
                      fill={
                        ann.fillColor && ann.fillColor !== 'transparent'
                          ? ann.fillColor
                          : 'transparent'
                      }
                      stroke={ann.color}
                      strokeWidth={strokeW}
                    />
                  )}
                  {(ann.kind === 'line' || ann.kind === 'arrow') && (
                    <>
                      <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={Math.max(12, rh)}
                        fill="transparent"
                      />
                      <line
                        x1={rx}
                        y1={midY}
                        x2={rx + rw}
                        y2={midY}
                        stroke={ann.color}
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                      />
                      {ann.kind === 'arrow' && (
                        <polyline
                          points={`${rx + rw - Math.max(8, strokeW * 4)},${midY - Math.max(5, strokeW * 2.2)} ${rx + rw},${midY} ${rx + rw - Math.max(8, strokeW * 4)},${midY + Math.max(5, strokeW * 2.2)}`}
                          fill="none"
                          stroke={ann.color}
                          strokeWidth={strokeW}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </>
                  )}
                  {isSelected && (
                    <>
                      <rect
                        x={rx - 2}
                        y={ry - 2}
                        width={rw + 4}
                        height={rh + 4}
                        fill="none"
                        stroke="#EA3D2F"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                      />
                      {isAnnotating && activeTool === 'select' && (
                        <rect
                          x={rx + rw - 6}
                          y={ry + rh - 6}
                          width={14}
                          height={14}
                          rx={3}
                          fill="#FFFFFF"
                          stroke="#EA3D2F"
                          strokeWidth={2}
                          className="cursor-nwse-resize"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            boxTransformRef.current = {
                              id: ann.id,
                              mode: 'resize',
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              origXPct: ann.xPct,
                              origYPct: ann.yPct,
                              origWPct: ann.wPct,
                              origHPct: ann.hPct,
                            };
                          }}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}

            {draftStroke && draftStroke.length >= 2 && (
              <path
                d={draftStroke
                  .map(
                    (pt, idx) =>
                      `${idx === 0 ? 'M' : 'L'} ${(pt.xPct * pageSize.width).toFixed(1)} ${(pt.yPct * pageSize.height).toFixed(1)}`,
                  )
                  .join(' ')}
                fill="none"
                stroke={activeColor}
                strokeWidth={2.2 * scale}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
            )}

            {draftRect && (
              <>
                {activeTool === 'circle' ? (
                  <ellipse
                    cx={
                      ((draftRect.startX + draftRect.endX) / 2) * pageSize.width
                    }
                    cy={
                      ((draftRect.startY + draftRect.endY) / 2) * pageSize.height
                    }
                    rx={
                      (Math.abs(draftRect.endX - draftRect.startX) / 2) *
                      pageSize.width
                    }
                    ry={
                      (Math.abs(draftRect.endY - draftRect.startY) / 2) *
                      pageSize.height
                    }
                    fill="none"
                    stroke={activeColor}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                ) : activeTool === 'line' || activeTool === 'arrow' ? (
                  <line
                    x1={Math.min(draftRect.startX, draftRect.endX) * pageSize.width}
                    y1={((draftRect.startY + draftRect.endY) / 2) * pageSize.height}
                    x2={Math.max(draftRect.startX, draftRect.endX) * pageSize.width}
                    y2={((draftRect.startY + draftRect.endY) / 2) * pageSize.height}
                    stroke={activeColor}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                ) : (
                  <rect
                    x={Math.min(draftRect.startX, draftRect.endX) * pageSize.width}
                    y={Math.min(draftRect.startY, draftRect.endY) * pageSize.height}
                    width={
                      Math.abs(draftRect.endX - draftRect.startX) * pageSize.width
                    }
                    height={
                      Math.abs(draftRect.endY - draftRect.startY) * pageSize.height
                    }
                    fill={
                      activeTool === 'redact'
                        ? '#FFFFFF'
                        : activeTool === 'highlight'
                          ? activeColor
                          : 'none'
                    }
                    fillOpacity={
                      activeTool === 'redact'
                        ? 0.92
                        : activeTool === 'highlight'
                          ? 0.34
                          : 0
                    }
                    stroke={activeTool === 'redact' ? '#94a3b8' : activeColor}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
              </>
            )}
          </svg>

          {imageAnns.map((ann) => {
            const isSelected = selectedId === ann.id;
            return (
              <div
                key={ann.id}
                onPointerDown={(e) => {
                  if (!isAnnotating) return;
                  e.stopPropagation();
                  onSelectAnnotation(ann.id);
                  if (activeTool === 'select') {
                    boxTransformRef.current = {
                      id: ann.id,
                      mode: 'move',
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origXPct: ann.xPct,
                      origYPct: ann.yPct,
                      origWPct: ann.wPct,
                      origHPct: ann.hPct,
                    };
                  }
                }}
                style={{
                  left: `${ann.xPct * 100}%`,
                  top: `${ann.yPct * 100}%`,
                  width: `${ann.wPct * 100}%`,
                  height: `${ann.hPct * 100}%`,
                  opacity: ann.opacity ?? 1,
                  zIndex: (ann.zIndex ?? 1) + 2,
                }}
                className={`absolute ${
                  isAnnotating && activeTool === 'select'
                    ? 'pointer-events-auto cursor-move'
                    : isAnnotating
                      ? 'pointer-events-auto'
                      : ''
                } ${
                  isSelected && isAnnotating
                    ? 'ring-2 ring-[#EA3D2F] ring-offset-1'
                    : ''
                }`}
              >
                <img
                  src={ann.src}
                  alt="Imagen PDF"
                  draggable={false}
                  className="h-full w-full object-fill pointer-events-none select-none"
                />
                {isSelected && isAnnotating && activeTool === 'select' && (
                  <button
                    type="button"
                    aria-label="Cambiar tamaño de imagen"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      boxTransformRef.current = {
                        id: ann.id,
                        mode: 'resize',
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        origXPct: ann.xPct,
                        origYPct: ann.yPct,
                        origWPct: ann.wPct,
                        origHPct: ann.hPct,
                      };
                    }}
                    className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-md border-2 border-[#EA3D2F] bg-white shadow"
                  />
                )}
              </div>
            );
          })}

          {textAnns.map((ann) => {
            const isSelected = selectedId === ann.id;
            const fontCss =
              ann.fontFamily === 'serif'
                ? 'Georgia, "Times New Roman", serif'
                : ann.fontFamily === 'mono'
                  ? '"Courier New", Courier, monospace'
                  : 'Helvetica, Arial, sans-serif';
            return (
              <div
                key={ann.id}
                onPointerDown={(e) => {
                  if (!isAnnotating) return;
                  e.stopPropagation();
                  onSelectAnnotation(ann.id);
                  if (activeTool === 'select' || activeTool === 'text') {
                    dragTextRef.current = {
                      id: ann.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origXPct: ann.xPct,
                      origYPct: ann.yPct,
                      moved: false,
                    };
                  }
                }}
                style={{
                  left: `${ann.xPct * 100}%`,
                  top: `${ann.yPct * 100}%`,
                  fontSize: `${Math.max(8, ann.fontSize * scale)}px`,
                  lineHeight: 1.25,
                  color: ann.color,
                  fontWeight: ann.bold ? 700 : 400,
                  fontStyle: ann.italic ? 'italic' : 'normal',
                  backgroundColor: ann.bgFill || 'transparent',
                  padding: ann.bgFill ? '2px 4px' : '1px 2px',
                  fontFamily: fontCss,
                  opacity: ann.opacity ?? 1,
                  transform: ann.rotationDeg
                    ? `rotate(${ann.rotationDeg}deg)`
                    : undefined,
                  transformOrigin: 'top left',
                  zIndex: (ann.zIndex ?? 1) + 4,
                }}
                className={`absolute max-w-[85%] whitespace-pre-wrap break-words rounded transition-shadow ${
                  isAnnotating ? 'pointer-events-auto cursor-move' : ''
                } ${
                  isSelected && isAnnotating
                    ? 'ring-2 ring-[#EA3D2F] ring-offset-1'
                    : isAnnotating
                      ? 'hover:ring-1 hover:ring-slate-400/70'
                      : ''
                }`}
              >
                {ann.text || ' '}
              </div>
            );
          })}
        </div>
      )}

      {rendering && !isTextEditActive && (
        <div className="no-print absolute inset-0 flex items-center justify-center bg-white/75 text-xs text-slate-500">
          Renderizando página {pageNumber}...
        </div>
      )}
    </div>
  );
}

export default function WpsPdfViewer({
  document: doc,
  syncStatus = 'saved',
  onBack,
  onUpdateDocument,
}: WpsPdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'continuous' | 'single'>('continuous');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [nightReading, setNightReading] = useState(false);
  const [sepiaReading, setSepiaReading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pagesText, setPagesText] = useState<ExtractedPdfPage[]>([]);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const suppressScrollSyncUntilRef = useRef(0);

  // In-place editing state (Word-style inline text OR canvas annotations)
  const [editMode, setEditMode] = useState(false);
  const [editSubMode, setEditSubMode] = useState<EditSubMode>('text');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<ToolDrawerTab>('inicio');
  const [pageHtmls, setPageHtmls] = useState<Record<number, string>>({});
  const pageHtmlMapRef = useRef<Record<number, string>>({});
  const [textDirty, setTextDirty] = useState(false);
  const textDirtyRef = useRef(false);
  const extractedForBytesRef = useRef<string | null>(null);

  const activeEditorPageRef = useRef<number>(1);
  const editorElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const savedRangeRef = useRef<Range | null>(null);

  // Inline Word formatting feedback
  const [inlineFormats, setInlineFormats] = useState<WordActiveFormats>({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    unorderedList: false,
    orderedList: false,
  });

  // Spellchecker state for in-place text mode
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [customDict, setCustomDict] = useState<Set<string>>(() =>
    loadCustomDictionary(),
  );
  const [ignoredSpellWords, setIgnoredSpellWords] = useState<Set<string>>(
    () => new Set(),
  );
  const [spellErrorsByPage, setSpellErrorsByPage] = useState<
    Record<number, SpellErrorMatch[]>
  >({});
  const [spellMenu, setSpellMenu] = useState<{
    menu: SpellContextMenuState;
    pageNumber: number;
    targetEl: HTMLDivElement;
  } | null>(null);

  // Canvas annotation tools
  const [activeTool, setActiveTool] = useState<PdfTool>('text');
  const [activeColor, setActiveColor] = useState('#0F172A');
  const [highlightColor, setHighlightColor] = useState('#FACC15');
  const [activeFontSize, setActiveFontSize] = useState(14);
  const [activeBold, setActiveBold] = useState(false);
  const [activeWhiteBg, setActiveWhiteBg] = useState(false);
  const [draftAnnotations, setDraftAnnotations] = useState<PdfAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isApplyingEdits, setIsApplyingEdits] = useState(false);
  const [isExtractingPages, setIsExtractingPages] = useState(false);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const pdfImageInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedDocStyle, setCopiedDocStyle] = useState<Record<string, string> | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiSnapshot, setAiSnapshot] = useState<{
    selectedText: string;
    fullText: string;
    currentHtml: string;
    pageNumber: number;
  }>({ selectedText: '', fullText: '', currentHtml: '', pageNumber: 1 });

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );

  const history = useDocumentHistory<PdfHistorySnapshot>(
    {
      pdfBase64: doc.pdfBase64,
      pageHtmls: {},
      textDirty: false,
      draftAnnotations: [],
      title: doc.title,
    },
    doc.id,
    {
      equals: (a, b) =>
        a.pdfBase64 === b.pdfBase64 &&
        a.textDirty === b.textDirty &&
        a.title === b.title &&
        a.draftAnnotations === b.draftAnnotations &&
        arePageHtmlMapsEqual(a.pageHtmls, b.pageHtmls),
    },
  );

  const pageHtmlsRef = useRef<Record<number, string>>({});
  const draftAnnotationsRef = useRef<PdfAnnotation[]>([]);
  pageHtmlsRef.current = pageHtmls;
  draftAnnotationsRef.current = draftAnnotations;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reset edit session state only when switching to another document
  useEffect(() => {
    setDraftAnnotations([]);
    setSelectedId(null);
    setCurrentPage(1);
    setEditNotice(null);
    setEditMode(false);
    setEditSubMode('text');
    setDrawerOpen(false);
    setPageHtmls({});
    pageHtmlMapRef.current = {};
    setTextDirty(false);
    textDirtyRef.current = false;
    extractedForBytesRef.current = null;
    setSpellErrorsByPage({});
    setSpellMenu(null);
  }, [doc.id]);

  // Keep history synced with external updates (e.g. cloud sync)
  useEffect(() => {
    history.syncExternal({
      pdfBase64: doc.pdfBase64,
      pageHtmls: pageHtmlsRef.current,
      textDirty: textDirtyRef.current,
      draftAnnotations: draftAnnotationsRef.current,
      title: doc.title,
    });
  }, [doc.pdfBase64, doc.title, history]);

  const rawBytes = useMemo(() => {
    if (doc.pdfBase64) {
      return base64ToUint8(doc.pdfBase64);
    }
    return buildSamplePdfBytes();
  }, [doc.pdfBase64]);

  useEffect(() => {
    let destroyed = false;
    const loadingTask = pdfjsLib.getDocument({ data: rawBytes.slice() });

    async function loadPdf() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const proxy = await loadingTask.promise;
        if (destroyed) {
          void loadingTask.destroy();
          return;
        }
        setPdfDoc(proxy);
        setNumPages(proxy.numPages);
        setCurrentPage((prev) => Math.max(1, Math.min(proxy.numPages, prev)));

        const extracted: ExtractedPdfPage[] = [];
        for (let p = 1; p <= proxy.numPages; p++) {
          const page = await proxy.getPage(p);
          const content = await page.getTextContent();
          const text = content.items
            .map((it) => ('str' in it ? it.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          extracted.push({ pageNumber: p, text });
        }
        if (!destroyed) setPagesText(extracted);
      } catch (err) {
        if (!destroyed) {
          setErrorMsg(
            err instanceof Error
              ? `No se pudo abrir el archivo PDF: ${err.message}`
              : 'No se pudo procesar el archivo PDF.',
          );
        }
      } finally {
        if (!destroyed) setLoading(false);
      }
    }

    loadPdf();
    return () => {
      destroyed = true;
      void loadingTask.destroy();
    };
  }, [rawBytes]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return pagesText.filter((p) => p.text.toLowerCase().includes(q));
  }, [pagesText, searchQuery]);

  const selectedAnnotation = useMemo(
    () => draftAnnotations.find((a) => a.id === selectedId) ?? null,
    [draftAnnotations, selectedId],
  );

  const draftCountByPage = useMemo(() => {
    const map = new Map<number, number>();
    for (const ann of draftAnnotations) {
      map.set(ann.pageNumber, (map.get(ann.pageNumber) ?? 0) + 1);
    }
    return map;
  }, [draftAnnotations]);

  // Keep active thumbnail synced as user scrolls in continuous mode
  useEffect(() => {
    if (viewMode !== 'continuous' || !pdfDoc || numPages <= 1) return;
    const rootEl = mainScrollRef.current;
    if (!rootEl || typeof IntersectionObserver === 'undefined') return;

    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressScrollSyncUntilRef.current) return;
        for (const entry of entries) {
          const pageAttr = Number(
            (entry.target as HTMLElement).dataset.pdfPage || 0,
          );
          if (pageAttr > 0) {
            ratios.set(pageAttr, entry.intersectionRatio);
          }
        }
        let bestPage = 0;
        let bestRatio = 0;
        ratios.forEach((ratio, page) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = page;
          }
        });
        if (bestPage > 0 && bestRatio > 0.15) {
          setCurrentPage(bestPage);
        }
      },
      {
        root: rootEl,
        threshold: [0.1, 0.25, 0.5, 0.75],
      },
    );

    const nodes = rootEl.querySelectorAll<HTMLElement>('[data-pdf-page]');
    nodes.forEach((n) => observer.observe(n));

    return () => observer.disconnect();
  }, [viewMode, pdfDoc, numPages, zoomPercent, editMode, editSubMode]);

  const ensurePerPageHtmlLoaded = useCallback(async () => {
    if (!pdfDoc) return;
    const revKey = `${doc.id}:${doc.pdfBase64?.length ?? 0}:${pdfDoc.numPages}`;
    if (extractedForBytesRef.current === revKey && Object.keys(pageHtmlMapRef.current).length > 0) {
      return;
    }
    setIsExtractingPages(true);
    try {
      const list = await extractStructuredHtmlPerPage(pdfDoc, doc.title);
      const map: Record<number, string> = {};
      list.forEach((html, idx) => {
        map[idx + 1] = html;
      });
      pageHtmlMapRef.current = map;
      setPageHtmls(map);
      extractedForBytesRef.current = revKey;
      history.syncExternal({
        pdfBase64: doc.pdfBase64,
        pageHtmls: map,
        textDirty: textDirtyRef.current,
        draftAnnotations: draftAnnotationsRef.current,
        title: doc.title,
      });
    } finally {
      setIsExtractingPages(false);
    }
  }, [pdfDoc, doc.id, doc.title, doc.pdfBase64, history]);

  const handleRegisterEditorElement = useCallback(
    (pageNumber: number, el: HTMLDivElement | null) => {
      editorElementsRef.current[pageNumber] = el;
    },
    [],
  );

  const syncInlineFormats = useCallback(() => {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const activeEl = editorElementsRef.current[activeEditorPageRef.current];
        if (activeEl?.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0);
          if (isRangeInsideElement(range, activeEl)) {
            savedRangeRef.current = range.cloneRange();
          }
        }
      }
      setInlineFormats({
        bold: window.document.queryCommandState('bold'),
        italic: window.document.queryCommandState('italic'),
        underline: window.document.queryCommandState('underline'),
        strikeThrough: window.document.queryCommandState('strikeThrough'),
        unorderedList: window.document.queryCommandState('insertUnorderedList'),
        orderedList: window.document.queryCommandState('insertOrderedList'),
      });
    } catch {
      // Ignore queryCommandState errors
    }
  }, []);

  const handleEditorFocusOrSelect = useCallback(
    (pageNumber: number, el: HTMLDivElement) => {
      activeEditorPageRef.current = pageNumber;
      editorElementsRef.current[pageNumber] = el;
      syncInlineFormats();
    },
    [syncInlineFormats],
  );

  const handlePageHtmlChange = useCallback(
    (pageNumber: number, html: string, immediate = false) => {
      const nextMap = { ...pageHtmlMapRef.current, [pageNumber]: html };
      pageHtmlMapRef.current = nextMap;
      setPageHtmls(nextMap);
      textDirtyRef.current = true;
      setTextDirty(true);
      setEditNotice(null);

      const snapshot: PdfHistorySnapshot = {
        pdfBase64: doc.pdfBase64,
        pageHtmls: nextMap,
        textDirty: true,
        draftAnnotations: draftAnnotationsRef.current,
        title: doc.title,
      };
      if (immediate) {
        history.pushImmediate(snapshot);
      } else {
        history.recordDebounced(snapshot);
      }
    },
    [doc.pdfBase64, doc.title, history],
  );

  const handleSpellErrorsChange = useCallback(
    (pageNumber: number, matches: SpellErrorMatch[]) => {
      setSpellErrorsByPage((prev) => {
        const existing = prev[pageNumber] || [];
        if (
          existing.length === matches.length &&
          existing.every((m, idx) => m.id === matches[idx]?.id)
        ) {
          return prev;
        }
        return { ...prev, [pageNumber]: matches };
      });
    },
    [],
  );

  const flattenedSpellErrors = useMemo(() => {
    const out: { pageNumber: number; match: SpellErrorMatch }[] = [];
    const pages = Object.keys(spellErrorsByPage)
      .map(Number)
      .sort((a, b) => a - b);
    for (const p of pages) {
      for (const match of spellErrorsByPage[p] || []) {
        out.push({ pageNumber: p, match });
      }
    }
    return out;
  }, [spellErrorsByPage]);

  const applyHistorySnapshot = useCallback(
    (snapshot: PdfHistorySnapshot | null) => {
      if (!snapshot) return;
      setSpellMenu(null);
      setSelectedId(null);
      savedRangeRef.current = null;

      pageHtmlMapRef.current = snapshot.pageHtmls;
      setPageHtmls(snapshot.pageHtmls);
      textDirtyRef.current = snapshot.textDirty;
      setTextDirty(snapshot.textDirty);
      setDraftAnnotations(snapshot.draftAnnotations);

      if (snapshot.pdfBase64 !== doc.pdfBase64 || snapshot.title !== doc.title) {
        extractedForBytesRef.current =
          Object.keys(snapshot.pageHtmls).length > 0
            ? `${doc.id}:${snapshot.pdfBase64?.length ?? 0}:${numPages}`
            : null;
        onUpdateDocument({
          pdfBase64: snapshot.pdfBase64,
          title: snapshot.title,
          updatedAt: 'Ahora mismo',
        });
      }

      // If snapshot has uncommitted draft edits while user was outside edit mode, reveal them immediately
      if (!editMode && (snapshot.textDirty || snapshot.draftAnnotations.length > 0)) {
        setEditMode(true);
        setEditSubMode(snapshot.draftAnnotations.length > 0 ? 'annotate' : 'text');
      }

      setEditNotice(null);
      syncInlineFormats();
    },
    [doc.id, doc.pdfBase64, doc.title, editMode, numPages, onUpdateDocument, syncInlineFormats],
  );

  const handleUndo = useCallback(() => {
    const prev = history.undo();
    applyHistorySnapshot(prev);
  }, [applyHistorySnapshot, history]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    applyHistorySnapshot(next);
  }, [applyHistorySnapshot, history]);

  const runWordCommand = (command: string, value?: string) => {
    if (command === 'undo') {
      handleUndo();
      return;
    }
    if (command === 'redo') {
      handleRedo();
      return;
    }
    if (editSubMode !== 'text') {
      void handleSwitchEditSubMode('text');
      return;
    }
    const targetPage = activeEditorPageRef.current || currentPage || 1;
    const el = editorElementsRef.current[targetPage];
    if (!el) return;

    const isBlockInsertion =
      command === 'insertHTML' &&
      typeof value === 'string' &&
      /<(table|hr|p|h[1-3]|ul|ol|blockquote)\b/i.test(value);

    runCommandWithoutKeyboardPopup(el, savedRangeRef.current, () => {
      if (isBlockInsertion) {
        prepareSelectionForBlockInsert(el, savedRangeRef.current);
      }
      window.document.execCommand(command, false, value);
    });
    handlePageHtmlChange(targetPage, el.innerHTML, true);
    syncInlineFormats();
  };

  const insertHtmlAtCursor = (html: string) => {
    runWordCommand('insertHTML', html);
  };

  const handleOpenAiAssistant = () => {
    const targetPage =
      editMode && editSubMode === 'text'
        ? activeEditorPageRef.current || currentPage || 1
        : currentPage || 1;

    let selectedText = '';
    const el = editorElementsRef.current[targetPage];
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      if (el && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        if (isRangeInsideElement(range, el)) {
          savedRangeRef.current = range.cloneRange();
        }
      }
      selectedText = sel.toString().trim();
    } else if (savedRangeRef.current && el && isRangeInsideElement(savedRangeRef.current, el)) {
      selectedText = savedRangeRef.current.toString().trim();
    }

    const domText = el?.innerText?.trim();
    const extractedPageText =
      pagesText.find((p) => p.pageNumber === targetPage)?.text || '';
    const fullText = domText || extractedPageText;
    const currentHtml = el?.innerHTML || pageHtmlMapRef.current[targetPage] || '';

    setAiSnapshot({
      selectedText,
      fullText,
      currentHtml,
      pageNumber: targetPage,
    });
    hideSoftKeyboard();
    setDrawerOpen(false);
    setSpellMenu(null);
    setAiModalOpen(true);
  };

  const handleApplyAiPdfTextResult = (
    html: string,
    placement: 'replace-selection' | 'insert' | 'replace-all',
  ) => {
    if (editSubMode !== 'text') {
      void handleSwitchEditSubMode('text');
    }
    const targetPage = aiSnapshot.pageNumber || activeEditorPageRef.current || currentPage || 1;
    const el = editorElementsRef.current[targetPage];

    if (placement === 'replace-all') {
      if (el) {
        el.innerHTML = html;
      }
      savedRangeRef.current = null;
      handlePageHtmlChange(targetPage, html, true);
      syncInlineFormats();
      return;
    }

    if (!el) {
      const prev = pageHtmlMapRef.current[targetPage] || '';
      handlePageHtmlChange(targetPage, `${prev}${html}`, true);
      return;
    }

    const isBlockInsertion = /<(table|hr|p|h[1-3]|ul|ol|blockquote|div)\b/i.test(html);
    runCommandWithoutKeyboardPopup(el, savedRangeRef.current, () => {
      if (placement === 'insert' && isBlockInsertion) {
        prepareSelectionForBlockInsert(el, savedRangeRef.current);
      } else if (placement === 'replace-selection' && savedRangeRef.current) {
        const sel = window.getSelection();
        if (sel && isRangeInsideElement(savedRangeRef.current, el)) {
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current);
        }
      }
      window.document.execCommand('insertHTML', false, html);
    });
    handlePageHtmlChange(targetPage, el.innerHTML, true);
    syncInlineFormats();
  };

  const handleApplyAiPdfNoteResult = (
    noteText: string,
    withWhiteBg: boolean,
    customColors?: { bgColor?: string; textColor?: string },
  ) => {
    const clean = noteText.trim();
    if (!clean) return;
    if (!editMode) {
      setEditMode(true);
    }
    if (editSubMode !== 'annotate') {
      setEditSubMode('annotate');
    }
    const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const noteAnn: PdfTextAnnotation = {
      id,
      kind: 'text',
      pageNumber: aiSnapshot.pageNumber || currentPage || 1,
      xPct: 0.08,
      yPct: 0.12,
      text: clean,
      fontSize: 12,
      color: customColors?.textColor || '#0F172A',
      bgFill: withWhiteBg ? customColors?.bgColor || '#FFFFFF' : undefined,
      opacity: 1,
      zIndex: draftAnnotationsRef.current.length + 1,
    };
    handleAddAnnotation(noteAnn);
    setActiveTool('select');
    setSelectedId(id);
  };

  const applyInlineStyle = (styles: Record<string, string>) => {
    if (editSubMode !== 'text') {
      void handleSwitchEditSubMode('text');
      return;
    }
    const targetPage = activeEditorPageRef.current || currentPage || 1;
    const el = editorElementsRef.current[targetPage];
    if (!el) return;

    runCommandWithoutKeyboardPopup(el, savedRangeRef.current, () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!isRangeInsideElement(range, el)) return;

      if (range.collapsed) {
        const anchorEl =
          range.startContainer instanceof HTMLElement
            ? range.startContainer
            : range.startContainer.parentElement;
        const targetEl = anchorEl?.closest(
          'span, p, h1, h2, h3, li, blockquote',
        ) as HTMLElement | null;
        if (targetEl && el.contains(targetEl) && targetEl !== el) {
          Object.entries(styles).forEach(([k, v]) => {
            targetEl.style.setProperty(
              k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
              v,
            );
          });
        }
        return;
      }

      const span = window.document.createElement('span');
      Object.entries(styles).forEach(([k, v]) => {
        span.style.setProperty(
          k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
          v,
        );
      });
      try {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        const nextRange = window.document.createRange();
        nextRange.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        savedRangeRef.current = nextRange.cloneRange();
      } catch {
        // Ignore non-contiguous range edge cases
      }
    });
    handlePageHtmlChange(targetPage, el.innerHTML, true);
    syncInlineFormats();
  };

  const handleCopyDocStyle = () => {
    const targetPage = activeEditorPageRef.current || currentPage || 1;
    const activeEl = editorElementsRef.current[targetPage];
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const el =
      anchor instanceof HTMLElement
        ? anchor
        : anchor?.parentElement ?? activeEl;
    if (!el) return;
    const computed = window.getComputedStyle(el);
    setCopiedDocStyle({
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      color: computed.color,
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      textDecoration: computed.textDecorationLine,
      letterSpacing: computed.letterSpacing,
      textTransform: computed.textTransform,
    });
  };

  const handleApplyCopiedDocStyle = () => {
    if (!copiedDocStyle) return;
    applyInlineStyle(copiedDocStyle);
  };

  const handleJumpToNextSpellError = () => {
    if (!spellCheckEnabled) {
      setSpellCheckEnabled(true);
      return;
    }
    if (flattenedSpellErrors.length === 0) return;
    const first = flattenedSpellErrors[0];
    const targetEl = editorElementsRef.current[first.pageNumber];
    if (!targetEl || !first.match.range.startContainer.isConnected) return;

    const parentEl = first.match.range.startContainer.parentElement;
    parentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rect = first.match.range.getBoundingClientRect();
    const suggestions = getSpellingSuggestions(first.match.word, 5);
    setSpellMenu({
      menu: {
        errorId: first.match.id,
        word: first.match.word,
        suggestions,
        x: rect.left,
        y: rect.bottom + 6,
        range: first.match.range,
      },
      pageNumber: first.pageNumber,
      targetEl,
    });
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

  const handleSelectSpellSuggestion = (
    menu: SpellContextMenuState,
    replacement: string,
  ) => {
    if (!spellMenu) return;
    const targetPage = spellMenu.pageNumber;
    const el = spellMenu.targetEl;
    setSpellMenu(null);
    if (!menu.range.startContainer.isConnected || !el) return;
    try {
      runCommandWithoutKeyboardPopup(el, menu.range, () => {
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
      });
      handlePageHtmlChange(targetPage, el.innerHTML, true);
    } catch {
      // Ignore stale range replacement
    }
  };

  const handleIgnoreSpellWord = (word: string) => {
    const clean = word.toLowerCase();
    setIgnoredSpellWords((prev) => {
      const next = new Set(prev);
      next.add(clean);
      return next;
    });
    setSpellMenu(null);
  };

  const handleAddWordToDictionary = (word: string) => {
    const clean = word.toLowerCase();
    setCustomDict((prev) => {
      const next = new Set(prev);
      next.add(clean);
      saveCustomDictionary(next);
      return next;
    });
    setSpellMenu(null);
  };

  const handleAddAnnotation = useCallback(
    (ann: PdfAnnotation) => {
      const next = [...draftAnnotationsRef.current, ann];
      setDraftAnnotations(next);
      setEditNotice(null);
      history.pushImmediate({
        pdfBase64: doc.pdfBase64,
        pageHtmls: pageHtmlMapRef.current,
        textDirty: textDirtyRef.current,
        draftAnnotations: next,
        title: doc.title,
      });
    },
    [doc.pdfBase64, doc.title, history],
  );

  const handleUpdateAnnotation = useCallback(
    (id: string, patch: Partial<PdfAnnotation>) => {
      const next = draftAnnotationsRef.current.map((ann) =>
        ann.id === id ? ({ ...ann, ...patch } as PdfAnnotation) : ann,
      );
      setDraftAnnotations(next);
      history.recordDebounced({
        pdfBase64: doc.pdfBase64,
        pageHtmls: pageHtmlMapRef.current,
        textDirty: textDirtyRef.current,
        draftAnnotations: next,
        title: doc.title,
      });
    },
    [doc.pdfBase64, doc.title, history],
  );

  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      const next = draftAnnotationsRef.current.filter((a) => a.id !== id);
      setDraftAnnotations(next);
      setSelectedId((prev) => (prev === id ? null : prev));
      history.pushImmediate({
        pdfBase64: doc.pdfBase64,
        pageHtmls: pageHtmlMapRef.current,
        textDirty: textDirtyRef.current,
        draftAnnotations: next,
        title: doc.title,
      });
    },
    [doc.pdfBase64, doc.title, history],
  );

  const handleDuplicateAnnotation = useCallback(
    (ann: PdfAnnotation) => {
      const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const cloned: PdfAnnotation =
        ann.kind === 'draw'
          ? {
              ...ann,
              id,
              points: ann.points.map((pt) => ({
                xPct: Math.min(0.98, pt.xPct + 0.03),
                yPct: Math.min(0.98, pt.yPct + 0.03),
              })),
              zIndex: (ann.zIndex ?? 1) + 1,
            }
          : {
              ...ann,
              id,
              xPct: Math.min(0.88, ann.xPct + 0.03),
              yPct: Math.min(0.9, ann.yPct + 0.03),
              zIndex: (ann.zIndex ?? 1) + 1,
            };
      handleAddAnnotation(cloned);
      setSelectedId(id);
    },
    [handleAddAnnotation],
  );

  const handleLayerAnnotation = useCallback(
    (ann: PdfAnnotation, dir: 'up' | 'down') => {
      const cur = ann.zIndex ?? 1;
      const nextZ = dir === 'up' ? cur + 1 : Math.max(0, cur - 1);
      handleUpdateAnnotation(ann.id, { zIndex: nextZ });
    },
    [handleUpdateAnnotation],
  );

  const handleUploadPdfImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
      });
      if (!rawDataUrl) return;

      // Normalize any format (e.g. WebP/GIF/AVIF) to PNG & measure aspect ratio
      const { pngUrl, aspect } = await new Promise<{
        pngUrl: string;
        aspect: number;
      }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          const scaleRatio = Math.min(
            1,
            maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1),
          );
          const w = Math.max(16, Math.round((img.naturalWidth || 240) * scaleRatio));
          const h = Math.max(16, Math.round((img.naturalHeight || 180) * scaleRatio));
          const isPngOrJpg = /^data:image\/(png|jpeg|jpg);base64,/i.test(rawDataUrl);
          if (isPngOrJpg && scaleRatio >= 1) {
            resolve({ pngUrl: rawDataUrl, aspect: w / h });
            return;
          }
          const canvas = window.document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve({ pngUrl: canvas.toDataURL('image/png'), aspect: w / h });
          } else {
            resolve({ pngUrl: rawDataUrl, aspect: 1.33 });
          }
        };
        img.onerror = () => resolve({ pngUrl: rawDataUrl, aspect: 1.33 });
        img.src = rawDataUrl;
      });

      const wPct = 0.34;
      const hPct = Math.max(0.08, Math.min(0.45, (wPct / Math.max(0.25, aspect)) * 0.72));
      const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const imgAnn: PdfImageAnnotation = {
        id,
        kind: 'image',
        pageNumber: currentPage || 1,
        xPct: 0.33,
        yPct: 0.32,
        wPct,
        hPct,
        src: pngUrl,
        opacity: 1,
        zIndex: draftAnnotationsRef.current.length + 1,
      };
      handleAddAnnotation(imgAnn);
      setActiveTool('select');
      setSelectedId(id);
    },
    [currentPage, handleAddAnnotation],
  );

  const commitAllEditsAndGetBytes = async (): Promise<Uint8Array> => {
    let workingBytes = rawBytes;
    const hasTextChanges = textDirtyRef.current;
    const hasDrawChanges = draftAnnotationsRef.current.length > 0;

    if (!hasTextChanges && !hasDrawChanges) {
      return workingBytes;
    }

    if (hasTextChanges) {
      const total = Math.max(1, numPages || Object.keys(pageHtmlMapRef.current).length);
      const orderedHtmls: string[] = [];
      for (let p = 1; p <= total; p++) {
        orderedHtmls.push(pageHtmlMapRef.current[p] ?? '<p></p>');
      }
      workingBytes = await buildPdfBytesFromPageHtmls(doc.title, orderedHtmls);
      textDirtyRef.current = false;
      setTextDirty(false);
    }

    if (hasDrawChanges) {
      workingBytes = await applyPdfEdits(workingBytes, draftAnnotationsRef.current);
      setDraftAnnotations([]);
      setSelectedId(null);
    }

    const base64 = uint8ToBase64(workingBytes);
    extractedForBytesRef.current = `${doc.id}:${base64.length}:${numPages}`;
    history.syncExternal({
      pdfBase64: base64,
      pageHtmls: pageHtmlMapRef.current,
      textDirty: false,
      draftAnnotations: [],
      title: doc.title,
    });
    onUpdateDocument({
      pdfBase64: base64,
      updatedAt: 'Ahora mismo',
    });

    return workingBytes;
  };

  const handleSavePdfEdits = async () => {
    if ((!textDirtyRef.current && draftAnnotations.length === 0) || isApplyingEdits) {
      return;
    }
    setIsApplyingEdits(true);
    setEditNotice(null);
    try {
      await commitAllEditsAndGetBytes();
      setEditNotice('Cambios guardados en el archivo PDF.');
    } catch (err) {
      setEditNotice(
        err instanceof Error
          ? `No se pudieron guardar los cambios: ${err.message}`
          : 'Error al guardar cambios en el PDF.',
      );
    } finally {
      setIsApplyingEdits(false);
    }
  };

  const handleToggleEditMode = async () => {
    if (isApplyingEdits || isExtractingPages) return;
    if (!editMode) {
      setEditNotice(null);
      await ensurePerPageHtmlLoaded();
      setEditMode(true);
      setSelectedId(null);
      return;
    }

    // Closing edit mode: persist any unsaved text/canvas changes into PDF bytes cleanly in place
    history.commitPending();
    hideSoftKeyboard();
    if (textDirtyRef.current || draftAnnotations.length > 0) {
      setIsApplyingEdits(true);
      try {
        await commitAllEditsAndGetBytes();
        setEditNotice('Documento PDF actualizado.');
      } catch (err) {
        setEditNotice(
          err instanceof Error
            ? `No se pudieron aplicar los cambios: ${err.message}`
            : 'Error al guardar cambios en el PDF.',
        );
      } finally {
        setIsApplyingEdits(false);
      }
    }
    setSpellMenu(null);
    setSelectedId(null);
    setDrawerOpen(false);
    setEditMode(false);
  };

  const handleSwitchEditSubMode = async (nextSubMode: EditSubMode) => {
    if (nextSubMode === editSubMode || isApplyingEdits) return;
    history.commitPending();
    hideSoftKeyboard();
    setSpellMenu(null);
    if (nextSubMode === 'annotate') {
      if (textDirtyRef.current) {
        setIsApplyingEdits(true);
        try {
          await commitAllEditsAndGetBytes();
        } finally {
          setIsApplyingEdits(false);
        }
      }
      setEditSubMode('annotate');
    } else {
      if (draftAnnotations.length > 0) {
        setIsApplyingEdits(true);
        try {
          await commitAllEditsAndGetBytes();
        } finally {
          setIsApplyingEdits(false);
        }
      }
      await ensurePerPageHtmlLoaded();
      setEditSubMode('text');
    }
  };

  const handlePageOperation = async (
    op: (bytes: Uint8Array) => Promise<Uint8Array>,
    noticeText: string,
  ) => {
    if (isApplyingEdits) return;
    history.commitPending();
    setIsApplyingEdits(true);
    setEditNotice(null);
    try {
      const baseBytes = await commitAllEditsAndGetBytes();
      const updated = await op(baseBytes);
      const nextBase64 = uint8ToBase64(updated);
      extractedForBytesRef.current = null;
      pageHtmlMapRef.current = {};
      setPageHtmls({});
      history.pushImmediate({
        pdfBase64: nextBase64,
        pageHtmls: {},
        textDirty: false,
        draftAnnotations: [],
        title: doc.title,
      });
      onUpdateDocument({
        pdfBase64: nextBase64,
        updatedAt: 'Ahora mismo',
      });
      setEditNotice(noticeText);
    } catch (err) {
      setEditNotice(
        err instanceof Error
          ? `Error al modificar páginas: ${err.message}`
          : 'No se pudo completar la operación de página.',
      );
    } finally {
      setIsApplyingEdits(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsApplyingEdits(true);
    try {
      const finalBytes = await commitAllEditsAndGetBytes();
      const bufferCopy = new Uint8Array(finalBytes).buffer;
      const blob = new Blob([bufferCopy], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${doc.title.replace(/[^\w\dáéíóúñÁÉÍÓÚÑ\-_ ]+/g, '').trim() || 'documento'}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      setIsApplyingEdits(false);
    }
  };

  const handleBackPress = async () => {
    if (textDirtyRef.current || draftAnnotations.length > 0) {
      try {
        await commitAllEditsAndGetBytes();
      } catch {
        // Proceed back gracefully
      }
    }
    onBack();
  };

  const jumpToPage = (pageNum: number) => {
    const bounded = Math.max(1, Math.min(numPages || 1, pageNum));
    suppressScrollSyncUntilRef.current = Date.now() + 550;
    setCurrentPage(bounded);
    if (viewMode === 'continuous') {
      const el = window.document.getElementById(`wps-pdf-page-${bounded}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setThumbsOpen(false);
    if (viewportWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const baseScaleFactor =
    viewportWidth < 640
      ? Math.min(0.62, Math.max(0.45, (viewportWidth - 28) / 612))
      : 1.05;
  const scale = (zoomPercent / 100) * baseScaleFactor;

  const toolColor = activeTool === 'highlight' ? highlightColor : activeColor;
  const paletteForTool =
    activeTool === 'highlight' ? HIGHLIGHT_COLORS : TEXT_COLORS;
  const hasPendingSaves = textDirty || draftAnnotations.length > 0;

  return (
    <div className="wps-print-root flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Compact Sticky Top Bar (52px) */}
      <header className="no-print sticky top-0 z-30 flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            onClick={() => void handleBackPress()}
            aria-label="Volver a documentos"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Ocultar miniaturas' : 'Mostrar miniaturas'}
            aria-pressed={sidebarOpen}
            title="Panel de miniaturas"
            className={`flex min-h-[44px] min-w-[40px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              sidebarOpen
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={doc.title}
              onChange={(e) =>
                onUpdateDocument({
                  title: e.target.value,
                  updatedAt: 'Ahora mismo',
                })
              }
              aria-label="Título del PDF"
              className="w-full min-w-[60px] truncate rounded-lg bg-transparent px-1.5 py-0.5 font-display text-sm font-semibold text-slate-900 focus:bg-slate-100 focus:outline-none dark:text-slate-100 dark:focus:bg-slate-800"
            />
            <div className="flex items-center gap-2 px-1.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span>
                PDF · {numPages} {numPages === 1 ? 'pág.' : 'págs.'}
              </span>
              <span
                role="status"
                aria-live="polite"
                className="hidden items-center gap-1 font-sans sm:inline-flex"
              >
                {syncStatus === 'saving' || isApplyingEdits ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span>Guardado</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {(editMode || history.canUndo || history.canRedo) && (
            <>
              <button
                type="button"
                disabled={!history.canUndo || isApplyingEdits}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleUndo}
                aria-label="Deshacer"
                title="Deshacer cambio"
                className="flex min-h-[44px] min-w-[38px] sm:min-w-[42px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!history.canRedo || isApplyingEdits}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleRedo}
                aria-label="Rehacer"
                title="Rehacer cambio"
                className="hidden min-h-[44px] min-w-[42px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-35 sm:flex dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </>
          )}

          {editMode && editSubMode === 'text' && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleJumpToNextSpellError}
              title={
                spellCheckEnabled
                  ? flattenedSpellErrors.length > 0
                    ? `${flattenedSpellErrors.length} error(es) ortográfico(s) — Clic para revisar`
                    : 'Sin errores ortográficos'
                  : 'Activar corrector ortográfico'
              }
              aria-label="Revisar ortografía"
              className={`inline-flex min-h-[40px] items-center gap-1 rounded-xl px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                !spellCheckEnabled
                  ? 'text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800'
                  : flattenedSpellErrors.length > 0
                    ? 'bg-red-50 text-[#EA3D2F] hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-950/80'
                    : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
              }`}
            >
              <SpellCheck className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline font-mono tabular-nums">
                {!spellCheckEnabled
                  ? 'Off'
                  : flattenedSpellErrors.length > 0
                    ? `${flattenedSpellErrors.length}`
                    : 'OK'}
              </span>
            </button>
          )}

          {hasPendingSaves && (
            <button
              type="button"
              disabled={isApplyingEdits}
              onClick={() => void handleSavePdfEdits()}
              aria-label="Guardar cambios en PDF"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Guardar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Buscar en PDF"
            className={`flex min-h-[44px] min-w-[38px] items-center justify-center rounded-xl transition-colors ${
              searchOpen
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setNightReading((v) => !v);
              setSepiaReading(false);
            }}
            aria-label="Modo lectura nocturna"
            className={`hidden min-h-[44px] min-w-[38px] items-center justify-center rounded-xl transition-colors lg:flex ${
              nightReading
                ? 'bg-slate-900 text-amber-300 dark:bg-slate-700'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Moon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Imprimir PDF"
            className="hidden min-h-[44px] min-w-[38px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 sm:flex dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleOpenAiAssistant}
            disabled={isApplyingEdits || isExtractingPages || (!pdfDoc && loading)}
            aria-label="Asistente IA para PDF"
            title="Asistente IA"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 text-xs font-semibold text-white shadow-2xs transition-opacity hover:opacity-95 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>IA</span>
          </button>

          <button
            type="button"
            disabled={isApplyingEdits || isExtractingPages || (!pdfDoc && loading)}
            onClick={() => void handleToggleEditMode()}
            aria-label={editMode ? 'Finalizar edición' : 'Editar PDF en esta vista'}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
              editMode
                ? 'bg-[#EA3D2F] text-white hover:bg-[#D63124]'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {isExtractingPages ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Abriendo...</span>
              </>
            ) : editMode ? (
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

          <button
            type="button"
            disabled={isApplyingEdits}
            onClick={() => void handleDownloadPdf()}
            aria-label="Descargar PDF"
            className="hidden min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-2.5 sm:inline-flex sm:px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Descargar PDF</span>
          </button>
        </div>
      </header>

      {/* Compact PDF Mode Strip (Texto Word vs Anotar + Paginación) */}
      {editMode && (
        <div className="no-print sticky top-[52px] z-20 border-b border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto whitespace-nowrap">
            {/* Sub-mode switcher: Texto (Word) vs Anotar (Canvas) */}
            <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => void handleSwitchEditSubMode('text')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  editSubMode === 'text'
                    ? 'bg-[#2B5CE6] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Texto</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSwitchEditSubMode('annotate')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  editSubMode === 'annotate'
                    ? 'bg-[#EA3D2F] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <PenTool className="h-3.5 w-3.5" />
                <span>Anotar</span>
              </button>
            </div>

            {editSubMode === 'annotate' ? (
              <>
                <div className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
                <input
                  ref={pdfImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleUploadPdfImage(e)}
                />
                {(
                  [
                    { id: 'select', label: 'Mover', Icon: MousePointer },
                    { id: 'text', label: 'Texto', Icon: Type },
                    { id: 'draw', label: 'Firma', Icon: PenTool },
                    { id: 'highlight', label: 'Resaltar', Icon: Highlighter },
                    { id: 'redact', label: 'Tapar', Icon: Eraser },
                    { id: 'box', label: 'Recuadro', Icon: Square },
                    { id: 'circle', label: 'Círculo', Icon: Circle },
                    { id: 'arrow', label: 'Flecha', Icon: ArrowRight },
                    { id: 'line', label: 'Línea', Icon: Minus },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = activeTool === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTool(id)}
                      className={`inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#EA3D2F] text-white'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{label}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => pdfImageInputRef.current?.click()}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-purple-600" />
                  <span>Imagen</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAiAssistant}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 text-xs font-semibold text-white hover:opacity-95"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>IA</span>
                </button>

                <div className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

                {activeTool !== 'redact' && activeTool !== 'select' && (
                  <div className="flex shrink-0 items-center gap-1.5 px-1">
                    {paletteForTool.map((swatch) => {
                      const selected = toolColor === swatch;
                      return (
                        <button
                          key={swatch}
                          type="button"
                          aria-label={`Color ${swatch}`}
                          onClick={() => {
                            if (activeTool === 'highlight') {
                              setHighlightColor(swatch);
                            } else {
                              setActiveColor(swatch);
                            }
                            if (selectedAnnotation) {
                              handleUpdateAnnotation(selectedAnnotation.id, {
                                color: swatch,
                              });
                            }
                          }}
                          style={{ backgroundColor: swatch }}
                          className={`h-6 w-6 shrink-0 rounded-full border transition-transform ${
                            selected
                              ? 'scale-110 border-[#EA3D2F] ring-2 ring-[#EA3D2F]/30'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        />
                      );
                    })}
                    <label
                      title="Color personalizado"
                      className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500 dark:border-slate-600"
                    >
                      <input
                        type="color"
                        value={toolColor}
                        onChange={(e) => {
                          const c = e.target.value;
                          if (activeTool === 'highlight') {
                            setHighlightColor(c);
                          } else {
                            setActiveColor(c);
                          }
                          if (selectedAnnotation) {
                            handleUpdateAnnotation(selectedAnnotation.id, { color: c });
                          }
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                )}

                {activeTool === 'text' && (
                  <button
                    type="button"
                    onClick={() => setActiveWhiteBg((v) => !v)}
                    className={`inline-flex min-h-[34px] shrink-0 items-center rounded-lg border px-2 text-[11px] font-medium ${
                      activeWhiteBg
                        ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    Fondo blanco
                  </button>
                )}

                <button
                  type="button"
                  disabled={!history.canUndo}
                  onClick={handleUndo}
                  aria-label="Deshacer último trazo"
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Deshacer</span>
                </button>
              </>
            ) : (
              <span className="hidden px-2 text-xs text-slate-500 sm:inline dark:text-slate-400">
                Usa la barra inferior y Herramientas (Inicio, Insertar, Ver, Revisar) igual que en Word.
              </span>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => jumpToPage(currentPage - 1)}
                aria-label="Página anterior"
                className="flex min-h-[34px] min-w-[32px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                {currentPage} / {numPages || 1}
              </span>
              <button
                type="button"
                disabled={currentPage >= numPages}
                onClick={() => jumpToPage(currentPage + 1)}
                aria-label="Página siguiente"
                className="flex min-h-[34px] min-w-[32px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setThumbsOpen(true)}
                className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Grid className="h-3.5 w-3.5" />
                <span>Páginas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search in PDF Bar */}
      {searchOpen && (
        <div className="no-print border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar texto dentro del PDF..."
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {searchMatches.length} pág.
            </span>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="Cerrar búsqueda"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {searchQuery.trim() && (
            <div className="mx-auto mt-2.5 flex max-w-3xl flex-wrap gap-2">
              {searchMatches.length === 0 ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Sin coincidencias en el texto extraído del PDF.
                </span>
              ) : (
                searchMatches.map((m) => (
                  <button
                    key={m.pageNumber}
                    type="button"
                    onClick={() => jumpToPage(m.pageNumber)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 hover:border-[#EA3D2F] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Ir a página {m.pageNumber}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Subtle feedback banner for PDF save/page operations */}
      {editNotice && (
        <div className="no-print border-b border-emerald-500/20 bg-emerald-50 px-4 py-2 text-center text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          <span>{editNotice}</span>
          <button
            type="button"
            onClick={() => setEditNotice(null)}
            className="ml-3 underline"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* Split Body: Thumbnail Sidebar + Main PDF Pages Viewport */}
      <div className="wps-print-body flex min-h-0 flex-1 overflow-hidden pb-[48px]">
        {pdfDoc && !errorMsg && (
          <PdfThumbnailSidebar
            pdfDoc={pdfDoc}
            numPages={numPages}
            currentPage={currentPage}
            pagesText={pagesText}
            draftCountByPage={draftCountByPage}
            nightFilter={nightReading}
            sepiaFilter={sepiaReading}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onSelectPage={jumpToPage}
            onOpenOrganizer={() => {
              if (viewportWidth < 1024) setSidebarOpen(false);
              setThumbsOpen(true);
            }}
          />
        )}

        <main
          ref={mainScrollRef}
          className="wps-print-scroll flex-1 overflow-auto px-3 py-5 pb-20 sm:px-6"
        >
          {loading && !pdfDoc ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Cargando documento PDF...
            </div>
          ) : errorMsg ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {errorMsg}
            </div>
          ) : pdfDoc ? (
            <div className="space-y-5 print:space-y-4">
              {editMode && editSubMode === 'annotate' && draftAnnotations.length === 0 && (
                <div className="no-print mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2 text-center text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                  {activeTool === 'text' &&
                    'Toca cualquier parte de la página para añadir texto flotante (activa "Fondo blanco" para tapar texto previo).'}
                  {activeTool === 'draw' &&
                    'Dibuja o firma directamente sobre la página con el dedo o ratón.'}
                  {activeTool === 'highlight' &&
                    'Arrastra sobre el documento para resaltar áreas importantes.'}
                  {activeTool === 'redact' &&
                    'Arrastra un recuadro blanco para tapar contenido previo del PDF.'}
                  {(activeTool === 'box' ||
                    activeTool === 'circle' ||
                    activeTool === 'arrow' ||
                    activeTool === 'line') &&
                    'Arrastra sobre la página para dibujar la forma. Usa "Mover" para escalar o reubicar.'}
                  {activeTool === 'select' &&
                    'Toca cualquier objeto para moverlo, escalarlo con la esquina o editar su estilo Canva.'}
                </div>
              )}

              {viewMode === 'single' ? (
                <div id={`wps-pdf-page-${currentPage}`} data-pdf-page={currentPage}>
                  <PdfEditablePage
                    pdfDoc={pdfDoc}
                    pageNumber={currentPage}
                    scale={scale}
                    nightFilter={nightReading}
                    sepiaFilter={sepiaReading}
                    editMode={editMode}
                    editSubMode={editSubMode}
                    pageHtml={pageHtmls[currentPage] ?? '<p></p>'}
                    spellCheckEnabled={spellCheckEnabled}
                    customDict={customDict}
                    ignoredSpellWords={ignoredSpellWords}
                    onPageHtmlChange={handlePageHtmlChange}
                    onRegisterEditorElement={handleRegisterEditorElement}
                    onEditorFocusOrSelect={handleEditorFocusOrSelect}
                    onSpellErrorsChange={handleSpellErrorsChange}
                    onOpenSpellMenu={(menu, pageNumber, targetEl) =>
                      setSpellMenu({ menu, pageNumber, targetEl })
                    }
                    activeTool={activeTool}
                    activeColor={toolColor}
                    activeFontSize={activeFontSize}
                    activeBold={activeBold}
                    activeWhiteBg={activeWhiteBg}
                    annotations={draftAnnotations}
                    selectedId={selectedId}
                    onSelectAnnotation={setSelectedId}
                    onAddAnnotation={handleAddAnnotation}
                    onUpdateAnnotation={handleUpdateAnnotation}
                  />
                </div>
              ) : (
                Array.from({ length: numPages }).map((_, idx) => {
                  const pageNum = idx + 1;
                  return (
                    <div
                      key={pageNum}
                      id={`wps-pdf-page-${pageNum}`}
                      data-pdf-page={pageNum}
                      className="space-y-1.5"
                    >
                      <div className="no-print text-center font-mono text-[11px] tabular-nums text-slate-400">
                        Página {pageNum} / {numPages}
                      </div>
                      <PdfEditablePage
                        pdfDoc={pdfDoc}
                        pageNumber={pageNum}
                        scale={scale}
                        nightFilter={nightReading}
                        sepiaFilter={sepiaReading}
                        editMode={editMode}
                        editSubMode={editSubMode}
                        pageHtml={pageHtmls[pageNum] ?? '<p></p>'}
                        spellCheckEnabled={spellCheckEnabled}
                        customDict={customDict}
                        ignoredSpellWords={ignoredSpellWords}
                        onPageHtmlChange={handlePageHtmlChange}
                        onRegisterEditorElement={handleRegisterEditorElement}
                        onEditorFocusOrSelect={handleEditorFocusOrSelect}
                        onSpellErrorsChange={handleSpellErrorsChange}
                        onOpenSpellMenu={(menu, pageNumber, targetEl) =>
                          setSpellMenu({ menu, pageNumber, targetEl })
                        }
                        activeTool={activeTool}
                        activeColor={toolColor}
                        activeFontSize={activeFontSize}
                        activeBold={activeBold}
                        activeWhiteBg={activeWhiteBg}
                        annotations={draftAnnotations}
                        selectedId={selectedId}
                        onSelectAnnotation={setSelectedId}
                        onAddAnnotation={handleAddAnnotation}
                        onUpdateAnnotation={handleUpdateAnnotation}
                      />
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </main>
      </div>

      {/* Contextual Spellcheck Menu for In-Place PDF Text Editing */}
      {spellMenu && (
        <SpellCheckMenu
          menu={spellMenu.menu}
          onSelectSuggestion={handleSelectSpellSuggestion}
          onIgnoreWord={handleIgnoreSpellWord}
          onAddToDictionary={handleAddWordToDictionary}
          onClose={() => setSpellMenu(null)}
        />
      )}

      {/* Contextual Floating Canva Inspector for Selected PDF Annotation */}
      {editMode && editSubMode === 'annotate' && selectedAnnotation && (
        <div className="no-print fixed bottom-[56px] left-1/2 z-30 max-h-[58vh] w-[calc(100%-1rem)] max-w-xl -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {selectedAnnotation.kind === 'text'
                ? `Texto Canva (Pág. ${selectedAnnotation.pageNumber})`
                : selectedAnnotation.kind === 'image'
                  ? `Imagen / Sello (Pág. ${selectedAnnotation.pageNumber})`
                  : selectedAnnotation.kind === 'circle'
                    ? 'Círculo / Óvalo'
                    : selectedAnnotation.kind === 'arrow'
                      ? 'Flecha'
                      : selectedAnnotation.kind === 'line'
                        ? 'Línea'
                        : selectedAnnotation.kind === 'draw'
                          ? 'Trazo / Firma'
                          : selectedAnnotation.kind === 'highlight'
                            ? 'Resaltado'
                            : selectedAnnotation.kind === 'redact'
                              ? 'Corrector blanco'
                              : 'Recuadro'}{' '}
              · Capa {selectedAnnotation.zIndex ?? 1}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleLayerAnnotation(selectedAnnotation, 'down')}
                title="Bajar capa"
                aria-label="Bajar capa"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleLayerAnnotation(selectedAnnotation, 'up')}
                title="Subir capa"
                aria-label="Subir capa"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDuplicateAnnotation(selectedAnnotation)}
                title="Duplicar elemento"
                aria-label="Duplicar elemento"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteAnnotation(selectedAnnotation.id)}
                aria-label="Eliminar elemento"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Cerrar inspector"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {selectedAnnotation.kind === 'text' && (
            <div className="space-y-2.5">
              <textarea
                rows={2}
                value={selectedAnnotation.text}
                onChange={(e) =>
                  handleUpdateAnnotation(selectedAnnotation.id, {
                    text: e.target.value,
                  })
                }
                placeholder="Escribe el texto para insertar en el PDF..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'sans', label: 'Sans' },
                    { id: 'serif', label: 'Serif' },
                    { id: 'mono', label: 'Mono' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      handleUpdateAnnotation(selectedAnnotation.id, {
                        fontFamily: f.id,
                      })
                    }
                    className={`h-8 rounded-lg border px-2 text-xs font-medium ${
                      (selectedAnnotation.fontFamily ?? 'sans') === f.id
                        ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-300'
                        : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const nextSize = Math.max(8, selectedAnnotation.fontSize - 2);
                    setActiveFontSize(nextSize);
                    handleUpdateAnnotation(selectedAnnotation.id, {
                      fontSize: nextSize,
                    });
                  }}
                  className="h-8 rounded-lg border border-slate-200 px-2 font-mono text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  A-
                </button>
                <span className="w-10 text-center font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                  {selectedAnnotation.fontSize}pt
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextSize = Math.min(54, selectedAnnotation.fontSize + 2);
                    setActiveFontSize(nextSize);
                    handleUpdateAnnotation(selectedAnnotation.id, {
                      fontSize: nextSize,
                    });
                  }}
                  className="h-8 rounded-lg border border-slate-200 px-2 font-mono text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  A+
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextBold = !selectedAnnotation.bold;
                    setActiveBold(nextBold);
                    handleUpdateAnnotation(selectedAnnotation.id, {
                      bold: nextBold,
                    });
                  }}
                  aria-label="Negrita"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                    selectedAnnotation.bold
                      ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-300'
                      : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Bold className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleUpdateAnnotation(selectedAnnotation.id, {
                      italic: !selectedAnnotation.italic,
                    })
                  }
                  aria-label="Cursiva"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                    selectedAnnotation.italic
                      ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-300'
                      : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Italic className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextBg = selectedAnnotation.bgFill ? undefined : '#FFFFFF';
                    setActiveWhiteBg(Boolean(nextBg));
                    handleUpdateAnnotation(selectedAnnotation.id, {
                      bgFill: nextBg,
                    });
                  }}
                  className={`h-8 rounded-lg border px-2 text-xs font-medium ${
                    selectedAnnotation.bgFill
                      ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/40 dark:text-red-300'
                      : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  Fondo blanco
                </button>
              </div>

              <CanvaColorSwatchRow
                label="Color de texto"
                value={selectedAnnotation.color}
                onChange={(color) => {
                  setActiveColor(color);
                  handleUpdateAnnotation(selectedAnnotation.id, { color });
                }}
              />

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                    <span>Opacidad</span>
                    <span className="font-mono tabular-nums">
                      {Math.round((selectedAnnotation.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={Math.round((selectedAnnotation.opacity ?? 1) * 100)}
                    onChange={(e) =>
                      handleUpdateAnnotation(selectedAnnotation.id, {
                        opacity: Number(e.target.value) / 100,
                      })
                    }
                    className="w-full accent-[#EA3D2F]"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                    <span>Rotación</span>
                    <span className="font-mono tabular-nums">
                      {selectedAnnotation.rotationDeg ?? 0}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={5}
                    value={selectedAnnotation.rotationDeg ?? 0}
                    onChange={(e) =>
                      handleUpdateAnnotation(selectedAnnotation.id, {
                        rotationDeg: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#EA3D2F]"
                  />
                </div>
              </div>
            </div>
          )}

          {selectedAnnotation.kind === 'image' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">Ancho:</span>
                {[0.2, 0.35, 0.55, 0.8].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => {
                      const ratio =
                        selectedAnnotation.hPct / Math.max(0.05, selectedAnnotation.wPct);
                      handleUpdateAnnotation(selectedAnnotation.id, {
                        wPct: w,
                        hPct: Math.min(0.85, Math.max(0.05, w * ratio)),
                      });
                    }}
                    className="h-8 rounded-lg border border-slate-200 px-2.5 font-mono text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {Math.round(w * 100)}%
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>Opacidad</span>
                  <span className="font-mono tabular-nums">
                    {Math.round((selectedAnnotation.opacity ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round((selectedAnnotation.opacity ?? 1) * 100)}
                  onChange={(e) =>
                    handleUpdateAnnotation(selectedAnnotation.id, {
                      opacity: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full accent-[#EA3D2F]"
                />
              </div>
            </div>
          )}

          {selectedAnnotation.kind !== 'text' && selectedAnnotation.kind !== 'image' && (
            <div className="space-y-2.5">
              {selectedAnnotation.kind !== 'redact' && (
                <CanvaColorSwatchRow
                  label={
                    selectedAnnotation.kind === 'box' ||
                    selectedAnnotation.kind === 'circle'
                      ? 'Color de borde / trazo'
                      : 'Color'
                  }
                  value={selectedAnnotation.color}
                  onChange={(color) => {
                    setActiveColor(color);
                    handleUpdateAnnotation(selectedAnnotation.id, { color });
                  }}
                />
              )}

              {(selectedAnnotation.kind === 'box' ||
                selectedAnnotation.kind === 'circle') && (
                <CanvaColorSwatchRow
                  label="Color de relleno"
                  value={selectedAnnotation.fillColor || 'transparent'}
                  allowTransparent
                  onChange={(fillColor) =>
                    handleUpdateAnnotation(selectedAnnotation.id, {
                      fillColor: fillColor === 'transparent' ? undefined : fillColor,
                    })
                  }
                />
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                {selectedAnnotation.kind !== 'highlight' &&
                  selectedAnnotation.kind !== 'redact' && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                        <span>Grosor</span>
                        <span className="font-mono tabular-nums">
                          {selectedAnnotation.strokeWidth ?? 2}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={0.5}
                        value={selectedAnnotation.strokeWidth ?? 2}
                        onChange={(e) =>
                          handleUpdateAnnotation(selectedAnnotation.id, {
                            strokeWidth: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#EA3D2F]"
                      />
                    </div>
                  )}

                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                    <span>Opacidad</span>
                    <span className="font-mono tabular-nums">
                      {Math.round((selectedAnnotation.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={Math.round((selectedAnnotation.opacity ?? 1) * 100)}
                    onChange={(e) =>
                      handleUpdateAnnotation(selectedAnnotation.id, {
                        opacity: Number(e.target.value) / 100,
                      })
                    }
                    className="w-full accent-[#EA3D2F]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Page Index & Page Organizer Sheet */}
      {thumbsOpen && (
        <div
          className="no-print fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setThumbsOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-t-3xl bg-white p-5 sm:rounded-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Organizar páginas ({numPages})
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Rota, reordena, inserta páginas en blanco o elimina páginas del PDF.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setThumbsOpen(false)}
                aria-label="Cerrar organizador de páginas"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {Array.from({ length: numPages }).map((_, idx) => {
                const pageNum = idx + 1;
                const pageInfo = pagesText.find((p) => p.pageNumber === pageNum);
                return (
                  <div
                    key={pageNum}
                    className="flex items-center justify-between gap-2 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => jumpToPage(pageNum)}
                      className={`flex min-w-0 flex-1 items-start gap-2.5 text-left transition-colors ${
                        currentPage === pageNum
                          ? 'text-[#EA3D2F] dark:text-red-400'
                          : 'text-slate-700 hover:text-slate-900 dark:text-slate-300'
                      }`}
                    >
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">
                        Pág. {pageNum}
                      </span>
                      <span className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                        {pageInfo?.text || 'Contenido gráfico / en blanco'}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        disabled={isApplyingEdits}
                        onClick={() =>
                          void handlePageOperation(
                            (b) => rotatePdfPage(b, idx, 90),
                            `Página ${pageNum} rotada 90°.`,
                          )
                        }
                        title="Rotar 90°"
                        aria-label={`Rotar página ${pageNum} 90 grados`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <RotateCw className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        disabled={isApplyingEdits || idx === 0}
                        onClick={() =>
                          void handlePageOperation(
                            (b) => movePdfPage(b, idx, idx - 1),
                            `Página ${pageNum} movida arriba.`,
                          )
                        }
                        title="Mover arriba"
                        aria-label={`Mover página ${pageNum} arriba`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        disabled={isApplyingEdits || idx >= numPages - 1}
                        onClick={() =>
                          void handlePageOperation(
                            (b) => movePdfPage(b, idx, idx + 1),
                            `Página ${pageNum} movida abajo.`,
                          )
                        }
                        title="Mover abajo"
                        aria-label={`Mover página ${pageNum} abajo`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        disabled={isApplyingEdits}
                        onClick={() =>
                          void handlePageOperation(
                            (b) => insertBlankPdfPage(b, idx),
                            `Página en blanco añadida después de pág. ${pageNum}.`,
                          )
                        }
                        title="Añadir página en blanco después"
                        aria-label={`Insertar página en blanco después de página ${pageNum}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <FilePlus2 className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        disabled={isApplyingEdits || numPages <= 1}
                        onClick={() =>
                          void handlePageOperation(
                            (b) => deletePdfPage(b, idx),
                            `Página ${pageNum} eliminada.`,
                          )
                        }
                        title="Eliminar página"
                        aria-label={`Eliminar página ${pageNum}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar: Exact Word Editing Bar in Edit Mode, or PDF Reader Bar */}
      {editMode ? (
        <WpsWordEditingBar
          drawerOpen={drawerOpen}
          onDrawerOpenChange={setDrawerOpen}
          drawerTab={drawerTab}
          onDrawerTabChange={setDrawerTab}
          activeFormats={inlineFormats}
          onRunCommand={runWordCommand}
          onInsertHtml={insertHtmlAtCursor}
          onApplyInlineStyle={applyInlineStyle}
          onCopyStyle={handleCopyDocStyle}
          hasCopiedStyle={Boolean(copiedDocStyle)}
          onApplyCopiedStyle={handleApplyCopiedDocStyle}
          spellCheckEnabled={spellCheckEnabled}
          onToggleSpellCheck={() => setSpellCheckEnabled((v) => !v)}
          spellErrorCount={flattenedSpellErrors.length}
          firstSpellErrorWord={flattenedSpellErrors[0]?.match.word}
          onJumpToNextSpellError={handleJumpToNextSpellError}
          onOpenAiAssistant={handleOpenAiAssistant}
          comments={doc.comments}
          onAddComment={handleAddComment}
          onToggleCommentResolved={toggleCommentResolved}
          onDeleteComment={deleteComment}
          extraInsertSection={
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  void handleSwitchEditSubMode('annotate');
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <PenTool className="h-4 w-4 text-[#EA3D2F]" />
                <span>Dibujar firma / anotar PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setThumbsOpen(true);
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Grid className="h-4 w-4 text-blue-600" />
                <span>Organizar o añadir páginas</span>
              </button>
            </div>
          }
          viewTabContent={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Desplazamiento de páginas
                </div>
                <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode('continuous')}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
                      viewMode === 'continuous'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>Continua</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('single')}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
                      viewMode === 'single'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>1 página</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Modo de edición PDF
                </div>
                <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => void handleSwitchEditSubMode('text')}
                    className={`min-h-[36px] rounded-lg px-3 text-xs font-medium ${
                      editSubMode === 'text'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Texto
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSwitchEditSubMode('annotate')}
                    className={`min-h-[36px] rounded-lg px-3 text-xs font-medium ${
                      editSubMode === 'annotate'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Anotar
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Zoom del documento ({zoomPercent}%)
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
                  Lectura y miniaturas
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSepiaReading((v) => !v);
                      setNightReading(false);
                    }}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                      sepiaReading
                        ? 'border-amber-600 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Sepia</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNightReading((v) => !v);
                      setSepiaReading(false);
                    }}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                      nightReading
                        ? 'border-amber-500 bg-slate-900 text-amber-300'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    <span>Noche</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen((v) => !v)}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                      sidebarOpen
                        ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <PanelLeft className="h-3.5 w-3.5" />
                    <span>Miniaturas</span>
                  </button>
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
                  disabled={isApplyingEdits}
                  onClick={() => void handleDownloadPdf()}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-4 w-4 text-[#EA3D2F]" />
                  <span>Descargar (.pdf)</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Printer className="h-4 w-4 text-blue-600" />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setThumbsOpen(true);
                  }}
                  className="col-span-2 flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Grid className="h-4 w-4 text-emerald-600" />
                  <span>Organizar páginas ({numPages})</span>
                </button>
              </div>
            </div>
          }
        />
      ) : (
        <footer className="no-print fixed bottom-0 left-0 right-0 z-30 flex h-[48px] items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setThumbsOpen(true)}
              aria-label="Organizar páginas"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Grid className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => jumpToPage(currentPage - 1)}
              aria-label="Página anterior"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-1 font-mono text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">
              {currentPage} / {numPages || 1}
            </span>

            <button
              type="button"
              disabled={currentPage >= numPages}
              onClick={() => jumpToPage(currentPage + 1)}
              aria-label="Página siguiente"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setViewMode((m) => (m === 'continuous' ? 'single' : 'continuous'))
              }
              aria-label="Cambiar modo de desplazamiento de páginas"
              className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 sm:px-2.5 sm:text-xs dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {viewMode === 'continuous' ? 'Continua' : '1 pág.'}
            </button>

            <button
              type="button"
              onClick={() => {
                setSepiaReading((v) => !v);
                setNightReading(false);
              }}
              aria-label="Filtro sepia"
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl ${
                sepiaReading
                  ? 'bg-amber-100 text-amber-800'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Eye className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setZoomPercent((z) => Math.max(75, z - 15))}
              aria-label="Alejar zoom"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => setZoomPercent((z) => Math.min(200, z + 15))}
              aria-label="Acercar zoom"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}

      <AiEditAssistantModal
        open={aiModalOpen}
        mode={editMode && editSubMode === 'text' ? 'document' : 'pdf-annotate'}
        documentTitle={doc.title}
        fileType={doc.format}
        selectedText={aiSnapshot.selectedText}
        fullText={aiSnapshot.fullText}
        currentHtml={aiSnapshot.currentHtml}
        pdfPageNumber={aiSnapshot.pageNumber}
        pdfTotalPages={Math.max(1, numPages)}
        onClose={() => setAiModalOpen(false)}
        onApplyDocumentResult={handleApplyAiPdfTextResult}
        onApplyPdfNoteResult={handleApplyAiPdfNoteResult}
      />
    </div>
  );
}
