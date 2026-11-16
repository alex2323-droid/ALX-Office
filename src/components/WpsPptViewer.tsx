import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Bold,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  Italic,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Monitor,
  Move,
  Paintbrush,
  Palette,
  Pencil,
  Plus,
  Printer,
  Redo2,
  Search,
  Shapes,
  Sliders,
  Sparkles,
  SpellCheck,
  StickyNote,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  WpsChartKind,
  WpsComment,
  WpsDocument,
  WpsImageFilterPreset,
  WpsShadowStyle,
  WpsShapeKind,
  WpsSlide,
  WpsSlideElement,
  WpsSlideParagraph,
  WpsTextEffect,
} from '../data/wpsDocuments';
import { useDocumentHistory } from '../hooks/useDocumentHistory';
import {
  hideSoftKeyboard,
  isRangeInsideElement,
  prepareSelectionForBlockInsert,
  runCommandWithoutKeyboardPopup,
  syncCheckboxAttribute,
} from '../lib/editorDom';
import { exportDocumentToPptxBytes } from '../lib/pptxExporter';
import {
  SpellErrorMatch,
  getSpellingSuggestions,
  loadCustomDictionary,
  saveCustomDictionary,
  scanElementSpelling,
} from '../lib/spellChecker';
import {
  CANVA_COLORS,
  CANVA_FONTS,
  CANVA_GRADIENTS,
  CANVA_SHAPE_DEFINITIONS,
  CANVA_SLIDE_TEMPLATES,
  CANVA_SOLID_BGS,
  CANVA_TEXT_PRESETS,
  CanvaChartRenderer,
  CanvaColorSwatchRow,
  CanvaFloatingActionBar,
  CanvaSelectionBox,
  CanvaShapeSvg,
  ResizeHandle,
  getImageFilterCss,
  getShadowCss,
  getTextEffectStyle,
} from './CanvaControls';
import { SpellCheckMenu, SpellContextMenuState } from './SpellCheckMenu';
import type { WordActiveFormats } from './WpsWordEditingBar';

interface PptHistorySnapshot {
  slides: WpsSlide[];
  title: string;
}

interface WpsPptViewerProps {
  document: WpsDocument;
  syncStatus?: 'saving' | 'saved';
  onBack: () => void;
  onUpdateDocument?: (patch: Partial<WpsDocument>) => void;
}

type SlideTheme = 'light' | 'slate' | 'dark';
type PptViewMode = 'slide' | 'reading';
type CanvaCanvasPanel =
  | null
  | 'design'
  | 'elements'
  | 'text'
  | 'charts'
  | 'background'
  | 'layers'
  | 'review';
type CanvaElementPanel =
  | null
  | 'font'
  | 'size'
  | 'color'
  | 'format'
  | 'spacing'
  | 'effects'
  | 'border'
  | 'filters'
  | 'opacity'
  | 'position'
  | 'data';

interface SnapGuide {
  axis: 'x' | 'y';
  pct: number;
}

interface CopiedElementStyle {
  fillColor?: string;
  fillGradient?: string;
  borderColor?: string;
  borderWidthPx?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  borderRadiusPx?: number;
  opacity?: number;
  shadow?: WpsShadowStyle;
  fontFamily?: string;
  fontSizePt?: number;
  letterSpacingEm?: number;
  lineHeight?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textEffect?: WpsTextEffect;
  effectColor?: string;
  color?: string;
}

