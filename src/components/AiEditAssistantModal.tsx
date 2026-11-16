import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Columns2,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Replace,
  Send,
  Shuffle,
  Sparkles,
  StickyNote,
  X,
} from 'lucide-react';
import {
  AiDocumentDesignContext,
  AiDocumentEditResponse,
  AiPdfAssistResponse,
  AiSlideDesignContext,
  AiSlideEditResponse,
  requestAiDocumentEdit,
  requestAiPdfAssist,
  requestAiSlideEdit,
} from '../lib/aiEditorClient';
import { buildWpsSlideFromAiProposal } from '../lib/aiSlideBuilder';
import AiSlideCanvasPreview from './AiSlideCanvasPreview';

export type AiAssistantMode = 'document' | 'slide' | 'pdf-annotate';

interface AiEditAssistantModalProps {
  open: boolean;
  mode: AiAssistantMode;
  documentTitle: string;
  fileType: string;
  selectedText?: string;
  fullText?: string;
  currentHtml?: string;
  pageBgColor?: string;
  fontFamily?: 'sans' | 'serif' | 'mono';
  designContext?: AiDocumentDesignContext;
  slideTitle?: string;
  slideTexts?: string[];
  slideContext?: AiSlideDesignContext;
  pdfPageNumber?: number;
  pdfTotalPages?: number;
  onClose: () => void;
  onApplyDocumentResult?: (
    html: string,
    placement: 'replace-selection' | 'insert' | 'replace-all',
    designPatch?: {
      pageBgColor?: string;
      fontFamily?: 'sans' | 'serif' | 'mono';
    },
  ) => void;
  onApplySlideResult?: (
    result: AiSlideEditResponse,
    target: 'current' | 'new-slide',
  ) => void;
  onApplyPdfNoteResult?: (
    noteText: string,
    withWhiteBg: boolean,
    customColors?: { bgColor?: string; textColor?: string },
  ) => void;
}

const DOC_ACTIONS = [
  { id: 'rewrite', label: 'Mejorar redacción' },
  { id: 'fix_grammar', label: 'Corregir ortografía' },
  { id: 'formal', label: 'Tono formal' },
  { id: 'concise', label: 'Resumir' },
  { id: 'expand', label: 'Ampliar manteniendo estilo' },
  { id: 'checklist', label: 'Lista de pasos' },
  { id: 'table', label: 'Crear tabla' },
  { id: 'translate_en', label: 'Traducir al inglés' },
  { id: 'translate_es', label: 'Traducir al español' },
];

const SLIDE_ACTIONS = [
  { id: 'vary_design', label: 'Nuevo diseño creativo' },
  { id: 'improve_slide', label: 'Mejorar contenido' },
  { id: 'cards', label: 'Tarjetas Canva' },
  { id: 'diagram', label: 'Diagrama de flujo' },
  { id: 'chart', label: 'Gráfico con datos' },
  { id: 'table', label: 'Tabla comparativa' },
  { id: 'notes', label: 'Notas de orador' },
];

const PDF_ANNOTATE_ACTIONS = [
  { id: 'summarize_note', label: 'Resumir página en nota' },
  { id: 'key_points', label: 'Puntos clave' },
  { id: 'action_items', label: 'Tareas / conclusiones' },
  { id: 'translate_es', label: 'Resumir en español' },
];

function getFontStackCss(fontFamily?: 'sans' | 'serif' | 'mono'): string {
  if (fontFamily === 'serif') return 'var(--font-serif)';
  if (fontFamily === 'mono') return 'var(--font-mono)';
  return 'var(--font-sans)';
}

