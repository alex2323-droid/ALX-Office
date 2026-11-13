import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Monitor,
  Search,
  StickyNote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { WpsDocument, WpsSlide, WpsSlideElement } from '../data/wpsDocuments';

interface WpsPptViewerProps {
  document: WpsDocument;
  onBack: () => void;
}

type SlideTheme = 'light' | 'slate' | 'dark';
type PptViewMode = 'slide' | 'reading';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function SlideStage({
  slide,
  totalSlides,
  formatLabel,
  theme,
  interactive = true,
  fitHeight = false,
}: {
  slide: WpsSlide;
  totalSlides: number;
  formatLabel: string;
  theme: SlideTheme;
  interactive?: boolean;
  fitHeight?: boolean;
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
            overflow: 'hidden',
          }}
          className="rounded border border-slate-300/70 bg-white/95 text-slate-900"
        >
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-slate-100">
                {el.headers.map((h, i) => (
                  <th key={i} className="border-b border-slate-300 px-2.5 py-1.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {el.rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-slate-200 last:border-b-0">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-2.5 py-1.5">
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
}: {
  slide: WpsSlide;
  totalSlides: number;
  formatLabel: string;
  surface: { bg: string; text: string; sub: string; border: string };
}) {
  const denseBullets = slide.bullets.length > 5;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '44px 56px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: surface.text,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#EA580C',
          }}
        >
          <span>{formatLabel} · WPS Presentation</span>
          <span className="font-mono tabular-nums">
            {slide.index} / {totalSlides}
          </span>
        </div>

        <h2
          style={{
            fontSize: slide.title.length > 68 ? '28px' : '34px',
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: slide.subtitle ? '10px' : '22px',
          }}
          className="font-display"
        >
          {slide.title}
        </h2>

        {slide.subtitle && (
          <p
            style={{
              fontSize: '18px',
              lineHeight: 1.4,
              color: surface.sub,
              marginBottom: '20px',
            }}
          >
            {slide.subtitle}
          </p>
        )}

        {slide.bullets.length > 0 && (
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
                style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}
              >
                <span
                  style={{
                    marginTop: '9px',
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
        )}

        {slide.table && (
          <div style={{ marginTop: '20px' }}>
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
                      {h}
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

      <div
        style={{
          height: '3px',
          width: '64px',
          borderRadius: '9999px',
          backgroundColor: '#EA580C',
          opacity: 0.75,
        }}
      />
    </div>
  );
}

export default function WpsPptViewer({
  document: doc,
  onBack,
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
  const [notesOpen, setNotesOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [viewMode, setViewMode] = useState<PptViewMode>('slide');
  const [slideTheme, setSlideTheme] = useState<SlideTheme>('light');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const activeSlide = slides[currentIdx] ?? slides[0];
  const hasExplicitRichLayout = Boolean(
    activeSlide.elements && activeSlide.elements.length > 0,
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (presentationMode && e.key === ' ')) {
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
    return slides.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.subtitle || '').toLowerCase().includes(q) ||
        s.bullets.some((b) => b.toLowerCase().includes(q)) ||
        s.notes.toLowerCase().includes(q),
    );
  }, [slides, searchQuery]);

  const exportSlidesHtml = () => {
    const body = slides
      .map(
        (s) =>
          `<section style="border:1px solid #cbd5e1;border-radius:12px;padding:32px;margin-bottom:24px;">
            <div style="font-size:12px;color:#ea580c;font-weight:bold;">Diapositiva ${s.index}</div>
            <h2>${escapeHtml(s.title)}</h2>
            ${s.subtitle ? `<p>${escapeHtml(s.subtitle)}</p>` : ''}
            <ul>${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
            ${s.notes ? `<p style="color:#64748b;font-size:13px;"><strong>Notas:</strong> ${escapeHtml(s.notes)}</p>` : ''}
          </section>`,
      )
      .join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head><body style="font-family:Arial,sans-serif;max-width:900px;margin:40px auto;"><h1>${escapeHtml(doc.title)}</h1>${body}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^\w\dáéíóúñÁÉÍÓÚÑ\-_ ]+/g, '').trim() || 'presentacion'}.html`;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Compact Sticky Top Bar (52px) */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a documentos"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {doc.title}
            </div>
            <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {doc.format} · Diapositiva {currentIdx + 1} de {slides.length}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode((v) => (v === 'slide' ? 'reading' : 'slide'))}
            aria-label={viewMode === 'slide' ? 'Cambiar a lectura móvil' : 'Cambiar a vista diapositiva'}
            title={viewMode === 'slide' ? 'Lectura móvil' : 'Vista diapositiva'}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
              viewMode === 'reading'
                ? 'bg-orange-50 text-[#EA580C] dark:bg-orange-950/50 dark:text-orange-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {viewMode === 'slide' ? (
              <AlignLeft className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setGridOpen(true)}
            aria-label="Cuadrícula de diapositivas"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Buscar en diapositivas"
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl ${
              searchOpen
                ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={exportSlidesHtml}
            aria-label="Exportar presentación"
            className="hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 sm:flex dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setPresentationMode(true)}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#EA580C] px-3 text-xs font-semibold text-white hover:bg-[#D44D06]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Presentar</span>
          </button>
        </div>
      </header>

      {/* Search Strip */}
      {searchOpen && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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
        className="flex flex-1 flex-col items-center justify-center px-3 py-5 sm:px-6 sm:py-7"
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
        <div className="w-full max-w-4xl space-y-4">
          {viewMode === 'slide' ? (
            <div className="overflow-auto rounded-xl">
              <div style={{ width: `${zoomPercent}%`, minWidth: '100%' }}>
                <SlideStage
                  slide={activeSlide}
                  totalSlides={slides.length}
                  formatLabel={doc.format}
                  theme={slideTheme}
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
              <h1 className="font-display text-xl font-bold leading-snug text-slate-900 sm:text-2xl dark:text-slate-100">
                {activeSlide.title}
              </h1>
              {activeSlide.subtitle && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {activeSlide.subtitle}
                </p>
              )}
              {activeSlide.bullets.length > 0 && (
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-800 sm:text-base dark:text-slate-200">
                  {activeSlide.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#EA580C]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {activeSlide.notes || 'Sin notas registradas para esta diapositiva.'}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Visual Thumbnail Grid Modal */}
      {gridOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4"
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

      {/* Bottom Slide Filmstrip */}
      <footer className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
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
    </div>
  );
}