interface PptSpellMenuState {
  menu: SpellContextMenuState;
  fieldKey: string;
  targetEl: HTMLDivElement;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractPlainTextFromHtml(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const div = window.document.createElement('div');
  div.innerHTML = html;
  return (div.innerText || div.textContent || '').trim();
}

function extractLinesFromHtml(html: string): string[] {
  if (!html) return [];
  if (typeof window === 'undefined') {
    return html
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const div = window.document.createElement('div');
  div.innerHTML = html;
  const listItems = Array.from(div.querySelectorAll('li'))
    .map((li) => (li.textContent || '').trim())
    .filter(Boolean);
  if (listItems.length > 0) return listItems;

  const blockEls = Array.from(
    div.querySelectorAll('p, div, h1, h2, h3, blockquote'),
  )
    .map((b) => (b.textContent || '').trim())
    .filter(Boolean);
  if (blockEls.length > 0) return blockEls;

  return (div.innerText || div.textContent || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function slideTextElementToHtml(
  el: Extract<WpsSlideElement, { type: 'text' }>,
): string {
  if (el.richHtml !== undefined) return el.richHtml;
  if (!el.paragraphs || el.paragraphs.length === 0) return '<p></p>';

  const parts: string[] = [];
  let bulletItems: string[] = [];

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      parts.push(`<ul>${bulletItems.join('')}</ul>`);
      bulletItems = [];
    }
  };

  for (const p of el.paragraphs) {
    const inner = p.runs
      .map((r) => {
        if (r.text === '\n') return '<br />';
        const styles: string[] = [];
        if (r.color) styles.push(`color:${r.color}`);
        if (r.fontSizePt) styles.push(`font-size:${Math.round(r.fontSizePt * 1.333)}px`);
        let chunk = escapeHtml(r.text);
        if (r.bold || el.isTitle) chunk = `<strong>${chunk}</strong>`;
        if (r.italic) chunk = `<em>${chunk}</em>`;
        if (r.underline) chunk = `<u>${chunk}</u>`;
        if (styles.length > 0) {
          chunk = `<span style="${styles.join(';')}">${chunk}</span>`;
        }
        return chunk;
      })
      .join('');
    const align = p.align ? ` style="text-align:${p.align}"` : '';
    if (p.bullet) {
      bulletItems.push(`<li${align}>${inner || '<br />'}</li>`);
    } else {
      flushBullets();
      parts.push(`<p${align}>${inner || '<br />'}</p>`);
    }
  }
  flushBullets();

  return parts.join('');
}

function htmlToSlideParagraphs(
  html: string,
  template?: WpsSlideParagraph,
): WpsSlideParagraph[] {
  const lines = extractLinesFromHtml(html);
  const templateRun = template?.runs[0] || { text: '' };
  if (lines.length === 0) {
    return [{ align: template?.align || 'left', runs: [{ ...templateRun, text: '' }] }];
  }
  return lines.map((line) => ({
    align: template?.align || 'left',
    runs: [{ ...templateRun, text: line }],
  }));
}

function structuredTitleToHtml(slide: WpsSlide): string {
  if (slide.titleHtml !== undefined) return slide.titleHtml;
  return `<p>${escapeHtml(slide.title)}</p>`;
}

function structuredSubtitleToHtml(slide: WpsSlide): string {
  if (slide.subtitleHtml !== undefined) return slide.subtitleHtml;
  return `<p>${escapeHtml(slide.subtitle || '')}</p>`;
}

function structuredBodyToHtml(slide: WpsSlide): string {
  if (slide.bodyHtml !== undefined) return slide.bodyHtml;
  if (slide.bullets.length === 0) return '<p></p>';
  return `<ul>${slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

/**
 * Promotes a legacy structured slide into free Canva-movable WpsSlideElement[]
 * so users can drag, resize, rotate, style, and layer every object freely.
 */
function promoteSlideToRichElements(slide: WpsSlide, theme: SlideTheme): WpsSlide {
  if (slide.elements && slide.elements.length > 0) return slide;
  const isDarkTheme = theme === 'dark' || theme === 'slate';
  const defaultBg =
    slide.backgroundColor ||
    (theme === 'dark' ? '#0F172A' : theme === 'slate' ? '#0F2744' : '#FFFFFF');
  const titleColor = isDarkTheme ? '#FFFFFF' : '#0F172A';
  const bodyColor = isDarkTheme ? '#E2E8F0' : '#334155';
  const baseId = `prom-${Date.now().toString(36)}`;

  const elements: WpsSlideElement[] = [
    {
      id: `${baseId}-title`,
      type: 'text',
      isTitle: true,
      xPct: 6,
      yPct: 8,
      wPct: 88,
      hPct: 16,
      fontSizePt: 28,
      richHtml: structuredTitleToHtml(slide),
      paragraphs: [
        {
          align: 'left',
          runs: [{ text: slide.title, bold: true, fontSizePt: 28, color: titleColor }],
        },
      ],
      zIndex: 1,
    },
  ];

  let nextY = 25;
  if (slide.subtitle !== undefined && slide.subtitle.trim().length > 0) {
    elements.push({
      id: `${baseId}-sub`,
      type: 'text',
      xPct: 6,
      yPct: nextY,
      wPct: 88,
      hPct: 11,
      fontSizePt: 16,
      richHtml: structuredSubtitleToHtml(slide),
      paragraphs: [
        {
          align: 'left',
          runs: [{ text: slide.subtitle, fontSizePt: 16, color: bodyColor }],
        },
      ],
      zIndex: 2,
    });
    nextY = 38;
  }

  if (slide.bullets.length > 0 || slide.bodyHtml) {
    elements.push({
      id: `${baseId}-body`,
      type: 'text',
      xPct: 6,
      yPct: nextY,
      wPct: slide.table ? 48 : 88,
      hPct: 50,
      fontSizePt: 16,
      richHtml: structuredBodyToHtml(slide),
      paragraphs: slide.bullets.map((b) => ({
        align: 'left',
        bullet: true,
        runs: [{ text: b, fontSizePt: 16, color: bodyColor }],
      })),
      zIndex: 3,
    });
  }

  if (slide.table) {
    elements.push({
      id: `${baseId}-tbl`,
      type: 'table',
      xPct: slide.bullets.length > 0 || slide.bodyHtml ? 56 : 6,
      yPct: nextY,
      wPct: slide.bullets.length > 0 || slide.bodyHtml ? 38 : 88,
      hPct: 48,
      headers: slide.table.headers,
      rows: slide.table.rows,
      headerBgColor: '#F1F5F9',
      headerTextColor: '#0F172A',
      zIndex: 4,
    });
  }

  return {
    ...slide,
    backgroundColor: defaultBg,
    elements,
  };
}

function getElementTypeLabel(el: WpsSlideElement): string {
  switch (el.type) {
    case 'text':
      return el.isTitle ? 'Título' : 'Texto';
    case 'shape':
      return 'Forma';
    case 'image':
      return 'Imagen';
    case 'table':
      return 'Tabla';
    case 'chart':
      return 'Gráfico';
    case 'diagram':
      return 'Diagrama';
  }
}

function RichEditableBox({
  fieldKey,
  html,
  placeholder,
  scale = 1,
  editable = true,
  style,
  className = '',
  spellCheckEnabled,
  customDict,
  ignoredSpellWords,
  onChangeHtml,
  onRegisterElement,
  onActivate,
  onSyncFormats,
  onSpellErrorsChange,
  onOpenSpellMenu,
}: {
  fieldKey: string;
  html: string;
  placeholder?: string;
  scale?: number;
  editable?: boolean;
  style?: React.CSSProperties;
  className?: string;
  spellCheckEnabled: boolean;
  customDict: Set<string>;
  ignoredSpellWords: Set<string>;
  onChangeHtml: (nextHtml: string) => void;
  onRegisterElement: (fieldKey: string, el: HTMLDivElement | null) => void;
  onActivate: (fieldKey: string, el: HTMLDivElement) => void;
  onSyncFormats: () => void;
  onSpellErrorsChange: (fieldKey: string, matches: SpellErrorMatch[]) => void;
  onOpenSpellMenu: (
    menu: SpellContextMenuState,
    fieldKey: string,
    targetEl: HTMLDivElement,
  ) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const latestErrorsRef = useRef<SpellErrorMatch[]>([]);
  const lastEmittedHtmlRef = useRef<string>(html);
  const [underlineRects, setUnderlineRects] = useState<
    { id: string; left: number; top: number; width: number }[]
  >([]);

  const computeRects = useCallback(
    (errors: SpellErrorMatch[]) => {
      const container = wrapperRef.current;
      if (!container) {
        setUnderlineRects([]);
        return;
      }
      const cRect = container.getBoundingClientRect();
      const s = scale > 0.05 ? scale : 1;
      const nextRects: { id: string; left: number; top: number; width: number }[] = [];
      for (const err of errors) {
        if (!err.range.startContainer.isConnected) continue;
        const rects = err.range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width <= 0 || r.height <= 0) continue;
          nextRects.push({
            id: `${err.id}-${i}`,
            left: (r.left - cRect.left) / s,
            top: (r.bottom - cRect.top) / s - 2,
            width: r.width / s,
          });
        }
      }
      setUnderlineRects(nextRects);
    },
    [scale],
  );

  const runScan = useCallback(() => {
    const el = editorRef.current;
    if (!spellCheckEnabled || !el || !editable) {
      latestErrorsRef.current = [];
      setUnderlineRects([]);
      onSpellErrorsChange(fieldKey, []);
      return;
    }
    const found = scanElementSpelling(el, ignoredSpellWords, customDict);
    latestErrorsRef.current = found;
    computeRects(found);
    onSpellErrorsChange(fieldKey, found);
  }, [
    spellCheckEnabled,
    editable,
    ignoredSpellWords,
    customDict,
    computeRects,
    fieldKey,
    onSpellErrorsChange,
  ]);

  const scheduleScan = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      runScan();
    }, 140);
  }, [runScan]);

  useEffect(() => {
    const el = editorRef.current;
    onRegisterElement(fieldKey, el);
    return () => {
      onRegisterElement(fieldKey, null);
      onSpellErrorsChange(fieldKey, []);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [fieldKey, onRegisterElement, onSpellErrorsChange]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (html !== lastEmittedHtmlRef.current || el.innerHTML === '') {
      if (el.innerHTML !== html) {
        el.innerHTML = html;
      }
      lastEmittedHtmlRef.current = html;
    } else if (window.document.activeElement !== el && el.innerHTML !== html) {
      el.innerHTML = html;
    }
    const raf = window.requestAnimationFrame(() => runScan());
    return () => window.cancelAnimationFrame(raf);
  }, [fieldKey, html, runScan]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => runScan());
    return () => window.cancelAnimationFrame(raf);
  }, [runScan]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() =>
      computeRects(latestErrorsRef.current),
    );
    return () => window.cancelAnimationFrame(raf);
  }, [scale, computeRects]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const reposition = () => computeRects(latestErrorsRef.current);
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
  }, [computeRects]);

  const findErrorAtPoint = (clientX: number, clientY: number): SpellErrorMatch | null => {
    for (const err of latestErrorsRef.current) {
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

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      {editable && spellCheckEnabled && underlineRects.length > 0 && (
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
        contentEditable={editable}
        spellCheck={false}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={(e) => {
          if (!editable) return;
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onInput={(e) => {
          if (!editable) return;
          e.currentTarget
            .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
            .forEach(syncCheckboxAttribute);
          const next = e.currentTarget.innerHTML;
          lastEmittedHtmlRef.current = next;
          onActivate(fieldKey, e.currentTarget);
          onChangeHtml(next);
          scheduleScan();
          onSyncFormats();
        }}
        onKeyUp={(e) => {
          if (!editable) return;
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onMouseUp={(e) => {
          if (!editable) return;
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onTouchEnd={(e) => {
          if (!editable) return;
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onContextMenu={(e) => {
          if (!editable || !spellCheckEnabled || !editorRef.current) return;
          const matched = findErrorAtPoint(e.clientX, e.clientY);
          if (!matched) return;
          e.preventDefault();
          onOpenSpellMenu(
            {
              errorId: matched.id,
              word: matched.word,
              suggestions: getSpellingSuggestions(matched.word, 5),
              x: e.clientX,
              y: e.clientY + 6,
              range: matched.range,
            },
            fieldKey,
            editorRef.current,
          );
        }}
        onClick={(e) => {
          if (!editable) return;
          e.stopPropagation();
          const target = e.target;
          if (target instanceof HTMLInputElement && target.type === 'checkbox') {
            syncCheckboxAttribute(target);
            hideSoftKeyboard();
            if (editorRef.current) {
              const next = editorRef.current.innerHTML;
              lastEmittedHtmlRef.current = next;
              onChangeHtml(next);
            }
            return;
          }
          if (editorRef.current) {
            onActivate(fieldKey, editorRef.current);
          }
          if (!spellCheckEnabled || !editorRef.current) return;
          const isCoarse =
            typeof window !== 'undefined' &&
            window.matchMedia('(pointer: coarse)').matches;
          if (!isCoarse) return;
          const matched = findErrorAtPoint(e.clientX, e.clientY);
          if (matched) {
            e.preventDefault();
            hideSoftKeyboard();
            onOpenSpellMenu(
              {
                errorId: matched.id,
                word: matched.word,
                suggestions: getSpellingSuggestions(matched.word, 5),
                x: e.clientX,
                y: e.clientY + 8,
                range: matched.range,
              },
              fieldKey,
              editorRef.current,
            );
          }
        }}
        style={style}
        className={`wps-doc-canvas [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_ol]:mb-1.5 relative z-[1] h-full w-full outline-none ${
          editable ? '' : 'pointer-events-none select-none'
        } ${className}`}
      />
    </div>
  );
}

function SlideStage({
  slide,
  totalSlides,
  formatLabel,
  theme,
  interactive = true,
  fitHeight = false,
  editMode = false,
  selectedElementId = null,
  editingTextId = null,
  activeFieldKey = null,
  hasCopiedStyle = false,
  spellCheckEnabled = true,
  customDict,
  ignoredSpellWords,
  onSelectElement,
  onSetEditingTextId,
  onChangeSlide,
  onCommitHistory,
  onDuplicateElement,
  onDeleteElement,
  onCopyElementStyle,
  onPasteElementStyle,
  onReorderLayer,
  onRegisterEditable,
  onActivateEditable,
  onSyncFormats,
  onSpellErrorsChange,
  onOpenSpellMenu,
}: {
  slide: WpsSlide;
  totalSlides: number;
  formatLabel: string;
  theme: SlideTheme;
  interactive?: boolean;
  fitHeight?: boolean;
  editMode?: boolean;
  selectedElementId?: string | null;
  editingTextId?: string | null;
  activeFieldKey?: string | null;
  hasCopiedStyle?: boolean;
  spellCheckEnabled?: boolean;
  customDict?: Set<string>;
  ignoredSpellWords?: Set<string>;
  onSelectElement?: (id: string | null) => void;
  onSetEditingTextId?: (id: string | null) => void;
  onChangeSlide?: (updater: (prev: WpsSlide) => WpsSlide, immediate?: boolean) => void;
  onCommitHistory?: () => void;
  onDuplicateElement?: (id: string) => void;
  onDeleteElement?: (id: string) => void;
  onCopyElementStyle?: (id: string) => void;
  onPasteElementStyle?: (id: string) => void;
  onReorderLayer?: (id: string, dir: 'forward' | 'backward') => void;
  onRegisterEditable?: (fieldKey: string, el: HTMLDivElement | null) => void;
  onActivateEditable?: (fieldKey: string, el: HTMLDivElement) => void;
  onSyncFormats?: () => void;
  onSpellErrorsChange?: (fieldKey: string, matches: SpellErrorMatch[]) => void;
  onOpenSpellMenu?: (
    menu: SpellContextMenuState,
    fieldKey: string,
    targetEl: HTMLDivElement,
  ) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageCanvasRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 800, height: 450 });
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [liveBadge, setLiveBadge] = useState<string | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const interactionRef = useRef<{
    mode: 'drag' | 'resize' | 'rotate';
    elId: string;
    handle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origRot: number;
    centerPxX: number;
    centerPxY: number;
    moved: boolean;
  } | null>(null);

  const virtualW = slide.slideWidthPx || 960;
  const virtualH = slide.slideHeightPx || 540;
  const aspectRatio = virtualW / virtualH;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBoxSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualW, virtualH, fitHeight]);

  const scale = fitHeight
    ? Math.min(boxSize.width / virtualW, boxSize.height / virtualH)
    : boxSize.width / virtualW;

  const hasRichElements = Boolean(slide.elements && slide.elements.length > 0);
  const isCustomBg = Boolean(slide.backgroundColor && slide.backgroundColor !== '#FFFFFF');

  const unstyledSurface =
    theme === 'dark'
      ? { bg: '#0F172A', text: '#F8FAFC', sub: '#CBD5E1', border: '#334155' }
      : theme === 'slate'
        ? { bg: '#0F2744', text: '#FFFFFF', sub: '#CBD5E1', border: '#1E3A5F' }
        : { bg: '#FFFFFF', text: '#0F172A', sub: '#475569', border: '#E2E8F0' };

  const stageBg = hasRichElements
    ? isCustomBg
      ? slide.backgroundColor
      : theme === 'light'
        ? '#FFFFFF'
        : slide.backgroundColor || '#FFFFFF'
    : unstyledSurface.bg;

  const sortedElements = useMemo(() => {
    if (!slide.elements) return [];
    return [...slide.elements].sort((a, b) => a.zIndex - b.zIndex);
  }, [slide.elements]);

  const noopRegister = useCallback(() => {}, []);
  const noopActivate = useCallback(() => {}, []);
  const noopSync = useCallback(() => {}, []);
  const noopSpell = useCallback(() => {}, []);
  const noopMenu = useCallback(() => {}, []);
  const emptySet = useMemo(() => new Set<string>(), []);

  const updateSingleElement = useCallback(
    (id: string, patch: Partial<WpsSlideElement>, immediate = false) => {
      if (!onChangeSlide) return;
      onChangeSlide(
        (prev) => ({
          ...prev,
          elements: prev.elements?.map((item) =>
            item.id === id ? ({ ...item, ...patch } as WpsSlideElement) : item,
          ),
        }),
        immediate,
      );
    },
    [onChangeSlide],
  );

  // Global window pointer listeners for silky smooth drag / resize / rotate even outside element bounds
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const act = interactionRef.current;
      const stageEl = stageCanvasRef.current;
      if (!act || !stageEl) return;

      const stageRect = stageEl.getBoundingClientRect();
      if (stageRect.width <= 0 || stageRect.height <= 0) return;

      const dxPct = ((e.clientX - act.startClientX) / stageRect.width) * 100;
      const dyPct = ((e.clientY - act.startClientY) / stageRect.height) * 100;
      if (Math.hypot(e.clientX - act.startClientX, e.clientY - act.startClientY) > 2) {
        act.moved = true;
      }
      if (!act.moved) return;

      if (act.mode === 'drag') {
        let nextX = act.origX + dxPct;
        let nextY = act.origY + dyPct;

        // Canva smart snap alignment guides
        const guides: SnapGuide[] = [];
        const threshold = 1.25;
        const elCenterX = nextX + act.origW / 2;
        const elCenterY = nextY + act.origH / 2;

        // Canvas center & margins
        const xTargets = [
          { val: 50, apply: 50 - act.origW / 2, guide: 50 },
          { val: 6, apply: 6, guide: 6 },
          { val: 94, apply: 94 - act.origW, guide: 94 },
        ];
        for (const t of xTargets) {
          const check = t.guide === 50 ? elCenterX : t.guide === 6 ? nextX : nextX + act.origW;
          if (Math.abs(check - t.val) < threshold) {
            nextX = t.apply;
            guides.push({ axis: 'x', pct: t.guide });
            break;
          }
        }

        const yTargets = [
          { val: 50, apply: 50 - act.origH / 2, guide: 50 },
          { val: 8, apply: 8, guide: 8 },
          { val: 92, apply: 92 - act.origH, guide: 92 },
        ];
        for (const t of yTargets) {
          const check = t.guide === 50 ? elCenterY : t.guide === 8 ? nextY : nextY + act.origH;
          if (Math.abs(check - t.val) < threshold) {
            nextY = t.apply;
            guides.push({ axis: 'y', pct: t.guide });
            break;
          }
        }

        // Snap to sibling elements' centers & edges
        const siblings = (slide.elements || []).filter((s) => s.id !== act.elId);
        for (const sib of siblings) {
          const sibCx = sib.xPct + sib.wPct / 2;
          const sibCy = sib.yPct + sib.hPct / 2;
          if (Math.abs(nextX + act.origW / 2 - sibCx) < threshold) {
            nextX = sibCx - act.origW / 2;
            guides.push({ axis: 'x', pct: sibCx });
          } else if (Math.abs(nextX - sib.xPct) < threshold) {
            nextX = sib.xPct;
            guides.push({ axis: 'x', pct: sib.xPct });
          }
          if (Math.abs(nextY + act.origH / 2 - sibCy) < threshold) {
            nextY = sibCy - act.origH / 2;
            guides.push({ axis: 'y', pct: sibCy });
          } else if (Math.abs(nextY - sib.yPct) < threshold) {
            nextY = sib.yPct;
            guides.push({ axis: 'y', pct: sib.yPct });
          }
        }

        nextX = Math.max(-20, Math.min(95, Math.round(nextX * 10) / 10));
        nextY = Math.max(-20, Math.min(95, Math.round(nextY * 10) / 10));
        setSnapGuides(guides);
        setLiveBadge(`X ${Math.round(nextX)}% · Y ${Math.round(nextY)}%`);
        updateSingleElement(act.elId, { xPct: nextX, yPct: nextY }, false);
        return;
      }

      if (act.mode === 'resize' && act.handle) {
        let nextX = act.origX;
        let nextY = act.origY;
        let nextW = act.origW;
        let nextH = act.origH;
        const minW = 5;
        const minH = 4;

        if (act.handle.includes('e')) {
          nextW = Math.max(minW, act.origW + dxPct);
        }
        if (act.handle.includes('s')) {
          nextH = Math.max(minH, act.origH + dyPct);
        }
        if (act.handle.includes('w')) {
          const clampedDx = Math.min(act.origW - minW, dxPct);
          nextX = act.origX + clampedDx;
          nextW = act.origW - clampedDx;
        }
        if (act.handle.includes('n')) {
          const clampedDy = Math.min(act.origH - minH, dyPct);
          nextY = act.origY + clampedDy;
          nextH = act.origH - clampedDy;
        }

        nextX = Math.round(nextX * 10) / 10;
        nextY = Math.round(nextY * 10) / 10;
        nextW = Math.round(nextW * 10) / 10;
        nextH = Math.round(nextH * 10) / 10;
        setLiveBadge(`${Math.round(nextW)}% × ${Math.round(nextH)}%`);
        updateSingleElement(
          act.elId,
          { xPct: nextX, yPct: nextY, wPct: nextW, hPct: nextH },
          false,
        );
        return;
      }

      if (act.mode === 'rotate') {
        const angleRad = Math.atan2(
          e.clientY - act.centerPxY,
          e.clientX - act.centerPxX,
        );
        let deg = Math.round(((angleRad * 180) / Math.PI) - 90);
        deg = ((deg % 360) + 360) % 360;
        if (deg > 180) deg -= 360;
        // Soft snap to 0, ±45, ±90, 180
        for (const snap of [0, 45, -45, 90, -90, 135, -135, 180, -180]) {
          if (Math.abs(deg - snap) <= 4) {
            deg = snap;
            break;
          }
        }
        setLiveBadge(`${deg}°`);
        updateSingleElement(act.elId, { rotationDeg: deg }, false);
      }
    };

    const handleUp = () => {
      const act = interactionRef.current;
      if (!act) return;
      interactionRef.current = null;
      setSnapGuides([]);
      setLiveBadge(null);
      if (act.moved) {
        onCommitHistory?.();
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [slide.elements, updateSingleElement, onCommitHistory]);

  const startDragElement = (el: WpsSlideElement, e: React.PointerEvent) => {
    if (!editMode || !onChangeSlide || el.locked) return;
    if (el.type === 'text' && editingTextId === el.id) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Detect double-tap to enter inline text editing (Canva behavior!)
    const now = Date.now();
    if (
      el.type === 'text' &&
      lastTapRef.current &&
      lastTapRef.current.id === el.id &&
      now - lastTapRef.current.time < 320
    ) {
      lastTapRef.current = null;
      onSelectElement?.(el.id);
      onSetEditingTextId?.(el.id);
      return;
    }
    lastTapRef.current = { id: el.id, time: now };

    e.stopPropagation();
    hideSoftKeyboard();
    onSelectElement?.(el.id);
    if (editingTextId && editingTextId !== el.id) {
      onSetEditingTextId?.(null);
    }

    interactionRef.current = {
      mode: 'drag',
      elId: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xPct,
      origY: el.yPct,
      origW: el.wPct,
      origH: el.hPct,
      origRot: el.rotationDeg || 0,
      centerPxX: 0,
      centerPxY: 0,
      moved: false,
    };
  };

  const startResizeElement = (
    el: WpsSlideElement,
    handle: ResizeHandle,
    e: React.PointerEvent,
  ) => {
    if (!editMode || !onChangeSlide || el.locked) return;
    e.stopPropagation();
    hideSoftKeyboard();
    interactionRef.current = {
      mode: 'resize',
      elId: el.id,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xPct,
      origY: el.yPct,
      origW: el.wPct,
      origH: el.hPct,
      origRot: el.rotationDeg || 0,
      centerPxX: 0,
      centerPxY: 0,
      moved: false,
    };
  };

  const startRotateElement = (el: WpsSlideElement, e: React.PointerEvent) => {
    const stageEl = stageCanvasRef.current;
    if (!editMode || !onChangeSlide || el.locked || !stageEl) return;
    e.stopPropagation();
    hideSoftKeyboard();
    const rect = stageEl.getBoundingClientRect();
    const cx = rect.left + ((el.xPct + el.wPct / 2) / 100) * rect.width;
    const cy = rect.top + ((el.yPct + el.hPct / 2) / 100) * rect.height;

    interactionRef.current = {
      mode: 'rotate',
      elId: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xPct,
      origY: el.yPct,
      origW: el.wPct,
      origH: el.hPct,
      origRot: el.rotationDeg || 0,
      centerPxX: cx,
      centerPxY: cy,
      moved: false,
    };
  };

  const renderRichElement = (el: WpsSlideElement) => {
    const isSelected = editMode && selectedElementId === el.id;
    const isEditingThisText = editMode && el.type === 'text' && editingTextId === el.id;

    const flipX = 'flippedX' in el && el.flippedX ? -1 : 1;
    const flipY = 'flippedY' in el && el.flippedY ? -1 : 1;
    const rotStr = el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : '';
    const flipStr = flipX !== 1 || flipY !== 1 ? `scale(${flipX}, ${flipY})` : '';
    const transformValue = [rotStr, flipStr].filter(Boolean).join(' ') || undefined;

    const outerStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${el.xPct}%`,
      top: `${el.yPct}%`,
      width: `${el.wPct}%`,
      height: `${el.hPct}%`,
      zIndex: isSelected ? Math.max(el.zIndex, 40) : el.zIndex,
      transform: rotStr || undefined,
      opacity: el.opacity ?? 1,
      touchAction: editMode && isSelected && !isEditingThisText ? 'none' : undefined,
    };

    const selectionOverlay = isSelected ? (
      <CanvaSelectionBox
        locked={Boolean(el.locked)}
        rotationDeg={el.rotationDeg || 0}
        isEditingText={isEditingThisText}
        badgeText={liveBadge}
        onResizeStart={(handle, ev) => startResizeElement(el, handle, ev)}
        onRotateStart={(ev) => startRotateElement(el, ev)}
      />
    ) : null;

    if (el.type === 'shape') {
      return (
        <div
          key={el.id}
          onPointerDown={(e) => startDragElement(el, e)}
          onClick={(e) => {
            if (!editMode) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
          }}
          style={{
            ...outerStyle,
            transform: transformValue,
            boxShadow: el.shapeKind !== 'line' ? getShadowCss(el.shadow) : undefined,
          }}
          className={editMode ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''}
        >
          <CanvaShapeSvg
            shapeKind={el.shapeKind}
            fillColor={el.fillColor}
            fillGradient={el.fillGradient}
            borderColor={el.borderColor}
            borderWidthPx={el.borderWidthPx}
            borderStyle={el.borderStyle}
            borderRadiusPx={el.borderRadiusPx}
          />
          {selectionOverlay}
        </div>
      );
    }

    if (el.type === 'image') {
      return (
        <div
          key={el.id}
          onPointerDown={(e) => startDragElement(el, e)}
          onClick={(e) => {
            if (!editMode) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
          }}
          style={{
            ...outerStyle,
            boxShadow: getShadowCss(el.shadow),
          }}
          className={editMode ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''}
        >
          <img
            src={el.src}
            alt={el.alt || 'Elemento gráfico'}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: el.imageFit || 'contain',
              transform: flipStr || undefined,
              filter: getImageFilterCss(
                el.filterPreset,
                el.brightness ?? 100,
                el.contrast ?? 100,
                el.saturate ?? 100,
              ),
              borderRadius: el.borderRadiusPx ? `${el.borderRadiusPx}px` : undefined,
              border:
                el.borderColor || el.borderWidthPx
                  ? `${Math.max(1, el.borderWidthPx || 2)}px solid ${el.borderColor || '#0F172A'}`
                  : undefined,
            }}
          />
          {selectionOverlay}
        </div>
      );
    }

    if (el.type === 'chart') {
      return (
        <div
          key={el.id}
          onPointerDown={(e) => startDragElement(el, e)}
          onClick={(e) => {
            if (!editMode) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
          }}
          style={outerStyle}
          className={editMode ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''}
        >
          <CanvaChartRenderer el={el} />
          {selectionOverlay}
        </div>
      );
    }

    if (el.type === 'diagram') {
      return (
        <div
          key={el.id}
          onPointerDown={(e) => startDragElement(el, e)}
          onClick={(e) => {
            if (!editMode) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
          }}
          style={{
            ...outerStyle,
            backgroundColor: el.fillColor || 'rgba(248, 250, 252, 0.94)',
            borderColor: el.borderColor || 'rgba(203, 213, 225, 0.9)',
            borderRadius: `${el.borderRadiusPx ?? 10}px`,
            boxShadow: getShadowCss(el.shadow),
          }}
          className={`flex flex-wrap items-center justify-center gap-2 overflow-hidden border p-3 text-slate-900 ${
            editMode ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''
          }`}
        >
          {el.items.slice(0, 8).map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs"
            >
              {item}
            </div>
          ))}
          {selectionOverlay}
        </div>
      );
    }

    if (el.type === 'table') {
      return (
        <div
          key={el.id}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            startDragElement(el, e);
          }}
          onClick={(e) => {
            if (!editMode) return;
            e.stopPropagation();
            onSelectElement?.(el.id);
          }}
          style={{
            ...outerStyle,
            borderRadius: `${el.borderRadiusPx ?? 6}px`,
            borderColor: el.borderColor || 'rgba(203, 213, 225, 0.8)',
            backgroundColor: el.cellBgColor || 'rgba(255, 255, 255, 0.96)',
            boxShadow: getShadowCss(el.shadow),
          }}
          className="overflow-auto border text-slate-900"
        >
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr
                style={{
                  backgroundColor: el.headerBgColor || '#F1F5F9',
                  color: el.headerTextColor || '#0F172A',
                }}
              >
                {el.headers.map((h, i) => (
                  <th key={i} className="border-b border-slate-300 px-2.5 py-1.5 font-semibold">
                    {editMode && onChangeSlide && isSelected ? (
                      <input
                        type="text"
                        value={h}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onChangeSlide((prev) => ({
                            ...prev,
                            elements: prev.elements?.map((item) =>
                              item.id === el.id && item.type === 'table'
                                ? {
                                    ...item,
                                    headers: item.headers.map((hv, hi) =>
                                      hi === i ? e.target.value : hv,
                                    ),
                                  }
                                : item,
                            ),
                          }))
                        }
                        className="w-full rounded bg-transparent px-0.5 font-semibold focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                      />
                    ) : (
                      h
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {el.rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-slate-200 last:border-b-0">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-2.5 py-1.5">
                      {editMode && onChangeSlide && isSelected ? (
                        <input
                          type="text"
                          value={cell}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onChangeSlide((prev) => ({
                              ...prev,
                              elements: prev.elements?.map((item) =>
                                item.id === el.id && item.type === 'table'
                                  ? {
                                      ...item,
                                      rows: item.rows.map((rw, ri) =>
                                        ri === rIdx
                                          ? rw.map((cv, ci) =>
                                              ci === cIdx ? e.target.value : cv,
                                            )
                                          : rw,
                                      ),
                                    }
                                  : item,
                              ),
                            }))
                          }
                          className="w-full rounded bg-transparent px-0.5 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                        />
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {selectionOverlay}
        </div>
      );
    }

    // Text element
    const fieldKey = `el:${slide.id}:${el.id}`;
    const isActiveField = editMode && (isSelected || activeFieldKey === fieldKey);
    const firstRun = el.paragraphs[0]?.runs[0];
    const firstParaAlign = el.paragraphs[0]?.align || 'left';
    const effectivePt = el.fontSizePt || firstRun?.fontSizePt || (el.isTitle ? 28 : 16);
    const fontPx = Math.max(11, Math.round(effectivePt * 1.333));
    const initialHtml = slideTextElementToHtml(el);
    const textColor = firstRun?.color || '#0F172A';
    const fxStyle = getTextEffectStyle(el.textEffect, el.effectColor, textColor);
    const justifyContent =
      el.verticalAlign === 'bottom'
        ? 'flex-end'
        : el.verticalAlign === 'middle' || el.isTitle
          ? 'center'
          : 'flex-start';

    if (editMode && onChangeSlide) {
      return (
        <div
          key={el.id}
          onPointerDown={(e) => startDragElement(el, e)}
          onClick={(e) => {
            e.stopPropagation();
            onSelectElement?.(el.id);
          }}
          style={{
            ...outerStyle,
            backgroundColor: el.fillColor || 'transparent',
            border:
              el.borderColor || el.borderWidthPx
                ? `${Math.max(1, el.borderWidthPx || 1.5)}px ${el.borderStyle || 'solid'} ${el.borderColor || '#0F172A'}`
                : undefined,
            outline:
              !isSelected && isActiveField
                ? '1.5px solid #7C3AED'
                : !isSelected
                  ? '1px dashed rgba(148, 163, 184, 0.45)'
                  : undefined,
            borderRadius: `${el.borderRadiusPx ?? 6}px`,
            boxShadow: getShadowCss(el.shadow),
            padding: '4px 8px',
            overflow: isSelected ? 'visible' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent,
          }}
          className={
            isEditingThisText
              ? 'cursor-text'
              : el.locked
                ? 'cursor-not-allowed'
                : 'cursor-move'
          }
        >
          <div className="h-full w-full overflow-y-auto overflow-x-hidden">
            <RichEditableBox
              fieldKey={fieldKey}
              html={initialHtml}
              scale={scale}
              editable={isEditingThisText}
              placeholder="Doble toque para escribir..."
              spellCheckEnabled={spellCheckEnabled}
              customDict={customDict || emptySet}
              ignoredSpellWords={ignoredSpellWords || emptySet}
              onRegisterElement={onRegisterEditable || noopRegister}
              onActivate={(k, node) => {
                onSelectElement?.(el.id);
                (onActivateEditable || noopActivate)(k, node);
              }}
              onSyncFormats={onSyncFormats || noopSync}
              onSpellErrorsChange={onSpellErrorsChange || noopSpell}
              onOpenSpellMenu={onOpenSpellMenu || noopMenu}
              onChangeHtml={(nextHtml) => {
                const plain = extractPlainTextFromHtml(nextHtml);
                onChangeSlide((prev) => ({
                  ...prev,
                  title: el.isTitle && plain ? plain : prev.title,
                  elements: prev.elements?.map((item) =>
                    item.id === el.id && item.type === 'text'
                      ? {
                          ...item,
                          richHtml: nextHtml,
                          paragraphs: htmlToSlideParagraphs(nextHtml, item.paragraphs[0]),
                        }
                      : item,
                  ),
                }));
              }}
              style={{
                fontFamily: el.fontFamily,
                fontSize: `${fontPx}px`,
                color: textColor,
                textAlign: firstParaAlign,
                lineHeight: el.lineHeight ?? 1.28,
                letterSpacing: el.letterSpacingEm ? `${el.letterSpacingEm}em` : undefined,
                textTransform: el.textTransform,
                height: el.isTitle || el.verticalAlign === 'middle' ? 'auto' : '100%',
                ...fxStyle,
              }}
            />
          </div>
          {selectionOverlay}
        </div>
      );
    }

    if (el.richHtml !== undefined) {
      return (
        <div
          key={el.id}
          style={{
            ...outerStyle,
            transform: transformValue,
            backgroundColor: el.fillColor || 'transparent',
            border:
              el.borderColor || el.borderWidthPx
                ? `${Math.max(1, el.borderWidthPx || 1.5)}px ${el.borderStyle || 'solid'} ${el.borderColor || '#0F172A'}`
                : undefined,
            borderRadius: `${el.borderRadiusPx ?? 6}px`,
            boxShadow: getShadowCss(el.shadow),
            padding: '4px 8px',
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
            justifyContent,
            fontFamily: el.fontFamily,
            fontSize: `${fontPx}px`,
            color: textColor,
            textAlign: firstParaAlign,
            lineHeight: el.lineHeight ?? 1.28,
            letterSpacing: el.letterSpacingEm ? `${el.letterSpacingEm}em` : undefined,
            textTransform: el.textTransform,
            ...fxStyle,
          }}
        >
          <div
            className="wps-doc-canvas [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_ol]:mb-1.5"
            dangerouslySetInnerHTML={{ __html: el.richHtml }}
          />
        </div>
      );
    }

    return (
      <div
        key={el.id}
        style={{
          ...outerStyle,
          transform: transformValue,
          backgroundColor: el.fillColor || 'transparent',
          border:
            el.borderColor || el.borderWidthPx
              ? `${Math.max(1, el.borderWidthPx || 1.5)}px ${el.borderStyle || 'solid'} ${el.borderColor || '#0F172A'}`
              : undefined,
          borderRadius: `${el.borderRadiusPx ?? 6}px`,
          boxShadow: getShadowCss(el.shadow),
          padding: '4px 8px',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          justifyContent,
          fontFamily: el.fontFamily,
          letterSpacing: el.letterSpacingEm ? `${el.letterSpacingEm}em` : undefined,
          textTransform: el.textTransform,
          ...fxStyle,
        }}
      >
        {el.paragraphs.map((p, pIdx) => {
          const indentPx = p.level ? p.level * 18 : 0;
          return (
            <div
              key={pIdx}
              style={{
                textAlign: p.align || 'left',
                paddingLeft: `${indentPx}px`,
                marginBottom: '6px',
                lineHeight: el.lineHeight ?? 1.28,
                display: p.bullet ? 'flex' : 'block',
                alignItems: 'flex-start',
                gap: p.bullet ? '8px' : undefined,
              }}
            >
              {p.bullet && (
                <span
                  style={{
                    marginTop: '0.45em',
                    width: '6px',
                    height: '6px',
                    borderRadius: '9999px',
                    backgroundColor: p.runs[0]?.color || '#EA580C',
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                {p.runs.map((run, rIdx) => {
                  if (run.text === '\n') return <br key={rIdx} />;
                  const pxSize = Math.max(
                    11,
                    Math.round((el.fontSizePt || run.fontSizePt || (el.isTitle ? 28 : 16)) * 1.333),
                  );
                  return (
                    <span
                      key={rIdx}
                      style={{
                        fontSize: `${pxSize}px`,
                        fontWeight: run.bold ? 700 : el.isTitle ? 700 : 400,
                        fontStyle: run.italic ? 'italic' : 'normal',
                        textDecoration: run.underline ? 'underline' : 'none',
                        color: run.color || '#0F172A',
                      }}
                    >
                      {run.text}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const selectedElementObj = useMemo(() => {
    if (!editMode || !selectedElementId || !slide.elements) return null;
    return slide.elements.find((e) => e.id === selectedElementId) ?? null;
  }, [editMode, selectedElementId, slide.elements]);

  const stageSurfaceStyle: React.CSSProperties = {
    width: `${virtualW}px`,
    height: `${virtualH}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    backgroundColor: stageBg,
    backgroundImage: slide.backgroundImage
      ? `url(${slide.backgroundImage})`
      : slide.backgroundGradient || undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    position: 'relative',
    overflow: 'hidden',
  };

  if (fitHeight) {
    const scaledW = virtualW * scale;
    const scaledH = virtualH * scale;
    return (
      <div
        ref={hostRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
      >
        <div
          style={{
            width: `${scaledW}px`,
            height: `${scaledH}px`,
            position: 'relative',
            overflow: 'hidden',
          }}
          className="rounded-xl shadow-2xl"
        >
          <div style={stageSurfaceStyle}>
            {hasRichElements ? (
              sortedElements.map(renderRichElement)
            ) : (
              <StructuredSlideCanvas
                slide={slide}
                totalSlides={totalSlides}
                formatLabel={formatLabel}
                surface={unstyledSurface}
                scale={scale}
                editMode={editMode}
                activeFieldKey={activeFieldKey}
                spellCheckEnabled={spellCheckEnabled}
                customDict={customDict}
                ignoredSpellWords={ignoredSpellWords}
                onChangeSlide={onChangeSlide}
                onRegisterEditable={onRegisterEditable}
                onActivateEditable={onActivateEditable}
                onSyncFormats={onSyncFormats}
                onSpellErrorsChange={onSpellErrorsChange}
                onOpenSpellMenu={onOpenSpellMenu}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-2">
      {/* Canva Floating Quick-Action Bar right above the stage when an element is selected */}
      {editMode && selectedElementObj && (
        <div className="no-print flex justify-center overflow-x-auto pb-0.5">
          <CanvaFloatingActionBar
            canEditText={selectedElementObj.type === 'text'}
            isEditingText={editingTextId === selectedElementObj.id}
            locked={Boolean(selectedElementObj.locked)}
            hasCopiedStyle={hasCopiedStyle}
            onToggleEditText={() => {
              const nextEdit =
                editingTextId === selectedElementObj.id ? null : selectedElementObj.id;
              onSetEditingTextId?.(nextEdit);
              if (!nextEdit) {
                hideSoftKeyboard();
              }
            }}
            onCopyStyle={() => onCopyElementStyle?.(selectedElementObj.id)}
            onPasteStyle={() => onPasteElementStyle?.(selectedElementObj.id)}
            onDuplicate={() => onDuplicateElement?.(selectedElementObj.id)}
            onToggleLock={() =>
              updateSingleElement(
                selectedElementObj.id,
                { locked: !selectedElementObj.locked },
                true,
              )
            }
            onBringForward={() => onReorderLayer?.(selectedElementObj.id, 'forward')}
            onSendBackward={() => onReorderLayer?.(selectedElementObj.id, 'backward')}
            onDelete={() => onDeleteElement?.(selectedElementObj.id)}
          />
        </div>
      )}

      <div
        ref={hostRef}
        style={{ aspectRatio: `${aspectRatio}` }}
        onClick={() => {
          if (!editMode) return;
          onSelectElement?.(null);
          onSetEditingTextId?.(null);
          hideSoftKeyboard();
        }}
        className={`relative w-full overflow-hidden rounded-xl border border-slate-200/90 shadow-md dark:border-slate-800 ${
          interactive ? 'select-text' : 'pointer-events-none select-none'
        }`}
      >
        <div ref={stageCanvasRef} style={stageSurfaceStyle}>
          {hasRichElements ? (
            sortedElements.map(renderRichElement)
          ) : (
            <StructuredSlideCanvas
              slide={slide}
              totalSlides={totalSlides}
              formatLabel={formatLabel}
              surface={unstyledSurface}
              scale={scale}
              editMode={editMode}
              activeFieldKey={activeFieldKey}
              spellCheckEnabled={spellCheckEnabled}
              customDict={customDict}
              ignoredSpellWords={ignoredSpellWords}
              onChangeSlide={onChangeSlide}
              onRegisterEditable={onRegisterEditable}
              onActivateEditable={onActivateEditable}
              onSyncFormats={onSyncFormats}
              onSpellErrorsChange={onSpellErrorsChange}
              onOpenSpellMenu={onOpenSpellMenu}
            />
          )}

          {/* Smart Canva Alignment Snap Guides */}
          {editMode &&
            snapGuides.map((g, i) =>
              g.axis === 'x' ? (
                <div
                  key={`gx-${i}`}
                  aria-hidden="true"
                  style={{ left: `${g.pct}%` }}
                  className="no-print pointer-events-none absolute inset-y-0 z-50 w-[1.5px] bg-[#EC4899]"
                />
              ) : (
                <div
                  key={`gy-${i}`}
                  aria-hidden="true"
                  style={{ top: `${g.pct}%` }}
                  className="no-print pointer-events-none absolute inset-x-0 z-50 h-[1.5px] bg-[#EC4899]"
                />
              ),
            )}
        </div>
      </div>
    </div>
  );
}

function StructuredSlideCanvas({
  slide,
  totalSlides,
  formatLabel,
  surface,
  scale = 1,
  editMode = false,
  activeFieldKey = null,
  spellCheckEnabled = true,
  customDict,
  ignoredSpellWords,
  onChangeSlide,
  onRegisterEditable,
  onActivateEditable,
  onSyncFormats,
  onSpellErrorsChange,
  onOpenSpellMenu,
}: {
  slide: WpsSlide;
  totalSlides: number;
  formatLabel: string;
  surface: { bg: string; text: string; sub: string; border: string };
  scale?: number;
  editMode?: boolean;
  activeFieldKey?: string | null;
  spellCheckEnabled?: boolean;
  customDict?: Set<string>;
  ignoredSpellWords?: Set<string>;
  onChangeSlide?: (updater: (prev: WpsSlide) => WpsSlide) => void;
  onRegisterEditable?: (fieldKey: string, el: HTMLDivElement | null) => void;
  onActivateEditable?: (fieldKey: string, el: HTMLDivElement) => void;
  onSyncFormats?: () => void;
  onSpellErrorsChange?: (fieldKey: string, matches: SpellErrorMatch[]) => void;
  onOpenSpellMenu?: (
    menu: SpellContextMenuState,
    fieldKey: string,
    targetEl: HTMLDivElement,
  ) => void;
}) {
  const denseBullets = slide.bullets.length > 5;
  const emptySet = useMemo(() => new Set<string>(), []);
  const noopRegister = useCallback(() => {}, []);
  const noopActivate = useCallback(() => {}, []);
  const noopSync = useCallback(() => {}, []);
  const noopSpell = useCallback(() => {}, []);
  const noopMenu = useCallback(() => {}, []);

  const titleKey = `title:${slide.id}`;
  const subtitleKey = `subtitle:${slide.id}`;
  const bodyKey = `body:${slide.id}`;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '40px 52px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: surface.text,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#EA580C',
          }}
        >
          <span>{formatLabel} · ALX Office Presentation</span>
          <span className="font-mono tabular-nums">
            {slide.index} / {totalSlides}
          </span>
        </div>

        {/* Title */}
        {editMode && onChangeSlide ? (
          <div
            style={{
              marginBottom: slide.subtitle !== undefined ? '10px' : '18px',
              outline:
                activeFieldKey === titleKey
                  ? '2px solid #7C3AED'
                  : '1px dashed rgba(148, 163, 184, 0.55)',
              outlineOffset: '3px',
              borderRadius: '4px',
            }}
          >
            <RichEditableBox
              fieldKey={titleKey}
              html={structuredTitleToHtml(slide)}
              scale={scale}
              placeholder="Título de la diapositiva..."
              spellCheckEnabled={spellCheckEnabled}
              customDict={customDict || emptySet}
              ignoredSpellWords={ignoredSpellWords || emptySet}
              onRegisterElement={onRegisterEditable || noopRegister}
              onActivate={onActivateEditable || noopActivate}
              onSyncFormats={onSyncFormats || noopSync}
              onSpellErrorsChange={onSpellErrorsChange || noopSpell}
              onOpenSpellMenu={onOpenSpellMenu || noopMenu}
              onChangeHtml={(nextHtml) =>
                onChangeSlide((prev) => ({
                  ...prev,
                  titleHtml: nextHtml,
                  title: extractPlainTextFromHtml(nextHtml) || '',
                }))
              }
              style={{
                fontSize: slide.title.length > 68 ? '28px' : '34px',
                fontWeight: 700,
                lineHeight: 1.2,
                color: surface.text,
              }}
              className="font-display [&_p]:mb-0"
            />
          </div>
        ) : slide.titleHtml !== undefined ? (
          <div
            style={{
              fontSize: slide.title.length > 68 ? '28px' : '34px',
              fontWeight: 700,
              lineHeight: 1.2,
              marginBottom: slide.subtitle ? '10px' : '18px',
            }}
            className="wps-doc-canvas font-display [&_p]:mb-0"
            dangerouslySetInnerHTML={{ __html: slide.titleHtml }}
          />
        ) : (
          <h2
            style={{
              fontSize: slide.title.length > 68 ? '28px' : '34px',
              fontWeight: 700,
              lineHeight: 1.2,
              marginBottom: slide.subtitle ? '10px' : '18px',
            }}
            className="font-display"
          >
            {slide.title}
          </h2>
        )}

        {/* Subtitle */}
        {editMode && onChangeSlide
          ? slide.subtitle !== undefined && (
              <div
                style={{
                  marginBottom: '18px',
                  outline:
                    activeFieldKey === subtitleKey
                      ? '2px solid #7C3AED'
                      : '1px dashed rgba(148, 163, 184, 0.45)',
                  outlineOffset: '3px',
                  borderRadius: '4px',
                }}
              >
                <RichEditableBox
                  fieldKey={subtitleKey}
                  html={structuredSubtitleToHtml(slide)}
                  scale={scale}
                  placeholder="Subtítulo opcional..."
                  spellCheckEnabled={spellCheckEnabled}
                  customDict={customDict || emptySet}
                  ignoredSpellWords={ignoredSpellWords || emptySet}
                  onRegisterElement={onRegisterEditable || noopRegister}
                  onActivate={onActivateEditable || noopActivate}
                  onSyncFormats={onSyncFormats || noopSync}
                  onSpellErrorsChange={onSpellErrorsChange || noopSpell}
                  onOpenSpellMenu={onOpenSpellMenu || noopMenu}
                  onChangeHtml={(nextHtml) =>
                    onChangeSlide((prev) => ({
                      ...prev,
                      subtitleHtml: nextHtml,
                      subtitle: extractPlainTextFromHtml(nextHtml),
                    }))
                  }
                  style={{
                    fontSize: '18px',
                    lineHeight: 1.4,
                    color: surface.sub,
                  }}
                  className="[&_p]:mb-0"
                />
              </div>
            )
          : slide.subtitleHtml !== undefined && slide.subtitle ? (
              <div
                style={{
                  fontSize: '18px',
                  lineHeight: 1.4,
                  color: surface.sub,
                  marginBottom: '18px',
                }}
                className="wps-doc-canvas [&_p]:mb-0"
                dangerouslySetInnerHTML={{ __html: slide.subtitleHtml }}
              />
            ) : (
              slide.subtitle && (
                <p
                  style={{
                    fontSize: '18px',
                    lineHeight: 1.4,
                    color: surface.sub,
                    marginBottom: '18px',
                  }}
                >
                  {slide.subtitle}
                </p>
              )
            )}

        {/* Rich Body */}
        {editMode && onChangeSlide ? (
          <div
            style={{
              outline:
                activeFieldKey === bodyKey
                  ? '2px solid #7C3AED'
                  : '1px dashed rgba(148, 163, 184, 0.45)',
              outlineOffset: '3px',
              borderRadius: '4px',
            }}
            className="min-h-[120px] flex-1 overflow-y-auto overflow-x-hidden"
          >
            <RichEditableBox
              fieldKey={bodyKey}
              html={structuredBodyToHtml(slide)}
              scale={scale}
              placeholder="Escribe contenido, listas, tablas o casillas..."
              spellCheckEnabled={spellCheckEnabled}
              customDict={customDict || emptySet}
              ignoredSpellWords={ignoredSpellWords || emptySet}
              onRegisterElement={onRegisterEditable || noopRegister}
              onActivate={onActivateEditable || noopActivate}
              onSyncFormats={onSyncFormats || noopSync}
              onSpellErrorsChange={onSpellErrorsChange || noopSpell}
              onOpenSpellMenu={onOpenSpellMenu || noopMenu}
              onChangeHtml={(nextHtml) =>
                onChangeSlide((prev) => ({
                  ...prev,
                  bodyHtml: nextHtml,
                  bullets: extractLinesFromHtml(nextHtml),
                }))
              }
              style={{
                fontSize: denseBullets ? '16px' : '19px',
                lineHeight: 1.4,
                color: surface.text,
              }}
            />
          </div>
        ) : slide.bodyHtml !== undefined ? (
          <div
            style={{
              fontSize: denseBullets ? '16px' : '19px',
              lineHeight: 1.4,
              color: surface.text,
            }}
            className="wps-doc-canvas [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_ol]:mb-1.5 flex-1 overflow-hidden"
            dangerouslySetInnerHTML={{ __html: slide.bodyHtml }}
          />
        ) : (
          slide.bullets.length > 0 && (
            <ul
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: denseBullets ? '8px' : '12px',
                fontSize: denseBullets ? '16px' : '19px',
                lineHeight: 1.4,
              }}
            >
              {slide.bullets.slice(0, 8).map((b, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '9999px',
                      backgroundColor: '#EA580C',
                      flexShrink: 0,
                    }}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )
        )}

        {slide.table && (
          <div style={{ marginTop: '16px' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '15px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: `2px solid ${surface.border}` }}>
                  {slide.table.headers.map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px', fontWeight: 600 }}>
                      {editMode && onChangeSlide ? (
                        <input
                          type="text"
                          value={h}
                          onChange={(e) =>
                            onChangeSlide((prev) =>
                              prev.table
                                ? {
                                    ...prev,
                                    table: {
                                      ...prev.table,
                                      headers: prev.table.headers.map((hv, hi) =>
                                        hi === i ? e.target.value : hv,
                                      ),
                                    },
                                  }
                                : prev,
                            )
                          }
                          className="w-full rounded border border-dashed border-slate-400/40 bg-transparent px-1 font-semibold focus:border-[#7C3AED] focus:outline-none"
                        />
                      ) : (
                        h
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {slide.table.rows.map((row, rIdx) => (
                  <tr key={rIdx} style={{ borderBottom: `1px solid ${surface.border}` }}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ padding: '8px 12px' }}>
                        {editMode && onChangeSlide ? (
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) =>
                              onChangeSlide((prev) =>
                                prev.table
                                  ? {
                                      ...prev,
                                      table: {
                                        ...prev.table,
                                        rows: prev.table.rows.map((rw, ri) =>
                                          ri === rIdx
                                            ? rw.map((cv, ci) =>
                                                ci === cIdx ? e.target.value : cv,
                                              )
                                            : rw,
                                        ),
                                      },
                                    }
                                  : prev,
                              )
                            }
                            className="w-full rounded border border-dashed border-slate-400/40 bg-transparent px-1 focus:border-[#7C3AED] focus:outline-none"
                          />
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        style={{
          height: '3px',
          width: '64px',
          borderRadius: '9999px',
          backgroundColor: '#EA580C',
          opacity: 0.75,
          marginTop: '10px',
        }}
      />
    </div>
  );
}

export default function WpsPptViewer({
  document: doc,
  syncStatus = 'saved',
  onBack,
  onUpdateDocument,
}: WpsPptViewerProps) {
  const slides: WpsSlide[] = useMemo(() => {
    if (doc.slides && doc.slides.length > 0) return doc.slides;
    return [
      {
        id: 'empty-1',
        index: 1,
        title: doc.title,
        bullets: ['No se encontraron diapositivas legibles en esta presentación.'],
        notes: '',
      },
    ];
  }, [doc.slides, doc.title]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [viewMode, setViewMode] = useState<PptViewMode>('slide');
  const [slideTheme, setSlideTheme] = useState<SlideTheme>('light');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [exportingPptx, setExportingPptx] = useState(false);

  // Canva Bottom Studio Panels
  const [canvasPanel, setCanvasPanel] = useState<CanvaCanvasPanel>(null);
  const [elementPanel, setElementPanel] = useState<CanvaElementPanel>(null);
  const [copiedStyle, setCopiedStyle] = useState<CopiedElementStyle | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  const uploadImageInputRef = useRef<HTMLInputElement | null>(null);
  const bgImageInputRef = useRef<HTMLInputElement | null>(null);

  const [activeFormats, setActiveFormats] = useState<WordActiveFormats>({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    unorderedList: false,
    orderedList: false,
  });

  // Editable DOM tracking & selection range persistence
  const editableMapRef = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const activeFieldKeyRef = useRef<string | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // Spellcheck state
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [ignoredSpellWords, setIgnoredSpellWords] = useState<Set<string>>(() => new Set());
  const [customDict, setCustomDict] = useState<Set<string>>(() => loadCustomDictionary());
  const [spellErrorsByField, setSpellErrorsByField] = useState<
    Record<string, SpellErrorMatch[]>
  >({});
  const [spellMenu, setSpellMenu] = useState<PptSpellMenuState | null>(null);

  const activeSlide = slides[currentIdx] ?? slides[0];
  const hasExplicitRichLayout = Boolean(
    activeSlide.elements && activeSlide.elements.length > 0,
  );

  const selectedElement = useMemo(() => {
    if (!selectedElementId || !activeSlide.elements) return null;
    return activeSlide.elements.find((e) => e.id === selectedElementId) ?? null;
  }, [activeSlide.elements, selectedElementId]);

  const history = useDocumentHistory<PptHistorySnapshot>(
    { slides, title: doc.title },
    doc.id,
    {
      equals: (a, b) => a.title === b.title && a.slides === b.slides,
    },
  );

  useEffect(() => {
    history.syncExternal({ slides, title: doc.title });
  }, [slides, doc.title, history]);

  const commitSlides = useCallback(
    (nextSlides: WpsSlide[], immediate = false) => {
      if (!onUpdateDocument) return;
      const reindexed = nextSlides.map((s, idx) => ({ ...s, index: idx + 1 }));
      const snapshot: PptHistorySnapshot = {
        slides: reindexed,
        title: doc.title,
      };
      if (immediate) {
        history.pushImmediate(snapshot);
      } else {
        history.recordDebounced(snapshot);
      }
      onUpdateDocument({
        slides: reindexed,
        updatedAt: 'Ahora mismo',
      });
    },
    [doc.title, history, onUpdateDocument],
  );

  const updateActiveSlide = useCallback(
    (updater: (prev: WpsSlide) => WpsSlide, immediate = false) => {
      const next = slides.map((s, idx) => (idx === currentIdx ? updater(s) : s));
      commitSlides(next, immediate);
    },
    [slides, currentIdx, commitSlides],
  );

  const ensureRichCanvasSlide = useCallback(
    (slide: WpsSlide): WpsSlide => promoteSlideToRichElements(slide, slideTheme),
    [slideTheme],
  );

  const updateSelectedElement = useCallback(
    (patch: Partial<WpsSlideElement>, immediate = true) => {
      if (!selectedElementId) return;
      updateActiveSlide(
        (prev) => ({
          ...prev,
          elements: prev.elements?.map((item) =>
            item.id === selectedElementId ? ({ ...item, ...patch } as WpsSlideElement) : item,
          ),
        }),
        immediate,
      );
    },
    [selectedElementId, updateActiveSlide],
  );

  const applyHistorySnapshot = useCallback(
    (snapshot: PptHistorySnapshot | null) => {
      if (!snapshot || !onUpdateDocument) return;
      setSpellMenu(null);
      savedRangeRef.current = null;
      setCurrentIdx((i) => Math.max(0, Math.min(snapshot.slides.length - 1, i)));
      onUpdateDocument({
        slides: snapshot.slides,
        title: snapshot.title,
        updatedAt: 'Ahora mismo',
      });
    },
    [onUpdateDocument],
  );

  const handleUndo = useCallback(() => {
    const prev = history.undo();
    applyHistorySnapshot(prev);
  }, [applyHistorySnapshot, history]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    applyHistorySnapshot(next);
  }, [applyHistorySnapshot, history]);

  const handleRegisterEditable = useCallback(
    (fieldKey: string, el: HTMLDivElement | null) => {
      if (el) {
        editableMapRef.current[fieldKey] = el;
      } else {
        delete editableMapRef.current[fieldKey];
      }
    },
    [],
  );

  const syncFormatState = useCallback(() => {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const anchor = sel.anchorNode;
        const activeEl = activeFieldKeyRef.current
          ? editableMapRef.current[activeFieldKeyRef.current]
          : null;
        if (activeEl && anchor && activeEl.contains(anchor)) {
          const range = sel.getRangeAt(0);
          if (isRangeInsideElement(range, activeEl)) {
            savedRangeRef.current = range.cloneRange();
          }
        }
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
      // Ignore queryCommandState errors
    }
  }, []);

  const handleActivateEditable = useCallback(
    (fieldKey: string, el: HTMLDivElement) => {
      activeFieldKeyRef.current = fieldKey;
      setActiveFieldKey(fieldKey);
      editableMapRef.current[fieldKey] = el;
      syncFormatState();
    },
    [syncFormatState],
  );

  const getPreferredEditableElement = useCallback((): {
    key: string;
    el: HTMLDivElement;
  } | null => {
    if (selectedElementId && activeSlide.elements) {
      const selKey = `el:${activeSlide.id}:${selectedElementId}`;
      const selEl = editableMapRef.current[selKey];
      if (selEl && selEl.isConnected) {
        return { key: selKey, el: selEl };
      }
    }
    if (activeFieldKeyRef.current) {
      const existing = editableMapRef.current[activeFieldKeyRef.current];
      if (existing && existing.isConnected) {
        return { key: activeFieldKeyRef.current, el: existing };
      }
    }
    const candidates = hasExplicitRichLayout
      ? (activeSlide.elements || [])
          .filter((e): e is Extract<WpsSlideElement, { type: 'text' }> => e.type === 'text')
          .map((e) => `el:${activeSlide.id}:${e.id}`)
      : [`body:${activeSlide.id}`, `title:${activeSlide.id}`, `subtitle:${activeSlide.id}`];

    for (const key of candidates) {
      const candidateEl = editableMapRef.current[key];
      if (candidateEl && candidateEl.isConnected) {
        return { key, el: candidateEl };
      }
    }
    return null;
  }, [activeSlide, hasExplicitRichLayout, selectedElementId]);

  const runWordCommand = (command: string, value?: string) => {
    if (command === 'undo') {
      handleUndo();
      return;
    }
    if (command === 'redo') {
      handleRedo();
      return;
    }
    const target = getPreferredEditableElement();
    if (!target) return;
    const { key, el } = target;
    activeFieldKeyRef.current = key;
    setActiveFieldKey(key);

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
    el.dispatchEvent(new Event('input', { bubbles: true }));
    history.commitPending();
    syncFormatState();
  };

  // Spellcheck handlers
  const handleSpellErrorsChange = useCallback(
    (fieldKey: string, matches: SpellErrorMatch[]) => {
      setSpellErrorsByField((prev) => {
        const existing = prev[fieldKey] || [];
        if (
          existing.length === matches.length &&
          existing.every((m, idx) => m.id === matches[idx]?.id)
        ) {
          return prev;
        }
        return { ...prev, [fieldKey]: matches };
      });
    },
    [],
  );

  const flattenedSpellErrors = useMemo(() => {
    const out: { fieldKey: string; match: SpellErrorMatch }[] = [];
    for (const [fieldKey, matches] of Object.entries(spellErrorsByField)) {
      if (!editableMapRef.current[fieldKey]?.isConnected) continue;
      for (const match of matches) {
        out.push({ fieldKey, match });
      }
    }
    return out;
  }, [spellErrorsByField]);

  const handleJumpToNextSpellError = () => {
    if (!spellCheckEnabled) {
      setSpellCheckEnabled(true);
      return;
    }
    if (flattenedSpellErrors.length === 0) return;
    const first = flattenedSpellErrors[0];
    const targetEl = editableMapRef.current[first.fieldKey];
    if (!targetEl || !first.match.range.startContainer.isConnected) return;

    const parentEl = first.match.range.startContainer.parentElement;
    parentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rect = first.match.range.getBoundingClientRect();
    setSpellMenu({
      menu: {
        errorId: first.match.id,
        word: first.match.word,
        suggestions: getSpellingSuggestions(first.match.word, 5),
        x: rect.left,
        y: rect.bottom + 6,
        range: first.match.range,
      },
      fieldKey: first.fieldKey,
      targetEl,
    });
  };

  const handleSelectSpellSuggestion = (
    menu: SpellContextMenuState,
    replacement: string,
  ) => {
    if (!spellMenu) return;
    const targetEl = spellMenu.targetEl;
    setSpellMenu(null);
    if (!menu.range.startContainer.isConnected || !targetEl) return;

    try {
      runCommandWithoutKeyboardPopup(targetEl, menu.range, () => {
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
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      history.commitPending();
      syncFormatState();
    } catch {
      // Ignore stale range errors
    }
  };

  const handleIgnoreSpellWord = (word: string) => {
    const clean = word.trim().toLowerCase();
    setIgnoredSpellWords((prev) => {
      const next = new Set(prev);
      next.add(clean);
      return next;
    });
    setSpellMenu(null);
  };

  const handleAddWordToDictionary = (word: string) => {
    const clean = word.trim().toLowerCase();
    setCustomDict((prev) => {
      const next = new Set(prev);
      next.add(clean);
      saveCustomDictionary(next);
      return next;
    });
    setSpellMenu(null);
  };

  const handleAddComment = (rawText: string) => {
    if (!onUpdateDocument) return;
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
    if (!onUpdateDocument) return;
    onUpdateDocument({
      comments: doc.comments.map((c) =>
        c.id === id ? { ...c, resolved: !c.resolved } : c,
      ),
    });
  };

  const deleteComment = (id: string) => {
    if (!onUpdateDocument) return;
    onUpdateDocument({
      comments: doc.comments.filter((c) => c.id !== id),
    });
  };

  // Slide CRUD
  const handleAddSlide = () => {
    const newSlide: WpsSlide = {
      id: `s-${Date.now()}`,
      index: slides.length + 1,
      title: `Diapositiva ${slides.length + 1}`,
      backgroundColor: '#FFFFFF',
      bullets: [],
      notes: '',
      elements: [
        {
          id: `tb-${Date.now()}-1`,
          type: 'text',
          isTitle: true,
          xPct: 8,
          yPct: 14,
          wPct: 84,
          hPct: 18,
          fontSizePt: 30,
          richHtml: `<p><strong>Diapositiva ${slides.length + 1}</strong></p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: `Diapositiva ${slides.length + 1}`, bold: true, fontSizePt: 30, color: '#0F172A' }],
            },
          ],
          zIndex: 1,
        },
        {
          id: `tb-${Date.now()}-2`,
          type: 'text',
          xPct: 8,
          yPct: 36,
          wPct: 84,
          hPct: 32,
          fontSizePt: 16,
          richHtml: '<p>Toca dos veces para editar texto o usa el menú inferior para añadir formas, gráficos e imágenes.</p>',
          paragraphs: [
            {
              align: 'left',
              runs: [
                {
                  text: 'Toca dos veces para editar texto o usa el menú inferior para añadir formas, gráficos e imágenes.',
                  fontSizePt: 16,
                  color: '#475569',
                },
              ],
            },
          ],
          zIndex: 2,
        },
      ],
    };
    const next = [
      ...slides.slice(0, currentIdx + 1),
      newSlide,
      ...slides.slice(currentIdx + 1),
    ];
    commitSlides(next, true);
    setCurrentIdx(currentIdx + 1);
    setSelectedElementId(null);
    setEditingTextId(null);
    activeFieldKeyRef.current = null;
    setActiveFieldKey(null);
  };

  const handleDuplicateSlide = () => {
    const copy: WpsSlide = {
      ...activeSlide,
      id: `s-${Date.now()}`,
      title: `${activeSlide.title} (Copia)`,
      bullets: [...activeSlide.bullets],
      elements: activeSlide.elements
        ? (JSON.parse(JSON.stringify(activeSlide.elements)) as WpsSlideElement[]).map(
            (el) => ({ ...el, id: `${el.id}-c` }),
          )
        : undefined,
    };
    const next = [
      ...slides.slice(0, currentIdx + 1),
      copy,
      ...slides.slice(currentIdx + 1),
    ];
    commitSlides(next, true);
    setCurrentIdx(currentIdx + 1);
  };

  const handleDeleteSlide = () => {
    if (slides.length <= 1) return;
    const next = slides.filter((_, idx) => idx !== currentIdx);
    commitSlides(next, true);
    setCurrentIdx((i) => Math.max(0, Math.min(next.length - 1, i)));
    setSelectedElementId(null);
    setEditingTextId(null);
    activeFieldKeyRef.current = null;
    setActiveFieldKey(null);
  };

  const handleMoveSlide = (dir: -1 | 1) => {
    const target = currentIdx + dir;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    const [moved] = next.splice(currentIdx, 1);
    next.splice(target, 0, moved);
    commitSlides(next, true);
    setCurrentIdx(target);
  };

  // Canva Element Creators (auto-promote structured slides into rich canvas)
  const insertCanvasElement = useCallback(
    (factory: (nextZ: number) => WpsSlideElement) => {
      let createdId = '';
      updateActiveSlide((prev) => {
        const promoted = ensureRichCanvasSlide(prev);
        const maxZ = (promoted.elements || []).reduce(
          (m, e) => Math.max(m, e.zIndex),
          0,
        );
        const newEl = factory(maxZ + 1);
        createdId = newEl.id;
        return {
          ...promoted,
          elements: [...(promoted.elements || []), newEl],
        };
      }, true);
      if (createdId) {
        setSelectedElementId(createdId);
        setEditingTextId(null);
        setCanvasPanel(null);
        setElementPanel(null);
      }
    },
    [ensureRichCanvasSlide, updateActiveSlide],
  );

  const handleAddTextPreset = (presetId: string) => {
    const preset =
      CANVA_TEXT_PRESETS.find((p) => p.id === presetId) ?? CANVA_TEXT_PRESETS[0];
    insertCanvasElement((zIndex) => ({
      id: `tx-${Date.now()}`,
      type: 'text',
      isTitle: preset.isTitle,
      xPct: Math.round((100 - preset.wPct) / 2),
      yPct: 36,
      wPct: preset.wPct,
      hPct: preset.hPct,
      fillColor: preset.fillColor,
      borderRadiusPx: preset.borderRadiusPx,
      fontFamily: preset.fontFamily,
      fontSizePt: preset.fontSizePt,
      richHtml: preset.bold
        ? `<p><strong>${escapeHtml(preset.sampleText)}</strong></p>`
        : `<p>${escapeHtml(preset.sampleText)}</p>`,
      paragraphs: [
        {
          align: preset.fillColor ? 'center' : 'left',
          runs: [
            {
              text: preset.sampleText,
              fontSizePt: preset.fontSizePt,
              color: preset.color,
              bold: preset.bold,
            },
          ],
        },
      ],
      zIndex,
    }));
  };

  const handleAddShape = (kind: WpsShapeKind, defaultFill: string) => {
    const isLine = kind === 'line';
    insertCanvasElement((zIndex) => ({
      id: `sh-${Date.now()}`,
      type: 'shape',
      shapeKind: kind,
      xPct: isLine ? 20 : 38,
      yPct: isLine ? 48 : 34,
      wPct: isLine ? 60 : 22,
      hPct: isLine ? 6 : 30,
      fillColor: defaultFill,
      borderRadiusPx: kind === 'roundRect' ? 14 : undefined,
      zIndex,
    }));
  };

  const handleAddChart = (chartKind: WpsChartKind) => {
    insertCanvasElement((zIndex) => ({
      id: `ch-${Date.now()}`,
      type: 'chart',
      chartKind,
      xPct: 16,
      yPct: 24,
      wPct: 68,
      hPct: 54,
      title:
        chartKind === 'donut'
          ? 'Distribución (%)'
          : chartKind === 'line'
            ? 'Tendencia mensual'
            : 'Comparativa de resultados',
      borderRadiusPx: 12,
      shadow: 'soft',
      series: [
        {
          name: '2026',
          points: [
            { label: 'Q1', value: 35 },
            { label: 'Q2', value: 52 },
            { label: 'Q3', value: 78 },
            { label: 'Q4', value: 94 },
          ],
        },
      ],
      zIndex,
    }));
  };

  const handleAddRichTable = () => {
    insertCanvasElement((zIndex) => ({
      id: `tb-${Date.now()}`,
      type: 'table',
      xPct: 14,
      yPct: 28,
      wPct: 72,
      hPct: 44,
      headerBgColor: '#0F172A',
      headerTextColor: '#FFFFFF',
      borderRadiusPx: 10,
      headers: ['Concepto', 'Objetivo', 'Actual'],
      rows: [
        ['Conversión', '35%', '42%'],
        ['Retención', '80%', '88%'],
      ],
      zIndex,
    }));
  };

  const handleAddDiagram = () => {
    insertCanvasElement((zIndex) => ({
      id: `dg-${Date.now()}`,
      type: 'diagram',
      xPct: 12,
      yPct: 32,
      wPct: 76,
      hPct: 36,
      borderRadiusPx: 12,
      items: ['1. Idea', '2. Diseño', '3. Validación', '4. Lanzamiento'],
      zIndex,
    }));
  };

  const handleUploadCanvasImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const src = reader.result;
        insertCanvasElement((zIndex) => ({
          id: `img-${Date.now()}`,
          type: 'image',
          src,
          alt: file.name,
          xPct: 26,
          yPct: 22,
          wPct: 46,
          hPct: 52,
          imageFit: 'contain',
          borderRadiusPx: 8,
          zIndex,
        }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadBackgroundImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const src = reader.result;
        updateActiveSlide((prev) => {
          const promoted = ensureRichCanvasSlide(prev);
          return {
            ...promoted,
            backgroundImage: src,
            backgroundGradient: undefined,
          };
        }, true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Element Actions
  const handleDuplicateElement = useCallback(
    (id: string) => {
      let dupId = '';
      updateActiveSlide((prev) => {
        const list = prev.elements || [];
        const srcEl = list.find((e) => e.id === id);
        if (!srcEl) return prev;
        const maxZ = list.reduce((m, e) => Math.max(m, e.zIndex), 0);
        const clone = JSON.parse(JSON.stringify(srcEl)) as WpsSlideElement;
        dupId = `${srcEl.type}-${Date.now()}`;
        clone.id = dupId;
        clone.xPct = Math.min(82, clone.xPct + 4);
        clone.yPct = Math.min(82, clone.yPct + 4);
        clone.zIndex = maxZ + 1;
        if ('locked' in clone) clone.locked = false;
        return { ...prev, elements: [...list, clone] };
      }, true);
      if (dupId) {
        setSelectedElementId(dupId);
        setEditingTextId(null);
      }
    },
    [updateActiveSlide],
  );

  const handleDeleteElement = useCallback(
    (id: string) => {
      updateActiveSlide(
        (prev) => ({
          ...prev,
          elements: prev.elements?.filter((e) => e.id !== id),
        }),
        true,
      );
      setSelectedElementId((prev) => (prev === id ? null : prev));
      setEditingTextId((prev) => (prev === id ? null : prev));
      setElementPanel(null);
    },
    [updateActiveSlide],
  );

  const handleReorderLayer = useCallback(
    (id: string, dir: 'forward' | 'backward' | 'front' | 'back') => {
      updateActiveSlide((prev) => {
        const list = [...(prev.elements || [])].sort((a, b) => a.zIndex - b.zIndex);
        const idx = list.findIndex((e) => e.id === id);
        if (idx === -1) return prev;
        const [item] = list.splice(idx, 1);
        if (dir === 'front') list.push(item);
        else if (dir === 'back') list.unshift(item);
        else if (dir === 'forward') list.splice(Math.min(list.length, idx + 1), 0, item);
        else list.splice(Math.max(0, idx - 1), 0, item);
        return {
          ...prev,
          elements: list.map((el, i) => ({ ...el, zIndex: i + 1 })),
        };
      }, true);
    },
    [updateActiveSlide],
  );

  const handleCopyElementStyle = useCallback(
    (id: string) => {
      const el = activeSlide.elements?.find((e) => e.id === id);
      if (!el) return;
      const style: CopiedElementStyle = {
        opacity: el.opacity,
        shadow: el.shadow,
        borderRadiusPx: 'borderRadiusPx' in el ? el.borderRadiusPx : undefined,
        borderColor: 'borderColor' in el ? el.borderColor : undefined,
        borderWidthPx: 'borderWidthPx' in el ? el.borderWidthPx : undefined,
        borderStyle: 'borderStyle' in el ? el.borderStyle : undefined,
        fillColor: 'fillColor' in el ? el.fillColor : undefined,
        fillGradient: el.type === 'shape' ? el.fillGradient : undefined,
      };
      if (el.type === 'text') {
        style.fontFamily = el.fontFamily;
        style.fontSizePt = el.fontSizePt || el.paragraphs[0]?.runs[0]?.fontSizePt;
        style.letterSpacingEm = el.letterSpacingEm;
        style.lineHeight = el.lineHeight;
        style.textTransform = el.textTransform;
        style.textEffect = el.textEffect;
        style.effectColor = el.effectColor;
        style.color = el.paragraphs[0]?.runs[0]?.color;
      }
      setCopiedStyle(style);
    },
    [activeSlide.elements],
  );

  const handlePasteElementStyle = useCallback(
    (id: string) => {
      if (!copiedStyle) return;
      updateActiveSlide((prev) => ({
        ...prev,
        elements: prev.elements?.map((el): WpsSlideElement => {
          if (el.id !== id) return el;
          const opacity = copiedStyle.opacity ?? el.opacity;
          const shadow = copiedStyle.shadow ?? el.shadow;
          if (el.type === 'text') {
            return {
              ...el,
              opacity,
              shadow,
              fillColor: copiedStyle.fillColor ?? el.fillColor,
              borderColor: copiedStyle.borderColor ?? el.borderColor,
              borderWidthPx: copiedStyle.borderWidthPx ?? el.borderWidthPx,
              borderRadiusPx: copiedStyle.borderRadiusPx ?? el.borderRadiusPx,
              fontFamily: copiedStyle.fontFamily ?? el.fontFamily,
              fontSizePt: copiedStyle.fontSizePt ?? el.fontSizePt,
              letterSpacingEm: copiedStyle.letterSpacingEm ?? el.letterSpacingEm,
              lineHeight: copiedStyle.lineHeight ?? el.lineHeight,
              textTransform: copiedStyle.textTransform ?? el.textTransform,
              textEffect: copiedStyle.textEffect ?? el.textEffect,
              effectColor: copiedStyle.effectColor ?? el.effectColor,
              paragraphs: copiedStyle.color
                ? el.paragraphs.map((p) => ({
                    ...p,
                    runs: p.runs.map((r) => ({ ...r, color: copiedStyle.color })),
                  }))
                : el.paragraphs,
            };
          }
          if (el.type === 'shape') {
            return {
              ...el,
              opacity,
              shadow,
              fillColor: copiedStyle.fillColor ?? el.fillColor,
              fillGradient: copiedStyle.fillGradient ?? el.fillGradient,
              borderColor: copiedStyle.borderColor ?? el.borderColor,
              borderWidthPx: copiedStyle.borderWidthPx ?? el.borderWidthPx,
              borderStyle: copiedStyle.borderStyle ?? el.borderStyle,
              borderRadiusPx: copiedStyle.borderRadiusPx ?? el.borderRadiusPx,
            };
          }
          if (el.type === 'image') {
            return {
              ...el,
              opacity,
              shadow,
              borderColor: copiedStyle.borderColor ?? el.borderColor,
              borderWidthPx: copiedStyle.borderWidthPx ?? el.borderWidthPx,
              borderRadiusPx: copiedStyle.borderRadiusPx ?? el.borderRadiusPx,
            };
          }
          return { ...el, opacity, shadow };
        }),
      }), true);
      setCopiedStyle(null);
    },
    [copiedStyle, updateActiveSlide],
  );

  // Align selected element relative to slide canvas
  const alignElementOnCanvas = (mode: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => {
    if (!selectedElement) return;
    const patch: Partial<WpsSlideElement> = {};
    if (mode === 'left') patch.xPct = 5;
    if (mode === 'centerH') patch.xPct = Math.round(((100 - selectedElement.wPct) / 2) * 10) / 10;
    if (mode === 'right') patch.xPct = Math.round((95 - selectedElement.wPct) * 10) / 10;
    if (mode === 'top') patch.yPct = 6;
    if (mode === 'centerV') patch.yPct = Math.round(((100 - selectedElement.hPct) / 2) * 10) / 10;
    if (mode === 'bottom') patch.yPct = Math.round((94 - selectedElement.hPct) * 10) / 10;
    updateSelectedElement(patch, true);
  };

  // Reset active editable key & selection when changing slide
  useEffect(() => {
    setSpellMenu(null);
    setSpellErrorsByField({});
    setSelectedElementId(null);
    setEditingTextId(null);
    setElementPanel(null);
    activeFieldKeyRef.current = null;
    setActiveFieldKey(null);
    savedRangeRef.current = null;
  }, [currentIdx]);

  // Clear element panel if selection clears
  useEffect(() => {
    if (!selectedElementId) {
      setElementPanel(null);
      setEditingTextId(null);
    }
  }, [selectedElementId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      if (
        e.key === 'ArrowRight' ||
        e.key === 'PageDown' ||
        (presentationMode && e.key === ' ')
      ) {
        e.preventDefault();
        setCurrentIdx((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Escape' && presentationMode) {
        setPresentationMode(false);
      } else if (
        editMode &&
        selectedElementId &&
        !editingTextId &&
        (e.key === 'Delete' || e.key === 'Backspace')
      ) {
        e.preventDefault();
        handleDeleteElement(selectedElementId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [slides.length, presentationMode, editMode, selectedElementId, editingTextId, handleDeleteElement]);

  const matchingSlides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return slides.filter((s) => {
      const elementText = (s.elements || [])
        .map((el) =>
          el.type === 'text'
            ? el.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ')
            : '',
        )
        .join(' ')
        .toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.subtitle || '').toLowerCase().includes(q) ||
        s.bullets.some((b) => b.toLowerCase().includes(q)) ||
        s.notes.toLowerCase().includes(q) ||
        elementText.includes(q)
      );
    });
  }, [slides, searchQuery]);

  const handleExportPptx = async () => {
    if (exportingPptx) return;
    setExportingPptx(true);
    try {
      const bytes = await exportDocumentToPptxBytes({ ...doc, slides });
      const bufferCopy = new Uint8Array(bytes).buffer;
      const blob = new Blob([bufferCopy], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${doc.title.replace(/[^\w\dáéíóúñÁÉÍÓÚÑ\-_ ]+/g, '').trim() || 'presentacion'}.pptx`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      setExportingPptx(false);
    }
  };

  const exportSlidesHtml = () => {
    const body = slides
      .map((s) => {
        if (s.elements && s.elements.length > 0) {
          const elementsHtml = [...s.elements]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((el) => {
              if (el.type === 'text') return slideTextElementToHtml(el);
              if (el.type === 'image') {
                return `<p><img src="${el.src}" alt="${escapeHtml(el.alt || 'Imagen')}" style="max-width:100%;height:auto;" /></p>`;
              }
              if (el.type === 'table') {
                const ths = el.headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(h)}</th>`).join('');
                const trs = el.rows
                  .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(c)}</td>`).join('')}</tr>`)
                  .join('');
                return `<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
              }
              if (el.type === 'diagram') {
                return `<p>${el.items.map((item) => escapeHtml(item)).join(' · ')}</p>`;
              }
              if (el.type === 'chart') {
                const pts = el.series[0]?.points.map((p) => `${escapeHtml(p.label)}: ${p.value}`).join(' | ') || '';
                return `<p><strong>${escapeHtml(el.title || 'Gráfico')}</strong>${pts ? ` — ${pts}` : ''}</p>`;
              }
              return '';
            })
            .join('');
          return `<section style="border:1px solid #cbd5e1;border-radius:12px;padding:32px;margin-bottom:24px;">
              <div style="font-size:12px;color:#ea580c;font-weight:bold;">Diapositiva ${s.index}</div>
              ${elementsHtml}
              ${s.notes ? `<p style="color:#64748b;font-size:13px;"><strong>Notas:</strong> ${escapeHtml(s.notes)}</p>` : ''}
            </section>`;
        }

        const titlePart =
          s.titleHtml !== undefined ? s.titleHtml : `<h2>${escapeHtml(s.title)}</h2>`;
        const subtitlePart =
          s.subtitleHtml !== undefined && s.subtitle
            ? s.subtitleHtml
            : s.subtitle
              ? `<p>${escapeHtml(s.subtitle)}</p>`
              : '';
        const bodyPart =
          s.bodyHtml !== undefined
            ? s.bodyHtml
            : `<ul>${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
        const tablePart = s.table
          ? `<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr>${s.table.headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
          : '';
        return `<section style="border:1px solid #cbd5e1;border-radius:12px;padding:32px;margin-bottom:24px;">
            <div style="font-size:12px;color:#ea580c;font-weight:bold;">Diapositiva ${s.index}</div>
            ${titlePart}
            ${subtitlePart}
            ${bodyPart}
            ${tablePart}
            ${s.notes ? `<p style="color:#64748b;font-size:13px;"><strong>Notas:</strong> ${escapeHtml(s.notes)}</p>` : ''}
          </section>`;
      })
      .join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head><body style="font-family:Arial,sans-serif;max-width:900px;margin:40px auto;"><h1>${escapeHtml(doc.title)}</h1>${body}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^\w\dáéíóúñÁÉÍÓÚÑ\-_ ]+/g, '').trim() || 'presentacion'}.html`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  if (presentationMode) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black text-white"
        onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (touchStartX === null) return;
          const endX = e.changedTouches[0]?.clientX ?? touchStartX;
          const delta = endX - touchStartX;
          if (delta < -48) {
            setCurrentIdx((i) => Math.min(slides.length - 1, i + 1));
          } else if (delta > 48) {
            setCurrentIdx((i) => Math.max(0, i - 1));
          }
          setTouchStartX(null);
        }}
      >
        <div className="relative flex-1 p-3 sm:p-6">
          <SlideStage
            slide={activeSlide}
            totalSlides={slides.length}
            formatLabel={doc.format}
            theme={slideTheme}
            fitHeight
          />
          <button
            type="button"
            aria-label="Diapositiva anterior"
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="absolute inset-y-0 left-0 w-1/5 cursor-w-resize focus:outline-none"
          />
          <button
            type="button"
            aria-label="Diapositiva siguiente"
            onClick={() => setCurrentIdx((i) => Math.min(slides.length - 1, i + 1))}
            className="absolute inset-y-0 right-0 w-1/5 cursor-e-resize focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-zinc-950/90 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentIdx <= 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="px-2 font-mono text-xs tabular-nums text-zinc-300">
              {currentIdx + 1} / {slides.length}
            </span>
            <button
              type="button"
              disabled={currentIdx >= slides.length - 1}
              onClick={() => setCurrentIdx((i) => Math.min(slides.length - 1, i + 1))}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPresentationMode(false)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#7C3AED] px-4 text-xs font-semibold text-white hover:bg-[#6D28D9]"
          >
            <Minimize2 className="h-4 w-4" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    );
  }

  // Contextual bottom dock tabs for selected element vs empty canvas
  const elementToolTabs: { id: NonNullable<CanvaElementPanel>; label: string; icon: typeof Type }[] =
    selectedElement?.type === 'text'
      ? [
          { id: 'font', label: 'Fuente', icon: Type },
          { id: 'size', label: 'Tamaño', icon: Sliders },
          { id: 'color', label: 'Color', icon: Palette },
          { id: 'format', label: 'Formato', icon: Bold },
          { id: 'spacing', label: 'Espaciado', icon: AlignLeft },
          { id: 'effects', label: 'Efectos', icon: Sparkles },
          { id: 'border', label: 'Borde', icon: Shapes },
          { id: 'opacity', label: 'Opacidad', icon: Sliders },
          { id: 'position', label: 'Posición', icon: Move },
        ]
      : selectedElement?.type === 'shape'
        ? [
            { id: 'color', label: 'Relleno', icon: Palette },
            { id: 'border', label: 'Borde', icon: Shapes },
            { id: 'effects', label: 'Sombra', icon: Sparkles },
            { id: 'opacity', label: 'Opacidad', icon: Sliders },
            { id: 'position', label: 'Posición', icon: Move },
          ]
        : selectedElement?.type === 'image'
          ? [
              { id: 'filters', label: 'Filtros', icon: Sparkles },
              { id: 'border', label: 'Borde', icon: Shapes },
              { id: 'opacity', label: 'Opacidad', icon: Sliders },
              { id: 'position', label: 'Posición', icon: Move },
            ]
          : selectedElement?.type === 'chart' ||
              selectedElement?.type === 'table' ||
              selectedElement?.type === 'diagram'
            ? [
                { id: 'data', label: 'Editar datos', icon: BarChart3 },
                { id: 'color', label: 'Colores', icon: Palette },
                { id: 'border', label: 'Borde', icon: Shapes },
                { id: 'opacity', label: 'Opacidad', icon: Sliders },
                { id: 'position', label: 'Posición', icon: Move },
              ]
            : [];

  const sortedLayers = [...(activeSlide.elements || [])].sort(
    (a, b) => b.zIndex - a.zIndex,
  );

  return (
    <div className="wps-print-root flex min-h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <input
        ref={uploadImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadCanvasImage}
        className="hidden"
      />
      <input
        ref={bgImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadBackgroundImage}
        className="hidden"
      />

      {/* Compact Sticky Top Bar (52px) */}
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
          <div className="min-w-0 flex-1">
            {onUpdateDocument ? (
              <input
                type="text"
                value={doc.title}
                onChange={(e) =>
                  onUpdateDocument({
                    title: e.target.value,
                    updatedAt: 'Ahora mismo',
                  })
                }
                aria-label="Título de la presentación"
                className="w-full min-w-[60px] truncate rounded-lg bg-transparent px-1.5 py-0.5 font-display text-sm font-semibold text-slate-900 focus:bg-slate-100 focus:outline-none dark:text-slate-100 dark:focus:bg-slate-800"
              />
            ) : (
              <div className="truncate font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {doc.title}
              </div>
            )}
            <div className="flex items-center gap-2 px-1.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span>
                {doc.format} · {currentIdx + 1}/{slides.length}
              </span>
              {onUpdateDocument && (
                <span
                  role="status"
                  aria-live="polite"
                  className="hidden items-center gap-1 font-sans sm:inline-flex"
                >
                  {syncStatus === 'saving' ? (
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
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {onUpdateDocument && (editMode || history.canUndo || history.canRedo) && (
            <>
              <button
                type="button"
                disabled={!history.canUndo}
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
                disabled={!history.canRedo}
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

          {editMode && onUpdateDocument && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleJumpToNextSpellError}
              title={
                spellCheckEnabled
                  ? flattenedSpellErrors.length > 0
                    ? `${flattenedSpellErrors.length} error(es) ortográfico(s)`
                    : 'Sin errores ortográficos'
                  : 'Activar corrector ortográfico'
              }
              aria-label="Revisar ortografía"
              className={`hidden sm:inline-flex min-h-[40px] items-center gap-1 rounded-xl px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                !spellCheckEnabled
                  ? 'text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800'
                  : flattenedSpellErrors.length > 0
                    ? 'bg-red-50 text-[#EA3D2F] hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400'
                    : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400'
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

          {onUpdateDocument && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!editMode && viewMode === 'reading') {
                  setViewMode('slide');
                }
                if (editMode) {
                  history.commitPending();
                  hideSoftKeyboard();
                  setCanvasPanel(null);
                  setElementPanel(null);
                }
                setSpellMenu(null);
                setSelectedElementId(null);
                setEditingTextId(null);
                setEditMode((v) => !v);
              }}
              aria-label={editMode ? 'Finalizar edición' : 'Editar diapositivas estilo Canva'}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                editMode
                  ? 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {editMode ? (
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
          )}

          <button
            type="button"
            onClick={() => setGridOpen(true)}
            aria-label="Cuadrícula de diapositivas"
            className="hidden min-h-[44px] min-w-[40px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 sm:flex dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Buscar en diapositivas"
            className={`flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xl ${
              searchOpen
                ? 'bg-violet-50 text-[#7C3AED] dark:bg-violet-950/50 dark:text-violet-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={exportingPptx}
            onClick={() => void handleExportPptx()}
            title="Descargar archivo PowerPoint (.pptx)"
            aria-label="Exportar PPTX"
            className="hidden min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 md:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-[#EA580C]" />
            <span>{exportingPptx ? 'Exportando...' : 'PPTX'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditMode(false);
              setCanvasPanel(null);
              setElementPanel(null);
              setPresentationMode(true);
            }}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#EA580C] px-3 text-xs font-semibold text-white hover:bg-[#D44D06]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Presentar</span>
          </button>
        </div>
      </header>

      {/* Compact In-Place Slide Management Strip */}
      {editMode && onUpdateDocument && (
        <div className="no-print sticky top-[52px] z-20 border-b border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-5xl items-center gap-1.5 overflow-x-auto whitespace-nowrap">
            <button
              type="button"
              onClick={handleAddSlide}
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg bg-[#7C3AED] px-2.5 text-xs font-semibold text-white hover:bg-[#6D28D9]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Página</span>
            </button>
            <button
              type="button"
              onClick={handleDuplicateSlide}
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Duplicar</span>
            </button>
            <button
              type="button"
              disabled={currentIdx <= 0}
              onClick={() => handleMoveSlide(-1)}
              aria-label="Mover diapositiva atrás"
              className="flex min-h-[34px] min-w-[32px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={currentIdx >= slides.length - 1}
              onClick={() => handleMoveSlide(1)}
              aria-label="Mover diapositiva adelante"
              className="flex min-h-[34px] min-w-[32px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={slides.length <= 1}
              onClick={handleDeleteSlide}
              aria-label="Eliminar diapositiva"
              className="flex min-h-[34px] min-w-[32px] shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-35 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            <div className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

            {!hasExplicitRichLayout && (
              <button
                type="button"
                onClick={() =>
                  updateActiveSlide((prev) => ensureRichCanvasSlide(prev), true)
                }
                className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-[#7C3AED] hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
              >
                <Move className="h-3.5 w-3.5" />
                <span>Convertir a Lienzo Canva</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setGridOpen(true)}
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Páginas ({slides.length})</span>
            </button>

            <span className="hidden pl-2 text-xs text-slate-500 lg:inline dark:text-slate-400">
              {selectedElement
                ? `${getElementTypeLabel(selectedElement)} seleccionado · Arrastra para mover o usa las esquinas para escalar`
                : 'Toca un elemento para mover/escalar, o usa la barra Canva inferior'}
            </span>
          </div>
        </div>
      )}

      {/* Search Strip */}
      {searchOpen && (
        <div className="no-print border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en títulos, contenido o notas..."
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#7C3AED] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
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
            <div className="mx-auto mt-2.5 flex max-w-4xl flex-wrap gap-2">
              {matchingSlides.length === 0 ? (
                <span className="text-xs text-slate-500">Sin coincidencias.</span>
              ) : (
                matchingSlides.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setCurrentIdx(s.index - 1);
                      setSearchOpen(false);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Diapositiva {s.index}: {s.title}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Slide Viewport */}
      <main
        className={`wps-print-scroll flex flex-1 flex-col items-center justify-center px-3 py-5 sm:px-6 sm:py-7 ${
          editMode && onUpdateDocument ? 'pb-[84px]' : ''
        }`}
        onTouchStart={(e) => {
          if (editMode && selectedElementId) return;
          setTouchStartX(e.touches[0]?.clientX ?? null);
        }}
        onTouchEnd={(e) => {
          if (touchStartX === null) return;
          const endX = e.changedTouches[0]?.clientX ?? touchStartX;
          const delta = endX - touchStartX;
          if (delta < -48) {
            setCurrentIdx((i) => Math.min(slides.length - 1, i + 1));
          } else if (delta > 48) {
            setCurrentIdx((i) => Math.max(0, i - 1));
          }
          setTouchStartX(null);
        }}
      >
        <div className="wps-print-sheet w-full max-w-4xl space-y-4">
          {viewMode === 'slide' ? (
            <div className="overflow-auto rounded-xl">
              <div style={{ width: `${zoomPercent}%`, minWidth: '100%' }}>
                <SlideStage
                  slide={activeSlide}
                  totalSlides={slides.length}
                  formatLabel={doc.format}
                  theme={slideTheme}
                  editMode={editMode && Boolean(onUpdateDocument)}
                  selectedElementId={selectedElementId}
                  editingTextId={editingTextId}
                  activeFieldKey={activeFieldKey}
                  hasCopiedStyle={Boolean(copiedStyle)}
                  spellCheckEnabled={spellCheckEnabled}
                  customDict={customDict}
                  ignoredSpellWords={ignoredSpellWords}
                  onSelectElement={setSelectedElementId}
                  onSetEditingTextId={setEditingTextId}
                  onChangeSlide={onUpdateDocument ? updateActiveSlide : undefined}
                  onCommitHistory={() => history.commitPending()}
                  onDuplicateElement={handleDuplicateElement}
                  onDeleteElement={handleDeleteElement}
                  onCopyElementStyle={handleCopyElementStyle}
                  onPasteElementStyle={handlePasteElementStyle}
                  onReorderLayer={(id, dir) => handleReorderLayer(id, dir)}
                  onRegisterEditable={handleRegisterEditable}
                  onActivateEditable={handleActivateEditable}
                  onSyncFormats={syncFormatState}
                  onSpellErrorsChange={handleSpellErrorsChange}
                  onOpenSpellMenu={(menu, fieldKey, targetEl) =>
                    setSpellMenu({ menu, fieldKey, targetEl })
                  }
                />
              </div>
            </div>
          ) : (
            /* Mobile Reading Reflow Mode — supports both structured & rich Canva elements */
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#EA580C]">
                <span>Lectura continua · {doc.format}</span>
                <span className="font-mono tabular-nums">
                  Diapositiva {activeSlide.index} / {slides.length}
                </span>
              </div>

              {hasExplicitRichLayout ? (
                <div className="space-y-4">
                  {[...(activeSlide.elements || [])]
                    .sort((a, b) => a.zIndex - b.zIndex)
                    .map((el) => {
                      if (el.type === 'text') {
                        return (
                          <div
                            key={el.id}
                            className={`wps-doc-canvas text-slate-900 dark:text-slate-100 ${
                              el.isTitle ? 'font-display text-xl font-bold sm:text-2xl' : 'text-sm leading-relaxed sm:text-base'
                            }`}
                            dangerouslySetInnerHTML={{ __html: slideTextElementToHtml(el) }}
                          />
                        );
                      }
                      if (el.type === 'image') {
                        return (
                          <img
                            key={el.id}
                            src={el.src}
                            alt={el.alt || 'Imagen de diapositiva'}
                            className="max-h-60 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain p-2 dark:border-slate-800 dark:bg-slate-950"
                          />
                        );
                      }
                      if (el.type === 'table') {
                        return (
                          <div key={el.id} className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs sm:text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                  {el.headers.map((h, i) => (
                                    <th key={i} className="py-2 pr-4 font-semibold">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                                {el.rows.map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="py-2 pr-4">
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      }
                      if (el.type === 'diagram') {
                        return (
                          <div
                            key={el.id}
                            className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                          >
                            {el.items.map((item, idx) => (
                              <span
                                key={idx}
                                className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:border-violet-900/50 dark:bg-slate-900 dark:text-slate-200"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        );
                      }
                      if (el.type === 'chart') {
                        return (
                          <div
                            key={el.id}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                          >
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {el.title || 'Datos del gráfico'}
                            </div>
                            <div className="mt-2 space-y-1.5">
                              {el.series[0]?.points.map((pt, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600 dark:text-slate-400">{pt.label}</span>
                                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                    {pt.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                </div>
              ) : (
                <>
                  {activeSlide.titleHtml !== undefined ? (
                    <div
                      className="wps-doc-canvas font-display text-xl font-bold leading-snug text-slate-900 sm:text-2xl dark:text-slate-100"
                      dangerouslySetInnerHTML={{ __html: activeSlide.titleHtml }}
                    />
                  ) : (
                    <h1 className="font-display text-xl font-bold leading-snug text-slate-900 sm:text-2xl dark:text-slate-100">
                      {activeSlide.title}
                    </h1>
                  )}
                  {activeSlide.subtitleHtml !== undefined && activeSlide.subtitle ? (
                    <div
                      className="wps-doc-canvas mt-2 text-sm text-slate-600 dark:text-slate-400"
                      dangerouslySetInnerHTML={{ __html: activeSlide.subtitleHtml }}
                    />
                  ) : (
                    activeSlide.subtitle && (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        {activeSlide.subtitle}
                      </p>
                    )
                  )}
                  {activeSlide.bodyHtml !== undefined ? (
                    <div
                      className="wps-doc-canvas mt-4 text-sm leading-relaxed text-slate-800 sm:text-base dark:text-slate-200"
                      dangerouslySetInnerHTML={{ __html: activeSlide.bodyHtml }}
                    />
                  ) : (
                    activeSlide.bullets.length > 0 && (
                      <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-800 sm:text-base dark:text-slate-200">
                        {activeSlide.bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#EA580C]" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                  {activeSlide.table && (
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            {activeSlide.table.headers.map((h, i) => (
                              <th key={i} className="py-2 pr-4 font-semibold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                          {activeSlide.table.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="py-2 pr-4">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* External Slide Action Row */}
          <div className="no-print flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentIdx <= 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-35 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                disabled={currentIdx >= slides.length - 1}
                onClick={() => setCurrentIdx((i) => Math.min(slides.length - 1, i + 1))}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-35 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewMode((v) => (v === 'slide' ? 'reading' : 'slide'))}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                {viewMode === 'slide' ? (
                  <>
                    <AlignLeft className="h-3.5 w-3.5" />
                    <span>Lectura</span>
                  </>
                ) : (
                  <>
                    <Monitor className="h-3.5 w-3.5" />
                    <span>Diapositiva</span>
                  </>
                )}
              </button>

              {viewMode === 'slide' && (
                <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1 dark:border-slate-800 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setZoomPercent((z) => Math.max(100, z - 25))}
                    disabled={zoomPercent <= 100}
                    aria-label="Alejar zoom"
                    className="flex min-h-[40px] min-w-[36px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="px-1 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                    {zoomPercent}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomPercent((z) => Math.min(200, z + 25))}
                    disabled={zoomPercent >= 200}
                    aria-label="Acercar zoom"
                    className="flex min-h-[40px] min-w-[36px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
                  notesOpen
                    ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED] dark:bg-violet-950/40 dark:text-violet-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                <StickyNote className="h-4 w-4" />
                <span>Notas</span>
              </button>
            </div>
          </div>

          {/* Collapsible Speaker Notes */}
          {notesOpen && (
            <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <StickyNote className="h-4 w-4 text-[#7C3AED]" />
                  <span>Notas del orador</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNotesOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Ocultar
                </button>
              </div>
              {editMode && onUpdateDocument ? (
                <textarea
                  rows={3}
                  value={activeSlide.notes}
                  onChange={(e) =>
                    updateActiveSlide((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Escribe notas del orador para esta diapositiva..."
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800 focus:border-[#7C3AED] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {activeSlide.notes || 'Sin notas registradas para esta diapositiva.'}
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Contextual Spellcheck Menu */}
      {spellMenu && (
        <SpellCheckMenu
          menu={spellMenu.menu}
          onSelectSuggestion={handleSelectSpellSuggestion}
          onIgnoreWord={handleIgnoreSpellWord}
          onAddToDictionary={handleAddWordToDictionary}
          onClose={() => setSpellMenu(null)}
        />
      )}

      {/* Visual Thumbnail Grid Modal */}
      {gridOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setGridOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-t-3xl bg-white p-5 sm:rounded-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Todas las diapositivas ({slides.length})
              </h2>
              <button
                type="button"
                onClick={() => setGridOpen(false)}
                aria-label="Cerrar cuadrícula"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {slides.map((s, idx) => {
                const active = idx === currentIdx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setCurrentIdx(idx);
                      setGridOpen(false);
                    }}
                    className={`group rounded-xl border p-2 text-left transition-colors ${
                      active
                        ? 'border-[#7C3AED] bg-violet-50/60 dark:bg-violet-950/30'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                  >
                    <SlideStage
                      slide={s}
                      totalSlides={slides.length}
                      formatLabel={doc.format}
                      theme={slideTheme}
                      interactive={false}
                    />
                    <div className="mt-2 flex items-center gap-1.5 px-1">
                      <span className="font-mono text-[11px] font-bold tabular-nums text-[#7C3AED]">
                        {s.index}
                      </span>
                      <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                        {s.title}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CANVA STUDIO EXPANDABLE INSPECTOR DRAWER */}
      {editMode && onUpdateDocument && (selectedElement ? elementPanel : canvasPanel) && (
        <div className="no-print fixed bottom-[58px] left-0 right-0 z-30 border-t border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {selectedElement
                  ? `${getElementTypeLabel(selectedElement)} · ${
                      elementToolTabs.find((t) => t.id === elementPanel)?.label || 'Ajustes'
                    }`
                  : canvasPanel === 'design'
                    ? 'Plantillas Canva'
                    : canvasPanel === 'elements'
                      ? 'Elementos y Formas'
                      : canvasPanel === 'text'
                        ? 'Estilos de Texto'
                        : canvasPanel === 'charts'
                          ? 'Tablas y Gráficos'
                          : canvasPanel === 'background'
                            ? 'Fondo de Diapositiva'
                            : canvasPanel === 'layers'
                              ? `Capas (${sortedLayers.length})`
                              : 'Revisar y Exportar'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCanvasPanel(null);
                  setElementPanel(null);
                }}
                aria-label="Cerrar panel"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[40vh] overflow-y-auto p-4">
              {/* ---------- SELECTED ELEMENT INSPECTORS ---------- */}
              {selectedElement && elementPanel === 'font' && selectedElement.type === 'text' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CANVA_FONTS.map((f) => {
                    const active = selectedElement.fontFamily === f.cssFamily;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateSelectedElement({ fontFamily: f.cssFamily }, true)}
                        style={{ fontFamily: f.cssFamily }}
                        className={`min-h-[46px] rounded-xl border px-3 text-left text-sm font-medium transition-colors ${
                          active
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED] dark:bg-violet-950/60 dark:text-violet-300'
                            : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedElement && elementPanel === 'size' && selectedElement.type === 'text' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span>Tamaño de fuente</span>
                    <span className="font-mono font-bold tabular-nums">
                      {selectedElement.fontSizePt ||
                        selectedElement.paragraphs[0]?.runs[0]?.fontSizePt ||
                        (selectedElement.isTitle ? 28 : 16)}
                      pt
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={72}
                    value={
                      selectedElement.fontSizePt ||
                      selectedElement.paragraphs[0]?.runs[0]?.fontSizePt ||
                      (selectedElement.isTitle ? 28 : 16)
                    }
                    onChange={(e) => updateSelectedElement({ fontSizePt: Number(e.target.value) }, false)}
                    onPointerUp={() => history.commitPending()}
                    className="w-full accent-[#7C3AED]"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[12, 16, 20, 28, 36, 48].map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => updateSelectedElement({ fontSizePt: pt }, true)}
                        className="min-h-[38px] rounded-lg border border-slate-200 px-3 font-mono text-xs font-semibold dark:border-slate-700"
                      >
                        {pt}pt
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedElement && elementPanel === 'color' && (
                <div className="space-y-4">
                  {selectedElement.type === 'text' && (
                    <>
                      <div>
                        <div className="mb-2 text-xs font-medium text-slate-500">Color de texto</div>
                        <CanvaColorSwatchRow
                          value={selectedElement.paragraphs[0]?.runs[0]?.color || '#0F172A'}
                          onChange={(color) =>
                            updateSelectedElement(
                              {
                                paragraphs: selectedElement.paragraphs.map((p) => ({
                                  ...p,
                                  runs: p.runs.map((r) => ({ ...r, color })),
                                })),
                              },
                              true,
                            )
                          }
                        />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-medium text-slate-500">Fondo del bloque</div>
                        <CanvaColorSwatchRow
                          allowTransparent
                          value={selectedElement.fillColor}
                          onChange={(color) =>
                            updateSelectedElement(
                              { fillColor: color === 'transparent' ? undefined : color },
                              true,
                            )
                          }
                        />
                      </div>
                    </>
                  )}

                  {selectedElement.type === 'shape' && (
                    <>
                      <div>
                        <div className="mb-2 text-xs font-medium text-slate-500">Color sólido</div>
                        <CanvaColorSwatchRow
                          allowTransparent
                          value={selectedElement.fillColor}
                          onChange={(color) =>
                            updateSelectedElement(
                              {
                                fillColor: color === 'transparent' ? undefined : color,
                                fillGradient: undefined,
                              },
                              true,
                            )
                          }
                        />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-medium text-slate-500">Degradados Canva</div>
                        <div className="flex flex-wrap gap-2">
                          {CANVA_GRADIENTS.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() =>
                                updateSelectedElement(
                                  { fillGradient: g.css, fillColor: g.fallbackColor },
                                  true,
                                )
                              }
                              style={{ backgroundImage: g.css }}
                              title={g.label}
                              className="h-9 w-14 rounded-lg border border-slate-300 shadow-2xs dark:border-slate-600"
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {(selectedElement.type === 'table' ||
                    selectedElement.type === 'chart' ||
                    selectedElement.type === 'diagram') && (
                    <div className="space-y-3">
                      {selectedElement.type === 'table' && (
                        <div>
                          <div className="mb-2 text-xs font-medium text-slate-500">Encabezado de tabla</div>
                          <CanvaColorSwatchRow
                            value={selectedElement.headerBgColor || '#F1F5F9'}
                            onChange={(color) =>
                              updateSelectedElement(
                                {
                                  headerBgColor: color,
                                  headerTextColor:
                                    color === '#FFFFFF' ||
                                    color === '#FEF08A' ||
                                    color === '#DBEAFE' ||
                                    color === '#FCE7F3'
                                      ? '#0F172A'
                                      : '#FFFFFF',
                                },
                                true,
                              )
                            }
                          />
                        </div>
                      )}
                      <div>
                        <div className="mb-2 text-xs font-medium text-slate-500">Fondo del contenedor</div>
                        <CanvaColorSwatchRow
                          value={
                            selectedElement.type === 'table'
                              ? selectedElement.cellBgColor || '#FFFFFF'
                              : selectedElement.fillColor || '#FFFFFF'
                          }
                          onChange={(color) =>
                            updateSelectedElement(
                              selectedElement.type === 'table'
                                ? { cellBgColor: color }
                                : { fillColor: color },
                              true,
                            )
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedElement && elementPanel === 'format' && selectedElement.type === 'text' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditingTextId(selectedElement.id);
                        window.requestAnimationFrame(() => runWordCommand('bold'));
                      }}
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border ${
                        activeFormats.bold
                          ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                      aria-label="Negrita"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditingTextId(selectedElement.id);
                        window.requestAnimationFrame(() => runWordCommand('italic'));
                      }}
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border ${
                        activeFormats.italic
                          ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                      aria-label="Cursiva"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditingTextId(selectedElement.id);
                        window.requestAnimationFrame(() => runWordCommand('underline'));
                      }}
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border ${
                        activeFormats.underline
                          ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                      aria-label="Subrayado"
                    >
                      <Underline className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditingTextId(selectedElement.id);
                        window.requestAnimationFrame(() => runWordCommand('strikeThrough'));
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
                      aria-label="Tachado"
                    >
                      <Strikethrough className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditingTextId(selectedElement.id);
                        window.requestAnimationFrame(() => runWordCommand('insertUnorderedList'));
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
                      aria-label="Viñetas"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditingTextId(selectedElement.id);
                        window.requestAnimationFrame(() => runWordCommand('insertOrderedList'));
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
                      aria-label="Lista numerada"
                    >
                      <ListOrdered className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {(
                      [
                        { align: 'left', Icon: AlignLeft, label: 'Izquierda' },
                        { align: 'center', Icon: AlignCenter, label: 'Centrar' },
                        { align: 'right', Icon: AlignRight, label: 'Derecha' },
                        { align: 'justify', Icon: AlignJustify, label: 'Justificar' },
                      ] as const
                    ).map(({ align, Icon, label }) => (
                      <button
                        key={align}
                        type="button"
                        aria-label={label}
                        onClick={() => {
                          updateSelectedElement(
                            {
                              paragraphs: selectedElement.paragraphs.map((p) => ({
                                ...p,
                                align,
                              })),
                            },
                            true,
                          );
                          setEditingTextId(selectedElement.id);
                          window.requestAnimationFrame(() =>
                            runWordCommand(
                              align === 'left'
                                ? 'justifyLeft'
                                : align === 'center'
                                  ? 'justifyCenter'
                                  : align === 'right'
                                    ? 'justifyRight'
                                    : 'justifyFull',
                            ),
                          );
                        }}
                        className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-slate-200 hover:border-[#7C3AED] dark:border-slate-700"
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    ))}

                    <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
                    {(
                      [
                        { label: 'AA', val: 'uppercase' },
                        { label: 'aa', val: 'lowercase' },
                        { label: 'Aa', val: 'capitalize' },
                        { label: 'Normal', val: 'none' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.val}
                        type="button"
                        onClick={() => updateSelectedElement({ textTransform: t.val }, true)}
                        className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold ${
                          selectedElement.textTransform === t.val
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedElement && elementPanel === 'spacing' && selectedElement.type === 'text' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex justify-between text-xs font-medium">
                      <span>Espaciado entre letras</span>
                      <span className="font-mono">{(selectedElement.letterSpacingEm ?? 0).toFixed(2)}em</span>
                    </div>
                    <input
                      type="range"
                      min={-0.05}
                      max={0.4}
                      step={0.02}
                      value={selectedElement.letterSpacingEm ?? 0}
                      onChange={(e) =>
                        updateSelectedElement({ letterSpacingEm: Number(e.target.value) }, false)
                      }
                      onPointerUp={() => history.commitPending()}
                      className="w-full accent-[#7C3AED]"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs font-medium">
                      <span>Interlineado</span>
                      <span className="font-mono">{(selectedElement.lineHeight ?? 1.28).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.9}
                      max={2.4}
                      step={0.05}
                      value={selectedElement.lineHeight ?? 1.28}
                      onChange={(e) =>
                        updateSelectedElement({ lineHeight: Number(e.target.value) }, false)
                      }
                      onPointerUp={() => history.commitPending()}
                      className="w-full accent-[#7C3AED]"
                    />
                  </div>
                </div>
              )}

              {selectedElement && elementPanel === 'effects' && (
                <div className="space-y-4">
                  {selectedElement.type === 'text' && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-500">Efectos de texto Canva</div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { id: 'none', label: 'Ninguno' },
                            { id: 'shadow', label: 'Sombra' },
                            { id: 'lift', label: 'Elevación' },
                            { id: 'hollow', label: 'Desalineado' },
                            { id: 'splice', label: 'Contorno + Sombra' },
                            { id: 'background', label: 'Fondo etiqueta' },
                          ] as { id: WpsTextEffect; label: string }[]
                        ).map((fx) => (
                          <button
                            key={fx.id}
                            type="button"
                            onClick={() => updateSelectedElement({ textEffect: fx.id }, true)}
                            className={`min-h-[40px] rounded-xl border px-3 text-xs font-medium ${
                              (selectedElement.textEffect || 'none') === fx.id
                                ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED] dark:bg-violet-950/60 dark:text-violet-300'
                                : 'border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {fx.label}
                          </button>
                        ))}
                      </div>
                      {(selectedElement.textEffect === 'shadow' ||
                        selectedElement.textEffect === 'splice' ||
                        selectedElement.textEffect === 'background') && (
                        <div className="mt-3">
                          <div className="mb-1.5 text-xs text-slate-500">Color del efecto</div>
                          <CanvaColorSwatchRow
                            colors={CANVA_COLORS.slice(0, 10)}
                            value={selectedElement.effectColor || '#7C3AED'}
                            onChange={(c) => updateSelectedElement({ effectColor: c }, true)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500">Sombra del elemento</div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { id: 'none', label: 'Sin sombra' },
                          { id: 'soft', label: 'Suave' },
                          { id: 'elevated', label: 'Elevada' },
                          { id: 'glow', label: 'Resplandor' },
                        ] as { id: WpsShadowStyle; label: string }[]
                      ).map((sh) => (
                        <button
                          key={sh.id}
                          type="button"
                          onClick={() => updateSelectedElement({ shadow: sh.id }, true)}
                          className={`min-h-[40px] rounded-xl border px-3 text-xs font-medium ${
                            (selectedElement.shadow || 'none') === sh.id
                              ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {sh.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedElement && elementPanel === 'border' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 flex justify-between text-xs font-medium">
                        <span>Esquinas redondeadas</span>
                        <span className="font-mono">
                          {('borderRadiusPx' in selectedElement ? selectedElement.borderRadiusPx : 0) ?? 0}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={48}
                        value={('borderRadiusPx' in selectedElement ? selectedElement.borderRadiusPx : 0) ?? 0}
                        onChange={(e) =>
                          updateSelectedElement({ borderRadiusPx: Number(e.target.value) }, false)
                        }
                        onPointerUp={() => history.commitPending()}
                        className="w-full accent-[#7C3AED]"
                      />
                    </div>
                    {selectedElement.type !== 'table' &&
                      selectedElement.type !== 'chart' &&
                      selectedElement.type !== 'diagram' && (
                        <div>
                          <div className="mb-1 flex justify-between text-xs font-medium">
                            <span>Grosor de borde</span>
                            <span className="font-mono">{selectedElement.borderWidthPx ?? 0}px</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={12}
                            value={selectedElement.borderWidthPx ?? 0}
                            onChange={(e) =>
                              updateSelectedElement({ borderWidthPx: Number(e.target.value) }, false)
                            }
                            onPointerUp={() => history.commitPending()}
                            className="w-full accent-[#7C3AED]"
                          />
                        </div>
                      )}
                  </div>
                  {(selectedElement.type === 'shape' || selectedElement.type === 'text') && (
                    <div className="flex flex-wrap gap-2">
                      {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => updateSelectedElement({ borderStyle: st }, true)}
                          className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium capitalize ${
                            (selectedElement.borderStyle || 'solid') === st
                              ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {st === 'solid' ? 'Sólido' : st === 'dashed' ? 'Guiones' : 'Puntos'}
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <div className="mb-1.5 text-xs text-slate-500">Color de borde</div>
                    <CanvaColorSwatchRow
                      allowTransparent
                      value={'borderColor' in selectedElement ? selectedElement.borderColor : undefined}
                      onChange={(c) =>
                        updateSelectedElement(
                          {
                            borderColor: c === 'transparent' ? undefined : c,
                            ...(c !== 'transparent' &&
                            'borderWidthPx' in selectedElement &&
                            !selectedElement.borderWidthPx
                              ? { borderWidthPx: 2 }
                              : {}),
                          },
                          true,
                        )
                      }
                    />
                  </div>
                </div>
              )}

              {selectedElement && elementPanel === 'filters' && selectedElement.type === 'image' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'none', label: 'Original' },
                        { id: 'vivid', label: 'Vívido' },
                        { id: 'bw', label: 'B / N' },
                        { id: 'sepia', label: 'Retro Sepia' },
                        { id: 'warm', label: 'Cálido' },
                        { id: 'cool', label: 'Frío' },
                        { id: 'blur', label: 'Desenfoque' },
                      ] as { id: WpsImageFilterPreset; label: string }[]
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => updateSelectedElement({ filterPreset: f.id }, true)}
                        className={`min-h-[38px] rounded-xl border px-3 text-xs font-medium ${
                          (selectedElement.filterPreset || 'none') === f.id
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>Brillo</span>
                        <span className="font-mono">{selectedElement.brightness ?? 100}%</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={160}
                        value={selectedElement.brightness ?? 100}
                        onChange={(e) =>
                          updateSelectedElement({ brightness: Number(e.target.value) }, false)
                        }
                        onPointerUp={() => history.commitPending()}
                        className="w-full accent-[#7C3AED]"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>Contraste</span>
                        <span className="font-mono">{selectedElement.contrast ?? 100}%</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={160}
                        value={selectedElement.contrast ?? 100}
                        onChange={(e) =>
                          updateSelectedElement({ contrast: Number(e.target.value) }, false)
                        }
                        onPointerUp={() => history.commitPending()}
                        className="w-full accent-[#7C3AED]"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>Saturación</span>
                        <span className="font-mono">{selectedElement.saturate ?? 100}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={selectedElement.saturate ?? 100}
                        onChange={(e) =>
                          updateSelectedElement({ saturate: Number(e.target.value) }, false)
                        }
                        onPointerUp={() => history.commitPending()}
                        className="w-full accent-[#7C3AED]"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['contain', 'cover', 'fill'] as const).map((fit) => (
                      <button
                        key={fit}
                        type="button"
                        onClick={() => updateSelectedElement({ imageFit: fit }, true)}
                        className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium ${
                          (selectedElement.imageFit || 'contain') === fit
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {fit === 'contain' ? 'Ajustar' : fit === 'cover' ? 'Rellenar' : 'Estirar'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedElement && elementPanel === 'opacity' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Transparencia</span>
                    <span className="font-mono font-bold tabular-nums">
                      {Math.round((selectedElement.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round((selectedElement.opacity ?? 1) * 100)}
                    onChange={(e) =>
                      updateSelectedElement({ opacity: Number(e.target.value) / 100 }, false)
                    }
                    onPointerUp={() => history.commitPending()}
                    className="w-full accent-[#7C3AED]"
                  />
                </div>
              )}

              {selectedElement && elementPanel === 'position' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleReorderLayer(selectedElement.id, 'front')}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium dark:border-slate-700"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                      <span>Al frente</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorderLayer(selectedElement.id, 'forward')}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium dark:border-slate-700"
                    >
                      <span>Adelante</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorderLayer(selectedElement.id, 'backward')}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium dark:border-slate-700"
                    >
                      <span>Atrás</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorderLayer(selectedElement.id, 'back')}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium dark:border-slate-700"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                      <span>Al fondo</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    {(
                      [
                        { m: 'left', label: 'Izq.' },
                        { m: 'centerH', label: 'Centro H' },
                        { m: 'right', label: 'Der.' },
                        { m: 'top', label: 'Arriba' },
                        { m: 'centerV', label: 'Centro V' },
                        { m: 'bottom', label: 'Abajo' },
                      ] as const
                    ).map((a) => (
                      <button
                        key={a.m}
                        type="button"
                        onClick={() => alignElementOnCanvas(a.m)}
                        className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 text-xs font-medium dark:border-slate-700"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>

                  {(selectedElement.type === 'shape' ||
                    selectedElement.type === 'image' ||
                    selectedElement.type === 'text') && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedElement({ flippedX: !selectedElement.flippedX }, true)
                        }
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                          selectedElement.flippedX
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <FlipHorizontal className="h-3.5 w-3.5" />
                        <span>Voltear H</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedElement({ flippedY: !selectedElement.flippedY }, true)
                        }
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                          selectedElement.flippedY
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <FlipVertical className="h-3.5 w-3.5" />
                        <span>Voltear V</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedElement({ rotationDeg: 0 }, true)}
                        className="min-h-[38px] rounded-lg border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                      >
                        Rotación 0°
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedElement && elementPanel === 'data' && selectedElement.type === 'chart' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'bar', label: 'Barras' },
                        { id: 'horizontalBar', label: 'Barras H' },
                        { id: 'line', label: 'Líneas' },
                        { id: 'donut', label: 'Dona' },
                      ] as { id: WpsChartKind; label: string }[]
                    ).map((ck) => (
                      <button
                        key={ck.id}
                        type="button"
                        onClick={() => updateSelectedElement({ chartKind: ck.id }, true)}
                        className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium ${
                          (selectedElement.chartKind || 'bar') === ck.id
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {ck.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={selectedElement.title || ''}
                    onChange={(e) => updateSelectedElement({ title: e.target.value }, false)}
                    placeholder="Título del gráfico"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  {selectedElement.series[0] && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {selectedElement.series[0].points.map((pt, idx) => (
                        <div key={idx} className="space-y-1 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                          <input
                            type="text"
                            value={pt.label}
                            onChange={(e) => {
                              const nextPts = selectedElement.series[0].points.map((p, pi) =>
                                pi === idx ? { ...p, label: e.target.value } : p,
                              );
                              updateSelectedElement(
                                {
                                  series: [
                                    { ...selectedElement.series[0], points: nextPts },
                                    ...selectedElement.series.slice(1),
                                  ],
                                },
                                false,
                              );
                            }}
                            className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                          <input
                            type="number"
                            value={pt.value}
                            onChange={(e) => {
                              const nextPts = selectedElement.series[0].points.map((p, pi) =>
                                pi === idx ? { ...p, value: Number(e.target.value) || 0 } : p,
                              );
                              updateSelectedElement(
                                {
                                  series: [
                                    { ...selectedElement.series[0], points: nextPts },
                                    ...selectedElement.series.slice(1),
                                  ],
                                },
                                false,
                              );
                            }}
                            className="h-7 w-full rounded border border-slate-200 px-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedElement && elementPanel === 'data' && selectedElement.type === 'table' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedElement(
                        {
                          rows: [
                            ...selectedElement.rows,
                            selectedElement.headers.map(() => 'Dato'),
                          ],
                        },
                        true,
                      )
                    }
                    className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                  >
                    + Añadir fila
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedElement(
                        {
                          headers: [...selectedElement.headers, `Col ${selectedElement.headers.length + 1}`],
                          rows: selectedElement.rows.map((r) => [...r, 'Dato']),
                        },
                        true,
                      )
                    }
                    className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                  >
                    + Añadir columna
                  </button>
                  {selectedElement.rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedElement(
                          { rows: selectedElement.rows.slice(0, -1) },
                          true,
                        )
                      }
                      className="min-h-[40px] rounded-xl border border-red-200 px-3 text-xs font-medium text-red-600 dark:border-red-900/50"
                    >
                      - Quitar última fila
                    </button>
                  )}
                </div>
              )}

              {selectedElement && elementPanel === 'data' && selectedElement.type === 'diagram' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {selectedElement.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) =>
                            updateSelectedElement(
                              {
                                items: selectedElement.items.map((it, i) =>
                                  i === idx ? e.target.value : it,
                                ),
                              },
                              false,
                            )
                          }
                          className="h-9 flex-1 rounded-lg border border-slate-200 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        {selectedElement.items.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedElement(
                                {
                                  items: selectedElement.items.filter((_, i) => i !== idx),
                                },
                                true,
                              )
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedElement(
                        { items: [...selectedElement.items, `${selectedElement.items.length + 1}. Paso`] },
                        true,
                      )
                    }
                    className="min-h-[38px] rounded-lg border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                  >
                    + Añadir paso
                  </button>
                </div>
              )}

              {/* ---------- CANVAS (NO ELEMENT SELECTED) PANELS ---------- */}
              {!selectedElement && canvasPanel === 'design' && (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {CANVA_SLIDE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        const patch = tpl.build();
                        updateActiveSlide(
                          (prev) => ({
                            ...prev,
                            ...patch,
                          }),
                          true,
                        );
                        setCanvasPanel(null);
                      }}
                      className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                    >
                      <span
                        className="h-2 w-10 rounded-full"
                        style={{ backgroundColor: tpl.accent }}
                      />
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {tpl.name}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {tpl.subtitle}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {!selectedElement && canvasPanel === 'elements' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {CANVA_SHAPE_DEFINITIONS.map((sh) => (
                      <button
                        key={sh.kind}
                        type="button"
                        onClick={() => handleAddShape(sh.kind, sh.defaultFill)}
                        className="flex min-h-[60px] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="h-6 w-6">
                          <CanvaShapeSvg shapeKind={sh.kind} fillColor={sh.defaultFill} />
                        </div>
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          {sh.label}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddDiagram}
                      className="flex min-h-[60px] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                    >
                      <Layers className="h-5 w-5 text-[#7C3AED]" />
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        Flujo
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {!selectedElement && canvasPanel === 'text' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CANVA_TEXT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleAddTextPreset(preset.id)}
                      className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-left hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                    >
                      <span className={`text-slate-900 dark:text-slate-100 ${preset.previewClass}`}>
                        {preset.label}
                      </span>
                      <Plus className="h-4 w-4 shrink-0 text-[#7C3AED]" />
                    </button>
                  ))}
                </div>
              )}

              {!selectedElement && canvasPanel === 'charts' && (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {(
                    [
                      { id: 'bar', label: 'Gráfico Barras', action: () => handleAddChart('bar') },
                      { id: 'hbar', label: 'Barras Horiz.', action: () => handleAddChart('horizontalBar') },
                      { id: 'line', label: 'Gráfico Líneas', action: () => handleAddChart('line') },
                      { id: 'donut', label: 'Gráfico Dona', action: () => handleAddChart('donut') },
                      { id: 'table', label: 'Tabla Editable', action: handleAddRichTable },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.action}
                      className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-800 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {item.id === 'table' ? (
                        <Table2 className="h-5 w-5 text-[#2563EB]" />
                      ) : (
                        <BarChart3 className="h-5 w-5 text-[#7C3AED]" />
                      )}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {!selectedElement && canvasPanel === 'background' && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500">Colores sólidos</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {CANVA_SOLID_BGS.map((bg) => (
                        <button
                          key={bg.value}
                          type="button"
                          onClick={() =>
                            updateActiveSlide((prev) => {
                              const promoted = ensureRichCanvasSlide(prev);
                              return {
                                ...promoted,
                                backgroundColor: bg.value,
                                backgroundGradient: undefined,
                                backgroundImage: undefined,
                              };
                            }, true)
                          }
                          title={bg.label}
                          style={{ backgroundColor: bg.value }}
                          className="h-9 w-9 rounded-full border border-slate-300 shadow-2xs dark:border-slate-600"
                        />
                      ))}
                      <label
                        title="Color personalizado"
                        className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500 text-xs font-bold text-white"
                      >
                        <span>+</span>
                        <input
                          type="color"
                          value={activeSlide.backgroundColor || '#FFFFFF'}
                          onChange={(e) =>
                            updateActiveSlide((prev) => ({
                              ...ensureRichCanvasSlide(prev),
                              backgroundColor: e.target.value,
                              backgroundGradient: undefined,
                              backgroundImage: undefined,
                            }))
                          }
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500">Degradados Canva</div>
                    <div className="flex flex-wrap gap-2">
                      {CANVA_GRADIENTS.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() =>
                            updateActiveSlide(
                              (prev) => ({
                                ...ensureRichCanvasSlide(prev),
                                backgroundColor: g.fallbackColor,
                                backgroundGradient: g.css,
                                backgroundImage: undefined,
                              }),
                              true,
                            )
                          }
                          style={{ backgroundImage: g.css }}
                          className="h-10 w-16 rounded-xl border border-slate-300 shadow-2xs dark:border-slate-600"
                          title={g.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => bgImageInputRef.current?.click()}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                    >
                      <ImageIcon className="h-4 w-4 text-[#7C3AED]" />
                      <span>Imagen de fondo</span>
                    </button>
                    {activeSlide.backgroundImage && (
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveSlide(
                            (prev) => ({ ...prev, backgroundImage: undefined }),
                            true,
                          )
                        }
                        className="min-h-[40px] rounded-xl border border-red-200 px-3 text-xs font-medium text-red-600"
                      >
                        Quitar imagen de fondo
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!selectedElement && canvasPanel === 'layers' && (
                <div className="space-y-2">
                  {sortedLayers.length === 0 ? (
                    <div className="text-center text-xs text-slate-500">
                      Esta diapositiva aún usa estructura clásica. Pulsa &ldquo;Convertir a Lienzo Canva&rdquo; o añade un elemento para gestionar capas.
                    </div>
                  ) : (
                    sortedLayers.map((el) => (
                      <div
                        key={el.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedElementId(el.id);
                            setCanvasPanel(null);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium text-slate-800 dark:text-slate-100"
                        >
                          <span className="font-mono text-[10px] text-[#7C3AED]">z{el.zIndex}</span>
                          <span className="truncate">
                            {getElementTypeLabel(el)}
                            {el.type === 'text' &&
                              ` · ${extractPlainTextFromHtml(slideTextElementToHtml(el)).slice(0, 26)}`}
                          </span>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleReorderLayer(el.id, 'forward')}
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                            aria-label="Subir capa"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReorderLayer(el.id, 'backward')}
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                            aria-label="Bajar capa"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveSlide(
                                (prev) => ({
                                  ...prev,
                                  elements: prev.elements?.map((item) =>
                                    item.id === el.id ? { ...item, locked: !item.locked } : item,
                                  ),
                                }),
                                true,
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                            aria-label="Bloquear capa"
                          >
                            {el.locked ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Unlock className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteElement(el.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                            aria-label="Eliminar capa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {!selectedElement && canvasPanel === 'review' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className="space-y-3 lg:col-span-5">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <SpellCheck className="h-4 w-4 text-[#7C3AED]" />
                        <span>Corrector ortográfico ({flattenedSpellErrors.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSpellCheckEnabled((v) => !v)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          spellCheckEnabled
                            ? 'bg-[#7C3AED] text-white'
                            : 'border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {spellCheckEnabled ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={exportingPptx}
                        onClick={() => void handleExportPptx()}
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#EA580C] px-3 text-xs font-semibold text-white hover:bg-[#D44D06] disabled:opacity-50"
                      >
                        <Download className="h-4 w-4" />
                        <span>{exportingPptx ? 'Exportando...' : 'Exportar .pptx'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={exportSlidesHtml}
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                      >
                        <Download className="h-4 w-4 text-emerald-600" />
                        <span>Exportar .html</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                      >
                        <Printer className="h-4 w-4 text-blue-600" />
                        <span>Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditMode(false);
                          setCanvasPanel(null);
                          setPresentationMode(true);
                        }}
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                      >
                        <Maximize2 className="h-4 w-4 text-[#7C3AED]" />
                        <span>Presentar</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5 lg:col-span-7">
                    <div className="text-xs font-semibold">Comentarios ({doc.comments.length})</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newCommentText.trim()) {
                            handleAddComment(newCommentText);
                            setNewCommentText('');
                          }
                        }}
                        placeholder="Añadir comentario..."
                        className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newCommentText.trim()) return;
                          handleAddComment(newCommentText);
                          setNewCommentText('');
                        }}
                        className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#7C3AED] px-3 text-xs font-semibold text-white"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        <span>Añadir</span>
                      </button>
                    </div>
                    {doc.comments.map((cm) => (
                      <div
                        key={cm.id}
                        className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-800"
                      >
                        <div>
                          <div className="font-semibold">{cm.author}</div>
                          <div className={cm.resolved ? 'line-through text-slate-400' : ''}>
                            {cm.text}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => toggleCommentResolved(cm.id)}
                            className="text-blue-600"
                          >
                            {cm.resolved ? 'Reabrir' : 'Resolver'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteComment(cm.id)}
                            className="text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CANVA STUDIO CONTEXTUAL BOTTOM DOCK */}
      {editMode && onUpdateDocument ? (
        <footer className="no-print fixed bottom-0 left-0 right-0 z-40 flex h-[58px] items-center gap-1 overflow-x-auto border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
          {selectedElement ? (
            <>
              {selectedElement.type === 'text' && !selectedElement.locked && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    setEditingTextId((prev) =>
                      prev === selectedElement.id ? null : selectedElement.id,
                    )
                  }
                  className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-[11px] font-semibold ${
                    editingTextId === selectedElement.id
                      ? 'bg-[#7C3AED] text-white'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Pencil className="h-4 w-4" />
                  <span>{editingTextId === selectedElement.id ? 'Listo' : 'Editar'}</span>
                </button>
              )}

              {elementToolTabs.map((tab) => {
                const Icon = tab.icon;
                const active = elementPanel === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      hideSoftKeyboard();
                      setElementPanel(active ? null : tab.id);
                    }}
                    className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-violet-50 text-[#7C3AED] dark:bg-violet-950/60 dark:text-violet-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  copiedStyle
                    ? handlePasteElementStyle(selectedElement.id)
                    : handleCopyElementStyle(selectedElement.id)
                }
                className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-[11px] font-medium ${
                  copiedStyle
                    ? 'bg-violet-50 text-[#7C3AED]'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Paintbrush className="h-4 w-4" />
                <span>{copiedStyle ? 'Pegar' : 'Estilo'}</span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleDuplicateElement(selectedElement.id)}
                className="flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Copy className="h-4 w-4" />
                <span>Duplicar</span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleDeleteElement(selectedElement.id)}
                className="flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
                <span>Eliminar</span>
              </button>
            </>
          ) : (
            <>
              {(
                [
                  { id: 'design', label: 'Diseño', icon: LayoutTemplate },
                  { id: 'elements', label: 'Elementos', icon: Shapes },
                  { id: 'text', label: 'Texto', icon: Type },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = canvasPanel === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      hideSoftKeyboard();
                      setCanvasPanel(active ? null : id);
                    }}
                    className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3.5 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-violet-50 text-[#7C3AED] dark:bg-violet-950/60 dark:text-violet-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  hideSoftKeyboard();
                  uploadImageInputRef.current?.click();
                }}
                className="flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Upload className="h-4 w-4" />
                <span>Subir</span>
              </button>

              {(
                [
                  { id: 'charts', label: 'Gráficos', icon: BarChart3 },
                  { id: 'background', label: 'Fondo', icon: Palette },
                  { id: 'layers', label: 'Capas', icon: Layers },
                  { id: 'review', label: 'Exportar', icon: Download },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = canvasPanel === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      hideSoftKeyboard();
                      setCanvasPanel(active ? null : id);
                    }}
                    className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3.5 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-violet-50 text-[#7C3AED] dark:bg-violet-950/60 dark:text-violet-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </>
          )}
        </footer>
      ) : (
        <footer className="no-print sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-4xl items-center gap-2 overflow-x-auto">
            {slides.map((s, idx) => {
              const active = idx === currentIdx;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`flex h-12 min-w-[140px] shrink-0 items-center gap-2 rounded-xl border px-3 text-left transition-colors ${
                    active
                      ? 'border-[#7C3AED] bg-violet-50/70 text-slate-900 dark:bg-violet-950/40 dark:text-slate-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <span className="font-mono text-xs font-bold tabular-nums text-[#7C3AED]">
                    {s.index}
                  </span>
                  <span className="truncate text-xs font-medium">{s.title}</span>
                </button>
              );
            })}
          </div>
        </footer>
      )}
    </div>
  );
}
