import { isNativeCapacitorApp } from './platform';

export interface AiDocumentDesignContext {
  pageBgColor?: string;
  fontFamily?: string;
  detectedColors?: string[];
  detectedHeadings?: string[];
  hasTables?: boolean;
}

export type AiTeamModelOption =
  | 'auto'
  | 'gemini'
  | 'gemma-4-e4b'
  | 'gemma-4-e2b'
  | 'gemma-4-26b'
  | 'gemma-4-31b'
  | 'nemotron-ultra'
  | 'nemotron-fast'
  | 'nemotron-vl'
  | 'ernie-flash'
  | 'gpt-120b'
  | 'qwen'
  | 'gpt-20b';

export type AiWorkTaskType =
  | 'quick-edit'
  | 'document-edit'
  | 'document-create'
  | 'presentation-design'
  | 'pdf-analysis';

export type AiEfficiencyMode = 'auto' | 'low-token' | 'quality';

export interface AiDocumentEditRequest {
  action: string;
  customPrompt?: string;
  selectedText?: string;
  fullText?: string;
  currentHtml?: string;
  documentTitle: string;
  fileType: string;
  preferredModel?: AiTeamModelOption;
  efficiencyMode?: AiEfficiencyMode;
  designContext?: AiDocumentDesignContext;
}

export interface AiDocumentEditResponse {
  html: string;
  summary: string;
  designNotes?: string;
  suggestedPageBgColor?: string;
  suggestedFontFamily?: 'sans' | 'serif' | 'mono';
  modelUsed?: string;
  teamRole?: string;
  taskProfile?: string;
  efficiencyMode?: AiEfficiencyMode;
}

export interface AiSlideDesignContext {
  backgroundColor?: string;
  backgroundGradient?: string;
  fontFamily?: string;
  elementsSummary?: string;
  otherSlideTitles?: string[];
}

export type SlideVisualStyle =
  | 'top-bar'
  | 'sidebar-left'
  | 'header-banner'
  | 'split-left'
  | 'split-right'
  | 'minimal-frame'
  | 'spotlight'
  | 'bento-grid'
  | 'editorial-hero'
  | 'diagonal-band';

export type SlideImageMode = 'none' | 'search' | 'generate';

export interface SlideQuestionOption {
  id: string;
  question: string;
  options: string[];
  allowCustom?: boolean;
}

export interface SlideQuestionAnswer {
  question: string;
  answer: string;
}

export interface AiSlideQuestionsRequest {
  purpose?: 'edit-slide' | 'create-pptx';
  presentationTitle: string;
  slideTitle?: string;
  slideTexts?: string[];
  otherSlideTitles?: string[];
  initialPrompt?: string;
}

export interface AiSlideQuestionsResponse {
  intro: string;
  questions: SlideQuestionOption[];
  modelUsed?: string;
  teamRole?: string;
}

export interface AiSlideEditRequest {
  action: string;
  customPrompt?: string;
  slideTitle?: string;
  slideTexts?: string[];
  presentationTitle: string;
  preferredModel?: AiTeamModelOption;
  efficiencyMode?: AiEfficiencyMode;
  slideContext?: AiSlideDesignContext;
  imageMode?: SlideImageMode;
  preserveContent?: boolean;
  qaAnswers?: SlideQuestionAnswer[];
  variationHint?: {
    avoidLayout?: string;
    avoidVisualStyle?: string;
    avoidLayouts?: string[];
    avoidVisualStyles?: string[];
    iteration?: number;
  };
}

export interface AiSlideEditResponse {
  title: string;
  subtitle?: string;
  layoutType: 'cover' | 'bullets' | 'cards' | 'diagram' | 'chart' | 'table';
  visualStyle?: SlideVisualStyle;
  bullets: string[];
  notes: string;
  backgroundColor?: string;
  backgroundGradient?: string;
  accentColor?: string;
  accentSecondaryColor?: string;
  textColor?: string;
  fontFamily?: string;
  chartKind?: 'bar' | 'horizontalBar' | 'line' | 'donut';
  chartTitle?: string;
  chartPoints?: { label: string; value: number }[];
  tableHeaders?: string[];
  tableRows?: string[][];
  imageUrl?: string;
  imageAlt?: string;
  imageSourceRole?: string;
  summary: string;
  modelUsed?: string;
  teamRole?: string;
  taskProfile?: string;
  efficiencyMode?: AiEfficiencyMode;
}

