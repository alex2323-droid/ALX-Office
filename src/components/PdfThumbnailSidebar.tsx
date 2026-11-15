import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Grid, PanelLeftClose, X } from 'lucide-react';

interface PdfThumbnailSidebarProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  numPages: number;
  currentPage: number;
  pagesText: { pageNumber: number; text: string }[];
  draftCountByPage: Map<number, number>;
  nightFilter: boolean;
  sepiaFilter: boolean;
  open: boolean;
  onClose: () => void;
  onSelectPage: (pageNumber: number) => void;
  onOpenOrganizer: () => void;
}

interface PdfThumbnailItemProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  snippet?: string;
  draftCount: number;
  nightFilter: boolean;
  sepiaFilter: boolean;
  onSelect: (pageNumber: number) => void;
}

function PdfThumbnailItem({
  pdfDoc,
  pageNumber,
  isActive,
  snippet,
  draftCount,
  nightFilter,
  sepiaFilter,
  onSelect,
}: PdfThumbnailItemProps) {
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inView, setInView] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
        }
      },
      { rootMargin: '220px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    setRendered(false);

    async function renderThumb() {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseVp = page.getViewport({ scale: 1 });
        const targetWidth = 156;
        const thumbScale = Math.min(0.55, targetWidth / Math.max(1, baseVp.width));
        const viewport = page.getViewport({ scale: thumbScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cssW = Math.max(60, Math.floor(viewport.width));
        const cssH = Math.max(60, Math.floor(viewport.height));
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch {
        // Ignore cancelled render tasks
      }
    }

    void renderThumb();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, inView]);

  useEffect(() => {
    if (isActive && containerRef.current) {
      containerRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isActive]);

  const filterStyle = nightFilter
    ? 'invert(0.9) hue-rotate(180deg)'
    : sepiaFilter
      ? 'sepia(0.28) brightness(0.97)'
      : 'none';

  return (
    <button
      ref={containerRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={`Ir a página ${pageNumber}`}
      className={`group flex w-full flex-col items-center rounded-xl p-2 text-left transition-colors ${
        isActive
          ? 'bg-red-50/90 dark:bg-red-950/35'
          : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/70'
      }`}
    >
      <div
        className={`relative flex min-h-[112px] w-[156px] items-center justify-center overflow-hidden rounded-lg border bg-white shadow-xs transition-all ${
          isActive
            ? 'border-2 border-[#EA3D2F] shadow-sm'
            : 'border-slate-200 group-hover:border-slate-300 dark:border-slate-700 dark:group-hover:border-slate-600'
        }`}
      >
        <canvas
          ref={canvasRef}
          style={{ filter: filterStyle }}
          className="block max-w-full"
        />
        {!rendered && (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-50 font-mono text-[11px] tabular-nums text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            {pageNumber}
          </span>
        )}
      </div>

      <div className="mt-1.5 w-[156px] space-y-0.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span
            className={`font-mono font-semibold tabular-nums ${
              isActive
                ? 'text-[#EA3D2F] dark:text-red-400'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            Pág. {pageNumber}
          </span>
          {draftCount > 0 && (
            <span className="font-mono text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
              {draftCount} {draftCount === 1 ? 'cambio' : 'cambios'}
            </span>
          )}
        </div>
        {snippet && (
          <p className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
            {snippet}
          </p>
        )}
      </div>
    </button>
  );
}

export default function PdfThumbnailSidebar({
  pdfDoc,
  numPages,
  currentPage,
  pagesText,
  draftCountByPage,
  nightFilter,
  sepiaFilter,
  open,
  onClose,
  onSelectPage,
  onOpenOrganizer,
}: PdfThumbnailSidebarProps) {
  if (!open) return null;

  const listContent = (
    <>
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="truncate font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
            Miniaturas
          </h2>
          <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            · {numPages}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onOpenOrganizer}
            title="Organizar páginas"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Grid className="h-3.5 w-3.5" />
            <span>Organizar</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Ocultar barra lateral de miniaturas"
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <PanelLeftClose className="hidden h-4 w-4 lg:block" />
            <X className="h-4 w-4 lg:hidden" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {Array.from({ length: numPages }).map((_, idx) => {
          const pageNumber = idx + 1;
          const info = pagesText.find((p) => p.pageNumber === pageNumber);
          return (
            <PdfThumbnailItem
              key={pageNumber}
              pdfDoc={pdfDoc}
              pageNumber={pageNumber}
              isActive={currentPage === pageNumber}
              snippet={info?.text}
              draftCount={draftCountByPage.get(pageNumber) ?? 0}
              nightFilter={nightFilter}
              sepiaFilter={sepiaFilter}
              onSelect={onSelectPage}
            />
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop docked thumbnail sidebar */}
      <aside
        aria-label="Vista general de páginas del PDF"
        className="no-print hidden h-full w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/95 lg:flex xl:w-60 dark:border-slate-800 dark:bg-slate-900/90"
      >
        {listContent}
      </aside>

      {/* Mobile / Tablet slide-over thumbnail drawer */}
      <div
        className="no-print fixed inset-0 z-40 flex bg-black/50 backdrop-blur-xs lg:hidden"
        onClick={onClose}
      >
        <aside
          aria-label="Vista general de páginas del PDF"
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-64 max-w-[82vw] flex-col border-r border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        >
          {listContent}
        </aside>
      </div>
    </>
  );
}
