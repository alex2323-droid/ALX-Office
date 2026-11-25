import type {
  AiCreateDocumentRequest,
  AiCreateDocumentResponse,
  AiEfficiencyMode,
  AiWorkTaskType,
} from './aiEditorClient';
import { isNativeCapacitorApp } from './platform';

export type FreeLlmTokenTier = 'ultra-low' | 'low' | 'balanced';

export interface FreeLlmBaseEndpointMeta {
  providerId: string;
  name: string;
  baseUrl: string;
  defaultLowTokenModel: string;
  protocol: 'chat' | 'responses' | 'anthropic';
  keylessSupported: boolean;
}

export interface FreeLlmEndpointDescriptor {
  id: string;
  providerId: string;
  label: string;
  baseUrl: string;
  model: string;
  kind: 'chat' | 'responses' | 'anthropic';
  tier?: 1 | 2 | 3;
  keyless: boolean;
  lowToken: boolean;
  estimatedTokensTier: FreeLlmTokenTier;
  bestForTasks?: AiWorkTaskType[];
  designStrength?: number;
  configured: boolean;
}

export interface FreeLlmProvidersResponse {
  providers: FreeLlmEndpointDescriptor[];
  baseEndpoints: FreeLlmBaseEndpointMeta[];
  lowTokenCount: number;
  totalConfigured: number;
  flagshipPlatforms?: string[];
}

export interface FreeLlmChatRequest {
  userPrompt: string;
  systemPrompt?: string;
  preferredEndpointId?: string;
  lowTokenMode?: boolean;
  taskType?: AiWorkTaskType;
  efficiencyMode?: AiEfficiencyMode;
  maxTokens?: number;
}

export interface FreeLlmChatResponse {
  text: string;
  modelUsed: string;
  teamRole: string;
  endpointId?: string;
  baseUrl?: string;
  lowTokenMode: boolean;
  taskProfile?: string;
}

export interface FreeLlmCreateDocumentRequest extends AiCreateDocumentRequest {
  tokenMode?: 'standard' | 'low-token';
  freellmapiEndpoint?: string;
}

/**
 * Catálogo público de endpoints base de FreeLLMAPI (sin claves privadas;
 * las credenciales residen exclusivamente en variables de entorno del servidor).
 */
export const FREELM_BASE_ENDPOINTS: readonly FreeLlmBaseEndpointMeta[] = [
  {
    providerId: 'kilo',
    name: 'Kilo AI Gateway',
    baseUrl: 'https://api.kilo.ai/api/gateway/v1',
    defaultLowTokenModel: 'nvidia/nemotron-3.5-lightning:free',
    protocol: 'chat',
    keylessSupported: true,
  },
  {
    providerId: 'llm7',
    name: 'LLM7.io',
    baseUrl: 'https://api.llm7.io/v1',
    defaultLowTokenModel: 'mistral-Nemo-Instruct-2407',
    protocol: 'chat',
    keylessSupported: true,
  },
  {
    providerId: 'apinex',
    name: 'APINex',
    baseUrl: 'https://api.apinex.bond/v1',
    defaultLowTokenModel: 'free/deepseek-v4.1-flash',
    protocol: 'chat',
    keylessSupported: false,
  },
  {
    providerId: 'simplellm',
    name: 'SimpleLLM',
    baseUrl: 'https://api.simplellm.eu/v1',
    defaultLowTokenModel: 'free-Llama-3.1-8B-Instruct',
    protocol: 'chat',
    keylessSupported: false,
  },
  {
    providerId: 'electronhub',
    name: 'ElectronHub',
    baseUrl: 'https://api.electronhub.ai/v1',
    defaultLowTokenModel: 'hermes-4-14b',
    protocol: 'chat',
    keylessSupported: false,
  },
  {
    providerId: 'aclide',
    name: 'ACLIDE',
    baseUrl: 'https://aclide.com/v1',
    defaultLowTokenModel: 'anthropic/claude-haiku-4.5',
    protocol: 'responses',
    keylessSupported: false,
  },
  {
    providerId: 'unorouter',
    name: 'UnoRouter',
    baseUrl: 'https://api.unorouter.com/v1',
    defaultLowTokenModel: 'glm-5.3:free',
    protocol: 'chat',
    keylessSupported: false,
  },
  {
    providerId: 'waterfall',
    name: 'Waterfall',
    baseUrl: 'https://api.getwaterfall.org/v1',
    defaultLowTokenModel: 'kimi-k3-nvidia-direct',
    protocol: 'chat',
    keylessSupported: false,
  },
  {
    providerId: 'router9',
    name: 'Router9',
    baseUrl: 'https://api.router9.com/v1',
    defaultLowTokenModel: 'deepseek/deepseek-v4-pro',
    protocol: 'chat',
    keylessSupported: false,
  },
  {
    providerId: 'modelscope',
    name: 'ModelScope',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    defaultLowTokenModel: 'deepseek-ai/DeepSeek-V4-Pro',
    protocol: 'chat',
    keylessSupported: false,
  },
] as const;