export interface AiPdfAssistRequest {
  action: string;
  customPrompt?: string;
  pageText: string;
  pageHtml?: string;
  pageNumber: number;
  totalPages: number;
  documentTitle: string;
  preferredModel?: AiTeamModelOption;
  efficiencyMode?: AiEfficiencyMode;
}

export interface AiPdfAssistResponse {
  noteText: string;
  bgColor?: string;
  textColor?: string;
  summary: string;
  modelUsed?: string;
  teamRole?: string;
  taskProfile?: string;
  efficiencyMode?: AiEfficiencyMode;
}

export interface AiCreateDocumentRequest {
  format: 'DOCX' | 'PPTX' | 'PDF';
  prompt: string;
  title?: string;
  tone?: string;
  palette?: string;
  fontStyle?: string;
  sectionCount?: number;
  preferredModel?: AiTeamModelOption;
  efficiencyMode?: AiEfficiencyMode;
  imageMode?: SlideImageMode;
  qaAnswers?: SlideQuestionAnswer[];
  tokenMode?: 'standard' | 'low-token';
  freellmapiEndpoint?: string;
}

export interface AiCreateDocumentResponse {
  format: 'DOCX' | 'PPTX' | 'PDF';
  title: string;
  folder: string;
  summary: string;
  contentHtml?: string;
  pageBgColor?: string;
  fontFamily?: 'sans' | 'serif' | 'mono';
  pagesHtml?: string[];
  slides?: AiSlideEditResponse[];
  modelUsed?: string;
  teamRole?: string;
  taskProfile?: string;
  efficiencyMode?: AiEfficiencyMode;
  tokenMode?: 'standard' | 'low-token';
  endpointUsed?: string;
}

export interface AiTranscribeAudioRequest {
  audioBase64: string;
  mimeType?: string;
  language?: string;
}

export interface AiTranscribeAudioResponse {
  text: string;
  modelUsed: string;
  teamRole: string;
}

function resolveAiUrl(path: string): string {
  const configuredBase = (
    (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_API_BASE_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (configuredBase) {
    return `${configuredBase}${path}`;
  }
  if (isNativeCapacitorApp()) {
    throw new Error(
      'El asistente IA en línea requiere abrir ALX Office desde la versión Web/PWA o compilar la APK con VITE_API_BASE_URL configurado.',
    );
  }
  return path;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'Sin conexión a internet. El asistente IA requiere conexión activa para generar o editar.',
    );
  }

  const targetUrl = resolveAiUrl(url);
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `El servidor de IA no devolvió una respuesta JSON válida (${res.status}).`,
    );
  }

  const payload = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(
      payload?.error || `Error del asistente IA (${res.status}).`,
    );
  }
  if (!payload) {
    throw new Error('La respuesta del asistente IA llegó vacía.');
  }
  return payload;
}

export function requestAiDocumentEdit(
  req: AiDocumentEditRequest,
): Promise<AiDocumentEditResponse> {
  return postJson<AiDocumentEditResponse>('/api/ai/edit-document', req);
}

export function requestAiSlideQuestions(
  req: AiSlideQuestionsRequest,
): Promise<AiSlideQuestionsResponse> {
  return postJson<AiSlideQuestionsResponse>('/api/ai/slide-questions', req);
}

export function requestAiSlideEdit(
  req: AiSlideEditRequest,
): Promise<AiSlideEditResponse> {
  return postJson<AiSlideEditResponse>('/api/ai/edit-slide', req);
}

export function requestAiPdfAssist(
  req: AiPdfAssistRequest,
): Promise<AiPdfAssistResponse> {
  return postJson<AiPdfAssistResponse>('/api/ai/assist-pdf', req);
}

export function requestAiCreateDocument(
  req: AiCreateDocumentRequest,
): Promise<AiCreateDocumentResponse> {
  return postJson<AiCreateDocumentResponse>('/api/ai/create-document', req);
}

export function requestAiTranscribeAudio(
  req: AiTranscribeAudioRequest,
): Promise<AiTranscribeAudioResponse> {
  return postJson<AiTranscribeAudioResponse>('/api/ai/transcribe-audio', req);
}
