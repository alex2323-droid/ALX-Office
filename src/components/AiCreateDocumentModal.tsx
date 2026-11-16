import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Presentation,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import type { WpsDocument } from '../data/wpsDocuments';
import {
  AiCreateDocumentResponse,
  requestAiCreateDocument,
} from '../lib/aiEditorClient';
import { buildWpsSlideFromAiProposal } from '../lib/aiSlideBuilder';
import { buildPdfBytesFromPageHtmls } from '../lib/pdfEditor';
import { uint8ToBase64 } from '../lib/wpsFileParser';
import AiSlideCanvasPreview from './AiSlideCanvasPreview';

interface AiCreateDocumentModalProps {
  open: boolean;
  initialFormat?: 'DOCX' | 'PPTX' | 'PDF';
  onClose: () => void;
  onCreateDocument: (doc: WpsDocument) => void;
}

const FORMAT_OPTIONS = [
  {
    id: 'DOCX' as const,
    label: 'Word (.docx)',
    hint: 'Informe, ensayo, contrato o guía',
    badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  },
  {
    id: 'PPTX' as const,
    label: 'Presentación (.pptx)',
    hint: 'Diapositivas Canva con gráficos y tarjetas',
    badgeClass:
      'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  },
  {
    id: 'PDF' as const,
    label: 'Documento (.pdf)',
    hint: 'PDF multipágina maquetado listo para anotar',
    badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  },
];

const PALETTE_OPTIONS = [
  { id: 'auto', label: 'Automática' },
  { id: 'corporate-blue', label: 'Azul Corporativo' },
  { id: 'canva-violet', label: 'Estudio Violeta' },
  { id: 'emerald', label: 'Esmeralda' },
  { id: 'dark-luxury', label: 'Oscuro Elegante' },
  { id: 'warm-editorial', label: 'Editorial Cálido' },
];

const FONT_OPTIONS = [
  { id: 'auto', label: 'Automática' },
  { id: 'modern-sans', label: 'Jakarta Sans' },
  { id: 'editorial-serif', label: 'Lora Serif' },
  { id: 'playfair-luxury', label: 'Playfair' },
  { id: 'impact-display', label: 'Oswald' },
  { id: 'tech-mono', label: 'JetBrains Mono' },
];

const TONE_OPTIONS = [
  { id: 'profesional', label: 'Profesional' },
  { id: 'ejecutivo', label: 'Ejecutivo' },
  { id: 'educativo', label: 'Educativo / Claro' },
  { id: 'creativo', label: 'Creativo / Canva' },
];

const PROMPT_SUGGESTIONS: Record<'DOCX' | 'PPTX' | 'PDF', string[]> = {
  DOCX: [
    'Propuesta comercial de servicios digitales con alcance, tabla de inversión y cronograma',
    'Manual operativo de bienvenida para nuevos integrantes del equipo',
  ],
  PPTX: [
    'Presentación de resultados trimestrales con métricas de ventas, gráfico de crecimiento y próximos pasos',
    'Lanzamiento de producto móvil con propuesta de valor en tarjetas y flujo de trabajo',
  ],
  PDF: [
    'Contrato de prestación de servicios profesionales con cláusulas claras y firmas',
    'Guía práctica de ciberseguridad para pymes en 3 páginas con tabla de verificación',
  ],
};

function getFontStackCss(fontFamily?: 'sans' | 'serif' | 'mono'): string {
  if (fontFamily === 'serif') return 'var(--font-serif)';
  if (fontFamily === 'mono') return 'var(--font-mono)';
  return 'var(--font-sans)';
}

export default function AiCreateDocumentModal({
  open,
  initialFormat = 'DOCX',
  onClose,
  onCreateDocument,
}: AiCreateDocumentModalProps) {
  const [format, setFormat] = useState<'DOCX' | 'PPTX' | 'PDF'>(initialFormat);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('profesional');
  const [palette, setPalette] = useState('auto');
  const [fontStyle, setFontStyle] = useState('auto');
  const [sectionCount, setSectionCount] = useState(4);

  const [loading, setLoading] = useState(false);
  const [compilingPdf, setCompilingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AiCreateDocumentResponse | null>(null);
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);
  const [previewPdfPageIdx, setPreviewPdfPageIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setFormat(initialFormat);
    setLoading(false);
    setCompilingPdf(false);
    setErrorMsg(null);
    setResult(null);
    setPreviewSlideIdx(0);
    setPreviewPdfPageIdx(0);
  }, [open, initialFormat]);

  const builtPreviewSlides = useMemo(() => {
    if (!result?.slides || result.slides.length === 0) return [];
    return result.slides.map((s, idx) =>
      buildWpsSlideFromAiProposal(s, idx + 1, 'ai-create-prev'),
    );
  }, [result]);

  if (!open) return null;

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setPreviewSlideIdx(0);
    setPreviewPdfPageIdx(0);

    try {
      const generated = await requestAiCreateDocument({
        format,
        prompt: prompt.trim(),
        title: title.trim() || undefined,
        tone,
        palette,
        fontStyle,
        sectionCount,
      });
      setResult(generated);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el documento con IA.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCreate = async () => {
    if (!result || compilingPdf) return;
    const now = Date.now();
    const id = `doc-${now}`;

    if (result.format === 'PPTX') {
      const builtSlides =
        result.slides && result.slides.length > 0
          ? result.slides.map((s, idx) =>
              buildWpsSlideFromAiProposal(s, idx + 1, `s-${now}`),
            )
          : [
              buildWpsSlideFromAiProposal(
                {
                  title: result.title,
                  layoutType: 'bullets',
                  bullets: ['Diapositiva generada con IA'],
                  notes: '',
                  summary: result.summary,
                },
                1,
                `s-${now}`,
              ),
            ];

      onCreateDocument({
        id,
        title: result.title,
        format: 'PPTX',
        folder: result.folder || 'Presentaciones',
        starred: false,
        updatedAt: 'Ahora mismo',
        contentHtml: '',
        slides: builtSlides,
        comments: [],
      });
      onClose();
      return;
    }

    if (result.format === 'PDF') {
      setCompilingPdf(true);
      try {
        const pagesHtml =
          result.pagesHtml && result.pagesHtml.length > 0
            ? result.pagesHtml
            : [`<h1>${result.title}</h1><p>${result.summary}</p>`];
        const bytes = await buildPdfBytesFromPageHtmls(result.title, pagesHtml);
        const base64 = uint8ToBase64(bytes);
        onCreateDocument({
          id,
          title: result.title,
          format: 'PDF',
          folder: result.folder || 'Documentación',
          starred: false,
          updatedAt: 'Ahora mismo',
          contentHtml: pagesHtml.join('\n<hr />\n'),
          pdfBase64: base64,
          comments: [],
        });
        onClose();
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? `No se pudo compilar el PDF: ${err.message}`
            : 'No se pudo compilar el archivo PDF.',
        );
      } finally {
        setCompilingPdf(false);
      }
      return;
    }

    // DOCX
    const styledContentHtml =
      result.pageBgColor && result.pageBgColor !== '#FFFFFF'
        ? `<div data-ai-page-bg="${result.pageBgColor}">${result.contentHtml || '<p></p>'}</div>`
        : result.contentHtml || '<p></p>';

    onCreateDocument({
      id,
      title: result.title,
      format: 'DOCX',
      folder: result.folder || 'Trabajo',
      starred: false,
      updatedAt: 'Ahora mismo',
      contentHtml: styledContentHtml,
      comments: [],
    });
    onClose();
  };

  const docPaperBg = result?.pageBgColor || '#FFFFFF';
  const isDarkDocPaper =
    /^#(0|1|2)/i.test(docPaperBg.trim()) || docPaperBg === '#0F2744';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-lg bg-slate-300 sm:hidden dark:bg-slate-700" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Crear Documento Completo con IA
              </h2>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Genera Word, Presentaciones Canva (PPTX) o PDF con vista previa real
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar creador IA"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Format Selector */}
          <div>
            <div className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              1. Tipo de archivo a crear
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {FORMAT_OPTIONS.map((opt) => {
                const active = format === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setFormat(opt.id);
                      setResult(null);
                      setErrorMsg(null);
                    }}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                      active
                        ? 'border-violet-600 bg-violet-50/70 ring-1 ring-violet-600 dark:border-violet-500 dark:bg-violet-950/30'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${opt.badgeClass}`}
                    >
                      {opt.id === 'PPTX' ? (
                        <Presentation className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        {opt.hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt & Design Form */}
          <form onSubmit={(e) => void handleGenerate(e)} className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="ai-create-title"
                  className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  Título (opcional)
                </label>
                <input
                  id="ai-create-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Plan Estratégico Q4 2026"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="ai-create-count"
                  className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  {format === 'PPTX'
                    ? 'Diapositivas'
                    : format === 'PDF'
                      ? 'Páginas PDF'
                      : 'Secciones'}
                </label>
                <select
                  id="ai-create-count"
                  value={sectionCount}
                  onChange={(e) => setSectionCount(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {(format === 'PDF' ? [2, 3, 4] : [3, 4, 5, 6]).map((n) => (
                    <option key={n} value={n}>
                      {n}{' '}
                      {format === 'PPTX'
                        ? 'diapositivas'
                        : format === 'PDF'
                          ? 'páginas'
                          : 'secciones'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="ai-create-palette"
                  className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  Paleta de colores
                </label>
                <select
                  id="ai-create-palette"
                  value={palette}
                  onChange={(e) => setPalette(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {PALETTE_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ai-create-font"
                  className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  Tipografía
                </label>
                <select
                  id="ai-create-font"
                  value={fontStyle}
                  onChange={(e) => setFontStyle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ai-create-tone"
                  className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  Tono
                </label>
                <select
                  id="ai-create-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {TONE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="ai-create-prompt"
                className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
              >
                2. Describe qué contenido, estructura y elementos debe tener
              </label>
              <textarea
                id="ai-create-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej. Redacta una propuesta de marketing digital para clínica dental con objetivos, tabla de servicios, precios y cronograma mensual..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PROMPT_SUGGESTIONS[format].map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPrompt(sug)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-[11px] text-slate-600 hover:border-violet-400 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:text-violet-300"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-xs hover:opacity-95 disabled:opacity-45"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generando vista previa...</span>
                  </>
                ) : result ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>Regenerar vista previa</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Generar y previsualizar</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* REAL VISUAL PREVIEW BEFORE CREATING */}
          {result && (
            <div className="space-y-3 rounded-2xl border border-violet-200 bg-slate-50 p-3.5 dark:border-violet-900/50 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                    {result.title}
                  </div>
                  <div className="text-[11px] text-violet-700 dark:text-violet-300">
                    {result.summary}
                  </div>
                </div>
                <span className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  Vista previa real · {result.format}
                </span>
              </div>

              {/* PPTX Multi-Slide Canva Preview */}
              {result.format === 'PPTX' && builtPreviewSlides.length > 0 && (
                <div className="space-y-2.5">
                  <AiSlideCanvasPreview
                    slide={
                      builtPreviewSlides[previewSlideIdx] || builtPreviewSlides[0]
                    }
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={previewSlideIdx <= 0}
                      onClick={() => setPreviewSlideIdx((i) => Math.max(0, i - 1))}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Anterior</span>
                    </button>

                    <span className="font-mono text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                      Diapositiva {previewSlideIdx + 1} / {builtPreviewSlides.length}
                    </span>

                    <button
                      type="button"
                      disabled={previewSlideIdx >= builtPreviewSlides.length - 1}
                      onClick={() =>
                        setPreviewSlideIdx((i) =>
                          Math.min(builtPreviewSlides.length - 1, i + 1),
                        )
                      }
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <span>Siguiente</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* PDF Paginated Preview */}
              {result.format === 'PDF' &&
                result.pagesHtml &&
                result.pagesHtml.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="rounded-xl bg-slate-200/80 p-3 dark:bg-slate-900">
                      <div
                        className="wps-doc-canvas mx-auto max-h-72 max-w-[540px] overflow-y-auto rounded-lg border border-slate-300 bg-white p-5 text-[13px] text-slate-900 shadow-sm"
                        dangerouslySetInnerHTML={{
                          __html:
                            result.pagesHtml[previewPdfPageIdx] ||
                            result.pagesHtml[0],
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={previewPdfPageIdx <= 0}
                        onClick={() =>
                          setPreviewPdfPageIdx((i) => Math.max(0, i - 1))
                        }
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Página ant.</span>
                      </button>
                      <span className="font-mono text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                        Página PDF {previewPdfPageIdx + 1} / {result.pagesHtml.length}
                      </span>
                      <button
                        type="button"
                        disabled={previewPdfPageIdx >= result.pagesHtml.length - 1}
                        onClick={() =>
                          setPreviewPdfPageIdx((i) =>
                            Math.min((result.pagesHtml?.length || 1) - 1, i + 1),
                          )
                        }
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <span>Página sig.</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

              {/* DOCX Paper Preview */}
              {result.format === 'DOCX' && result.contentHtml && (
                <div className="rounded-xl bg-slate-200/80 p-3 dark:bg-slate-900">
                  <div
                    style={{
                      backgroundColor: docPaperBg,
                      color: isDarkDocPaper ? '#F8FAFC' : '#0F172A',
                      fontFamily: getFontStackCss(result.fontFamily),
                      lineHeight: 1.6,
                    }}
                    className="wps-doc-canvas mx-auto max-h-72 overflow-y-auto rounded-xl border border-slate-300 p-5 text-[13px] shadow-sm"
                    dangerouslySetInnerHTML={{ __html: result.contentHtml }}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={loading || compilingPdf}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Generar otra versión</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmCreate()}
                  disabled={loading || compilingPdf}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#EA3D2F] px-4 text-xs font-semibold text-white hover:bg-[#D63124] disabled:opacity-50"
                >
                  {compilingPdf ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Compilando PDF...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Crear y abrir archivo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