function resolveLlmServiceUrl(path: string): string {
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
      'El servicio FreeLLMAPI requiere abrir ALX Office en Web/PWA o definir VITE_API_BASE_URL en la compilación móvil.',
    );
  }
  return path;
}

async function fetchJsonSafe<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'Sin conexión a internet. Conéctate para consultar o usar FreeLLMAPI.',
    );
  }

  const res = await fetch(resolveLlmServiceUrl(path), init);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `El puente FreeLLMAPI no devolvió JSON válido (${res.status}).`,
    );
  }

  const payload = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(
      payload?.error || `Error en el servicio FreeLLMAPI (${res.status}).`,
    );
  }
  if (!payload) {
    throw new Error('La respuesta del servicio FreeLLMAPI llegó vacía.');
  }
  return payload;
}

/**
 * Obtiene del backend los endpoints base configurados y modelos activos de FreeLLMAPI
 * sin exponer credenciales en el navegador.
 */
export function fetchFreeLlmProviders(): Promise<FreeLlmProvidersResponse> {
  return fetchJsonSafe<FreeLlmProvidersResponse>(
    '/api/ai/freellmapi/providers',
    { method: 'GET' },
  );
}

/**
 * Filtra y ordena los modelos de menor consumo de tokens disponibles,
 * priorizando los que mejor encajan con trabajos de oficina y diseño.
 */
export function getLowTokenModels(
  providers: FreeLlmEndpointDescriptor[],
  taskType?: AiWorkTaskType,
): FreeLlmEndpointDescriptor[] {
  const rank: Record<FreeLlmTokenTier, number> = {
    'ultra-low': 0,
    low: 1,
    balanced: 2,
  };
  return providers
    .filter((p) => p.configured && (p.lowToken || (taskType && p.bestForTasks?.includes(taskType))))
    .sort((a, b) => {
      if (taskType) {
        const aMatch = Number(Boolean(a.bestForTasks?.includes(taskType)));
        const bMatch = Number(Boolean(b.bestForTasks?.includes(taskType)));
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      const strengthDiff = (b.designStrength ?? 5) - (a.designStrength ?? 5);
      if (taskType === 'presentation-design' && strengthDiff !== 0) {
        return strengthDiff;
      }
      return rank[a.estimatedTokensTier] - rank[b.estimatedTokensTier];
    });
}

/**
 * Ordena todos los proveedores configurados según la tarea actual del usuario.
 */
export function getRecommendedProvidersForTask(
  providers: FreeLlmEndpointDescriptor[],
  taskType: AiWorkTaskType,
  efficiencyMode: AiEfficiencyMode = 'auto',
): FreeLlmEndpointDescriptor[] {
  const tierRank: Record<FreeLlmTokenTier, number> = {
    'ultra-low': 0,
    low: 1,
    balanced: 2,
  };
  return providers
    .filter((p) => p.configured)
    .sort((a, b) => {
      const aMatch = Number(Boolean(a.bestForTasks?.includes(taskType)));
      const bMatch = Number(Boolean(b.bestForTasks?.includes(taskType)));
      if (aMatch !== bMatch) return bMatch - aMatch;

      if (efficiencyMode === 'low-token') {
        const tDiff = tierRank[a.estimatedTokensTier] - tierRank[b.estimatedTokensTier];
        if (tDiff !== 0) return tDiff;
      }
      return (b.designStrength ?? 5) - (a.designStrength ?? 5);
    });
}

/**
 * Ejecuta una generación de texto usando los endpoints configurados de FreeLLMAPI
 * optimizados según la tarea y el presupuesto de tokens.
 */
export function requestFreeLlmCompletion(
  req: FreeLlmChatRequest,
): Promise<FreeLlmChatResponse> {
  return fetchJsonSafe<FreeLlmChatResponse>('/api/ai/freellmapi/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lowTokenMode: req.lowTokenMode ?? true,
      efficiencyMode: req.efficiencyMode ?? (req.lowTokenMode === false ? 'auto' : 'low-token'),
      maxTokens: req.maxTokens ?? 2200,
      ...req,
    }),
  });
}

/**
 * Conecta el asistente de creación de documentos (DOCX, PPTX, PDF) con el
 * orquestador por tarea (diseño visual para PPTX, redacción estructurada para DOCX/PDF).
 */
export function createDocumentWithFreeLlm(
  req: FreeLlmCreateDocumentRequest,
): Promise<AiCreateDocumentResponse> {
  const efficiencyMode: AiEfficiencyMode =
    req.efficiencyMode ?? (req.tokenMode === 'standard' ? 'auto' : 'low-token');
  const tokenMode = efficiencyMode === 'low-token' ? 'low-token' : 'standard';
  return fetchJsonSafe<AiCreateDocumentResponse>('/api/ai/create-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...req,
      efficiencyMode,
      tokenMode,
      freellmapiEndpoint: req.freellmapiEndpoint || 'auto',
    }),
  });
}
