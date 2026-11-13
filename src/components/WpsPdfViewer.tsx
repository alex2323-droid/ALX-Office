import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Grid,
  Moon,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { WpsDocument } from '../data/wpsDocuments';
import { buildSamplePdfBytes } from '../lib/samplePdfGenerator';
import { base64ToUint8 } from '../lib/wpsFileParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface WpsPdfViewerProps {
  document: WpsDocument;
  onBack: () => void;
}

interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  nightFilter,
  sepiaFilter,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  nightFilter: boolean;
  sepiaFilter: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);

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
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

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

  const filterStyle = nightFilter
    ? 'invert(0.9) hue-rotate(180deg)'
    : sepiaFilter
      ? 'sepia(0.28) brightness(0.97)'
      : 'none';

  return (
    <div className="relative mx-auto w-fit overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800">
      <canvas
        ref={canvasRef}
        style={{ filter: filterStyle }}
        className="block max-w-full"
      />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-slate-500">
          Renderizando página {pageNumber}...
        </div>
      )}
    </div>
  );
}

export default function WpsPdfViewer({
  document: doc,
  onBack,
}: WpsPdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'continuous' | 'single'>('continuous');
  const [zoomPercent, setZoomPercent] = useState(110);
  const [nightReading, setNightReading] = useState(false);
  const [sepiaReading, setSepiaReading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pagesText, setPagesText] = useState<ExtractedPdfPage[]>([]);
  const [thumbsOpen, setThumbsOpen] = useState(false);

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
        setCurrentPage(1);

        // Extract text from each page for search
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

  const handleDownloadPdf = () => {
    const bufferCopy = new Uint8Array(rawBytes).buffer;
    const blob = new Blob([bufferCopy], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^\w\dáéíóúñÁÉÍÓÚÑ\-_ ]+/g, '').trim() || 'documento'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const jumpToPage = (pageNum: number) => {
    const bounded = Math.max(1, Math.min(numPages || 1, pageNum));
    setCurrentPage(bounded);
    if (viewMode === 'continuous') {
      const el = window.document.getElementById(`wps-pdf-page-${bounded}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setThumbsOpen(false);
  };

  const scale = (zoomPercent / 100) * (viewportWidth < 640 ? 0.62 : 1.05);

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
              PDF · {numPages} {numPages === 1 ? 'página' : 'páginas'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Buscar en PDF"
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
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
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
              nightReading
                ? 'bg-slate-900 text-amber-300 dark:bg-slate-700'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Moon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            aria-label="Descargar PDF"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#EA3D2F] px-3 text-xs font-semibold text-white hover:bg-[#D63124] whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Descargar PDF</span>
          </button>
        </div>
      </header>

      {/* Search in PDF Bar */}
      {searchOpen && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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

      {/* Main PDF Pages Viewport */}
      <main className="flex-1 overflow-auto px-3 py-5 pb-24 sm:px-6">
        {loading ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Cargando documento PDF...
          </div>
        ) : errorMsg ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {errorMsg}
          </div>
        ) : pdfDoc ? (
          <div className="space-y-5">
            {viewMode === 'single' ? (
              <div id={`wps-pdf-page-${currentPage}`}>
                <PdfPageCanvas
                  pdfDoc={pdfDoc}
                  pageNumber={currentPage}
                  scale={scale}
                  nightFilter={nightReading}
                  sepiaFilter={sepiaReading}
                />
              </div>
            ) : (
              Array.from({ length: numPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <div key={pageNum} id={`wps-pdf-page-${pageNum}`} className="space-y-1.5">
                    <div className="text-center font-mono text-[11px] tabular-nums text-slate-400">
                      Página {pageNum} / {numPages}
                    </div>
                    <PdfPageCanvas
                      pdfDoc={pdfDoc}
                      pageNumber={pageNum}
                      scale={scale}
                      nightFilter={nightReading}
                      sepiaFilter={sepiaReading}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </main>

      {/* Page Index / Thumbnails Sheet */}
      {thumbsOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setThumbsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-5 sm:rounded-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Índice de páginas ({numPages})
              </h2>
              <button
                type="button"
                onClick={() => setThumbsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {pagesText.map((p) => (
                <button
                  key={p.pageNumber}
                  type="button"
                  onClick={() => jumpToPage(p.pageNumber)}
                  className={`flex w-full items-start gap-3 py-3 text-left transition-colors ${
                    currentPage === p.pageNumber
                      ? 'text-[#EA3D2F] dark:text-red-400'
                      : 'text-slate-700 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">
                    Pág. {p.pageNumber}
                  </span>
                  <span className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {p.text || 'Contenido gráfico / sin texto'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Ergonomic PDF Control Bar (52px) */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 flex h-[52px] items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setThumbsOpen(true)}
            aria-label="Índice de páginas"
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
    </div>
  );
}
