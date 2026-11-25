import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Presentation,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import type { WpsDocument } from '../data/wpsDocuments';
import {
  AiCreateDocumentResponse,
  AiEfficiencyMode,
  SlideImageMode,
  SlideQuestionOption,
  requestAiCreateDocument,
  requestAiSlideQuestions,
} from '../lib/aiEditorClient';
import {
  FreeLlmEndpointDescriptor,
  createDocumentWithFreeLlm,
  fetchFreeLlmProviders,
  getLowTokenModels,
} from '../lib/llm';
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

const PPTX_IMAGE_MODES: {
  id: SlideImageMode;
  label: string;
  hint: string;
}[] = [
  { id: 'none', label: 'Sin imágenes', hint: 'Solo formas, tarjetas y gráficos' },
  { id: 'search', label: 'Buscar imágenes del tema', hint: 'IA busca fotos reales del tema' },
  { id: 'generate', label: 'Generar ilustraciones IA', hint: 'IA diseña ilustraciones temáticas' },
];

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

  // PPTX opt-in image mode & interactive questions mode
  const [imageMode, setImageMode] = useState<SlideImageMode>('none');
  const [pptxWorkMode, setPptxWorkMode] = useState<'auto' | 'questions'>('auto');
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsIntro, setQuestionsIntro] = useState('');
  const [questions, setQuestions] = useState<SlideQuestionOption[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});

  const [efficiencyMode, setEfficiencyMode] = useState<AiEfficiencyMode>('auto');
  const [freellmapiEndpoint, setFreellmapiEndpoint] = useState('auto');
  const [allProviders, setAllProviders] = useState<FreeLlmEndpointDescriptor[]>([]);

  const [loading, setLoading] = useState(false);
  const [compilingPdf, setCompilingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AiCreateDocumentResponse | null>(null);
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);
  const [previewPdfPageIdx, setPreviewPdfPageIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setFormat(initialFormat);
    setImageMode('none');
    setPptxWorkMode('auto');
    setQuestionsLoading(false);
    setQuestionsIntro('');
    setQuestions([]);
    setQuestionAnswers({});
    setEfficiencyMode('auto');
    setFreellmapiEndpoint('auto');
    setLoading(false);
    setCompilingPdf(false);
    setErrorMsg(null);
    setResult(null);
    setPreviewSlideIdx(0);
    setPreviewPdfPageIdx(0);

    let cancelled = false;
    void fetchFreeLlmProviders()
      .then((res) => {
        if (cancelled) return;
        setAllProviders(res.providers);
      })
      .catch(() => {
        if (!cancelled) setAllProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialFormat]);

  const lowTokenEndpoints = useMemo(
    () =>
      getLowTokenModels(
        allProviders,
        format === 'PPTX' ? 'presentation-design' : 'document-create',
      ),
    [allProviders, format],
  );

  const builtPreviewSlides = useMemo(() => {
    if (!result?.slides || result.slides.length === 0) return [];
    return result.slides.map((s, idx) =>
      buildWpsSlideFromAiProposal(s, idx + 1, 'ai-create-prev'),
    );
  }, [result]);

  if (!open) return null;

  const handleFetchPptxQuestions = async () => {
    if (questionsLoading || loading) return;
    setQuestionsLoading(true);
    setErrorMsg(null);
    try {
      const res = await requestAiSlideQuestions({
        purpose: 'create-pptx',
        presentationTitle: title.trim() || prompt.trim() || 'Nueva presentación',
        initialPrompt: prompt.trim() || undefined,
      });
      setQuestionsIntro(res.intro);
      setQuestions(res.questions);
      const defaults: Record<string, string> = {};
      res.questions.forEach((q) => {
        if (q.options[0]) defaults[q.id] = q.options[0];
      });
      setQuestionAnswers(defaults);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudieron generar preguntas para la presentación.',
      );
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || loading) return;

    const collectedQa =
      format === 'PPTX'
        ? questions
            .map((q) => ({
              question: q.question,
              answer: (questionAnswers[q.id] || '').trim(),
            }))
            .filter((a) => a.answer.length > 0)
        : [];

    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setPreviewSlideIdx(0);
    setPreviewPdfPageIdx(0);

    try {
      const tokenMode: 'low-token' | 'standard' =
        efficiencyMode === 'low-token' ? 'low-token' : 'standard';
      const payload = {
        format,
        prompt: prompt.trim(),
        title: title.trim() || undefined,
        tone,
        palette,
        fontStyle,
        sectionCount,
        preferredModel: 'auto' as const,
        imageMode: format === 'PPTX' ? imageMode : ('none' as const),
        qaAnswers: collectedQa.length > 0 ? collectedQa : undefined,
        tokenMode,
        efficiencyMode,
        freellmapiEndpoint,
      };
      const generated =
        efficiencyMode === 'low-token'
          ? await createDocumentWithFreeLlm(payload)
          : await requestAiCreateDocument(payload);
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
                  bullets: [result.summary || result.title || 'Resumen ejecutivo'],
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
        const safeTitleHtml = result.title
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const safeSummaryHtml = (result.summary || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const pagesHtml =
          result.pagesHtml && result.pagesHtml.length > 0
            ? result.pagesHtml
            : [`<h1>${safeTitleHtml}</h1><p>${safeSummaryHtml}</p>`];
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

          {/* Task-Aware Efficiency & FreeLLMAPI Engine */}
          <div className="space-y-2.5 rounded-2xl border border-violet-200/80 bg-violet-50/60 p-3 dark:border-violet-900/50 dark:bg-violet-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-600/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {format === 'PPTX'
                      ? 'Motor Canva · Presentaciones de Alto Diseño'
                      : format === 'PDF'
                        ? 'Motor Editorial · Documentos PDF Maquetados'
                        : 'Motor Editorial · Documentos Word Profesionales'}
                  </div>
                  <p className="truncate text-[10px] text-slate-600 dark:text-slate-400">
                    {efficiencyMode === 'low-token'
                      ? 'Prioriza modelos de bajo consumo con respaldo automático si alguno falla'
                      : efficiencyMode === 'quality'
                        ? 'Máximo razonamiento creativo y arquitectónico con IAs insignia + respaldo automático'
                        : 'Prioriza tus mejores IAs con razonamiento alto, diseños únicos y respaldo automático'}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-violet-200 bg-white/90 p-0.5 dark:border-violet-900/60 dark:bg-slate-900">
                {(
                  [
                    { id: 'low-token', label: 'Ahorro', activeClass: 'bg-emerald-600 text-white' },
                    { id: 'auto', label: 'Razon. Alto', activeClass: 'bg-violet-600 text-white' },
                    { id: 'quality', label: 'Máx. Razon.', activeClass: 'bg-indigo-600 text-white' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={loading}
                    onClick={() => setEfficiencyMode(opt.id)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      efficiencyMode === opt.id
                        ? opt.activeClass
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {efficiencyMode === 'low-token' && (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <label
                  htmlFor="ai-create-freellmapi-endpoint"
                  className="text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                >
                  Endpoint FreeLLMAPI ({lowTokenEndpoints.length || 'auto'} activos):
                </label>
                <select
                  id="ai-create-freellmapi-endpoint"
                  value={freellmapiEndpoint}
                  disabled={loading}
                  onChange={(e) => setFreellmapiEndpoint(e.target.value)}
                  className="h-8 w-full rounded-lg border border-violet-200 bg-white px-2.5 text-[11px] text-slate-900 focus:border-violet-500 focus:outline-none sm:w-80 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="auto">
                    Automático según formato ({format === 'PPTX' ? 'Diseño' : 'Redacción'})
                  </option>
                  {lowTokenEndpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.label} · {ep.baseUrl.replace(/^https?:\/\//, '')}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* PPTX-only Controls: Work Mode (Auto vs Questions) & Opt-in Images */}
          {format === 'PPTX' && (
            <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Modo de creación de la presentación
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPptxWorkMode('auto')}
                    className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                      pptxWorkMode === 'auto'
                        ? 'border-violet-600 bg-white text-violet-700 shadow-2xs ring-1 ring-violet-600 dark:border-violet-400 dark:bg-slate-800 dark:text-violet-300'
                        : 'border-slate-200 bg-white/60 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300'
                    }`}
                  >
                    <Wand2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Modo automático</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setPptxWorkMode('questions');
                      if (questions.length === 0 && !questionsLoading) {
                        void handleFetchPptxQuestions();
                      }
                    }}
                    className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                      pptxWorkMode === 'questions'
                        ? 'border-violet-600 bg-white text-violet-700 shadow-2xs ring-1 ring-violet-600 dark:border-violet-400 dark:bg-slate-800 dark:text-violet-300'
                        : 'border-slate-200 bg-white/60 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300'
                    }`}
                  >
                    <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>IA me hace preguntas</span>
                  </button>
                </div>
              </div>

              {pptxWorkMode === 'questions' && (
                <div className="space-y-2.5 rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900/50 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                      <MessageSquareText className="h-4 w-4" />
                      <span>{questionsIntro || 'Personaliza tu presentación antes de crearla'}</span>
                    </span>
                    <button
                      type="button"
                      disabled={questionsLoading || loading}
                      onClick={() => void handleFetchPptxQuestions()}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <RefreshCw className={`h-3 w-3 ${questionsLoading ? 'animate-spin' : ''}`} />
                      <span>Actualizar</span>
                    </button>
                  </div>

                  {questionsLoading ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                      <span>Preparando preguntas sobre tu presentación...</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {questions.map((q) => {
                        const ans = questionAnswers[q.id] || '';
                        return (
                          <div
                            key={q.id}
                            className="space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/60"
                          >
                            <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                              {q.question}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {q.options.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={loading}
                                  onClick={() =>
                                    setQuestionAnswers((prev) => ({ ...prev, [q.id]: opt }))
                                  }
                                  className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                                    ans === opt
                                      ? 'border-violet-600 bg-violet-600 text-white'
                                      : 'border-slate-200 bg-white text-slate-700 hover:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Opt-in Topic Images for PPTX */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <ImageIcon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  <span>¿Deseas agregar imágenes relacionadas al tema en las diapositivas?</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {PPTX_IMAGE_MODES.map((opt) => {
                    const active = imageMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={loading}
                        onClick={() => setImageMode(opt.id)}
                        className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-all ${
                          active
                            ? 'border-violet-600 bg-white ring-1 ring-violet-600 dark:border-violet-400 dark:bg-slate-800'
                            : 'border-slate-200 bg-white/60 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60'
                        }`}
                      >
                        <div className="shrink-0 text-violet-600 dark:text-violet-400">
                          {opt.id === 'search' ? (
                            <Search className="h-3.5 w-3.5" />
                          ) : opt.id === 'generate' ? (
                            <Sparkles className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                            {opt.label}
                          </div>
                          <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                            {opt.hint}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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
                  {(format === 'PDF'
                    ? [2, 3, 4, 5, 6, 8, 10, 12]
                    : format === 'PPTX'
                      ? [3, 4, 5, 6, 8, 10, 12, 15, 20]
                      : [3, 4, 5, 6, 8, 10, 12, 15]
                  ).map((n) => (
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {result.title}
                    </span>
                    {(result.teamRole || result.modelUsed) && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          result.modelUsed?.includes('gemini')
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'
                            : result.modelUsed?.includes('gemma-4')
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                              : result.modelUsed?.includes('nemotron') ||
                                  result.modelUsed?.includes('ernie') ||
                                  result.modelUsed?.includes(':free')
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                : 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300'
                        }`}
                      >
                        ⚡ {result.taskProfile ? `${result.taskProfile} · ` : ''}
                        {result.teamRole || result.modelUsed}
                      </span>
                    )}
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