export default function AiEditAssistantModal({
  open,
  mode,
  documentTitle,
  fileType,
  selectedText = '',
  fullText = '',
  currentHtml = '',
  pageBgColor = '#FFFFFF',
  fontFamily = 'sans',
  designContext,
  slideTitle = '',
  slideTexts = [],
  slideContext,
  pdfPageNumber = 1,
  pdfTotalPages = 1,
  onClose,
  onApplyDocumentResult,
  onApplySlideResult,
  onApplyPdfNoteResult,
}: AiEditAssistantModalProps) {
  const [prompt, setPrompt] = useState('');
  const [refinePrompt, setRefinePrompt] = useState('');
  const [lastAction, setLastAction] = useState('custom');
  const [slideVariationCount, setSlideVariationCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [docViewTab, setDocViewTab] = useState<'preview' | 'compare'>('preview');
  const [docResult, setDocResult] = useState<AiDocumentEditResponse | null>(null);
  const [slideResult, setSlideResult] = useState<AiSlideEditResponse | null>(null);
  const [pdfResult, setPdfResult] = useState<AiPdfAssistResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrompt('');
    setRefinePrompt('');
    setLastAction('custom');
    setSlideVariationCount(0);
    setLoading(false);
    setErrorMsg(null);
    setDocViewTab('preview');
    setDocResult(null);
    setSlideResult(null);
    setPdfResult(null);
  }, [open, mode, documentTitle, slideTitle, pdfPageNumber]);

  const previewSlide = useMemo(() => {
    if (!slideResult) return null;
    return buildWpsSlideFromAiProposal(slideResult, 1, 'ai-preview');
  }, [slideResult]);

  if (!open) return null;

  const hasSelection = selectedText.trim().length > 0;
  const actions =
    mode === 'slide'
      ? SLIDE_ACTIONS
      : mode === 'pdf-annotate'
        ? PDF_ANNOTATE_ACTIONS
        : DOC_ACTIONS;

  const resetResults = () => {
    setDocResult(null);
    setSlideResult(null);
    setPdfResult(null);
    setErrorMsg(null);
  };

  const handleRun = async (
    actionId: string,
    overridePrompt?: string,
    requestVariation = false,
  ) => {
    const custom = (overridePrompt ?? prompt).trim();
    if (actionId === 'custom' && !custom && !requestVariation) return;

    const prevSlideResult = slideResult;
    const nextIteration =
      requestVariation || actionId === 'vary_design'
        ? slideVariationCount + 1
        : slideVariationCount;
    if (requestVariation || actionId === 'vary_design') {
      setSlideVariationCount(nextIteration);
    }

    setLastAction(actionId);
    setLoading(true);
    resetResults();
    try {
      if (mode === 'document') {
        const res = await requestAiDocumentEdit({
          action: actionId,
          customPrompt: custom,
          selectedText,
          fullText,
          currentHtml,
          documentTitle,
          fileType,
          designContext: {
            pageBgColor,
            fontFamily,
            ...designContext,
          },
        });
        setDocResult(res);
        setDocViewTab('preview');
      } else if (mode === 'slide') {
        const res = await requestAiSlideEdit({
          action: actionId,
          customPrompt: custom,
          slideTitle,
          slideTexts,
          presentationTitle: documentTitle,
          slideContext,
          variationHint:
            requestVariation || actionId === 'vary_design'
              ? {
                  avoidLayout: prevSlideResult?.layoutType,
                  avoidVisualStyle: prevSlideResult?.visualStyle,
                  iteration: nextIteration,
                }
              : undefined,
        });
        setSlideResult(res);
      } else {
        const res = await requestAiPdfAssist({
          action: actionId,
          customPrompt: custom,
          pageText: fullText,
          pageHtml: currentHtml,
          pageNumber: pdfPageNumber,
          totalPages: pdfTotalPages,
          documentTitle,
        });
        setPdfResult(res);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo completar la asistencia de IA.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefine = () => {
    const refText = refinePrompt.trim();
    if (!refText || loading) return;
    const baseInstruction = prompt.trim()
      ? `${prompt.trim()}. Ajuste adicional sobre la vista previa: ${refText}`
      : refText;
    setRefinePrompt('');
    void handleRun(lastAction === 'custom' ? 'custom' : lastAction, baseInstruction);
  };

  const handleVarySlideDesign = () => {
    if (loading) return;
    const custom = prompt.trim();
    void handleRun('vary_design', custom || undefined, true);
  };

  const effectiveBg = docResult?.suggestedPageBgColor || pageBgColor || '#FFFFFF';
  const effectiveFont = docResult?.suggestedFontFamily || fontFamily || 'sans';
  const isDarkPaper =
    /^#(0|1|2)/i.test(effectiveBg.trim()) || effectiveBg === '#0F2744';

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900"
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
                Asistente IA con Vista Previa Real
              </h2>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {mode === 'slide'
                  ? `Diapositivas Canva · ${slideTitle || documentTitle}`
                  : mode === 'pdf-annotate'
                    ? `PDF Página ${pdfPageNumber} de ${pdfTotalPages}`
                    : hasSelection
                      ? `Fragmento seleccionado (${selectedText.trim().length} car.)`
                      : `Documento completo · ${fileType} · Respeta estilo actual`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente IA"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {hasSelection && mode === 'document' && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-2.5 text-xs text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                Texto seleccionado
              </div>
              <p className="line-clamp-3 leading-relaxed">
                {selectedText.trim()}
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <div className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Acciones rápidas
            </div>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleRun(act.id)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 transition-colors hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-violet-500 dark:hover:bg-violet-950/40"
                >
                  <Sparkles className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                  <span>{act.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleRun('custom');
            }}
            className="space-y-2"
          >
            <label
              htmlFor="alx-ai-custom-prompt"
              className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
            >
              Instrucción personalizada (colores, estructura, elementos o contenido)
            </label>
            <div className="flex items-stretch gap-2">
              <textarea
                id="alx-ai-custom-prompt"
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === 'slide'
                    ? 'Ej. Crea 4 tarjetas oscuras con acento dorado o un gráfico de dona con ventas...'
                    : mode === 'pdf-annotate'
                      ? 'Ej. Resume los requisitos clave de esta página en una nota violeta...'
                      : 'Ej. Añade una sección de métricas con tabla azul marino manteniendo la tipografía...'
                }
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                aria-label="Enviar instrucción a IA"
                className="flex min-h-[44px] min-w-[48px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 px-3 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-45"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>

          {loading && (
            <div className="flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50/70 px-3.5 py-3 text-xs font-medium text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-600" />
              <span>Analizando contexto, diseño y generando vista previa real...</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Document Real Visual Preview */}
          {docResult && mode === 'document' && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                    {docResult.summary}
                  </div>
                  {docResult.designNotes && (
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {docResult.designNotes}
                    </div>
                  )}
                </div>

                <div className="inline-flex rounded-xl bg-slate-200/80 p-0.5 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setDocViewTab('preview')}
                    className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium ${
                      docViewTab === 'preview'
                        ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    <span>Vista real</span>
                  </button>
                  {currentHtml && (
                    <button
                      type="button"
                      onClick={() => setDocViewTab('compare')}
                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium ${
                        docViewTab === 'compare'
                          ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Columns2 className="h-3 w-3" />
                      <span>Comparar</span>
                    </button>
                  )}
                </div>
              </div>

              {docViewTab === 'compare' && currentHtml ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Original
                    </div>
                    <div
                      style={{
                        backgroundColor: pageBgColor || '#FFFFFF',
                        fontFamily: getFontStackCss(fontFamily),
                      }}
                      className="wps-doc-canvas max-h-60 overflow-y-auto rounded-xl border border-slate-200 p-3 text-xs text-slate-900 dark:border-slate-800"
                      dangerouslySetInnerHTML={{ __html: currentHtml }}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                      Vista Previa IA
                    </div>
                    <div
                      style={{
                        backgroundColor: effectiveBg,
                        color: isDarkPaper ? '#F8FAFC' : '#0F172A',
                        fontFamily: getFontStackCss(effectiveFont),
                      }}
                      className="wps-doc-canvas max-h-60 overflow-y-auto rounded-xl border-2 border-violet-400 p-3 text-xs shadow-sm"
                      dangerouslySetInnerHTML={{ __html: docResult.html }}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-200/70 p-2.5 dark:bg-slate-900">
                  <div
                    style={{
                      backgroundColor: effectiveBg,
                      color: isDarkPaper ? '#F8FAFC' : '#0F172A',
                      fontFamily: getFontStackCss(effectiveFont),
                      lineHeight: 1.6,
                    }}
                    className="wps-doc-canvas mx-auto max-h-64 overflow-y-auto rounded-xl border border-slate-300/80 p-4 text-[13px] shadow-sm"
                    dangerouslySetInnerHTML={{ __html: docResult.html }}
                  />
                </div>
              )}

              {/* Quick refinement bar */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRefine();
                    }
                  }}
                  placeholder="¿Ajustar antes de aplicar? Ej. Haz los títulos más compactos..."
                  className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!refinePrompt.trim() || loading}
                  onClick={handleRefine}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Ajustar</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {hasSelection && onApplyDocumentResult && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyDocumentResult(docResult.html, 'replace-selection', {
                        pageBgColor: docResult.suggestedPageBgColor,
                        fontFamily: docResult.suggestedFontFamily,
                      });
                      onClose();
                    }}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-700"
                  >
                    <Replace className="h-3.5 w-3.5" />
                    <span>Reemplazar selección</span>
                  </button>
                )}
                {onApplyDocumentResult && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyDocumentResult(docResult.html, 'insert', {
                          pageBgColor: docResult.suggestedPageBgColor,
                          fontFamily: docResult.suggestedFontFamily,
                        });
                        onClose();
                      }}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Insertar al cursor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyDocumentResult(docResult.html, 'replace-all', {
                          pageBgColor: docResult.suggestedPageBgColor,
                          fontFamily: docResult.suggestedFontFamily,
                        });
                        onClose();
                      }}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Reemplazar documento</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Slide Real 16:9 Canva Visual Preview */}
          {slideResult && previewSlide && mode === 'slide' && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                  {slideResult.summary}
                </span>
                <span className="font-mono text-[11px] uppercase text-slate-500">
                  {slideResult.visualStyle || 'canva'} · {slideResult.layoutType}
                </span>
              </div>

              <AiSlideCanvasPreview slide={previewSlide} />

              {slideResult.notes && (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <strong className="font-semibold text-slate-800 dark:text-slate-100">
                    Notas del orador:
                  </strong>{' '}
                  {slideResult.notes}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRefine();
                    }
                  }}
                  placeholder="¿Cambiar paleta, fuente o tipo de gráfico antes de aplicar?"
                  className="h-9 min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!refinePrompt.trim() || loading}
                  onClick={handleRefine}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Ajustar</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleVarySlideDesign}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-violet-300 bg-violet-50 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-40 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  <span>Variar diseño</span>
                </button>
              </div>

              {onApplySlideResult && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onApplySlideResult(slideResult, 'current');
                      onClose();
                    }}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Aplicar a diapositiva actual</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onApplySlideResult(slideResult, 'new-slide');
                      onClose();
                    }}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Crear nueva diapositiva</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PDF Annotate Real Sticker-on-Page Preview */}
          {pdfResult && mode === 'pdf-annotate' && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-950">
              <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                {pdfResult.summary}
              </div>

              {/* Miniature PDF page canvas showing how sticker will look */}
              <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-white p-4 shadow-xs">
                <div className="mb-3 space-y-1.5 opacity-25">
                  <div className="h-2.5 w-2/3 rounded bg-slate-400" />
                  <div className="h-2 w-full rounded bg-slate-300" />
                  <div className="h-2 w-5/6 rounded bg-slate-300" />
                </div>
                <div
                  style={{
                    backgroundColor: pdfResult.bgColor || '#FFFFFF',
                    color: pdfResult.textColor || '#0F172A',
                  }}
                  className="whitespace-pre-wrap rounded-xl border border-slate-300 p-3 text-xs leading-relaxed shadow-md"
                >
                  {pdfResult.noteText}
                </div>
                <div className="mt-3 space-y-1.5 opacity-20">
                  <div className="h-2 w-11/12 rounded bg-slate-300" />
                  <div className="h-2 w-3/4 rounded bg-slate-300" />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRefine();
                    }
                  }}
                  placeholder="¿Ajustar nota o color de tarjeta antes de insertar?"
                  className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!refinePrompt.trim() || loading}
                  onClick={handleRefine}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Ajustar</span>
                </button>
              </div>

              {onApplyPdfNoteResult && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onApplyPdfNoteResult(pdfResult.noteText, true, {
                        bgColor: pdfResult.bgColor,
                        textColor: pdfResult.textColor,
                      });
                      onClose();
                    }}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-700"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    <span>Insertar etiqueta con fondo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onApplyPdfNoteResult(pdfResult.noteText, false, {
                        textColor: pdfResult.textColor,
                      });
                      onClose();
                    }}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Insertar texto transparente</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
