import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Pencil,
  Plus,
  Printer,
  Redo2,
  Search,
  SpellCheck,
  StickyNote,
  Table2,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  WpsComment,
  WpsDocument,
  WpsSlide,
  WpsSlideElement,
  WpsSlideParagraph,
} from '../data/wpsDocuments';
import { useDocumentHistory } from '../hooks/useDocumentHistory';
import {
  hideSoftKeyboard,
  isRangeInsideElement,
  prepareSelectionForBlockInsert,
  runCommandWithoutKeyboardPopup,
  syncCheckboxAttribute,
} from '../lib/editorDom';
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

function RichEditableBox({
  fieldKey,
  html,
  placeholder,
  scale = 1,
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
    if (!spellCheckEnabled || !el) {
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
        data-placeholder={placeholder}
        onFocus={(e) => {
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onInput={(e) => {
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
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onMouseUp={(e) => {
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onTouchEnd={(e) => {
          onActivate(fieldKey, e.currentTarget);
          onSyncFormats();
        }}
        onContextMenu={(e) => {
          if (!spellCheckEnabled || !editorRef.current) return;
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
        className={`wps-doc-canvas [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_ol]:mb-1.5 relative z-[1] h-full w-full outline-none ${className}`}
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
  activeFieldKey = null,
  spellCheckEnabled = true,
  customDict,
  ignoredSpellWords,
  onSelectElement,
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
  theme: SlideTheme;
  interactive?: boolean;
  fitHeight?: boolean;
  editMode?: boolean;
  selectedElementId?: string | null;
  activeFieldKey?: string | null;
  spellCheckEnabled?: boolean;
  customDict?: Set<string>;
  ignoredSpellWords?: Set<string>;
  onSelectElement?: (id: string | null) => void;
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 800, height: 450 });

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

  const renderRichElement = (el: WpsSlideElement) => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${el.xPct}%`,
      top: `${el.yPct}%`,
      width: `${el.wPct}%`,
      height: `${el.hPct}%`,
      zIndex: el.zIndex,
    };

    if (el.type === 'shape') {
      const rot = el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined;
      if (el.shapeKind === 'line') {
        return (
          <div
            key={el.id}
            style={{
              ...baseStyle,
              transform: rot,
              borderTop: `2px solid ${el.borderColor || el.fillColor || '#94A3B8'}`,
            }}
          />
        );
      }
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            transform: rot,
            backgroundColor: el.fillColor || 'transparent',
            border: el.borderColor ? `1.5px solid ${el.borderColor}` : undefined,
            borderRadius:
              el.shapeKind === 'ellipse'
                ? '9999px'
                : el.shapeKind === 'roundRect'
                  ? '12px'
                  : '2px',
          }}
        />
      );
    }

    if (el.type === 'image') {
      return (
        <img
          key={el.id}
          src={el.src}
          alt={el.alt || 'Elemento gráfico'}
          style={{
            ...baseStyle,
            transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
            objectFit: el.imageFit || 'contain',
          }}
          draggable={false}
        />
      );
    }

    if (el.type === 'chart') {
      const allVals = el.series.flatMap((s) => s.points.map((p) => p.value));
      const maxVal = Math.max(1, ...allVals);
      const firstSeries = el.series[0];
      const colors = ['#2563EB', '#EA580C', '#16A34A', '#7C3AED'];
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            overflow: 'hidden',
          }}
          className="flex flex-col justify-between rounded-lg border border-slate-300/80 bg-white/95 p-3 text-slate-900 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-xs font-bold text-slate-800">
              {el.title || 'Gráfico'}
            </span>
            <div className="flex flex-wrap gap-2">
              {el.series.slice(0, 3).map((s, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                  <span
                    className="h-2 w-2 rounded-xs"
                    style={{ backgroundColor: colors[idx % colors.length] }}
                  />
                  {s.name}
                </span>
              ))}
            </div>
          </div>
          {firstSeries && (
            <div className="mt-2 flex flex-1 items-end gap-2 pt-2">
              {firstSeries.points.slice(0, 8).map((pt, pIdx) => (
                <div key={pIdx} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                    {el.series.slice(0, 3).map((s, sIdx) => {
                      const val = s.points[pIdx]?.value ?? 0;
                      const hPct = Math.max(6, Math.round((val / maxVal) * 100));
                      return (
                        <div
                          key={sIdx}
                          title={`${s.name}: ${val}`}
                          style={{
                            height: `${hPct}%`,
                            backgroundColor: colors[sIdx % colors.length],
                          }}
                          className="w-full max-w-[18px] rounded-t-xs"
                        />
                      );
                    })}
                  </div>
                  <span className="w-full truncate text-center text-[10px] text-slate-600">
                    {pt.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (el.type === 'diagram') {
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            overflow: 'hidden',
          }}
          className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/90 p-3 text-slate-900"
        >
          {el.items.slice(0, 8).map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs"
            >
              {item}
            </div>
          ))}
        </div>
      );
    }

    if (el.type === 'table') {
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            overflow: 'auto',
          }}
          className="rounded border border-slate-300/70 bg-white/95 text-slate-900"
        >
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-slate-100">
                {el.headers.map((h, i) => (
                  <th key={i} className="border-b border-slate-300 px-2.5 py-1.5 font-semibold">
                    {editMode && onChangeSlide ? (
                      <input
                        type="text"
                        value={h}
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
                        className="w-full bg-transparent font-semibold focus:outline-none focus:ring-1 focus:ring-[#EA580C] rounded px-0.5"
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
                      {editMode && onChangeSlide ? (
                        <input
                          type="text"
                          value={cell}
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
                          className="w-full bg-transparent focus:outline-none focus:ring-1 focus:ring-[#EA580C] rounded px-0.5"
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
      );
    }

    const fieldKey = `el:${slide.id}:${el.id}`;
    const isSelectedText =
      editMode && (selectedElementId === el.id || activeFieldKey === fieldKey);
    const firstRun = el.paragraphs[0]?.runs[0];
    const firstParaAlign = el.paragraphs[0]?.align || 'left';
    const fontPx = Math.max(
      11,
      Math.round((firstRun?.fontSizePt || (el.isTitle ? 28 : 16)) * 1.333),
    );
    const initialHtml = slideTextElementToHtml(el);

    if (editMode && onChangeSlide) {
      return (
        <div
          key={el.id}
          onClick={(e) => {
            e.stopPropagation();
            onSelectElement?.(el.id);
          }}
          style={{
            ...baseStyle,
            transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
            backgroundColor: el.fillColor || 'transparent',
            border: el.borderColor ? `1.5px solid ${el.borderColor}` : undefined,
            outline: isSelectedText
              ? '2px solid #EA580C'
              : '1px dashed rgba(148, 163, 184, 0.7)',
            outlineOffset: '-1px',
            borderRadius: '6px',
            padding: '4px 8px',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: el.isTitle ? 'center' : 'flex-start',
          }}
        >
          <RichEditableBox
            fieldKey={fieldKey}
            html={initialHtml}
            scale={scale}
            placeholder="Escribe aquí..."
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
              onChangeSlide((prev) => ({
                ...prev,
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
              fontSize: `${fontPx}px`,
              color: firstRun?.color || '#0F172A',
              textAlign: firstParaAlign,
              lineHeight: 1.3,
              height: el.isTitle ? 'auto' : '100%',
            }}
          />
        </div>
      );
    }

    if (el.richHtml !== undefined) {
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
            backgroundColor: el.fillColor || 'transparent',
            border: el.borderColor ? `1.5px solid ${el.borderColor}` : undefined,
            padding: '4px 8px',
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: el.isTitle ? 'center' : 'flex-start',
            fontSize: `${fontPx}px`,
            color: firstRun?.color || '#0F172A',
            textAlign: firstParaAlign,
            lineHeight: 1.3,
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
          ...baseStyle,
          transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
          backgroundColor: el.fillColor || 'transparent',
          border: el.borderColor ? `1.5px solid ${el.borderColor}` : undefined,
          padding: '4px 8px',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: el.isTitle ? 'center' : 'flex-start',
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
                lineHeight: 1.28,
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
                    Math.round((run.fontSizePt || (el.isTitle ? 28 : 16)) * 1.333),
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
          <div
            style={{
              width: `${virtualW}px`,
              height: `${virtualH}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundColor: stageBg,
              backgroundImage: slide.backgroundImage
                ? `url(${slide.backgroundImage})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
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
    <div
      ref={hostRef}
      style={{ aspectRatio: `${aspectRatio}` }}
      onClick={() => editMode && onSelectElement?.(null)}
      className={`relative w-full overflow-hidden rounded-xl border border-slate-200/90 shadow-md dark:border-slate-800 ${
        interactive ? 'select-text' : 'pointer-events-none select-none'
      }`}
    >
      <div
        style={{
          width: `${virtualW}px`,
          height: `${virtualH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          backgroundColor: stageBg,
          backgroundImage: slide.backgroundImage
            ? `url(${slide.backgroundImage})`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
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
                  ? '2px solid #EA580C'
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
                      ? '2px solid #EA580C'
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

        {/* Rich Body (Supports full Word formatting: bold, italic, lists, checklists, tables, images) */}
        {editMode && onChangeSlide ? (
          <div
            style={{
              outline:
                activeFieldKey === bodyKey
                  ? '2px solid #EA580C'
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
                <li
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                >
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
                          className="w-full rounded border border-dashed border-slate-400/40 bg-transparent px-1 font-semibold focus:border-[#EA580C] focus:outline-none"
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
                  <tr
                    key={rIdx}
                    style={{ borderBottom: `1px solid ${surface.border}` }}
                  >
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
                            className="w-full rounded border border-dashed border-slate-400/40 bg-transparent px-1 focus:border-[#EA580C] focus:outline-none"
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
  const [notesOpen, setNotesOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [viewMode, setViewMode] = useState<PptViewMode>('slide');
  const [slideTheme, setSlideTheme] = useState<SlideTheme>('light');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Word-parity editing bar state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<ToolDrawerTab>('inicio');
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

  const selectedTextElement = useMemo(() => {
    if (!selectedElementId || !activeSlide.elements) return null;
    const found = activeSlide.elements.find((e) => e.id === selectedElementId);
    return found && found.type === 'text' ? found : null;
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
  }, [activeSlide, hasExplicitRichLayout]);

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

  const insertHtmlAtCursor = (html: string) => {
    runWordCommand('insertHTML', html);
  };

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

  const handleAddSlide = () => {
    const newSlide: WpsSlide = {
      id: `s-${Date.now()}`,
      index: slides.length + 1,
      title: `Nueva diapositiva ${slides.length + 1}`,
      subtitle: 'Subtítulo editable',
      bullets: ['Primer punto clave', 'Segundo punto clave'],
      notes: '',
    };
    const next = [
      ...slides.slice(0, currentIdx + 1),
      newSlide,
      ...slides.slice(currentIdx + 1),
    ];
    commitSlides(next, true);
    setCurrentIdx(currentIdx + 1);
    setSelectedElementId(null);
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

  const handleAddRichTextBox = () => {
    const id = `tb-${Date.now()}`;
    const newBox: WpsSlideElement = {
      id,
      type: 'text',
      xPct: 12,
      yPct: 24,
      wPct: 76,
      hPct: 24,
      zIndex: (activeSlide.elements?.length ?? 0) + 10,
      richHtml: '<p>Nuevo cuadro de texto</p>',
      paragraphs: [
        {
          align: 'left',
          runs: [
            {
              text: 'Nuevo cuadro de texto',
              fontSizePt: 18,
              color: '#0F172A',
              bold: false,
            },
          ],
        },
      ],
    };
    updateActiveSlide(
      (prev) => ({
        ...prev,
        elements: [...(prev.elements || []), newBox],
      }),
      true,
    );
    setSelectedElementId(id);
  };

  const handleAddStructuredTable = () => {
    updateActiveSlide(
      (prev) =>
        prev.table
          ? {
              ...prev,
              table: {
                ...prev.table,
                rows: [...prev.table.rows, prev.table.headers.map(() => 'Dato')],
              },
            }
          : {
              ...prev,
              table: {
                headers: ['Elemento', 'Valor'],
                rows: [['Métrica 1', '100%']],
              },
            },
      true,
    );
  };

  // Reset active editable key & spell menu when changing slide
  useEffect(() => {
    setSpellMenu(null);
    setSpellErrorsByField({});
    activeFieldKeyRef.current = null;
    setActiveFieldKey(null);
    savedRangeRef.current = null;
  }, [currentIdx]);

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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [slides.length, presentationMode]);

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
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#EA580C] px-4 text-xs font-semibold text-white hover:bg-[#D44D06]"
          >
            <Minimize2 className="h-4 w-4" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wps-print-root flex min-h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
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
                {doc.format} · Diapositiva {currentIdx + 1} de {slides.length}
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
                  setDrawerOpen(false);
                }
                setSpellMenu(null);
                setSelectedElementId(null);
                setEditMode((v) => !v);
              }}
              aria-label={editMode ? 'Finalizar edición de diapositivas' : 'Editar diapositivas'}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                editMode
                  ? 'bg-[#EA3D2F] text-white hover:bg-[#D63124]'
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
                ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Imprimir presentación"
            className="hidden min-h-[44px] min-w-[40px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:flex dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setEditMode(false);
              setDrawerOpen(false);
              setPresentationMode(true);
            }}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#EA580C] px-3 text-xs font-semibold text-white hover:bg-[#D44D06]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Presentar</span>
          </button>
        </div>
      </header>

      {/* Compact In-Place Slide Structure Strip */}
      {editMode && onUpdateDocument && (
        <div className="no-print sticky top-[52px] z-20 border-b border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-5xl items-center gap-1.5 overflow-x-auto whitespace-nowrap">
            <button
              type="button"
              onClick={handleAddSlide}
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg bg-[#EA580C] px-2.5 text-xs font-semibold text-white hover:bg-[#D44D06]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Diapositiva</span>
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
              aria-label="Mover diapositiva a la izquierda"
              className="flex min-h-[34px] min-w-[32px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={currentIdx >= slides.length - 1}
              onClick={() => handleMoveSlide(1)}
              aria-label="Mover diapositiva a la derecha"
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

            {!hasExplicitRichLayout ? (
              <>
                {activeSlide.subtitle === undefined && (
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveSlide(
                        (prev) => ({
                          ...prev,
                          subtitle: 'Subtítulo de la diapositiva',
                          subtitleHtml: '<p>Subtítulo de la diapositiva</p>',
                        }),
                        true,
                      )
                    }
                    className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Type className="h-3.5 w-3.5" />
                    <span>Subtítulo</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddStructuredTable}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span>{activeSlide.table ? '+ Fila' : '+ Tabla'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleAddRichTextBox}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Type className="h-3.5 w-3.5" />
                  <span>+ Texto</span>
                </button>

                {selectedTextElement && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = selectedTextElement.id;
                      updateActiveSlide(
                        (prev) => ({
                          ...prev,
                          elements: prev.elements?.filter((e) => e.id !== targetId),
                        }),
                        true,
                      );
                      setSelectedElementId(null);
                    }}
                    className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Quitar cuadro</span>
                  </button>
                )}
              </>
            )}

            <span className="hidden pl-2 text-xs text-slate-500 lg:inline dark:text-slate-400">
              Usa la barra inferior y Herramientas igual que en Word.
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
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#EA580C] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 hover:border-[#EA580C] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
          editMode && onUpdateDocument ? 'pb-[76px]' : ''
        }`}
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
                  activeFieldKey={activeFieldKey}
                  spellCheckEnabled={spellCheckEnabled}
                  customDict={customDict}
                  ignoredSpellWords={ignoredSpellWords}
                  onSelectElement={setSelectedElementId}
                  onChangeSlide={onUpdateDocument ? updateActiveSlide : undefined}
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
            /* Mobile Reading Reflow Mode */
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#EA580C]">
                <span>Lectura continua · {doc.format}</span>
                <span className="font-mono tabular-nums">
                  Diapositiva {activeSlide.index} / {slides.length}
                </span>
              </div>
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
              {activeSlide.elements &&
                activeSlide.elements.some((el) => el.type === 'image') && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {activeSlide.elements
                      .filter((el) => el.type === 'image')
                      .map((imgEl) => (
                        <img
                          key={imgEl.id}
                          src={imgEl.src}
                          alt={imgEl.alt || 'Imagen de diapositiva'}
                          className="max-h-56 w-full rounded-xl border border-slate-200 object-contain bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950"
                        />
                      ))}
                  </div>
                )}
              {activeSlide.elements &&
                activeSlide.elements
                  .filter((el) => el.type === 'diagram')
                  .map((dgmEl) => (
                    <div
                      key={dgmEl.id}
                      className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                    >
                      {dgmEl.items.map((item, idx) => (
                        <span
                          key={idx}
                          className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:border-orange-900/50 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ))}
              {activeSlide.elements &&
                activeSlide.elements
                  .filter((el) => el.type === 'chart')
                  .map((chEl) => (
                    <div
                      key={chEl.id}
                      className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {chEl.title || 'Datos del gráfico'}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {chEl.series[0]?.points.map((pt, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-400">{pt.label}</span>
                            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                              {pt.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
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
            </div>
          )}

          {/* External Slide Action Row (Outside Slide Canvas) */}
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

              {!hasExplicitRichLayout && (
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
                  {(['light', 'slate', 'dark'] as SlideTheme[]).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setSlideTheme(theme)}
                      className={`min-h-[34px] rounded-lg px-2.5 text-[11px] font-medium ${
                        slideTheme === theme
                          ? 'bg-[#EA580C] text-white'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {theme === 'light' ? 'Claro' : theme === 'slate' ? 'Azul' : 'Oscuro'}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
                  notesOpen
                    ? 'border-[#EA580C] bg-orange-50 text-[#EA580C] dark:bg-orange-950/40 dark:text-orange-300'
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
                  <StickyNote className="h-4 w-4 text-[#EA580C]" />
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
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800 focus:border-[#EA580C] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
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

      {/* Contextual Spellcheck Menu for In-Place Slide Editing */}
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
                        ? 'border-[#EA580C] bg-orange-50/60 dark:bg-orange-950/30'
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
                      <span className="font-mono text-[11px] font-bold tabular-nums text-[#EA580C]">
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

      {/* Word Editing Bar in Edit Mode, or Native Filmstrip in Read Mode */}
      {editMode && onUpdateDocument ? (
        <WpsWordEditingBar
          drawerOpen={drawerOpen}
          onDrawerOpenChange={setDrawerOpen}
          drawerTab={drawerTab}
          onDrawerTabChange={setDrawerTab}
          activeFormats={activeFormats}
          onRunCommand={runWordCommand}
          onInsertHtml={insertHtmlAtCursor}
          spellCheckEnabled={spellCheckEnabled}
          onToggleSpellCheck={() => setSpellCheckEnabled((v) => !v)}
          spellErrorCount={flattenedSpellErrors.length}
          firstSpellErrorWord={flattenedSpellErrors[0]?.match.word}
          onJumpToNextSpellError={handleJumpToNextSpellError}
          comments={doc.comments}
          onAddComment={handleAddComment}
          onToggleCommentResolved={toggleCommentResolved}
          onDeleteComment={deleteComment}
          extraInsertSection={
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Elementos de diapositiva
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleAddSlide();
                    setDrawerOpen(false);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Plus className="h-4 w-4 text-[#EA580C]" />
                  <span>Nueva diapositiva</span>
                </button>
                {hasExplicitRichLayout ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleAddRichTextBox();
                      setDrawerOpen(false);
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Type className="h-4 w-4 text-blue-600" />
                    <span>Cuadro de texto</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      handleAddStructuredTable();
                      setDrawerOpen(false);
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Table2 className="h-4 w-4 text-blue-600" />
                    <span>{activeSlide.table ? 'Agregar fila a tabla' : 'Tabla de diapositiva'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setNotesOpen(true);
                    setDrawerOpen(false);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <StickyNote className="h-4 w-4 text-amber-600" />
                  <span>Notas del orador</span>
                </button>
              </div>
            </div>
          }
          viewTabContent={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Modo de vista
                </div>
                <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode('slide')}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
                      viewMode === 'slide'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    <span>Diapositiva</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('reading')}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
                      viewMode === 'reading'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <AlignLeft className="h-3.5 w-3.5" />
                    <span>Lectura</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Zoom ({zoomPercent}%)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[100, 125, 150, 200].map((z) => (
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

              {!hasExplicitRichLayout && (
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Tema visual
                  </div>
                  <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {(['light', 'slate', 'dark'] as SlideTheme[]).map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => setSlideTheme(theme)}
                        className={`min-h-[36px] rounded-lg px-3 text-xs font-medium ${
                          slideTheme === theme
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {theme === 'light' ? 'Claro' : theme === 'slate' ? 'Azul' : 'Oscuro'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Navegación y notas
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      setGridOpen(true);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Cuadrícula</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotesOpen((v) => !v)}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                      notesOpen
                        ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    <span>Notas</span>
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={exportSlidesHtml}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  <span>Página (.html)</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Printer className="h-4 w-4 text-[#EA3D2F]" />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditMode(false);
                    setDrawerOpen(false);
                    setPresentationMode(true);
                  }}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Maximize2 className="h-4 w-4 text-[#EA580C]" />
                  <span>Presentar</span>
                </button>
              </div>
            </div>
          }
        />
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
                      ? 'border-[#EA580C] bg-orange-50/70 text-slate-900 dark:bg-orange-950/40 dark:text-slate-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  <span className="font-mono text-xs font-bold tabular-nums text-[#EA580C]">
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
