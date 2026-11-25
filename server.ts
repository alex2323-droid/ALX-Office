import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeErrorText(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw || 'Error interno del servidor');
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key\s*[=:]\s*)[^\s,;'"`]+/gi, '$1[REDACTED]')
    .replace(
      /\b(gsk_|sk-or-v1-|sk-|tvly-|pexafy_api_|AIza|nvapi-|hf_|xai-|ghp_)[A-Za-z0-9_-]{8,}\b/g,
      '$1[REDACTED]',
    );
}

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

const CRITICAL_PRODUCTION_SECRETS = ['GEMINI_API_KEY'] as const;
const OPTIONAL_PROVIDER_SECRETS = [
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GROQ_API_KEY',
  'GROQ_KEY',
  'OPENROUTER_API_KEY',
  'OPEN_ROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'MOONSHOT_API_KEY',
  'XAI_API_KEY',
  'SAMBANOVA_API_KEY',
  'TOGETHER_API_KEY',
  'FIREWORKS_API_KEY',
  'CHUTES_API_KEY',
  'SILICONFLOW_API_KEY',
  'NEBIUS_API_KEY',
  'DEEPINFRA_API_KEY',
  'NOVITA_API_KEY',
  'ZHIPU_API_KEY',
  'GLM_API_KEY',
  'COHERE_API_KEY',
  'PERPLEXITY_API_KEY',
  'FREELLMAPI_API_KEY',
  'CEREBRAS_API_KEY',
  'NVIDIA_API_KEY',
  'NVIDIA_NIM_API_KEY',
  'MISTRAL_API_KEY',
  'GITHUB_MODELS_TOKEN',
  'GITHUB_TOKEN',
  'HUGGINGFACE_API_KEY',
  'HF_TOKEN',
  'BAZAARLINK_API_KEY',
  'ROUTEWAY_API_KEY',
  'KILO_API_KEY',
  'LLM7_API_KEY',
  'APINEX_API_KEY',
  'ELECTRONHUB_API_KEY',
  'ACLIDE_API_KEY',
  'ROUTER9_API_KEY',
  'MODELSCOPE_API_KEY',
  'UNOROUTER_API_KEY',
  'SIMPLELLM_API_KEY',
  'WATERFALL_API_KEY',
  'TAVILY_API_KEY',
  'FIRECRAWL_API_KEY',
  'PEXAFY_API_KEY',
  'PIXABAY_API_KEY',
] as const;

function isPlaceholderSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 10) return true;
  return /^(MY_|YOUR_|REPLACE_|CHANGEME|PLACEHOLDER|TODO|EXAMPLE|<[^>]+>)/i.test(trimmed);
}

function getEnvSecret(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    if (raw && raw.trim() && !isPlaceholderSecret(raw)) {
      return raw.trim();
    }
  }
  return '';
}

export function validateProductionSecrets(): {
  ok: boolean;
  isProduction: boolean;
  missingCritical: string[];
  invalidSecrets: string[];
  exposedClientVars: string[];
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const missingCritical: string[] = [];
  const invalidSecrets: string[] = [];

  for (const key of CRITICAL_PRODUCTION_SECRETS) {
    const val =
      key === 'GEMINI_API_KEY'
        ? process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY
        : process.env[key];
    if (!val || !val.trim()) {
      missingCritical.push(key);
    } else if (isPlaceholderSecret(val)) {
      invalidSecrets.push(key);
    }
  }

  for (const key of OPTIONAL_PROVIDER_SECRETS) {
    const val = process.env[key];
    if (val && val.trim() && isPlaceholderSecret(val)) {
      invalidSecrets.push(key);
    }
  }

  const exposedClientVars = Object.keys(process.env).filter(
    (name) =>
      /^VITE_.*(API_KEY|SECRET|PRIVATE_KEY|ACCESS_TOKEN|PASSWORD)/i.test(name) &&
      Boolean(process.env[name]?.trim()),
  );

  if (exposedClientVars.length > 0) {
    throw new Error(
      `[FATAL] Se detectaron variables de entorno de cliente potencialmente sensibles (${exposedClientVars.join(', ')}). Nunca expongas claves privadas con prefijo VITE_.`,
    );
  }

  if (isProduction && (missingCritical.length > 0 || invalidSecrets.length > 0)) {
    const details: string[] = [];
    if (missingCritical.length > 0) {
      details.push(`faltantes: ${missingCritical.join(', ')}`);
    }
    if (invalidSecrets.length > 0) {
      details.push(`con valores de plantilla o inválidos: ${invalidSecrets.join(', ')}`);
    }
    throw new Error(
      `[FATAL] No se puede inicializar ALX Office en producción porque faltan secretos críticos de configuración (${details.join('; ')}). Configúralos en Settings > Secrets antes de iniciar el servidor.`,
    );
  }

  if (!isProduction && (missingCritical.length > 0 || invalidSecrets.length > 0)) {
    const pending = [...missingCritical, ...invalidSecrets];
    console.warn(
      `[Configuración de inicio] Advertencia en desarrollo: faltan o están sin configurar (${pending.join(', ')}). En producción la aplicación bloqueará el arranque si no están definidos en Settings > Secrets.`,
    );
  }

  return {
    ok: missingCritical.length === 0 && invalidSecrets.length === 0 && exposedClientVars.length === 0,
    isProduction,
    missingCritical,
    invalidSecrets,
    exposedClientVars,
  };
}

// Reorganizado estrictamente de la MÁS ALTA a la MÁS BAJA exigencia / capacidad intelectual
export const GROQ_TEAM = {
  openrouterUltra: {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'Nemotron 550B Ultra',
    role: 'Arquitecto Ultra 550B (Máxima Exigencia / OpenRouter)',
  },
  reasoning: {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-120B',
    role: 'Estratega de Razonamiento (Exigencia Muy Alta)',
  },
  gemini: {
    id: MODEL_NAME,
    name: 'Gemini 4 Flash',
    role: 'Contexto Largo y Multimodal (Exigencia Muy Alta)',
  },
  gemma4_31b: {
    id: 'google/gemma-4-31b-it:free',
    name: 'Gemma 4 31B',
    role: 'Razonamiento Denso 31B (Exigencia Alta)',
  },
  structure: {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen-27B',
    role: 'Especialista en Estructura y Diseño (Exigencia Alta)',
  },
  gemma4_26b: {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Gemma 4 26B A4B',
    role: 'MoE Ágil 26B/4B (Exigencia Media-Alta)',
  },
  openrouterVl: {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    name: 'Nemotron Super VL',
    role: 'Diseñador Visual VL 1M (Exigencia Media-Alta)',
  },
  fast: {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-20B',
    role: 'Corrector Ultrarrápido (Exigencia Media)',
  },
  openrouterFast: {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'Nemotron Lightning',
    role: 'Redactor Veloz 1M (Exigencia Media)',
  },
  openrouterErnie: {
    id: 'baidu/ernie-5.5-flash-preview:free',
    name: 'ERNIE 5.5 Flash',
    role: 'Redactor Multilingüe 1M (Exigencia Media)',
  },
  gemma4E4b: {
    id: 'gemma-4-e4b-it',
    name: 'Gemma 4 E4B',
    role: 'Edge Multimodal 4B (Exigencia Media-Baja)',
  },
  gemma4E2b: {
    id: 'gemma-4-e2b-it',
    name: 'Gemma 4 E2B',
    role: 'Edge Ultracompacto 2B (Exigencia Baja)',
  },
  openrouterRouter: {
    id: 'openrouter/free',
    name: 'OpenRouter Free',
    role: 'Router Libre (Exigencia Variable)',
  },
  tavilySearch: {
    id: 'tavily-api',
    name: 'Tavily AI Search',
    role: 'Motor de Búsqueda Web e Investigación en Vivo (Tavily API)',
  },
  firecrawlScrape: {
    id: 'firecrawl-api',
    name: 'Firecrawl Web Crawler',
    role: 'Scraper y Extractor de Páginas Web (Firecrawl API)',
  },
  openAlex: {
    id: 'openalex-api',
    name: 'OpenAlex Scientific',
    role: 'Base de Datos Global de Investigación Académica (OpenAlex API https://help.openalex.org/api/)',
  },
  imageSearch: {
    id: 'openai/gpt-oss-20b',
    name: 'Buscador Visual IA',
    role: 'Especialista en Búsqueda de Imágenes (Pixabay + Openverse + Wikimedia)',
  },
  imageGen: {
    id: '@cf/black-forest-labs/flux-1-schnell',
    name: 'Ilustrador y Generador IA',
    role: 'Especialista en Generación de Imágenes (Cloudflare Flux/SDXL + Vector SVG)',
  },
  cloudflareFlux: {
    id: '@cf/black-forest-labs/flux-1-schnell',
    name: 'Cloudflare Flux 1 Schnell',
    role: 'Generador de Imágenes IA (Cloudflare Workers AI)',
  },
  cloudflareSdxl: {
    id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    name: 'Cloudflare SDXL Base',
    role: 'Generador Fotorealista (Cloudflare Workers AI)',
  },
  whisper: {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper V3 Turbo',
    role: 'Transcriptor de Voz y Dictado (Whisper V3)',
  },
};

export type AiWorkTaskType =
  | 'quick-edit'
  | 'document-edit'
  | 'document-create'
  | 'presentation-design'
  | 'pdf-analysis';

export type AiEfficiencyMode = 'auto' | 'low-token' | 'quality';

const TASK_PROFILE_LABELS: Record<AiWorkTaskType, string> = {
  'quick-edit': 'Edición Rápida y Síntesis',
  'document-edit': 'Edición Editorial de Documentos',
  'document-create': 'Autoría Estructurada de Documentos',
  'presentation-design': 'Diseño Visual Canva & Presentaciones',
  'pdf-analysis': 'Análisis y Anotación PDF',
};

type AiReasoningEffort = 'low' | 'medium' | 'high';

interface GroqTeamResult {
  text: string;
  modelUsed: string;
  teamRole: string;
  taskProfile?: string;
  efficiencyMode?: AiEfficiencyMode;
  endpointUsed?: string;
  endpointId?: string;
  baseUrl?: string;
  failoverUsed?: boolean;
  reasoningEffort?: AiReasoningEffort;
}

const groqModelCooldownUntil = new Map<string, number>();
let openRouterGlobalCooldownUntil = 0;

function parseGroqRetryMs(res: Response, errBody: string): number {
  const retryHeader = res.headers.get('retry-after');
  if (retryHeader) {
    const secs = Number(retryHeader);
    if (!Number.isNaN(secs) && secs > 0) return Math.ceil(secs * 1000);
  }
  const msMatch = errBody.match(/try again in\s+(\d+(?:\.\d+)?)ms/i);
  if (msMatch) return Math.ceil(Number(msMatch[1]));
  const secMatch = errBody.match(/try again in\s+(\d+(?:\.\d+)?)s/i);
  if (secMatch) return Math.ceil(Number(secMatch[1]) * 1000);
  return 10000;
}

function getReasoningEffortForTask(
  taskType: AiWorkTaskType,
  efficiencyMode: AiEfficiencyMode,
): AiReasoningEffort {
  if (efficiencyMode === 'low-token') return 'low';
  if (taskType === 'quick-edit') return efficiencyMode === 'quality' ? 'medium' : 'low';
  if (efficiencyMode === 'quality') return 'high';
  // High reasoning by default for presentation design, document authoring/editing, and PDF analysis
  return taskType === 'presentation-design' || taskType === 'document-create'
    ? 'high'
    : 'medium';
}

function getCreativeTemperatureForTask(
  taskType?: AiWorkTaskType,
  efficiencyMode: AiEfficiencyMode = 'auto',
): number {
  if (taskType === 'quick-edit') return 0.35;
  if (taskType === 'pdf-analysis') return 0.45;
  if (taskType === 'presentation-design') {
    return efficiencyMode === 'low-token' ? 0.65 : 0.86;
  }
  if (taskType === 'document-create') {
    return efficiencyMode === 'low-token' ? 0.55 : 0.76;
  }
  return efficiencyMode === 'low-token' ? 0.5 : 0.68;
}

async function fetchGroqChatOnce(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxCompletionTokens: number,
  reasoningEffort: AiReasoningEffort = 'medium',
  temperature = 0.72,
): Promise<Response> {
  const supportsReasoningEffort = model.startsWith('openai/gpt-oss-');
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: maxCompletionTokens,
      temperature,
      ...(supportsReasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    }),
    signal: AbortSignal.timeout(26000),
  });
}

async function callGeminiHydrogen(
  systemPrompt: string,
  userPrompt: string,
  thinkingLevel: ThinkingLevel = ThinkingLevel.HIGH,
  taskType?: AiWorkTaskType,
): Promise<GroqTeamResult> {
  const ai = getAiClient();
  const runCall = async (level: ThinkingLevel) =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: level },
      },
    });

  let response;
  try {
    response = await runCall(thinkingLevel);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    // If 'XHIGH' isn't accepted by the runtime SDK/model version, seamlessly fall back to HIGH
    if (
      String(thinkingLevel) === 'XHIGH' &&
      /400|invalid|thinking|enum|xhigh/i.test(rawMsg)
    ) {
      response = await runCall(ThinkingLevel.HIGH);
    } else {
      throw err;
    }
  }

  return {
    text: response.text || '',
    modelUsed: MODEL_NAME,
    teamRole: GROQ_TEAM.gemini.role,
    taskProfile: taskType ? TASK_PROFILE_LABELS[taskType] : undefined,
  };
}

async function callGemmaViaGeminiApi(
  modelId: string,
  role: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<GroqTeamResult | null> {
  if (!getEnvSecret('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY')) {
    return null;
  }
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `${systemPrompt}\n\n---\n\n${userPrompt}`,
    });
    const text = (response.text || '').trim();
    if (!text) return null;
    return {
      text,
      modelUsed: modelId,
      teamRole: role,
    };
  } catch {
    return null;
  }
}

async function fetchOpenRouterChatOnce(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  reasoningEffort: AiReasoningEffort = 'medium',
  temperature = 0.78,
): Promise<Response> {
  const reasoningConfig =
    model === GROQ_TEAM.openrouterFast.id
      ? { reasoning: { effort: reasoningEffort === 'high' ? 'low' : 'none' } }
      : model === GROQ_TEAM.openrouterUltra.id ||
          model.startsWith('google/gemma-4-') ||
          model === GROQ_TEAM.openrouterRouter.id
        ? { reasoning: { effort: reasoningEffort } }
        : model === GROQ_TEAM.openrouterVl.id
          ? { reasoning: { enabled: reasoningEffort !== 'low' } }
          : {};

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL?.trim() || 'https://alx-office.app',
      'X-Title': 'ALX Office',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...(model.startsWith('nvidia/') || model.startsWith('google/gemma-4-')
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...reasoningConfig,
      max_tokens: maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(16000),
  });
}

async function callOpenRouterFreeCascade(
  preferredModelId: string | undefined,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    reasoningEffort?: AiReasoningEffort;
    temperature?: number;
    maxTokens?: number;
    validateOutput?: (text: string) => boolean;
  },
): Promise<GroqTeamResult | null> {
  const apiKey = getEnvSecret('OPENROUTER_API_KEY', 'OPEN_ROUTER_API_KEY');
  if (!apiKey) return null;
  if (Date.now() < openRouterGlobalCooldownUntil) return null;

  const roleMap: Record<string, string> = {
    [GROQ_TEAM.openrouterUltra.id]: GROQ_TEAM.openrouterUltra.role,
    [GROQ_TEAM.openrouterFast.id]: GROQ_TEAM.openrouterFast.role,
    [GROQ_TEAM.openrouterVl.id]: GROQ_TEAM.openrouterVl.role,
    [GROQ_TEAM.openrouterErnie.id]: GROQ_TEAM.openrouterErnie.role,
    [GROQ_TEAM.gemma4_26b.id]: GROQ_TEAM.gemma4_26b.role,
    [GROQ_TEAM.gemma4_31b.id]: GROQ_TEAM.gemma4_31b.role,
    [GROQ_TEAM.openrouterRouter.id]: GROQ_TEAM.openrouterRouter.role,
  };

  // Ordered from highest intelligence/design capability to fastest fallback (:free endpoints)
  const allCandidates = [
    preferredModelId,
    GROQ_TEAM.openrouterUltra.id,
    GROQ_TEAM.gemma4_31b.id,
    GROQ_TEAM.openrouterVl.id,
    GROQ_TEAM.gemma4_26b.id,
    GROQ_TEAM.openrouterErnie.id,
    GROQ_TEAM.openrouterFast.id,
    GROQ_TEAM.openrouterRouter.id,
  ].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

  const now = Date.now();
  const ready = allCandidates.filter((m) => (groqModelCooldownUntil.get(m) ?? 0) <= now);
  const candidates = (ready.length > 0 ? ready : allCandidates).slice(0, 4);
  const cascadeStart = Date.now();
  const reasoningEffort = options?.reasoningEffort ?? 'medium';
  const temperature = options?.temperature ?? 0.78;
  const maxTokens = options?.maxTokens ?? 4096;

  for (const model of candidates) {
    if (Date.now() - cascadeStart > 22000) break;
    try {
      const res = await fetchOpenRouterChatOnce(
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        reasoningEffort,
        temperature,
      );
      if (res.status === 429) {
        const errBody = await res.text();
        if (/free-models-per-day|X-RateLimit-Remaining"\s*:\s*"0"/i.test(errBody)) {
          openRouterGlobalCooldownUntil = Date.now() + 5 * 60 * 1000;
          break;
        }
        const retryMs = parseGroqRetryMs(res, errBody);
        groqModelCooldownUntil.set(
          model,
          Date.now() + Math.max(12000, Math.min(retryMs, 60000)),
        );
        continue;
      }
      if (res.ok) {
        const data = (await res.json()) as {
          model?: string;
          choices?: { message?: { content?: string } }[];
        };
        const content = (data.choices?.[0]?.message?.content || '').trim();
        if (content && (!options?.validateOutput || options.validateOutput(content))) {
          groqModelCooldownUntil.delete(model);
          return {
            text: content,
            modelUsed: data.model || model,
            teamRole: roleMap[model] || `OpenRouter Gratis (${data.model || model})`,
            reasoningEffort,
          };
        }
        // Invalid or truncated output -> try next backup model
        continue;
      } else {
        await res.text();
        groqModelCooldownUntil.set(model, Date.now() + 10000);
      }
    } catch {
      groqModelCooldownUntil.set(model, Date.now() + 8000);
    }
  }
  return null;
}

async function tryGroqCascade(
  candidateModels: string[],
  systemPrompt: string,
  userPrompt: string,
  maxTokensDefault: number,
  options?: {
    reasoningEffort?: AiReasoningEffort;
    temperature?: number;
    validateOutput?: (text: string) => boolean;
  },
): Promise<GroqTeamResult | null> {
  const apiKey = getEnvSecret('GROQ_API_KEY', 'GROQ_KEY');
  if (!apiKey) return null;

  const roleMap: Record<string, string> = {
    [GROQ_TEAM.reasoning.id]: GROQ_TEAM.reasoning.role,
    [GROQ_TEAM.structure.id]: GROQ_TEAM.structure.role,
    [GROQ_TEAM.fast.id]: GROQ_TEAM.fast.role,
  };

  const now = Date.now();
  const unique = candidateModels.filter((m, i, arr) => arr.indexOf(m) === i);
  const ready = unique.filter((m) => (groqModelCooldownUntil.get(m) ?? 0) <= now);
  const queue = ready.length > 0 ? ready : [];
  const reasoningEffort = options?.reasoningEffort ?? 'medium';
  const temperature = options?.temperature ?? 0.74;

  for (const model of queue) {
    // Respect Qwen-27B's 1000 OTPM free-tier cap ONLY when calling Qwen directly
    const maxTokens =
      model === GROQ_TEAM.structure.id
        ? Math.min(900, maxTokensDefault)
        : Math.min(4096, Math.max(900, maxTokensDefault));

    try {
      let response = await fetchGroqChatOnce(
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        reasoningEffort,
        temperature,
      );

      if (response.status === 429) {
        const errBody = await response.text();
        const retryMs = parseGroqRetryMs(response, errBody);
        if (retryMs <= 1200) {
          await new Promise((r) => setTimeout(r, retryMs + 80));
          response = await fetchGroqChatOnce(
            apiKey,
            model,
            systemPrompt,
            userPrompt,
            maxTokens,
            reasoningEffort,
            temperature,
          );
          if (response.status === 429) {
            const errBody2 = await response.text();
            const retryMs2 = parseGroqRetryMs(response, errBody2);
            groqModelCooldownUntil.set(
              model,
              Date.now() + Math.max(10000, Math.min(retryMs2, 60000)),
            );
            continue;
          }
        } else {
          groqModelCooldownUntil.set(
            model,
            Date.now() + Math.max(10000, Math.min(retryMs, 60000)),
          );
          continue;
        }
      }

      if (response.ok) {
        groqModelCooldownUntil.delete(model);
        const data = await response.json();
        const content = (data.choices?.[0]?.message?.content || '').trim();
        if (content && (!options?.validateOutput || options.validateOutput(content))) {
          return {
            text: content,
            modelUsed: model,
            teamRole: roleMap[model] || model,
            reasoningEffort,
          };
        }
        continue;
      } else if (response.status >= 500) {
        groqModelCooldownUntil.set(model, Date.now() + 8000);
      } else {
        await response.text();
      }
    } catch {
      groqModelCooldownUntil.set(model, Date.now() + 5000);
    }
  }
  return null;
}

function getDefaultMaxTokensForTask(
  taskType: AiWorkTaskType,
  efficiencyMode: AiEfficiencyMode,
): number {
  switch (taskType) {
    case 'quick-edit':
      return efficiencyMode === 'quality' ? 1600 : 1100;
    case 'pdf-analysis':
      return efficiencyMode === 'low-token' ? 1200 : 2000;
    case 'document-edit':
      return efficiencyMode === 'low-token' ? 2400 : 3800;
    case 'document-create':
      return efficiencyMode === 'low-token' ? 3000 : 4096;
    case 'presentation-design':
      return efficiencyMode === 'low-token' ? 2800 : 4096;
  }
}

function getGeminiThinkingForTask(
  taskType: AiWorkTaskType,
  efficiencyMode: AiEfficiencyMode,
): ThinkingLevel {
  if (efficiencyMode === 'low-token') return ThinkingLevel.LOW;
  switch (taskType) {
    case 'quick-edit':
      return efficiencyMode === 'quality' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;
    case 'presentation-design':
    case 'document-create':
    case 'document-edit':
    case 'pdf-analysis':
      return efficiencyMode === 'quality'
        ? ('XHIGH' as ThinkingLevel)
        : ThinkingLevel.HIGH;
  }
}

async function runTaskAwareAiOrchestrator(options: {
  taskType: AiWorkTaskType;
  systemPrompt: string;
  userPrompt: string;
  efficiencyMode?: AiEfficiencyMode;
  preferredModel?: string;
  preferredEndpointId?: string;
  maxTokens?: number;
  longContextHint?: boolean;
  validateOutput?: (text: string) => boolean;
}): Promise<GroqTeamResult> {
  const {
    taskType,
    systemPrompt,
    userPrompt,
    efficiencyMode = 'auto',
    preferredModel = 'auto',
    preferredEndpointId,
    longContextHint = false,
    validateOutput,
  } = options;

  const hasGeminiKey = Boolean(
    getEnvSecret('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'),
  );
  const maxTokens =
    options.maxTokens ?? getDefaultMaxTokensForTask(taskType, efficiencyMode);
  const geminiThinking = getGeminiThinkingForTask(taskType, efficiencyMode);
  const reasoningEffort = getReasoningEffortForTask(taskType, efficiencyMode);
  const creativeTemp = getCreativeTemperatureForTask(taskType, efficiencyMode);
  const compactSystemPrompt =
    efficiencyMode === 'low-token'
      ? `${systemPrompt} Sé conciso para optimizar tokens manteniendo formato válido y diseño limpio.`
      : systemPrompt;

  let attemptFailures = 0;
  let geminiAttempted = false;
  let bestInvalidResult: GroqTeamResult | null = null;

  const isOutputAcceptable = (res: GroqTeamResult | null): res is GroqTeamResult => {
    if (!res || !res.text.trim()) return false;
    if (!validateOutput) return true;
    if (validateOutput(res.text)) return true;
    if (!bestInvalidResult || res.text.length > bestInvalidResult.text.length) {
      bestInvalidResult = res;
    }
    attemptFailures++;
    return false;
  };

  const attachMeta = (res: GroqTeamResult): GroqTeamResult => ({
    ...res,
    taskProfile: TASK_PROFILE_LABELS[taskType],
    efficiencyMode,
    reasoningEffort: res.reasoningEffort ?? reasoningEffort,
    failoverUsed: attemptFailures > 0,
  });

  const tryGeminiStep = async (
    sysPrompt: string,
    level: ThinkingLevel,
  ): Promise<GroqTeamResult | null> => {
    if (!hasGeminiKey || geminiAttempted) return null;
    geminiAttempted = true;
    try {
      const res = await callGeminiHydrogen(sysPrompt, userPrompt, level, taskType);
      if (isOutputAcceptable(res)) return res;
    } catch (err) {
      attemptFailures++;
      console.warn(`[AI Failover] Gemini 4 Hydrogen falló: ${sanitizeErrorText(err)}`);
    }
    return null;
  };

  const tryFreeProvidersStep = async (cfg: {
    sysPrompt: string;
    excludeKeyless?: boolean;
    minDesignStrength?: number;
    preferredId?: string;
    onlyKeyless?: boolean;
  }): Promise<GroqTeamResult | null> => {
    const res = await callFreeLlmApiProviders(cfg.sysPrompt, userPrompt, {
      lowTokenMode: efficiencyMode === 'low-token',
      preferredEndpointId: cfg.preferredId,
      taskType,
      efficiencyMode,
      maxTokens,
      reasoningEffort,
      temperature: creativeTemp,
      excludeKeyless: cfg.excludeKeyless,
      onlyKeyless: cfg.onlyKeyless,
      minDesignStrength: cfg.minDesignStrength,
      validateOutput,
    });
    if (isOutputAcceptable(res)) return res;
    if (!res) attemptFailures++;
    return null;
  };

  const tryGroqStep = async (
    models: string[],
    sysPrompt: string,
  ): Promise<GroqTeamResult | null> => {
    const res = await tryGroqCascade(models, sysPrompt, userPrompt, maxTokens, {
      reasoningEffort,
      temperature: creativeTemp,
      validateOutput,
    });
    if (isOutputAcceptable(res)) return res;
    if (!res) attemptFailures++;
    return null;
  };

  const tryOpenRouterStep = async (
    preferredOrId: string | undefined,
    sysPrompt: string,
  ): Promise<GroqTeamResult | null> => {
    const res = await callOpenRouterFreeCascade(preferredOrId, sysPrompt, userPrompt, {
      reasoningEffort,
      temperature: creativeTemp,
      maxTokens,
      validateOutput,
    });
    if (isOutputAcceptable(res)) return res;
    if (!res) attemptFailures++;
    return null;
  };

  // 1. Explicit model or endpoint selection from caller (still backed by automatic failover if it fails)
  if (preferredModel === 'gemini' || preferredModel.includes('gemini')) {
    const res = await tryGeminiStep(systemPrompt, geminiThinking);
    if (res) return attachMeta(res);
  }

  if (preferredModel === 'gemma-4-e4b' || preferredModel === 'gemma-4-e2b') {
    const gemmaTarget =
      preferredModel === 'gemma-4-e2b' ? GROQ_TEAM.gemma4E2b : GROQ_TEAM.gemma4E4b;
    const directGemma = await callGemmaViaGeminiApi(
      gemmaTarget.id,
      gemmaTarget.role,
      systemPrompt,
      userPrompt,
    );
    if (isOutputAcceptable(directGemma)) return attachMeta(directGemma);
    const orGemma = await tryOpenRouterStep(GROQ_TEAM.gemma4_26b.id, systemPrompt);
    if (orGemma) return attachMeta(orGemma);
  }

  const explicitOpenRouterMap: Record<string, string> = {
    'nemotron-ultra': GROQ_TEAM.openrouterUltra.id,
    'nemotron-fast': GROQ_TEAM.openrouterFast.id,
    'nemotron-vl': GROQ_TEAM.openrouterVl.id,
    'ernie-flash': GROQ_TEAM.openrouterErnie.id,
    'gemma-4-26b': GROQ_TEAM.gemma4_26b.id,
    'gemma-4-31b': GROQ_TEAM.gemma4_31b.id,
  };
  if (explicitOpenRouterMap[preferredModel]) {
    const orExplicit = await tryOpenRouterStep(
      explicitOpenRouterMap[preferredModel],
      systemPrompt,
    );
    if (orExplicit) return attachMeta(orExplicit);
  }

  if (
    preferredEndpointId &&
    preferredEndpointId !== 'auto' &&
    preferredEndpointId !== 'auto-low-token'
  ) {
    const explicitFree = await tryFreeProvidersStep({
      sysPrompt: compactSystemPrompt,
      preferredId: preferredEndpointId,
    });
    if (explicitFree) return attachMeta(explicitFree);
  }

  if (
    preferredModel !== 'auto' &&
    !preferredModel.includes('gemini') &&
    !explicitOpenRouterMap[preferredModel]
  ) {
    const mappedGroq =
      preferredModel === 'gpt-120b' || preferredModel.includes('120b')
        ? [GROQ_TEAM.reasoning.id, GROQ_TEAM.fast.id]
        : preferredModel === 'qwen' ||
            preferredModel.includes('qwen') ||
            preferredModel.includes('27b')
          ? [GROQ_TEAM.structure.id, GROQ_TEAM.reasoning.id]
          : preferredModel === 'gpt-20b' || preferredModel.includes('20b')
            ? [GROQ_TEAM.fast.id, GROQ_TEAM.reasoning.id]
            : [GROQ_TEAM.reasoning.id, GROQ_TEAM.fast.id];
    const explicitGroq = await tryGroqStep(mappedGroq, systemPrompt);
    if (explicitGroq) return attachMeta(explicitGroq);
  }

  // 2. Strict Tiered Automatic Routing & Multi-Provider Failover
  //    Tier 1: Keyed Flagship AIs (Kimi K3.1 Pro, Claude, GPT-4.1, DeepSeek R1/V4 Pro, Gemini 4 Hydrogen HIGH/XHIGH, Groq GPT-120B)
  //    Tier 2: High-Intelligence Backups (OpenRouter :free Nemotron 550B Ultra / Gemma 4 31B / VL, Keyed Tier-2 Providers)
  //    Tier 3: Resilient Safety Net (Groq GPT-20B, Gemma 4 E4B, Keyless FreeLLMAPI: LLM7 Gemma 3 27B / Kilo)

  if (taskType === 'quick-edit') {
    const fastGroq = await tryGroqStep(
      [GROQ_TEAM.fast.id, GROQ_TEAM.reasoning.id],
      compactSystemPrompt,
    );
    if (fastGroq) return attachMeta(fastGroq);

    const fastKeyed = await tryFreeProvidersStep({
      sysPrompt: compactSystemPrompt,
      excludeKeyless: true,
    });
    if (fastKeyed) return attachMeta(fastKeyed);

    const fastGemini = await tryGeminiStep(compactSystemPrompt, geminiThinking);
    if (fastGemini) return attachMeta(fastGemini);

    const fastOr = await tryOpenRouterStep(GROQ_TEAM.gemma4_26b.id, compactSystemPrompt);
    if (fastOr) return attachMeta(fastOr);
  } else if (taskType === 'presentation-design') {
    if (efficiencyMode === 'low-token') {
      // Keyed design-capable models first, then Groq, then Gemini LOW, then OpenRouter
      const compactKeyed = await tryFreeProvidersStep({
        sysPrompt: compactSystemPrompt,
        excludeKeyless: true,
        minDesignStrength: 8,
      });
      if (compactKeyed) return attachMeta(compactKeyed);

      const groqFastDesign = await tryGroqStep(
        [GROQ_TEAM.reasoning.id, GROQ_TEAM.fast.id],
        compactSystemPrompt,
      );
      if (groqFastDesign) return attachMeta(groqFastDesign);

      const gemLow = await tryGeminiStep(compactSystemPrompt, ThinkingLevel.LOW);
      if (gemLow) return attachMeta(gemLow);
    } else {
      // TIER 1 (Flagships):
      // 1A) Keyed Tier-1 Flagship Designers (NVIDIA Kimi K3.1 Pro, Claude Sonnet/Haiku, GPT-4.1, DeepSeek Reasoner/V4 Pro, Moonshot, ElectronHub Luna/Kimi)
      const tier1Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 9,
      });
      if (tier1Keyed) return attachMeta(tier1Keyed);

      // 1B) Gemini 4 Hydrogen (HIGH / XHIGH reasoning)
      const tier1Gemini = await tryGeminiStep(systemPrompt, geminiThinking);
      if (tier1Gemini) return attachMeta(tier1Gemini);

      // 1C) Groq GPT-120B (with high reasoning_effort)
      const tier1Groq = await tryGroqStep([GROQ_TEAM.reasoning.id], systemPrompt);
      if (tier1Groq) return attachMeta(tier1Groq);

      // TIER 2 (High-Intelligence Backups):
      // 2A) OpenRouter :free Flagships (Nemotron 550B Ultra -> Gemma 4 31B -> Nemotron Super VL)
      const tier2Or = await tryOpenRouterStep(GROQ_TEAM.openrouterUltra.id, systemPrompt);
      if (tier2Or) return attachMeta(tier2Or);

      // 2B) Remaining Keyed Tier-2 Providers (NVIDIA Llama 70B, HuggingFace Qwen 72B, Together, Fireworks, Mistral, etc.)
      const tier2Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 7,
      });
      if (tier2Keyed) return attachMeta(tier2Keyed);
    }
  } else if (taskType === 'document-create' || taskType === 'pdf-analysis') {
    if (efficiencyMode === 'low-token') {
      const compactKeyed = await tryFreeProvidersStep({
        sysPrompt: compactSystemPrompt,
        excludeKeyless: true,
        minDesignStrength: 7,
      });
      if (compactKeyed) return attachMeta(compactKeyed);

      const groqAuthor = await tryGroqStep(
        [GROQ_TEAM.reasoning.id, GROQ_TEAM.fast.id],
        compactSystemPrompt,
      );
      if (groqAuthor) return attachMeta(groqAuthor);

      const gemLow = await tryGeminiStep(compactSystemPrompt, ThinkingLevel.LOW);
      if (gemLow) return attachMeta(gemLow);
    } else {
      // TIER 1: Gemini 4 Hydrogen (HIGH/XHIGH, long context) -> Keyed Tier-1 Flagships -> Groq GPT-120B
      const tier1Gemini = await tryGeminiStep(systemPrompt, geminiThinking);
      if (tier1Gemini) return attachMeta(tier1Gemini);

      const tier1Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 9,
      });
      if (tier1Keyed) return attachMeta(tier1Keyed);

      const tier1Groq = await tryGroqStep([GROQ_TEAM.reasoning.id], systemPrompt);
      if (tier1Groq) return attachMeta(tier1Groq);

      // TIER 2: OpenRouter Ultra/Gemma 31B -> Keyed Tier-2
      const tier2Or = await tryOpenRouterStep(GROQ_TEAM.openrouterUltra.id, systemPrompt);
      if (tier2Or) return attachMeta(tier2Or);

      const tier2Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 7,
      });
      if (tier2Keyed) return attachMeta(tier2Keyed);
    }
  } else {
    // 'document-edit'
    if (efficiencyMode === 'low-token') {
      const compactKeyed = await tryFreeProvidersStep({
        sysPrompt: compactSystemPrompt,
        excludeKeyless: true,
      });
      if (compactKeyed) return attachMeta(compactKeyed);

      const groqFastEdit = await tryGroqStep(
        [GROQ_TEAM.fast.id, GROQ_TEAM.reasoning.id],
        compactSystemPrompt,
      );
      if (groqFastEdit) return attachMeta(groqFastEdit);
    } else if (longContextHint || efficiencyMode === 'quality') {
      const tier1Gemini = await tryGeminiStep(systemPrompt, geminiThinking);
      if (tier1Gemini) return attachMeta(tier1Gemini);

      const tier1Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 9,
      });
      if (tier1Keyed) return attachMeta(tier1Keyed);

      const tier1Groq = await tryGroqStep([GROQ_TEAM.reasoning.id], systemPrompt);
      if (tier1Groq) return attachMeta(tier1Groq);

      const tier2Or = await tryOpenRouterStep(GROQ_TEAM.openrouterUltra.id, systemPrompt);
      if (tier2Or) return attachMeta(tier2Or);

      const tier2Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 7,
      });
      if (tier2Keyed) return attachMeta(tier2Keyed);
    } else {
      // Balanced high-intelligence document edit: Tier-1 Keyed -> Gemini 4 Hydrogen -> Groq GPT-120B -> OpenRouter -> Tier-2 Keyed
      const tier1Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 9,
      });
      if (tier1Keyed) return attachMeta(tier1Keyed);

      const tier1Gemini = await tryGeminiStep(systemPrompt, geminiThinking);
      if (tier1Gemini) return attachMeta(tier1Gemini);

      const tier1Groq = await tryGroqStep([GROQ_TEAM.reasoning.id], systemPrompt);
      if (tier1Groq) return attachMeta(tier1Groq);

      const tier2Or = await tryOpenRouterStep(GROQ_TEAM.gemma4_31b.id, systemPrompt);
      if (tier2Or) return attachMeta(tier2Or);

      const tier2Keyed = await tryFreeProvidersStep({
        sysPrompt: systemPrompt,
        excludeKeyless: true,
        minDesignStrength: 7,
      });
      if (tier2Keyed) return attachMeta(tier2Keyed);
    }
  }

  // 3. TIER 3 — Universal Resilient Failover Safety Net (only reached if Tier 1 & Tier 2 all failed)
  const tier3Groq = await tryGroqStep(
    [GROQ_TEAM.fast.id, GROQ_TEAM.reasoning.id, GROQ_TEAM.structure.id],
    compactSystemPrompt,
  );
  if (tier3Groq) return attachMeta(tier3Groq);

  const tier3Or = await tryOpenRouterStep(GROQ_TEAM.gemma4_31b.id, compactSystemPrompt);
  if (tier3Or) return attachMeta(tier3Or);

  const tier3Gemini = await tryGeminiStep(compactSystemPrompt, ThinkingLevel.MEDIUM);
  if (tier3Gemini) return attachMeta(tier3Gemini);

  const tier3GemmaEdge = await callGemmaViaGeminiApi(
    GROQ_TEAM.gemma4E4b.id,
    GROQ_TEAM.gemma4E4b.role,
    compactSystemPrompt,
    userPrompt,
  );
  if (isOutputAcceptable(tier3GemmaEdge)) return attachMeta(tier3GemmaEdge);

  const tier3Keyless = await tryFreeProvidersStep({
    sysPrompt: compactSystemPrompt,
    onlyKeyless: true,
  });
  if (tier3Keyless) return attachMeta(tier3Keyless);

  // If every provider failed validation but we got a best-effort non-empty text, return it so cleanJsonResponse can recover
  if (bestInvalidResult) {
    return attachMeta(bestInvalidResult);
  }

  throw new Error(
    'Ningún proveedor de IA respondió tras agotar todos los respaldos automáticos. Verifica tus claves en Settings > Secrets o tu conexión.',
  );
}

async function callGroqTeamChat(
  specialist: 'reasoning' | 'structure' | 'fast' | 'gemini',
  systemPrompt: string,
  userPrompt: string,
  preferredModel?: string,
): Promise<GroqTeamResult> {
  const mappedTask: AiWorkTaskType =
    specialist === 'fast'
      ? 'quick-edit'
      : specialist === 'structure'
        ? 'presentation-design'
        : specialist === 'gemini'
          ? 'pdf-analysis'
          : 'document-edit';

  return runTaskAwareAiOrchestrator({
    taskType: mappedTask,
    systemPrompt,
    userPrompt,
    preferredModel: preferredModel || 'auto',
    efficiencyMode: 'auto',
  });
}

interface FreeOpenAiEndpoint {
  id: string;
  providerId: string;
  label: string;
  baseUrl: string;
  url: string;
  apiKey: string;
  model: string;
  kind?: 'chat' | 'responses' | 'anthropic';
  tier?: 1 | 2 | 3;
  supportsReasoningEffort?: boolean;
  streamSse?: boolean;
  keyless?: boolean;
  lowToken?: boolean;
  estimatedTokensTier?: 'ultra-low' | 'low' | 'balanced';
  bestForTasks?: AiWorkTaskType[];
  designStrength?: number;
  extraBody?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
}

const freeProviderCooldownUntil = new Map<string, number>();

function getConfiguredFreeLlmEndpoints(): FreeOpenAiEndpoint[] {
  const endpoints: FreeOpenAiEndpoint[] = [];

  // ── TIER 1: Direct Flagship APIs (Highest reasoning, creativity & reliability) ──
  const nvidiaKey = getEnvSecret('NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY');
  if (nvidiaKey) {
    endpoints.push(
      {
        id: 'nvidia-kimi-k31-pro',
        providerId: 'nvidia',
        label: 'NVIDIA NIM (Kimi K3.1 Pro)',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        apiKey: nvidiaKey,
        model: 'moonshotai/kimi-k3.1-pro',
        kind: 'chat',
        tier: 1,
        supportsReasoningEffort: true,
        streamSse: true,
        lowToken: true,
        estimatedTokensTier: 'balanced',
        bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
        designStrength: 10,
        extraHeaders: { Accept: 'text/event-stream' },
      },
      {
        id: 'nvidia-nim',
        providerId: 'nvidia',
        label: 'NVIDIA NIM (Llama 3.3 70B)',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        apiKey: nvidiaKey,
        model: 'meta/llama-3.3-70b-instruct',
        kind: 'chat',
        tier: 2,
        lowToken: false,
        estimatedTokensTier: 'balanced',
        bestForTasks: ['document-create', 'document-edit', 'pdf-analysis'],
        designStrength: 8,
      },
    );
  }

  const anthropicKey = getEnvSecret('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    endpoints.push({
      id: 'anthropic-claude-sonnet',
      providerId: 'anthropic',
      label: 'Anthropic (Claude Sonnet 4.5)',
      baseUrl: 'https://api.anthropic.com/v1',
      url: 'https://api.anthropic.com/v1/messages',
      apiKey: anthropicKey,
      model: 'claude-sonnet-4-5',
      kind: 'anthropic',
      tier: 1,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 10,
    });
  }

  const openAiKey = getEnvSecret('OPENAI_API_KEY');
  if (openAiKey) {
    endpoints.push({
      id: 'openai-gpt41',
      providerId: 'openai',
      label: 'OpenAI (GPT-4.1)',
      baseUrl: 'https://api.openai.com/v1',
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: openAiKey,
      model: 'gpt-4.1',
      kind: 'chat',
      tier: 1,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 10,
    });
  }

  const deepSeekKey = getEnvSecret('DEEPSEEK_API_KEY');
  if (deepSeekKey) {
    endpoints.push(
      {
        id: 'deepseek-reasoner',
        providerId: 'deepseek',
        label: 'DeepSeek (Reasoner R1)',
        baseUrl: 'https://api.deepseek.com/v1',
        url: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: deepSeekKey,
        model: 'deepseek-reasoner',
        kind: 'chat',
        tier: 1,
        lowToken: false,
        estimatedTokensTier: 'balanced',
        bestForTasks: ['presentation-design', 'document-create', 'pdf-analysis', 'document-edit'],
        designStrength: 10,
      },
      {
        id: 'deepseek-chat',
        providerId: 'deepseek',
        label: 'DeepSeek (V3 Chat)',
        baseUrl: 'https://api.deepseek.com/v1',
        url: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: deepSeekKey,
        model: 'deepseek-chat',
        kind: 'chat',
        tier: 1,
        lowToken: true,
        estimatedTokensTier: 'low',
        bestForTasks: ['document-edit', 'document-create', 'quick-edit', 'presentation-design'],
        designStrength: 9,
      },
    );
  }

  const moonshotKey = getEnvSecret('MOONSHOT_API_KEY');
  if (moonshotKey) {
    endpoints.push({
      id: 'moonshot-kimi',
      providerId: 'moonshot',
      label: 'Moonshot Direct (Kimi)',
      baseUrl: 'https://api.moonshot.ai/v1',
      url: 'https://api.moonshot.ai/v1/chat/completions',
      apiKey: moonshotKey,
      model: 'kimi-k2-0905-preview',
      kind: 'chat',
      tier: 1,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 10,
    });
  }

  const xaiKey = getEnvSecret('XAI_API_KEY');
  if (xaiKey) {
    endpoints.push({
      id: 'xai-grok',
      providerId: 'xai',
      label: 'xAI (Grok 3)',
      baseUrl: 'https://api.x.ai/v1',
      url: 'https://api.x.ai/v1/chat/completions',
      apiKey: xaiKey,
      model: 'grok-3-mini',
      kind: 'chat',
      tier: 1,
      supportsReasoningEffort: true,
      lowToken: true,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 9,
    });
  }

  const sambaNovaKey = getEnvSecret('SAMBANOVA_API_KEY');
  if (sambaNovaKey) {
    endpoints.push({
      id: 'sambanova-deepseek-r1',
      providerId: 'sambanova',
      label: 'SambaNova (DeepSeek R1)',
      baseUrl: 'https://api.sambanova.ai/v1',
      url: 'https://api.sambanova.ai/v1/chat/completions',
      apiKey: sambaNovaKey,
      model: 'DeepSeek-R1-Distill-Llama-70B',
      kind: 'chat',
      tier: 1,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 9,
    });
  }

  const aclideKey = getEnvSecret('ACLIDE_API_KEY');
  if (aclideKey) {
    endpoints.push({
      id: 'aclide-claude-haiku',
      providerId: 'aclide',
      label: 'ACLIDE Free (Claude Haiku 4.5)',
      baseUrl: 'https://aclide.com/v1',
      url: 'https://aclide.com/v1/responses',
      apiKey: aclideKey,
      model: 'anthropic/claude-haiku-4.5',
      kind: 'responses',
      tier: 1,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 9,
    });
  }

  const electronHubKey = getEnvSecret('ELECTRONHUB_API_KEY');
  if (electronHubKey) {
    endpoints.push(
      {
        id: 'electronhub-gpt56-luna',
        providerId: 'electronhub',
        label: 'ElectronHub Free (GPT-5.6 Luna)',
        baseUrl: 'https://api.electronhub.ai/v1',
        url: 'https://api.electronhub.ai/v1/chat/completions',
        apiKey: electronHubKey,
        model: 'gpt-5.6-luna',
        kind: 'chat',
        tier: 1,
        lowToken: false,
        estimatedTokensTier: 'balanced',
        bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
        designStrength: 9,
      },
      {
        id: 'electronhub-kimi-k31-pro',
        providerId: 'electronhub',
        label: 'ElectronHub Free (Kimi K3.1 Pro)',
        baseUrl: 'https://api.electronhub.ai/v1',
        url: 'https://api.electronhub.ai/v1/chat/completions',
        apiKey: electronHubKey,
        model: 'kimi-k3.1-pro',
        kind: 'chat',
        tier: 1,
        supportsReasoningEffort: true,
        lowToken: true,
        estimatedTokensTier: 'balanced',
        bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
        designStrength: 9,
      },
      {
        id: 'electronhub-gpt54-mini',
        providerId: 'electronhub',
        label: 'ElectronHub Free (GPT-5.4 Mini)',
        baseUrl: 'https://api.electronhub.ai/v1',
        url: 'https://api.electronhub.ai/v1/chat/completions',
        apiKey: electronHubKey,
        model: 'gpt-5.4-mini',
        kind: 'chat',
        tier: 2,
        lowToken: true,
        estimatedTokensTier: 'low',
        bestForTasks: ['document-edit', 'document-create', 'presentation-design', 'quick-edit'],
        designStrength: 8,
      },
      {
        id: 'electronhub-hermes4-14b',
        providerId: 'electronhub',
        label: 'ElectronHub Free (Hermes 4 14B)',
        baseUrl: 'https://api.electronhub.ai/v1',
        url: 'https://api.electronhub.ai/v1/chat/completions',
        apiKey: electronHubKey,
        model: 'hermes-4-14b',
        kind: 'chat',
        tier: 2,
        lowToken: true,
        estimatedTokensTier: 'ultra-low',
        bestForTasks: ['quick-edit', 'document-edit'],
        designStrength: 6,
      },
      {
        id: 'electronhub-gpt-oss-20b',
        providerId: 'electronhub',
        label: 'ElectronHub Free (GPT-OSS 20B)',
        baseUrl: 'https://api.electronhub.ai/v1',
        url: 'https://api.electronhub.ai/v1/chat/completions',
        apiKey: electronHubKey,
        model: 'gpt-oss-20b',
        kind: 'chat',
        tier: 2,
        lowToken: true,
        estimatedTokensTier: 'low',
        bestForTasks: ['quick-edit', 'document-edit'],
        designStrength: 6,
      },
    );
  }

  const apinexKey = getEnvSecret('APINEX_API_KEY');
  if (apinexKey) {
    endpoints.push(
      {
        id: 'apinex-deepseek-pro',
        providerId: 'apinex',
        label: 'APINex Free (DeepSeek V4 Pro)',
        baseUrl: 'https://api.apinex.bond/v1',
        url: 'https://api.apinex.bond/v1/chat/completions',
        apiKey: apinexKey,
        model: 'free/deepseek-v4-pro-0813',
        kind: 'chat',
        tier: 1,
        lowToken: false,
        estimatedTokensTier: 'balanced',
        bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
        designStrength: 9,
      },
      {
        id: 'apinex-glm53',
        providerId: 'apinex',
        label: 'APINex Free (GLM 5.3)',
        baseUrl: 'https://api.apinex.bond/v1',
        url: 'https://api.apinex.bond/v1/chat/completions',
        apiKey: apinexKey,
        model: 'free/glm-5.3',
        kind: 'chat',
        tier: 2,
        lowToken: true,
        estimatedTokensTier: 'low',
        bestForTasks: ['document-edit', 'document-create', 'presentation-design'],
        designStrength: 8,
      },
      {
        id: 'apinex-deepseek-flash',
        providerId: 'apinex',
        label: 'APINex Free (DeepSeek V4.1 Flash)',
        baseUrl: 'https://api.apinex.bond/v1',
        url: 'https://api.apinex.bond/v1/chat/completions',
        apiKey: apinexKey,
        model: 'free/deepseek-v4.1-flash',
        kind: 'chat',
        tier: 2,
        lowToken: true,
        estimatedTokensTier: 'ultra-low',
        bestForTasks: ['quick-edit', 'document-edit', 'document-create'],
        designStrength: 7,
      },
    );
  }

  const router9Key = getEnvSecret('ROUTER9_API_KEY');
  if (router9Key) {
    endpoints.push({
      id: 'router9-deepseek-pro',
      providerId: 'router9',
      label: 'Router9 Free (DeepSeek V4 Pro)',
      baseUrl: 'https://api.router9.com/v1',
      url: 'https://api.router9.com/v1/chat/completions',
      apiKey: router9Key,
      model: 'deepseek/deepseek-v4-pro',
      kind: 'chat',
      tier: 1,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 9,
    });
  }

  const modelScopeKey = getEnvSecret('MODELSCOPE_API_KEY');
  if (modelScopeKey) {
    endpoints.push({
      id: 'modelscope-deepseek-pro',
      providerId: 'modelscope',
      label: 'ModelScope Free (DeepSeek V4 Pro)',
      baseUrl: 'https://api-inference.modelscope.cn/v1',
      url: 'https://api-inference.modelscope.cn/v1/chat/completions',
      apiKey: modelScopeKey,
      model: 'deepseek-ai/DeepSeek-V4-Pro',
      kind: 'chat',
      tier: 1,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 9,
    });
  }

  const unoRouterKey = getEnvSecret('UNOROUTER_API_KEY');
  if (unoRouterKey) {
    endpoints.push(
      {
        id: 'unorouter-kimi-k31-pro',
        providerId: 'unorouter',
        label: 'UnoRouter Free (Kimi K3.1 Pro)',
        baseUrl: 'https://api.unorouter.com/v1',
        url: 'https://api.unorouter.com/v1/chat/completions',
        apiKey: unoRouterKey,
        model: 'kimi-k3.1-pro:free',
        kind: 'chat',
        tier: 1,
        supportsReasoningEffort: true,
        lowToken: true,
        estimatedTokensTier: 'balanced',
        bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
        designStrength: 9,
      },
      {
        id: 'unorouter-glm53',
        providerId: 'unorouter',
        label: 'UnoRouter Free (GLM 5.3)',
        baseUrl: 'https://api.unorouter.com/v1',
        url: 'https://api.unorouter.com/v1/chat/completions',
        apiKey: unoRouterKey,
        model: 'glm-5.3:free',
        kind: 'chat',
        tier: 2,
        lowToken: true,
        estimatedTokensTier: 'low',
        bestForTasks: ['document-edit', 'document-create', 'presentation-design'],
        designStrength: 8,
      },
    );
  }

  // ── TIER 2: Strong Keyed Cloud Backups ──
  const togetherKey = getEnvSecret('TOGETHER_API_KEY');
  if (togetherKey) {
    endpoints.push({
      id: 'together-deepseek-v3',
      providerId: 'together',
      label: 'Together AI (DeepSeek V3)',
      baseUrl: 'https://api.together.xyz/v1',
      url: 'https://api.together.xyz/v1/chat/completions',
      apiKey: togetherKey,
      model: 'deepseek-ai/DeepSeek-V3',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 9,
    });
  }

  const fireworksKey = getEnvSecret('FIREWORKS_API_KEY');
  if (fireworksKey) {
    endpoints.push({
      id: 'fireworks-deepseek-v3',
      providerId: 'fireworks',
      label: 'Fireworks AI (DeepSeek V3)',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      url: 'https://api.fireworks.ai/inference/v1/chat/completions',
      apiKey: fireworksKey,
      model: 'accounts/fireworks/models/deepseek-v3',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit'],
      designStrength: 9,
    });
  }

  const chutesKey = getEnvSecret('CHUTES_API_KEY');
  if (chutesKey) {
    endpoints.push({
      id: 'chutes-deepseek-v3',
      providerId: 'chutes',
      label: 'Chutes AI (DeepSeek V3)',
      baseUrl: 'https://llm.chutes.ai/v1',
      url: 'https://llm.chutes.ai/v1/chat/completions',
      apiKey: chutesKey,
      model: 'deepseek-ai/DeepSeek-V3-0324',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit'],
      designStrength: 8,
    });
  }

  const siliconFlowKey = getEnvSecret('SILICONFLOW_API_KEY');
  if (siliconFlowKey) {
    endpoints.push({
      id: 'siliconflow-deepseek-v3',
      providerId: 'siliconflow',
      label: 'SiliconFlow (DeepSeek V3)',
      baseUrl: 'https://api.siliconflow.cn/v1',
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      apiKey: siliconFlowKey,
      model: 'deepseek-ai/DeepSeek-V3',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'presentation-design'],
      designStrength: 8,
    });
  }

  const nebiusKey = getEnvSecret('NEBIUS_API_KEY');
  if (nebiusKey) {
    endpoints.push({
      id: 'nebius-deepseek-v3',
      providerId: 'nebius',
      label: 'Nebius Studio (DeepSeek V3)',
      baseUrl: 'https://api.studio.nebius.com/v1',
      url: 'https://api.studio.nebius.com/v1/chat/completions',
      apiKey: nebiusKey,
      model: 'deepseek-ai/DeepSeek-V3',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'presentation-design'],
      designStrength: 8,
    });
  }

  const deepInfraKey = getEnvSecret('DEEPINFRA_API_KEY');
  if (deepInfraKey) {
    endpoints.push({
      id: 'deepinfra-deepseek-v3',
      providerId: 'deepinfra',
      label: 'DeepInfra (DeepSeek V3)',
      baseUrl: 'https://api.deepinfra.com/v1/openai',
      url: 'https://api.deepinfra.com/v1/openai/chat/completions',
      apiKey: deepInfraKey,
      model: 'deepseek-ai/DeepSeek-V3',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'presentation-design'],
      designStrength: 8,
    });
  }

  const novitaKey = getEnvSecret('NOVITA_API_KEY');
  if (novitaKey) {
    endpoints.push({
      id: 'novita-deepseek-v3',
      providerId: 'novita',
      label: 'Novita AI (DeepSeek V3)',
      baseUrl: 'https://api.novita.ai/v3/openai',
      url: 'https://api.novita.ai/v3/openai/chat/completions',
      apiKey: novitaKey,
      model: 'deepseek/deepseek-v3-0324',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'presentation-design'],
      designStrength: 8,
    });
  }

  const zhipuKey = getEnvSecret('ZHIPU_API_KEY', 'GLM_API_KEY');
  if (zhipuKey) {
    endpoints.push({
      id: 'zhipu-glm4',
      providerId: 'zhipu',
      label: 'Zhipu AI (GLM-4 Plus)',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKey: zhipuKey,
      model: 'glm-4-plus',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'presentation-design'],
      designStrength: 8,
    });
  }

  const perplexityKey = getEnvSecret('PERPLEXITY_API_KEY');
  if (perplexityKey) {
    endpoints.push({
      id: 'perplexity-sonar',
      providerId: 'perplexity',
      label: 'Perplexity (Sonar Pro)',
      baseUrl: 'https://api.perplexity.ai',
      url: 'https://api.perplexity.ai/chat/completions',
      apiKey: perplexityKey,
      model: 'sonar',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'pdf-analysis', 'document-edit'],
      designStrength: 8,
    });
  }

  const cohereKey = getEnvSecret('COHERE_API_KEY');
  if (cohereKey) {
    endpoints.push({
      id: 'cohere-command-a',
      providerId: 'cohere',
      label: 'Cohere (Command A)',
      baseUrl: 'https://api.cohere.ai/compatibility/v1',
      url: 'https://api.cohere.ai/compatibility/v1/chat/completions',
      apiKey: cohereKey,
      model: 'command-a-03-2025',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 8,
    });
  }

  const freeLlmBase = (process.env.FREELLMAPI_BASE_URL || '').trim().replace(/\/+$/, '');
  const freeLlmKey = getEnvSecret('FREELLMAPI_API_KEY');
  if (freeLlmBase) {
    const cleanBase = freeLlmBase.replace(/\/chat\/completions$/i, '');
    const normalizedUrl = freeLlmBase.endsWith('/chat/completions')
      ? freeLlmBase
      : `${freeLlmBase}/chat/completions`;
    endpoints.push({
      id: 'freellmapi',
      providerId: 'freellmapi',
      label: 'FreeLLMAPI Router',
      baseUrl: cleanBase,
      url: normalizedUrl,
      apiKey: freeLlmKey,
      model: (process.env.FREELLMAPI_MODEL || 'auto').trim() || 'auto',
      kind: 'chat',
      tier: freeLlmKey ? 2 : 3,
      keyless: !freeLlmKey,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['quick-edit', 'document-edit', 'document-create', 'presentation-design'],
      designStrength: 7,
    });
  }

  const cerebrasKey = getEnvSecret('CEREBRAS_API_KEY');
  if (cerebrasKey) {
    endpoints.push({
      id: 'cerebras',
      providerId: 'cerebras',
      label: 'Cerebras (Llama 3.3 70B)',
      baseUrl: 'https://api.cerebras.ai/v1',
      url: 'https://api.cerebras.ai/v1/chat/completions',
      apiKey: cerebrasKey,
      model: 'llama-3.3-70b',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['quick-edit', 'document-edit', 'document-create'],
      designStrength: 7,
    });
  }

  const mistralKey = getEnvSecret('MISTRAL_API_KEY');
  if (mistralKey) {
    endpoints.push({
      id: 'mistral',
      providerId: 'mistral',
      label: 'Mistral AI (Large / Small)',
      baseUrl: 'https://api.mistral.ai/v1',
      url: 'https://api.mistral.ai/v1/chat/completions',
      apiKey: mistralKey,
      model: 'mistral-small-latest',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['quick-edit', 'document-edit', 'document-create'],
      designStrength: 7,
    });
  }

  const githubModelsToken = getEnvSecret('GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN');
  if (githubModelsToken) {
    endpoints.push({
      id: 'github-models',
      providerId: 'github-models',
      label: 'GitHub Models (GPT-4o)',
      baseUrl: 'https://models.inference.ai.azure.com',
      url: 'https://models.inference.ai.azure.com/chat/completions',
      apiKey: githubModelsToken,
      model: 'gpt-4o',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'quick-edit'],
      designStrength: 9,
    });
  }

  const huggingFaceKey = getEnvSecret('HUGGINGFACE_API_KEY', 'HF_TOKEN');
  if (huggingFaceKey) {
    endpoints.push({
      id: 'huggingface',
      providerId: 'huggingface',
      label: 'HuggingFace Router (Qwen 2.5 72B)',
      baseUrl: 'https://router.huggingface.co/v1',
      url: 'https://router.huggingface.co/v1/chat/completions',
      apiKey: huggingFaceKey,
      model: 'Qwen/Qwen2.5-72B-Instruct',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'presentation-design'],
      designStrength: 8,
    });
  }

  const bazaarLinkKey = getEnvSecret('BAZAARLINK_API_KEY');
  if (bazaarLinkKey) {
    endpoints.push({
      id: 'bazaarlink',
      providerId: 'bazaarlink',
      label: 'BazaarLink Free',
      baseUrl: 'https://bazaarlink.ai/api/v1',
      url: 'https://bazaarlink.ai/api/v1/chat/completions',
      apiKey: bazaarLinkKey,
      model: 'auto:free',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['quick-edit', 'document-edit', 'document-create'],
      designStrength: 7,
    });
  }

  const routewayKey = getEnvSecret('ROUTEWAY_API_KEY');
  if (routewayKey) {
    endpoints.push({
      id: 'routeway',
      providerId: 'routeway',
      label: 'Routeway Free (DeepSeek V3)',
      baseUrl: 'https://api.routeway.ai/v1',
      url: 'https://api.routeway.ai/v1/chat/completions',
      apiKey: routewayKey,
      model: 'deepseek/deepseek-chat-v3-0324:free',
      kind: 'chat',
      tier: 2,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['document-create', 'document-edit', 'presentation-design'],
      designStrength: 8,
      extraHeaders: {
        'User-Agent': 'Mozilla/5.0 ALXOffice/5.1',
      },
    });
  }

  const waterfallKey = getEnvSecret('WATERFALL_API_KEY');
  if (waterfallKey) {
    endpoints.push({
      id: 'waterfall-kimi-k3',
      providerId: 'waterfall',
      label: 'Waterfall Free (Kimi K3)',
      baseUrl: 'https://api.getwaterfall.org/v1',
      url: 'https://api.getwaterfall.org/v1/chat/completions',
      apiKey: waterfallKey,
      model: 'kimi-k3-nvidia-direct',
      kind: 'chat',
      tier: 2,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit'],
      designStrength: 8,
    });
  }

  const simpleLlmKey = getEnvSecret('SIMPLELLM_API_KEY');
  if (simpleLlmKey) {
    endpoints.push({
      id: 'simplellm-llama31-8b',
      providerId: 'simplellm',
      label: 'SimpleLLM Free (Llama 3.1 8B)',
      baseUrl: 'https://api.simplellm.eu/v1',
      url: 'https://api.simplellm.eu/v1/chat/completions',
      apiKey: simpleLlmKey,
      model: 'free-Llama-3.1-8B-Instruct',
      kind: 'chat',
      tier: 3,
      lowToken: true,
      estimatedTokensTier: 'ultra-low',
      bestForTasks: ['quick-edit'],
      designStrength: 4,
    });
  }

  // ── TIER 3: Keyless / Anonymous Resilience Safety Net (only used if Tier 1 & Tier 2 fail) ──
  const kiloKey = getEnvSecret('KILO_API_KEY');
  endpoints.push(
    {
      id: 'kilo-openrouter-free',
      providerId: 'kilo',
      label: 'Kilo OpenRouter Free (Respaldo)',
      baseUrl: 'https://api.kilo.ai/api/gateway/v1',
      url: 'https://api.kilo.ai/api/gateway/v1/chat/completions',
      apiKey: kiloKey,
      model: 'openrouter/free',
      kind: 'chat',
      tier: 3,
      keyless: !kiloKey,
      lowToken: false,
      estimatedTokensTier: 'balanced',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit'],
      designStrength: 7,
    },
    {
      id: 'kilo-auto',
      providerId: 'kilo',
      label: 'Kilo Gateway Free (Respaldo)',
      baseUrl: 'https://api.kilo.ai/api/gateway/v1',
      url: 'https://api.kilo.ai/api/gateway/v1/chat/completions',
      apiKey: kiloKey,
      model: 'kilo-auto/free',
      kind: 'chat',
      tier: 3,
      keyless: !kiloKey,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['quick-edit', 'document-edit', 'document-create'],
      designStrength: 6,
    },
    {
      id: 'kilo-nemotron-lightning',
      providerId: 'kilo',
      label: 'Kilo Nemotron Lightning Free (Respaldo)',
      baseUrl: 'https://api.kilo.ai/api/gateway/v1',
      url: 'https://api.kilo.ai/api/gateway/v1/chat/completions',
      apiKey: kiloKey,
      model: 'nvidia/nemotron-3.5-lightning:free',
      kind: 'chat',
      tier: 3,
      keyless: !kiloKey,
      lowToken: true,
      estimatedTokensTier: 'ultra-low',
      bestForTasks: ['quick-edit', 'document-edit'],
      designStrength: 5,
    },
  );

  const llm7Key = getEnvSecret('LLM7_API_KEY');
  endpoints.push(
    {
      id: 'llm7-gemma-27b',
      providerId: 'llm7',
      label: 'LLM7 Gemma 3 27B Free (Respaldo)',
      baseUrl: 'https://api.llm7.io/v1',
      url: 'https://api.llm7.io/v1/chat/completions',
      apiKey: llm7Key,
      model: 'gemma-3-27b',
      kind: 'chat',
      tier: 3,
      keyless: !llm7Key,
      lowToken: true,
      estimatedTokensTier: 'low',
      bestForTasks: ['presentation-design', 'document-create', 'document-edit', 'pdf-analysis'],
      designStrength: 7,
    },
    {
      id: 'llm7-mistral-nemo',
      providerId: 'llm7',
      label: 'LLM7 Mistral Nemo Free (Respaldo)',
      baseUrl: 'https://api.llm7.io/v1',
      url: 'https://api.llm7.io/v1/chat/completions',
      apiKey: llm7Key,
      model: 'mistral-Nemo-Instruct-2407',
      kind: 'chat',
      tier: 3,
      keyless: !llm7Key,
      lowToken: true,
      estimatedTokensTier: 'ultra-low',
      bestForTasks: ['quick-edit', 'document-edit'],
      designStrength: 5,
    },
  );

  return endpoints;
}

function scoreEndpointForTask(
  ep: FreeOpenAiEndpoint,
  taskType?: AiWorkTaskType,
  efficiencyMode: AiEfficiencyMode = 'auto',
  lowTokenMode = false,
): number {
  const tierEfficiency: Record<'ultra-low' | 'low' | 'balanced', number> = {
    'ultra-low': 10,
    low: 7,
    balanced: 3,
  };
  const effScore = tierEfficiency[ep.estimatedTokensTier || 'balanced'];
  const designScore = ep.designStrength ?? 6;
  const effectiveLowToken = lowTokenMode || efficiencyMode === 'low-token';

  let taskFit = 0;
  if (taskType && ep.bestForTasks) {
    const idx = ep.bestForTasks.indexOf(taskType);
    if (idx === 0) taskFit = 30;
    else if (idx === 1) taskFit = 22;
    else if (idx >= 2) taskFit = 14;
  }

  let weightDesign = 2.8;
  let weightEfficiency = 0.8;

  if (effectiveLowToken) {
    if (taskType === 'presentation-design' || taskType === 'document-create') {
      weightDesign = 2.8;
      weightEfficiency = 2.0;
    } else {
      weightDesign = 1.0;
      weightEfficiency = 3.2;
    }
  } else if (efficiencyMode === 'quality') {
    weightDesign = 4.6;
    weightEfficiency = 0.1;
  } else if (taskType === 'quick-edit') {
    weightDesign = 0.8;
    weightEfficiency = 2.8;
  } else if (taskType === 'presentation-design' || taskType === 'document-create') {
    weightDesign = 4.0;
    weightEfficiency = 0.5;
  }

  const tierPriorityBonus = ep.tier === 1 ? 35 : ep.tier === 2 ? 15 : 0;
  const keyedBonus = ep.keyless ? 0 : 12;
  return (
    tierPriorityBonus +
    taskFit +
    designScore * weightDesign +
    effScore * weightEfficiency +
    keyedBonus
  );
}

async function callFreeLlmApiProviders(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    lowTokenMode?: boolean;
    preferredEndpointId?: string;
    maxTokens?: number;
    taskType?: AiWorkTaskType;
    efficiencyMode?: AiEfficiencyMode;
    onlyHighDesign?: boolean;
    excludeKeyless?: boolean;
    onlyKeyless?: boolean;
    minDesignStrength?: number;
    reasoningEffort?: AiReasoningEffort;
    temperature?: number;
    validateOutput?: (text: string) => boolean;
  },
): Promise<(GroqTeamResult & { endpointId: string; baseUrl: string }) | null> {
  const endpoints = getConfiguredFreeLlmEndpoints();
  const preferred = options?.preferredEndpointId?.trim();
  const hasExplicitPreferred = Boolean(
    preferred && preferred !== 'auto' && preferred !== 'auto-low-token',
  );
  const efficiencyMode: AiEfficiencyMode =
    options?.efficiencyMode || (options?.lowTokenMode ? 'low-token' : 'auto');
  const reasoningEffort: AiReasoningEffort =
    options?.reasoningEffort ??
    (options?.taskType
      ? getReasoningEffortForTask(options.taskType, efficiencyMode)
      : 'medium');

  let ordered = [...endpoints];
  if (!hasExplicitPreferred) {
    if (options?.excludeKeyless) {
      ordered = ordered.filter((ep) => !ep.keyless);
    } else if (options?.onlyKeyless) {
      ordered = ordered.filter((ep) => Boolean(ep.keyless));
    }
    const minStrength = options?.minDesignStrength ?? (options?.onlyHighDesign ? 8 : 0);
    if (minStrength > 0) {
      ordered = ordered.filter((ep) => (ep.designStrength ?? 6) >= minStrength);
    }
  }

  if (ordered.length === 0) return null;

  ordered.sort(
    (a, b) =>
      scoreEndpointForTask(b, options?.taskType, efficiencyMode, options?.lowTokenMode) -
      scoreEndpointForTask(a, options?.taskType, efficiencyMode, options?.lowTokenMode),
  );

  if (hasExplicitPreferred && preferred) {
    const exactIndex = ordered.findIndex(
      (ep) => ep.id === preferred || ep.providerId === preferred || ep.model === preferred,
    );
    if (exactIndex > 0) {
      const [match] = ordered.splice(exactIndex, 1);
      ordered.unshift(match);
    }
  }

  const now = Date.now();
  const ready = ordered.filter((ep) => (freeProviderCooldownUntil.get(ep.id) ?? 0) <= now);
  const queue = (ready.length > 0 ? ready : ordered).slice(0, 12);
  const cascadeStart = Date.now();
  const hasFlagshipInQueue = queue.some((ep) => ep.tier === 1);
  const cascadeBudgetMs = hasFlagshipInQueue ? 45000 : 22000;
  const maxOutputTokens = Math.max(
    400,
    Math.min(4096, options?.maxTokens ?? (options?.lowTokenMode ? 2048 : 4096)),
  );
  const tempValue =
    options?.temperature ?? getCreativeTemperatureForTask(options?.taskType, efficiencyMode);

  for (const ep of queue) {
    if (Date.now() - cascadeStart > cascadeBudgetMs) break;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...ep.extraHeaders,
      };
      if (ep.kind === 'anthropic') {
        if (ep.apiKey) headers['x-api-key'] = ep.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else if (ep.apiKey) {
        headers.Authorization = `Bearer ${ep.apiKey}`;
      }

      const isDeepSeekReasoner = ep.model === 'deepseek-reasoner';
      const dynamicExtraBody: Record<string, unknown> = {
        ...(ep.extraBody || {}),
        ...(ep.supportsReasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      };

      const requestBody =
        ep.kind === 'anthropic'
          ? {
              model: ep.model,
              max_tokens: maxOutputTokens,
              temperature: tempValue,
              system: systemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
              ...dynamicExtraBody,
            }
          : ep.kind === 'responses'
            ? {
                model: ep.model,
                input: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                max_output_tokens: maxOutputTokens,
                temperature: tempValue,
                store: false,
                stream: false,
                ...dynamicExtraBody,
              }
            : {
                model: ep.model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                max_tokens: maxOutputTokens,
                ...(isDeepSeekReasoner ? {} : { temperature: tempValue }),
                ...(ep.streamSse ? { stream: true } : {}),
                ...dynamicExtraBody,
              };

      const isExplicitNvidia = preferred?.startsWith('nvidia');
      const timeoutMs =
        ep.providerId === 'nvidia'
          ? isExplicitNvidia
            ? 45000
            : reasoningEffort === 'high'
              ? 32000
              : 24000
          : ep.tier === 1
            ? 24000
            : 12000;

      const res = await fetch(ep.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 429) {
        const errBody = await res.text();
        const retryMs = parseGroqRetryMs(res, errBody);
        freeProviderCooldownUntil.set(
          ep.id,
          Date.now() + Math.max(15000, Math.min(retryMs, 120000)),
        );
        continue;
      }

      if (res.status === 401 || res.status === 402 || res.status === 403) {
        await res.text();
        console.warn(`[FreeLLMAPI] ${ep.id} auth/quota HTTP ${res.status}`);
        freeProviderCooldownUntil.set(ep.id, Date.now() + 5 * 60 * 1000);
        continue;
      }

      if (!res.ok) {
        await res.text();
        console.warn(`[FreeLLMAPI] ${ep.id} HTTP ${res.status}`);
        freeProviderCooldownUntil.set(ep.id, Date.now() + 20000);
        continue;
      }

      let content = '';
      let modelUsed = ep.model;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();

      if (ep.streamSse && contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const payloadStr = line.slice(5).trim();
            if (!payloadStr || payloadStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(payloadStr) as {
                model?: string;
                choices?: { delta?: { content?: string }; message?: { content?: string } }[];
              };
              if (chunk.model) modelUsed = chunk.model;
              // Collect visible delta.content only (reasoning_content is kept internal by the model)
              const piece =
                chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? '';
              if (piece) content += piece;
            } catch {
              // Ignore partial or non-JSON keep-alive SSE events
            }
          }
        }
        content = content.trim();
      } else {
        const data = (await res.json()) as {
          model?: string;
          content?: { type?: string; text?: string }[];
          choices?: { message?: { content?: string } }[];
          output?: {
            type?: string;
            content?: { type?: string; text?: string }[];
          }[];
        };
        if (data.model) modelUsed = data.model;
        if (ep.kind === 'anthropic') {
          content = (data.content || [])
            .filter((part) => part.type === 'text')
            .map((part) => part.text || '')
            .join('')
            .trim();
        } else if (ep.kind === 'responses') {
          content = (data.output || [])
            .filter((item) => item.type === 'message')
            .flatMap((item) => item.content || [])
            .filter((part) => part.type === 'output_text' || part.type === 'text')
            .map((part) => part.text || '')
            .join('')
            .trim();
        } else {
          content = (data.choices?.[0]?.message?.content || '').trim();
        }
      }

      if (content && (!options?.validateOutput || options.validateOutput(content))) {
        freeProviderCooldownUntil.delete(ep.id);
        return {
          text: content,
          modelUsed,
          teamRole: `${ep.label} (${modelUsed})`,
          endpointId: ep.id,
          baseUrl: ep.baseUrl,
          reasoningEffort,
        };
      }
      if (content) {
        console.warn(`[AI Failover] ${ep.id} devolvió formato incompleto; cambiando a respaldo.`);
      }
    } catch {
      freeProviderCooldownUntil.set(ep.id, Date.now() + 12000);
    }
  }

  return null;
}

function getAiClient(): GoogleGenAI {
  const apiKey = getEnvSecret(
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  );
  if (!apiKey) {
    throw new Error(
      'No hay una clave GEMINI_API_KEY configurada en el servidor (Settings > Secrets).',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('403') ||
    lower.includes('api key not valid')
  ) {
    return {
      status: 403,
      message:
        'La clave de Gemini no es válida o no tiene permisos. Verifica Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message:
        'Límite de solicitudes de Gemini alcanzado temporalmente. Selecciona "Auto" para usar el respaldo Groq o reintenta en unos segundos.',
    };
  }
  if (
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('503')
  ) {
    return {
      status: 503,
      message:
        'Gemini 4 Flash tiene alta demanda temporalmente (503). Usa "Auto (Equipo IA)" para respaldo automático o reintenta en unos segundos.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: 'Modelo de IA no disponible en este momento.',
    };
  }
  const safeRaw = sanitizeErrorText(raw);
  return {
    status: 500,
    message: safeRaw.startsWith('{')
      ? 'No se pudo completar la respuesta de Gemini en este momento. Intenta con "Auto (Equipo IA)".'
      : safeRaw || 'Error al procesar la edición con inteligencia artificial.',
  };
}

function recoverTruncatedJsonString(stripped: string, key: string): string | null {
  const keyIdx = stripped.search(new RegExp(`"${key}"\\s*:\\s*"`));
  if (keyIdx < 0) return null;
  const openQuoteIdx = stripped.indexOf('"', stripped.indexOf(':', keyIdx)) + 1;
  if (openQuoteIdx <= 0) return null;
  let rawSlice = stripped.slice(openQuoteIdx);
  // Stop at unescaped closing quote if present
  let endIdx = -1;
  for (let i = 0; i < rawSlice.length; i++) {
    if (rawSlice[i] === '\\') {
      i++;
      continue;
    }
    if (rawSlice[i] === '"') {
      endIdx = i;
      break;
    }
  }
  if (endIdx >= 0) {
    rawSlice = rawSlice.slice(0, endIdx);
  } else {
    // Strip trailing lone backslash or incomplete \uXXXX escape if truncated mid-escape
    rawSlice = rawSlice.replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/\\$/, '');
  }
  try {
    return JSON.parse(`"${rawSlice}"`) as string;
  } catch {
    return rawSlice
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
}

function cleanJsonResponse<T>(rawText: string | undefined, fallback: T): T {
  if (!rawText) return fallback;
  const trimmed = rawText.trim();
  const stripped = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        // continue to partial recovery
      }
    }

    // Recover truncated JSON string fields cleanly so raw JSON syntax never leaks into document HTML
    for (const key of ['html', 'contentHtml', 'noteText']) {
      const recovered = recoverTruncatedJsonString(stripped, key);
      if (recovered && recovered.trim()) {
        return {
          ...(fallback as Record<string, unknown>),
          [key]: recovered,
        } as T;
      }
    }
    return fallback;
  }
}

function escapeHtmlServer(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isDarkHexColorServer(hex?: string): boolean {
  if (!hex) return false;
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.48;
}

const VALID_LAYOUT_TYPES = ['cover', 'bullets', 'cards', 'diagram', 'chart', 'table'] as const;
const VALID_VISUAL_STYLES = [
  'bento-grid',
  'editorial-hero',
  'diagonal-band',
  'split-right',
  'sidebar-left',
  'header-banner',
  'split-left',
  'minimal-frame',
  'spotlight',
  'top-bar',
] as const;

type ValidVisualStyle = (typeof VALID_VISUAL_STYLES)[number];

interface CuratedDesignArchetype {
  id: string;
  name: string;
  mood: string;
  bg: string;
  gradient: string;
  accent: string;
  secondary: string;
  text: string;
  isDark: boolean;
  fontFamily: string;
  preferredCoverStyle: ValidVisualStyle;
  preferredContentStyles: ValidVisualStyle[];
  docFontKey: 'sans' | 'serif' | 'mono';
  docStructureHint: string;
}

const DESIGN_ARCHETYPES: readonly CuratedDesignArchetype[] = [
  {
    id: 'swiss-editorial-crimson',
    name: 'Editorial Suizo',
    mood: 'Revista limpia, rejilla asimétrica de alto impacto con tipografía audaz y acento carmesí',
    bg: '#FAF7F2',
    gradient: 'linear-gradient(135deg, #FAF7F2 0%, #F3ECE1 100%)',
    accent: '#C81E1E',
    secondary: '#1E293B',
    text: '#111827',
    isDark: false,
    fontFamily: '"Playfair Display", Georgia, serif',
    preferredCoverStyle: 'editorial-hero',
    preferredContentStyles: ['editorial-hero', 'bento-grid', 'split-right', 'minimal-frame'],
    docFontKey: 'serif',
    docStructureHint: 'Encabezado editorial con línea superior carmesí, cita destacada en .alx-canva-callout y comparativa en 2 columnas.',
  },
  {
    id: 'midnight-obsidian-gold',
    name: 'Obsidiana y Oro',
    mood: 'Presentación ejecutiva de lujo nocturno con contraste dorado y geometría limpia',
    bg: '#0B1120',
    gradient: 'linear-gradient(135deg, #0B1120 0%, #172554 60%, #1E1B4B 100%)',
    accent: '#F59E0B',
    secondary: '#38BDF8',
    text: '#F8FAFC',
    isDark: true,
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    preferredCoverStyle: 'diagonal-band',
    preferredContentStyles: ['diagonal-band', 'bento-grid', 'spotlight', 'split-right'],
    docFontKey: 'sans',
    docStructureHint: 'Portada oscura de alto contraste o cabecera sobria con KPIs dorados (.alx-canva-kpi) y tabla ejecutiva.',
  },
  {
    id: 'nordic-forest-sage',
    name: 'Bosque Nórdico',
    mood: 'Diseño escandinavo sereno, orgánico y moderno en verde bosque y arena',
    bg: '#F4F7F4',
    gradient: 'linear-gradient(135deg, #F4F7F4 0%, #E6F0EA 100%)',
    accent: '#14532D',
    secondary: '#0D9488',
    text: '#0F172A',
    isDark: false,
    fontFamily: '"Lora", Georgia, serif',
    preferredCoverStyle: 'split-right',
    preferredContentStyles: ['split-right', 'minimal-frame', 'bento-grid', 'header-banner'],
    docFontKey: 'serif',
    docStructureHint: 'Bloque de síntesis inicial en verde salvia, secciones numeradas limpias y lista de verificación práctica.',
  },
  {
    id: 'bauhaus-cobalt-coral',
    name: 'Bauhaus Cobalto',
    mood: 'Arquitectura geométrica contemporánea con bloques cobalto y acento coral energético',
    bg: '#FFFFFF',
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #EEF4FF 100%)',
    accent: '#1D4ED8',
    secondary: '#F97316',
    text: '#0F172A',
    isDark: false,
    fontFamily: '"Oswald", Impact, sans-serif',
    preferredCoverStyle: 'diagonal-band',
    preferredContentStyles: ['bento-grid', 'diagonal-band', 'sidebar-left', 'header-banner'],
    docFontKey: 'sans',
    docStructureHint: 'Títulos geométricos cobalto, panel de 2 columnas (.alx-canva-cols) y tabla comparativa nítida.',
  },
  {
    id: 'terracotta-studio',
    name: 'Estudio Terracota',
    mood: 'Calidez artesanal y diseño creativo moderno en crema, terracota y oliva',
    bg: '#FFFBF5',
    gradient: 'linear-gradient(135deg, #FFFBF5 0%, #FDEEE2 100%)',
    accent: '#C2410C',
    secondary: '#4D7C0F',
    text: '#1C1917',
    isDark: false,
    fontFamily: '"Lora", Georgia, serif',
    preferredCoverStyle: 'editorial-hero',
    preferredContentStyles: ['editorial-hero', 'split-left', 'bento-grid', 'minimal-frame'],
    docFontKey: 'serif',
    docStructureHint: 'Caja editorial terracota de introducción, desarrollo narrativo en bloques claros y tabla resumen.',
  },
  {
    id: 'cyber-teal-carbon',
    name: 'Carbono y Cian',
    mood: 'Estética tecnológica de precisión con fondo grafito y acentos cian/esmeralda',
    bg: '#090D16',
    gradient: 'linear-gradient(135deg, #090D16 0%, #111827 55%, #0F2937 100%)',
    accent: '#06B6D4',
    secondary: '#10B981',
    text: '#F1F5F9',
    isDark: true,
    fontFamily: '"JetBrains Mono", monospace',
    preferredCoverStyle: 'bento-grid',
    preferredContentStyles: ['bento-grid', 'diagonal-band', 'sidebar-left', 'spotlight'],
    docFontKey: 'mono',
    docStructureHint: 'Estilo ficha técnica moderna con métricas clave (.alx-canva-kpi), pasos estructurados y matriz de especificaciones.',
  },
  {
    id: 'royal-plum-amber',
    name: 'Ciruela y Ámbar',
    mood: 'Sofisticación creativa para branding, cultura y estrategia con contraste ciruela y ámbar',
    bg: '#FDF8FF',
    gradient: 'linear-gradient(135deg, #FDF8FF 0%, #F5EBFA 100%)',
    accent: '#86198F',
    secondary: '#D97706',
    text: '#1E1B2E',
    isDark: false,
    fontFamily: '"Playfair Display", Georgia, serif',
    preferredCoverStyle: 'split-right',
    preferredContentStyles: ['split-right', 'editorial-hero', 'bento-grid', 'header-banner'],
    docFontKey: 'serif',
    docStructureHint: 'Cabecera refinada, insights estratégicos en 2 columnas (.alx-canva-cols) y recomendaciones priorizadas.',
  },
  {
    id: 'oceanic-slate-mint',
    name: 'Océano y Menta',
    mood: 'Frescura corporativa para salud, ciencia y finanzas modernas en marino y menta',
    bg: '#F8FAFC',
    gradient: 'linear-gradient(135deg, #F8FAFC 0%, #E0F2FE 100%)',
    accent: '#0369A1',
    secondary: '#059669',
    text: '#0F172A',
    isDark: false,
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    preferredCoverStyle: 'header-banner',
    preferredContentStyles: ['bento-grid', 'header-banner', 'split-right', 'diagonal-band'],
    docFontKey: 'sans',
    docStructureHint: 'Resumen ejecutivo claro, KPIs cuantitativos (.alx-canva-kpi) y tabla de indicadores con encabezados azul océano.',
  },
  {
    id: 'espresso-sand-minimal',
    name: 'Espresso Minimalista',
    mood: 'Lujo discreto de estudio arquitectónico en marfil cálido, espresso y bronce',
    bg: '#F7F4EF',
    gradient: 'linear-gradient(135deg, #F7F4EF 0%, #ECE5DA 100%)',
    accent: '#451A03',
    secondary: '#B45309',
    text: '#1C1917',
    isDark: false,
    fontFamily: '"Playfair Display", Georgia, serif',
    preferredCoverStyle: 'minimal-frame',
    preferredContentStyles: ['minimal-frame', 'editorial-hero', 'split-left', 'bento-grid'],
    docFontKey: 'serif',
    docStructureHint: 'Maquetación limpia estilo dossier arquitectónico con subtítulos sobrios, bloques de análisis y tabla sin ruido.',
  },
  {
    id: 'electric-indigo-lime',
    name: 'Índigo y Lima',
    mood: 'Startup de producto digital de alto impacto en pizarra oscura con acentos índigo y lima',
    bg: '#0F172A',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 65%, #1E293B 100%)',
    accent: '#6366F1',
    secondary: '#84CC16',
    text: '#F8FAFC',
    isDark: true,
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    preferredCoverStyle: 'spotlight',
    preferredContentStyles: ['bento-grid', 'diagonal-band', 'split-right', 'spotlight'],
    docFontKey: 'sans',
    docStructureHint: 'Estructura orientada a producto con propuesta de valor en .alx-canva-callout, hoja de ruta y métricas clave.',
  },
];

const recentArchetypeIds: string[] = [];

function pickFreshDesignArchetype(options?: {
  palette?: string;
  avoidVisualStyles?: string[];
  iteration?: number;
}): CuratedDesignArchetype {
  const avoidSet = new Set(options?.avoidVisualStyles || []);
  const freshPool = DESIGN_ARCHETYPES.filter((a) => !recentArchetypeIds.includes(a.id));
  const pool = freshPool.length > 0 ? freshPool : [...DESIGN_ARCHETYPES];

  // Prefer archetypes whose cover/content styles avoid recently seen visualStyles
  const styleFiltered =
    avoidSet.size > 0
      ? pool.filter((a) => !avoidSet.has(a.preferredCoverStyle))
      : pool;
  const candidates = styleFiltered.length > 0 ? styleFiltered : pool;

  const chosen =
    candidates[Math.floor(Math.random() * candidates.length)] || DESIGN_ARCHETYPES[0];

  recentArchetypeIds.push(chosen.id);
  if (recentArchetypeIds.length > 5) {
    recentArchetypeIds.shift();
  }
  return chosen;
}

function buildCreativeDirectionDirective(
  archetype: CuratedDesignArchetype,
  options?: {
    palette?: string;
    avoidVisualStyles?: string[];
    avoidLayouts?: string[];
    isDeck?: boolean;
  },
): string {
  const hasExplicitPalette = Boolean(options?.palette && options.palette !== 'auto');
  const lines = [
    `DIRECCIÓN DE ARTE ÚNICA ("${archetype.name}" — ${archetype.mood}):`,
    hasExplicitPalette
      ? `- Respeta la paleta solicitada por el usuario, pero aplica la composición espacial y ritmo visual de "${archetype.name}".`
      : `- Usa esta paleta distintiva (NO repitas el clásico violeta #7C3AED salvo que el tema lo pida): fondo "${archetype.bg}", degradado "${archetype.gradient}", acento primario "${archetype.accent}", acento secundario "${archetype.secondary}", texto "${archetype.text}".`,
    `- Tipografía sugerida: ${archetype.fontFamily}.`,
    options?.isDeck
      ? `- Portada recomendada: visualStyle="${archetype.preferredCoverStyle}". Alterna las siguientes diapositivas entre estilos variados como: ${archetype.preferredContentStyles.join(', ')} (y combina con header-banner, sidebar-left, minimal-frame o spotlight para que ninguna diapositiva consecutiva se parezca).`
      : `- Composición recomendada para esta diapositiva: elige entre ${archetype.preferredContentStyles.join(', ')} según el contenido real.`,
  ];
  if (options?.avoidVisualStyles?.length) {
    lines.push(
      `- PROHIBIDO repetir estos visualStyle ya vistos: ${options.avoidVisualStyles.join(', ')}.`,
    );
  }
  if (options?.avoidLayouts?.length) {
    lines.push(
      `- Evita repetir estos layoutType recientes si es posible: ${options.avoidLayouts.join(', ')}.`,
    );
  }
  return lines.join('\n');
}

function buildDocumentDesignDirective(
  archetype: CuratedDesignArchetype,
  palette?: string,
): string {
  const hasExplicitPalette = Boolean(palette && palette !== 'auto');
  return [
    `DIRECCIÓN EDITORIAL CREATIVA ("${archetype.name}"):`,
    `- Enfoque de maquetación: ${archetype.docStructureHint}`,
    hasExplicitPalette
      ? '- Mantén la paleta elegida por el usuario con jerarquía tipográfica nítida y contrastes WCAG.'
      : `- Aplica acentos visuales coherentes: primario ${archetype.accent}, secundario ${archetype.secondary}, superficie de hoja ${archetype.isDark ? '#FFFFFF' : archetype.bg} (para Word/PDF prioriza legibilidad impecable), tipografía recomendada "${archetype.docFontKey}".`,
    '- Evita repetir plantillas genéricas idénticas: adapta títulos, cajas destacadas, columnas y tablas al tema real del usuario.',
  ].join('\n');
}

function isValidJsonOutputForKeys(rawText: string, requiredKeys: string[]): boolean {
  const parsed = cleanJsonResponse<Record<string, unknown>>(rawText, {});
  if (!parsed || typeof parsed !== 'object') return false;
  return requiredKeys.some((k) => {
    const val = parsed[k];
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    return Boolean(val);
  });
}

function extractBulletLinesFromAny(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const results: string[] = [];
  for (const item of input) {
    if (typeof item === 'string') {
      const cleaned = item.trim();
      if (
        cleaned &&
        !/^contenido generado (por|con) ia$/i.test(cleaned) &&
        !/^diapositiva generada con ia$/i.test(cleaned)
      ) {
        results.push(cleaned);
      }
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const head = String(obj.title ?? obj.heading ?? obj.label ?? obj.name ?? '').trim();
      const body = String(
        obj.description ?? obj.body ?? obj.text ?? obj.content ?? obj.detail ?? obj.value ?? '',
      ).trim();
      if (head && body) {
        results.push(`${head}: ${body}`);
      } else if (head || body) {
        results.push(head || body);
      }
    }
  }
  return results;
}

const PALETTE_COLOR_TOKENS: Record<
  string,
  {
    bg: string;
    gradient?: string;
    accent: string;
    secondary: string;
    text: string;
    isDark: boolean;
  }
> = {
  'corporate-blue': {
    bg: '#FFFFFF',
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 100%)',
    accent: '#1D4ED8',
    secondary: '#0EA5E9',
    text: '#0F172A',
    isDark: false,
  },
  'canva-violet': {
    bg: '#FFFFFF',
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 100%)',
    accent: '#7C3AED',
    secondary: '#EC4899',
    text: '#0F172A',
    isDark: false,
  },
  emerald: {
    bg: '#FFFFFF',
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 100%)',
    accent: '#059669',
    secondary: '#0D9488',
    text: '#0F172A',
    isDark: false,
  },
  'dark-luxury': {
    bg: '#0F172A',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #312E81 100%)',
    accent: '#F59E0B',
    secondary: '#8B5CF6',
    text: '#F8FAFC',
    isDark: true,
  },
  'warm-editorial': {
    bg: '#FBF7EE',
    gradient: 'linear-gradient(135deg, #FBF7EE 0%, #FEF3C7 100%)',
    accent: '#EA3D2F',
    secondary: '#D97706',
    text: '#1E293B',
    isDark: false,
  },
};

function resolveFallbackAccents(
  backgroundColor: string,
  backgroundGradient: string | undefined,
  isDarkBg: boolean,
): { accent: string; secondary: string } {
  const combined = `${backgroundColor} ${backgroundGradient || ''}`.toLowerCase();
  if (isDarkBg) return { accent: '#F59E0B', secondary: '#38BDF8' };
  if (/fbf7ee|fef3c7|fff7ed|faf5ff|ea3d2f|d97706/.test(combined)) {
    return { accent: '#EA3D2F', secondary: '#D97706' };
  }
  if (/ecfdf5|d1fae5|059669|0d9488/.test(combined)) {
    return { accent: '#059669', secondary: '#0D9488' };
  }
  if (/eff6ff|dbeafe|1d4ed8|0284c7/.test(combined)) {
    return { accent: '#1D4ED8', secondary: '#0EA5E9' };
  }
  return { accent: '#7C3AED', secondary: '#EC4899' };
}

function normalizeSlideProposal(
  rawInput: unknown,
  fallback: {
    title?: string;
    bullets?: string[];
    backgroundColor?: string;
    backgroundGradient?: string;
    fontFamily?: string;
    requestedLayout?: string;
  },
) {
  const raw = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<
    string,
    unknown
  >;

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : fallback.title || 'Diapositiva';

  const subtitle = typeof raw.subtitle === 'string' ? raw.subtitle.trim() : '';

  const rawLayout = String(raw.layoutType || fallback.requestedLayout || 'cards').trim();
  const layoutType = (VALID_LAYOUT_TYPES as readonly string[]).includes(rawLayout)
    ? (rawLayout as (typeof VALID_LAYOUT_TYPES)[number])
    : 'cards';

  const rawStyle = String(raw.visualStyle || 'split-left').trim();
  const visualStyle = (VALID_VISUAL_STYLES as readonly string[]).includes(rawStyle)
    ? (rawStyle as (typeof VALID_VISUAL_STYLES)[number])
    : 'split-left';

  // Extract bullets from standard `bullets` OR alternative model keys (`cards`, `items`, `points`, `steps`, `sections`)
  let bullets = extractBulletLinesFromAny(raw.bullets);
  if (bullets.length === 0) {
    for (const altKey of ['cards', 'items', 'points', 'steps', 'sections', 'content']) {
      const candidate = extractBulletLinesFromAny(raw[altKey]);
      if (candidate.length > 0) {
        bullets = candidate;
        break;
      }
    }
  }

  // Normalize table headers & rows
  const nestedTable =
    raw.table && typeof raw.table === 'object'
      ? (raw.table as Record<string, unknown>)
      : undefined;
  const rawHeaders = Array.isArray(raw.tableHeaders)
    ? raw.tableHeaders
    : Array.isArray(nestedTable?.headers)
      ? (nestedTable.headers as unknown[])
      : [];
  const tableHeaders = rawHeaders.map((h) => String(h ?? '').trim()).filter(Boolean);

  const rawRows = Array.isArray(raw.tableRows)
    ? raw.tableRows
    : Array.isArray(nestedTable?.rows)
      ? (nestedTable.rows as unknown[])
      : [];
  const tableRows: string[][] = rawRows
    .map((r) => {
      if (Array.isArray(r)) return r.map((c) => String(c ?? '').trim());
      if (r && typeof r === 'object') {
        return Object.values(r as Record<string, unknown>).map((c) =>
          String(c ?? '').trim(),
        );
      }
      return [];
    })
    .filter((r) => r.length > 0);

  // Normalize chart points
  const nestedChart =
    raw.chart && typeof raw.chart === 'object'
      ? (raw.chart as Record<string, unknown>)
      : undefined;
  const rawChartPoints = Array.isArray(raw.chartPoints)
    ? raw.chartPoints
    : Array.isArray(nestedChart?.points)
      ? (nestedChart.points as unknown[])
      : Array.isArray(nestedChart?.data)
        ? (nestedChart.data as unknown[])
        : [];
  const chartPoints = rawChartPoints
    .map((pt) => {
      if (!pt || typeof pt !== 'object') return null;
      const p = pt as Record<string, unknown>;
      const label = String(p.label ?? p.name ?? p.category ?? '').trim();
      const val = Number(p.value ?? p.val ?? p.count ?? p.y ?? 0);
      if (!label || Number.isNaN(val)) return null;
      return { label, value: val };
    })
    .filter((pt): pt is { label: string; value: number } => Boolean(pt));

  // If bullets is still empty, derive meaningful entries from tableRows, chartPoints, subtitle, or fallback
  if (bullets.length === 0) {
    if (tableRows.length > 0) {
      bullets = tableRows.slice(0, 4).map((r) => r.join(': '));
    } else if (chartPoints.length > 0) {
      bullets = chartPoints.slice(0, 4).map((p) => `${p.label}: ${p.value}`);
    } else if (fallback.bullets && fallback.bullets.length > 0) {
      bullets = fallback.bullets.filter(Boolean);
    } else if (subtitle) {
      bullets = [subtitle];
    } else {
      bullets = [title];
    }
  }

  const backgroundColor =
    typeof raw.backgroundColor === 'string' && raw.backgroundColor.trim()
      ? raw.backgroundColor.trim()
      : fallback.backgroundColor || '#FFFFFF';
  const backgroundGradient =
    typeof raw.backgroundGradient === 'string' && raw.backgroundGradient.trim()
      ? raw.backgroundGradient.trim()
      : fallback.backgroundGradient;

  const isDarkBg =
    isDarkHexColorServer(backgroundColor) ||
    Boolean(
      backgroundGradient &&
        /#0f172a|#1e1b4b|#111827|#1e293b|#312e81|#09090b|#18181b/i.test(backgroundGradient),
    );

  let textColor =
    typeof raw.textColor === 'string' && raw.textColor.trim()
      ? raw.textColor.trim()
      : isDarkBg
        ? '#F8FAFC'
        : '#0F172A';
  if (isDarkBg && isDarkHexColorServer(textColor)) {
    textColor = '#F8FAFC';
  } else if (!isDarkBg && !isDarkHexColorServer(textColor)) {
    textColor = '#0F172A';
  }

  const fallbackAccents = resolveFallbackAccents(
    backgroundColor,
    backgroundGradient,
    isDarkBg,
  );
  const accentColor =
    typeof raw.accentColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.accentColor.trim())
      ? raw.accentColor.trim()
      : fallbackAccents.accent;
  const accentSecondaryColor =
    typeof raw.accentSecondaryColor === 'string' &&
    /^#[0-9a-fA-F]{3,8}$/.test(raw.accentSecondaryColor.trim())
      ? raw.accentSecondaryColor.trim()
      : fallbackAccents.secondary;

  const chartKindRaw = String(raw.chartKind || nestedChart?.kind || 'bar');
  const chartKind = (['bar', 'horizontalBar', 'line', 'donut'] as const).includes(
    chartKindRaw as 'bar' | 'horizontalBar' | 'line' | 'donut',
  )
    ? (chartKindRaw as 'bar' | 'horizontalBar' | 'line' | 'donut')
    : 'bar';

  return {
    title,
    subtitle,
    layoutType,
    visualStyle,
    bullets,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    backgroundColor,
    backgroundGradient,
    accentColor,
    accentSecondaryColor,
    textColor,
    fontFamily:
      typeof raw.fontFamily === 'string' && raw.fontFamily.trim()
        ? raw.fontFamily.trim()
        : fallback.fontFamily,
    chartKind,
    chartTitle:
      typeof raw.chartTitle === 'string' && raw.chartTitle.trim()
        ? raw.chartTitle.trim()
        : typeof nestedChart?.title === 'string'
          ? nestedChart.title
          : '',
    chartPoints,
    tableHeaders,
    tableRows,
    summary:
      typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : `Diseño ${visualStyle} (${layoutType}) aplicado a "${title}".`,
  };
}

type NormalizedSlideProposal = ReturnType<typeof normalizeSlideProposal>;

function enforceDeckDesignQuality(
  slides: NormalizedSlideProposal[],
  deckTitle: string,
  palette: string,
  fontStyle: string,
  archetype?: CuratedDesignArchetype,
): NormalizedSlideProposal[] {
  if (slides.length === 0) return slides;

  const explicitPalette = PALETTE_COLOR_TOKENS[palette];
  const explicitFont = fontStyle !== 'auto' ? FONT_HINTS[fontStyle] : undefined;
  const styleRotation: ValidVisualStyle[] = archetype
    ? Array.from(
        new Set<ValidVisualStyle>([
          ...archetype.preferredContentStyles,
          'bento-grid',
          'editorial-hero',
          'diagonal-band',
          'split-right',
          'header-banner',
          'sidebar-left',
          'minimal-frame',
          'spotlight',
          'split-left',
          'top-bar',
        ]),
      )
    : [
        'bento-grid',
        'editorial-hero',
        'diagonal-band',
        'split-right',
        'header-banner',
        'sidebar-left',
        'minimal-frame',
        'spotlight',
        'split-left',
        'top-bar',
      ];
  const layoutRotation: (typeof VALID_LAYOUT_TYPES)[number][] = [
    'cards',
    'diagram',
    'bullets',
    'table',
    'chart',
  ];

  // Establish cohesive baseline from explicit palette, curated archetype, or slide 0
  const baseAccent = explicitPalette?.accent || archetype?.accent || slides[0].accentColor;
  const baseSecondary =
    explicitPalette?.secondary || archetype?.secondary || slides[0].accentSecondaryColor;
  const baseFont =
    explicitFont || slides[0].fontFamily || archetype?.fontFamily || FONT_HINTS['modern-sans'];

  let prevStyle = '';
  let prevLayout = '';

  return slides.map((slide, idx) => {
    const next = { ...slide };

    if (idx === 0) {
      next.layoutType = 'cover';
      if (!next.subtitle && deckTitle) {
        next.subtitle = next.bullets[0] || `Presentación ejecutiva · ${deckTitle}`;
      }
      if (!next.visualStyle || next.visualStyle === 'top-bar') {
        next.visualStyle = archetype?.preferredCoverStyle || 'editorial-hero';
      }
    } else {
      // Ensure consecutive slides never repeat the exact same visualStyle + layoutType pair
      if (next.visualStyle === prevStyle) {
        const curIdx = styleRotation.indexOf(next.visualStyle);
        next.visualStyle = styleRotation[(idx + Math.max(0, curIdx) + 1) % styleRotation.length];
      }
      if (next.layoutType === prevLayout && slides.length > 2) {
        const hasChartData = next.layoutType === 'chart' && next.chartPoints.length >= 2;
        const hasTableData = next.layoutType === 'table' && next.tableRows.length >= 2;
        if (!hasChartData && !hasTableData) {
          next.layoutType = layoutRotation[idx % 3];
        }
      }
    }

    if (explicitPalette) {
      next.backgroundColor = explicitPalette.bg;
      if (idx === 0 || idx % 2 === 0) {
        next.backgroundGradient = explicitPalette.gradient;
      }
      next.accentColor = explicitPalette.accent;
      next.accentSecondaryColor = explicitPalette.secondary;
      next.textColor = explicitPalette.text;
    } else if (archetype) {
      // If model ignored creative direction and fell back to generic default purple, honor archetype palette
      const usedDefaultPurple =
        next.accentColor.toLowerCase() === '#7c3aed' &&
        archetype.accent.toLowerCase() !== '#7c3aed';
      if (usedDefaultPurple) {
        next.backgroundColor = archetype.bg;
        if (idx === 0 || idx % 2 === 0) {
          next.backgroundGradient = archetype.gradient;
        }
        next.accentColor = archetype.accent;
        next.accentSecondaryColor = archetype.secondary;
        next.textColor = archetype.text;
      } else {
        next.accentColor = next.accentColor || baseAccent;
        next.accentSecondaryColor = next.accentSecondaryColor || baseSecondary;
        const isDark =
          isDarkHexColorServer(next.backgroundColor) ||
          Boolean(
            next.backgroundGradient &&
              /#0f172a|#0b1120|#090d16|#1e1b4b|#111827|#1e293b|#312e81/i.test(
                next.backgroundGradient,
              ),
          );
        next.textColor = isDark ? '#F8FAFC' : '#0F172A';
      }
    } else {
      next.accentColor = next.accentColor || baseAccent;
      next.accentSecondaryColor = next.accentSecondaryColor || baseSecondary;
      const isDark =
        isDarkHexColorServer(next.backgroundColor) ||
        Boolean(
          next.backgroundGradient &&
            /#0f172a|#0b1120|#090d16|#1e1b4b|#111827|#1e293b|#312e81/i.test(
              next.backgroundGradient,
            ),
        );
      next.textColor = isDark ? '#F8FAFC' : '#0F172A';
    }

    if (explicitFont || !next.fontFamily) {
      next.fontFamily = baseFont;
    }

    prevStyle = next.visualStyle;
    prevLayout = next.layoutType;
    return next;
  });
}

type SlideImageMode = 'none' | 'search' | 'generate';

function sanitizeSvgString(rawSvg: string): string | null {
  const match = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .trim();
  if (!/xmlns=/i.test(svg)) {
    svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/viewBox=/i.test(svg)) {
    svg = svg.replace(/^<svg/i, '<svg viewBox="0 0 800 500"');
  }
  return svg;
}

function buildFallbackTopicSvgDataUrl(
  topicTitle: string,
  accentHex = '#7C3AED',
  secondaryHex = '#EC4899',
): string {
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : '#7C3AED';
  const safeSecondary = /^#[0-9a-fA-F]{6}$/.test(secondaryHex) ? secondaryHex : '#EC4899';
  const safeLabel = escapeHtmlServer((topicTitle || 'Presentación').slice(0, 42));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="gBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="55%" stop-color="${safeAccent}" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="${safeSecondary}" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="gCard" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.06"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" rx="28" fill="url(#gBg)"/>
  <circle cx="650" cy="110" r="140" fill="#FFFFFF" fill-opacity="0.1"/>
  <circle cx="150" cy="420" r="120" fill="${safeSecondary}" fill-opacity="0.22"/>
  <rect x="85" y="85" width="630" height="330" rx="24" fill="url(#gCard)" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="2"/>
  <rect x="130" y="135" width="210" height="24" rx="12" fill="#FFFFFF" fill-opacity="0.85"/>
  <rect x="130" y="182" width="140" height="14" rx="7" fill="#FFFFFF" fill-opacity="0.45"/>
  <rect x="130" y="235" width="110" height="130" rx="14" fill="#FFFFFF" fill-opacity="0.2"/>
  <rect x="270" y="265" width="110" height="100" rx="14" fill="#FFFFFF" fill-opacity="0.32"/>
  <rect x="410" y="210" width="110" height="155" rx="14" fill="#FFFFFF" fill-opacity="0.48"/>
  <rect x="550" y="170" width="110" height="195" rx="14" fill="#FFFFFF" fill-opacity="0.72"/>
  <path d="M185 215 L325 245 L465 188 L605 142" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="605" cy="142" r="10" fill="#FFFFFF"/>
  <text x="130" y="458" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF" fill-opacity="0.85">${safeLabel}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

async function fetchImageUrlAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ALXOffice/5.1 (https://alx-office.app)',
      },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const mime = contentType.includes('png')
      ? 'image/png'
      : contentType.includes('jpeg') || contentType.includes('jpg')
        ? 'image/jpeg'
        : contentType.includes('webp')
          ? 'image/webp'
          : '';
    if (!mime) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024 || buf.length > 2_500_000) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function searchWikimediaImage(query: string): Promise<{ dataUrl: string; alt: string } | null> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=6` +
      `&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=800&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ALXOffice/5.1 (https://alx-office.app)' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: {
              mime?: string;
              thumburl?: string;
              url?: string;
              thumbwidth?: number;
              thumbheight?: number;
            }[];
          }
        >;
      };
    };
    const pages = Object.values(json.query?.pages || {});
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info) continue;
      const mime = (info.mime || '').toLowerCase();
      if (!mime.includes('jpeg') && !mime.includes('jpg') && !mime.includes('png')) continue;
      if ((info.thumbwidth || 0) < 300 || (info.thumbheight || 0) < 200) continue;
      const candidateUrl = info.thumburl || info.url;
      if (!candidateUrl) continue;
      const dataUrl = await fetchImageUrlAsDataUrl(candidateUrl);
      if (dataUrl) {
        const cleanTitle = (p.title || query).replace(/^File:/i, '').replace(/\.[a-z]+$/i, '');
        return { dataUrl, alt: cleanTitle };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function searchOpenverseImage(query: string): Promise<{ dataUrl: string; alt: string } | null> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=5&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ALXOffice/5.1 (https://alx-office.app)' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { thumbnail?: string; url?: string; title?: string }[];
    };
    for (const item of json.results || []) {
      const targetUrl = item.thumbnail || item.url;
      if (!targetUrl) continue;
      const dataUrl = await fetchImageUrlAsDataUrl(targetUrl);
      if (dataUrl) {
        return { dataUrl, alt: (item.title || query).slice(0, 80) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function searchPexafyImage(query: string): Promise<{ dataUrl: string; alt: string } | null> {
  try {
    const key = (process.env.PEXAFY_API_KEY || '').trim();
    if (!key) return null;
    const url = `https://api.pexafy.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`;
    let res = await fetch(url, {
      headers: { 'Authorization': key, 'User-Agent': 'ALXOffice/5.1' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`;
      res = await fetch(pexelsUrl, {
        headers: { 'Authorization': key, 'User-Agent': 'ALXOffice/5.1' },
        signal: AbortSignal.timeout(6000),
      });
    }
    if (!res.ok) return null;
    const json = (await res.json()) as {
      photos?: { src?: { large?: string; medium?: string; original?: string }; alt?: string }[];
    };
    for (const photo of json.photos || []) {
      const targetUrl = photo.src?.large || photo.src?.medium || photo.src?.original;
      if (!targetUrl) continue;
      const dataUrl = await fetchImageUrlAsDataUrl(targetUrl);
      if (dataUrl) {
        return { dataUrl, alt: photo.alt || query };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function searchPixabayImage(query: string): Promise<{ dataUrl: string; alt: string } | null> {
  try {
    const key = (process.env.PIXABAY_API_KEY || '').trim();
    if (!key) return null;
    const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&per_page=5&safesearch=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ALXOffice/5.1 (https://alx-office.app)' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      hits?: { webformatURL?: string; largeImageURL?: string; tags?: string }[];
    };
    for (const hit of json.hits || []) {
      const targetUrl = hit.largeImageURL || hit.webformatURL;
      if (!targetUrl) continue;
      const dataUrl = await fetchImageUrlAsDataUrl(targetUrl);
      if (dataUrl) {
        return { dataUrl, alt: hit.tags || query };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function searchTopicImageWithAi(
  presentationTitle: string,
  slideTitle: string,
  slideContextText: string,
): Promise<{ imageUrl: string; imageAlt: string; imageSourceRole: string } | null> {
  let queries = [
    `${slideTitle} ${slideContextText.slice(0, 120)}`.trim(),
    slideTitle.trim(),
    `${presentationTitle} ${slideTitle}`.trim(),
  ].filter(Boolean);
  let altText = `${slideTitle || presentationTitle}`;

  try {
    const queryResult = await runTaskAwareAiOrchestrator({
      taskType: 'quick-edit',
      efficiencyMode: 'low-token',
      systemPrompt:
        'Eres un especialista estricto en búsqueda visual de referencia. ' +
        'REGLA OBLIGATORIA: Las consultas de búsqueda visual ("queries") DEBEN incorporar obligatoriamente términos clave, conceptos o palabras del contenido, párrafo o puntos específicos de esta diapositiva actual. ESTÁ PROHIBIDO usar consultas genéricas basadas solo en el título general del mazo. ' +
        'Devuelve JSON con: {"queries":["inglés corto 1","inglés corto 2"],"alt":"descripción en español"}',
      userPrompt: `Título de diapositiva: "${slideTitle}"\nContenido / Puntos específicos de esta sección:\n${slideContextText.slice(0, 600)}`,
    });
    const parsed = cleanJsonResponse<{ queries?: string[]; alt?: string }>(queryResult.text, {});
    if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      queries = [
        ...parsed.queries.map((q) => String(q).trim()).filter(Boolean),
        ...queries,
      ];
    }
    if (typeof parsed.alt === 'string' && parsed.alt.trim()) {
      altText = parsed.alt.trim();
    }
  } catch {
    // Proceed with direct topic keywords
  }

  for (const q of queries.slice(0, 3)) {
    // Search Waterfall: Pexafy -> Pixabay -> Openverse -> Wikimedia
    const pexafyHit = await searchPexafyImage(q);
    if (pexafyHit) {
      return {
        imageUrl: pexafyHit.dataUrl,
        imageAlt: altText || pexafyHit.alt,
        imageSourceRole: 'Especialista Pexafy Stock API',
      };
    }
    const pixabayHit = await searchPixabayImage(q);
    if (pixabayHit) {
      return {
        imageUrl: pixabayHit.dataUrl,
        imageAlt: altText || pixabayHit.alt,
        imageSourceRole: 'Especialista Pixabay Stock API',
      };
    }
    const ovHit = await searchOpenverseImage(q);
    if (ovHit) {
      return {
        imageUrl: ovHit.dataUrl,
        imageAlt: altText || ovHit.alt,
        imageSourceRole: GROQ_TEAM.imageSearch.role,
      };
    }
    const wikiHit = await searchWikimediaImage(q);
    if (wikiHit) {
      return {
        imageUrl: wikiHit.dataUrl,
        imageAlt: altText || wikiHit.alt,
        imageSourceRole: GROQ_TEAM.imageSearch.role,
      };
    }
  }
  return null;
}

async function generateTopicIllustrationWithAi(
  presentationTitle: string,
  slideTitle: string,
  slideContextText: string,
  accentColor = '#7C3AED',
  secondaryColor = '#EC4899',
): Promise<{ imageUrl: string; imageAlt: string; imageSourceRole: string }> {
  const topicSummary = `${presentationTitle} — ${slideTitle}`.trim();

  // 1. If Gemini API key is configured, try native Gemini image model gracefully
  if (getEnvSecret('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY')) {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents:
          `Editorial clean presentation visual illustration matching palette (${accentColor}, ${secondaryColor}) ` +
          `representing the topic: "${topicSummary}". Context: ${slideContextText.slice(0, 260)}. ` +
          `Modern flat/3D vector corporate style, no watermarks, crisp composition.`,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: '4:3' },
        },
      });
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        const inlineData = (p as { inlineData?: { mimeType?: string; data?: string } }).inlineData;
        if (inlineData?.data && inlineData.mimeType) {
          return {
            imageUrl: `data:${inlineData.mimeType};base64,${inlineData.data}`,
            imageAlt: `Ilustración IA sobre ${slideTitle || presentationTitle}`,
            imageSourceRole: 'Ilustrador Gemini Image',
          };
        }
      }
    } catch {
      // Gracefully fall back to task-aware AI SVG Vector Illustrator team below
    }
  }

  // 2. Task-aware AI Vector Illustrator (Kimi K3.1 Pro / Gemini 4 Hydrogen / Nemotron Super VL / GPT-120B) -> crisp thematic SVG
  try {
    const svgResult = await runTaskAwareAiOrchestrator({
      taskType: 'presentation-design',
      efficiencyMode: 'quality',
      systemPrompt:
        'Eres un ilustrador vectorial experto para presentaciones ejecutivas Canva. ' +
        'Genera una ilustración SVG limpia, moderna, estética y directamente relacionada con el tema de la diapositiva. ' +
        'Reglas estrictas: ' +
        '- viewBox="0 0 800 500" ' +
        '- Usa degradados (<linearGradient>), formas geométricas limpias, íconos ilustrativos claros del tema, tarjetas flotantes y detalles visuales profesionales acorde a los colores proporcionados. ' +
        '- Evita textos largos dentro del SVG (máximo 1 etiqueta corta opcional). ' +
        '- Devuelve JSON válido con: {"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 800 500\\">...</svg>","alt":"descripción en español"}',
      userPrompt: `Tema de la presentación: "${presentationTitle}"\nDiapositiva: "${slideTitle}"\nContenido: ${slideContextText.slice(0, 350)}\nColor acento primario: ${accentColor}\nColor secundario: ${secondaryColor}`,
    });
    const parsed = cleanJsonResponse<{ svg?: string; alt?: string }>(svgResult.text, {});
    const cleanSvg = typeof parsed.svg === 'string' ? sanitizeSvgString(parsed.svg) : null;
    if (cleanSvg) {
      return {
        imageUrl: `data:image/svg+xml;base64,${Buffer.from(cleanSvg, 'utf8').toString('base64')}`,
        imageAlt: parsed.alt?.trim() || `Ilustración temática: ${slideTitle || presentationTitle}`,
        imageSourceRole: `${GROQ_TEAM.imageGen.name} (${svgResult.modelUsed})`,
      };
    }
  } catch {
    // Use procedural vector fallback below
  }

  return {
    imageUrl: buildFallbackTopicSvgDataUrl(
      slideTitle || presentationTitle,
      accentColor,
      secondaryColor,
    ),
    imageAlt: `Ilustración temática sobre ${slideTitle || presentationTitle}`,
    imageSourceRole: GROQ_TEAM.imageGen.role,
  };
}

async function resolveSlideTopicImage(
  imageMode: SlideImageMode | undefined,
  presentationTitle: string,
  slideTitle: string,
  slideContextText: string,
  accentColor?: string,
  secondaryColor?: string,
): Promise<{ imageUrl: string; imageAlt: string; imageSourceRole: string } | null> {
  if (!imageMode || imageMode === 'none') return null;

  if (imageMode === 'search') {
    const found = await searchTopicImageWithAi(
      presentationTitle,
      slideTitle,
      slideContextText,
    );
    if (found) return found;
    // Fallback to themed illustration if no public image matched the query
    return generateTopicIllustrationWithAi(
      presentationTitle,
      slideTitle,
      slideContextText,
      accentColor,
      secondaryColor,
    );
  }

  return generateTopicIllustrationWithAi(
    presentationTitle,
    slideTitle,
    slideContextText,
    accentColor,
    secondaryColor,
  );
}

const PALETTE_HINTS: Record<string, string> = {
  auto: 'Elige una paleta armónica de alto contraste acorde al tema.',
  'corporate-blue':
    'Paleta azul corporativo: fondo #FFFFFF o #EFF6FF, acento #1D4ED8, primario #0F2744, texto #0F172A.',
  'canva-violet':
    'Paleta Canva moderna: fondo #FFFFFF o #F5F3FF, acento #7C3AED, secundario #EC4899, texto #0F172A.',
  emerald:
    'Paleta esmeralda limpia: fondo #FFFFFF o #ECFDF5, acento #059669, secundario #0D9488, texto #0F172A.',
  'dark-luxury':
    'Paleta oscura elegante: fondo #0F172A (o degradado linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #312E81 100%)), acento #F59E0B o #8B5CF6, texto #F8FAFC.',
  'warm-editorial':
    'Paleta editorial cálida: fondo #FBF7EE, acento #EA3D2F, secundario #D97706, texto #1E293B.',
};

const FONT_HINTS: Record<string, string> = {
  auto: 'Usa la tipografía más apropiada al contexto.',
  'modern-sans': '"Plus Jakarta Sans", system-ui, sans-serif',
  'editorial-serif': '"Lora", Georgia, serif',
  'impact-display': '"Oswald", Impact, sans-serif',
  'playfair-luxury': '"Playfair Display", Georgia, serif',
  'tech-mono': '"JetBrains Mono", monospace',
};

async function startServer() {
  validateProductionSecrets();
  const app = express();
  app.use(express.json({ limit: '3mb' }));

  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // FreeLLMAPI Configured Endpoints & Task-Aware Catalog (never exposes API keys)
  app.get('/api/ai/freellmapi/providers', (_req, res) => {
    const endpoints = getConfiguredFreeLlmEndpoints();
    const providers = endpoints.map((ep) => ({
      id: ep.id,
      providerId: ep.providerId,
      label: ep.label,
      baseUrl: ep.baseUrl,
      model: ep.model,
      kind: ep.kind || ('chat' as const),
      tier: ep.tier || (ep.keyless ? 3 : 2),
      keyless: Boolean(ep.keyless),
      lowToken: Boolean(ep.lowToken),
      estimatedTokensTier: ep.estimatedTokensTier || 'balanced',
      bestForTasks: ep.bestForTasks || ['document-edit'],
      designStrength: ep.designStrength ?? 6,
      configured: true,
    }));

    const flagshipPlatforms: string[] = [];
    if (getEnvSecret('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY')) {
      flagshipPlatforms.push('Gemini 4 Hydrogen (Razonamiento Alto/XHigh)');
    }
    if (getEnvSecret('GROQ_API_KEY', 'GROQ_KEY')) {
      flagshipPlatforms.push('Groq (GPT-OSS 120B / 20B)');
    }
    if (getEnvSecret('OPENROUTER_API_KEY', 'OPEN_ROUTER_API_KEY')) {
      flagshipPlatforms.push('OpenRouter :free (Nemotron 550B Ultra / Gemma 4 31B)');
    }
    for (const ep of providers) {
      if (ep.tier === 1 && !ep.keyless) {
        flagshipPlatforms.push(ep.label);
      }
    }

    const baseMap = new Map<
      string,
      {
        providerId: string;
        name: string;
        baseUrl: string;
        defaultLowTokenModel: string;
        protocol: 'chat' | 'responses' | 'anthropic';
        keylessSupported: boolean;
      }
    >();
    for (const ep of providers) {
      if (!baseMap.has(ep.providerId)) {
        baseMap.set(ep.providerId, {
          providerId: ep.providerId,
          name: ep.label.split(' (')[0],
          baseUrl: ep.baseUrl,
          defaultLowTokenModel: ep.model,
          protocol: ep.kind,
          keylessSupported: ep.keyless,
        });
      }
    }

    res.json({
      providers,
      baseEndpoints: Array.from(baseMap.values()),
      lowTokenCount: providers.filter((p) => p.lowToken).length,
      totalConfigured: providers.length,
      flagshipPlatforms,
    });
  });

  app.post('/api/ai/freellmapi/chat', async (req, res) => {
    try {
      const {
        systemPrompt = 'Eres un asistente conciso y preciso de ALX Office. Responde de forma directa minimizando tokens innecesarios.',
        userPrompt = '',
        preferredEndpointId = 'auto',
        lowTokenMode = true,
        maxTokens = 2400,
        taskType = 'document-edit',
        efficiencyMode,
      } = (req.body || {}) as {
        systemPrompt?: string;
        userPrompt?: string;
        preferredEndpointId?: string;
        lowTokenMode?: boolean;
        maxTokens?: number;
        taskType?: AiWorkTaskType;
        efficiencyMode?: AiEfficiencyMode;
      };

      const cleanUserPrompt = userPrompt.trim();
      if (!cleanUserPrompt) {
        res.status(400).json({ error: 'Falta userPrompt para consultar FreeLLMAPI.' });
        return;
      }

      const resolvedMode: AiEfficiencyMode =
        efficiencyMode || (lowTokenMode ? 'low-token' : 'auto');
      const result = await runTaskAwareAiOrchestrator({
        taskType,
        systemPrompt,
        userPrompt: cleanUserPrompt,
        efficiencyMode: resolvedMode,
        preferredEndpointId,
        maxTokens,
      });

      res.json({
        text: result.text,
        modelUsed: result.modelUsed,
        teamRole: result.teamRole,
        endpointId: result.endpointId,
        baseUrl: result.baseUrl,
        lowTokenMode: resolvedMode === 'low-token',
        taskProfile: result.taskProfile,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 1. Document (DOCX / DOC / TXT / PDF-Text) AI Editor with full design fidelity
  app.post('/api/ai/edit-document', async (req, res) => {
    try {
      const {
        action = 'custom',
        customPrompt = '',
        selectedText = '',
        fullText = '',
        currentHtml = '',
        documentTitle = 'Documento',
        fileType = 'DOCX',
        preferredModel = 'auto',
        efficiencyMode = 'auto',
        designContext = {},
      } = (req.body || {}) as {
        action?: string;
        customPrompt?: string;
        selectedText?: string;
        fullText?: string;
        currentHtml?: string;
        documentTitle?: string;
        fileType?: string;
        preferredModel?: string;
        efficiencyMode?: AiEfficiencyMode;
        designContext?: {
          pageBgColor?: string;
          fontFamily?: string;
          detectedColors?: string[];
          detectedHeadings?: string[];
          hasTables?: boolean;
        };
      };

      const sourceText = (selectedText || fullText || '').slice(0, 14000).trim();
      const htmlSnippet = currentHtml.slice(0, 12000).trim();
      const userGoal = customPrompt.trim();

      if (!sourceText && !htmlSnippet && !userGoal) {
        res.status(400).json({
          error: 'Escribe una instrucción o selecciona texto para editar con IA.',
        });
        return;
      }

      const actionDescriptions: Record<string, string> = {
        rewrite:
          'Mejora la claridad, fluidez y redacción profesional conservando el tema, tono y diseño visual del documento.',
        formal:
          'Reescribe con tono formal, ejecutivo y preciso respetando encabezados, tablas y estilo visual existentes.',
        concise:
          'Sintetiza las ideas principales de manera directa sin perder datos ni estructura clave.',
        expand:
          'Amplía el contenido con argumentos, ejemplos concretos y subsecciones coherentes con el documento actual.',
        fix_grammar:
          'Corrige ortografía, acentuación, puntuación y gramática manteniendo intactos los estilos, colores, tablas y etiquetas HTML.',
        translate_en:
          'Traduce todo el contenido al inglés profesional conservando exactamente el diseño, colores y estructura HTML.',
        translate_es:
          'Traduce todo el contenido al español profesional conservando exactamente el diseño, colores y estructura HTML.',
        checklist:
          'Crea una lista de verificación o pasos accionables coherente con el contenido y la paleta visual del documento.',
        table:
          'Organiza los datos solicitados o existentes en una tabla HTML estilizada usando los colores del documento.',
      };

      const instruction = userGoal
        ? `${actionDescriptions[action] || ''} Instrucción explícita del usuario: ${userGoal}`.trim()
        : actionDescriptions[action] ||
          'Edita y mejora el contenido del documento respetando su diseño.';

      const detectedColorsText = designContext.detectedColors?.length
        ? designContext.detectedColors.join(', ')
        : 'Sin colores específicos detectados';
      const detectedHeadingsText = designContext.detectedHeadings?.length
        ? designContext.detectedHeadings.join(' > ')
        : 'Sin encabezados detectados';

      const isLongContext = sourceText.length > 6000 || htmlSnippet.length > 6000;
      const taskType: AiWorkTaskType =
        (action === 'fix_grammar' || action === 'concise') && !userGoal
          ? 'quick-edit'
          : 'document-edit';

      const wantsDesignRefresh =
        /diseñ|estil|modern|creativ|color|palet|renova|bonit|visual|canva|mejor/i.test(
          userGoal,
        );
      const docEditArchetype = wantsDesignRefresh ? pickFreshDesignArchetype() : undefined;

      const promptUser = [
        `Documento (${fileType}): "${documentTitle}"`,
        `Contexto de diseño actual:\n- Color de hoja: ${designContext.pageBgColor || '#FFFFFF'}\n- Tipografía actual: ${designContext.fontFamily || 'sans'}\n- Colores usados en el documento: ${detectedColorsText}\n- Jerarquía de títulos: ${detectedHeadingsText}\n- Contiene tablas: ${designContext.hasTables ? 'Sí' : 'No'}`,
        `Operación solicitada:\n${instruction}`,
        docEditArchetype ? buildDocumentDesignDirective(docEditArchetype, 'auto') : '',
        selectedText
          ? `Fragmento seleccionado para editar:\n"""\n${selectedText.slice(0, 8000)}\n"""`
          : htmlSnippet
            ? `HTML estructural actual del documento (respeta clases, estilos, colores y orden salvo que se pida cambiarlos):\n"""\n${htmlSnippet}\n"""`
            : `Texto actual del documento:\n"""\n${sourceText || '(Documento vacío)'}\n"""`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const systemInstruction =
        'Eres un editor documental y diseñador editorial experto de ALX Office. ' +
        'Analiza el tema real y el objetivo exacto del usuario antes de editar: ' +
        '1) Identifica la paleta de colores, tipografía, encabezados, tablas y bloques visuales (.alx-canva-callout, .alx-canva-kpi, .alx-canva-cols, p[data-checklist="true"]) del documento actual. ' +
        '2) Respeta SIEMPRE la coherencia temática, colores, tipografía y estructura existente, salvo que el usuario pida explícitamente renovar el estilo visual o cambiar colores/fuentes. ' +
        '3) Cuando el usuario pida mejorar diseño, crear resúmenes ejecutivos, métricas o comparativas, utiliza HTML semántico limpio con estilos inline precisos y bloques editoriales compatibles (.alx-canva-callout para cajas destacadas, .alx-canva-kpi para indicadores clave, .alx-canva-cols/.alx-canva-col para 2 columnas equilibradas). ' +
        '4) En tablas usa style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;" con encabezados <th> de fondo y texto de alto contraste acordes a la paleta y celdas cómodas (padding:8px 10px;border:1px solid #e2e8f0;). ' +
        '5) Nunca envuelvas en <html>, <body> ni bloques Markdown ```. ' +
        '6) Devuelve JSON válido con: "html", "summary" (1 frase clara), "designNotes" (qué elementos, colores o tipografía se respetaron o aplicaron), y opcionalmente "suggestedPageBgColor" (hex) y "suggestedFontFamily" ("sans"|"serif"|"mono").';

      const teamResult = await runTaskAwareAiOrchestrator({
        taskType,
        systemPrompt: systemInstruction,
        userPrompt: promptUser,
        efficiencyMode,
        preferredModel,
        longContextHint: isLongContext,
        validateOutput: (raw) => isValidJsonOutputForKeys(raw, ['html']),
      });

      const rawFallbackText = (teamResult.text || '').trim();
      const safeFallbackHtml = rawFallbackText.startsWith('{')
        ? '<p>No se pudo interpretar el formato JSON de la respuesta. Reintenta la edición.</p>'
        : rawFallbackText.startsWith('<')
          ? rawFallbackText
          : `<p>${escapeHtmlServer(rawFallbackText)}</p>`;

      const parsed = cleanJsonResponse<{
        html: string;
        summary: string;
        designNotes?: string;
        suggestedPageBgColor?: string;
        suggestedFontFamily?: 'sans' | 'serif' | 'mono';
      }>(teamResult.text, {
        html: safeFallbackHtml,
        summary: 'Edición aplicada al documento.',
        designNotes: 'Formato conservado.',
      });

      res.json({
        html: parsed.html || '<p></p>',
        summary: parsed.summary || 'Edición completada.',
        designNotes: parsed.designNotes || '',
        suggestedPageBgColor: parsed.suggestedPageBgColor,
        suggestedFontFamily:
          parsed.suggestedFontFamily === 'serif' ||
          parsed.suggestedFontFamily === 'mono' ||
          parsed.suggestedFontFamily === 'sans'
            ? parsed.suggestedFontFamily
            : undefined,
        modelUsed: teamResult.modelUsed,
        teamRole: teamResult.teamRole,
        taskProfile: teamResult.taskProfile,
        efficiencyMode: teamResult.efficiencyMode,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 2A. Interactive Slide Questions (Guided Mode before editing/creating PPTX)
  app.post('/api/ai/slide-questions', async (req, res) => {
    try {
      const {
        purpose = 'edit-slide',
        presentationTitle = 'Presentación',
        slideTitle = '',
        slideTexts = [],
        otherSlideTitles = [],
        initialPrompt = '',
      } = (req.body || {}) as {
        purpose?: 'edit-slide' | 'create-pptx';
        presentationTitle?: string;
        slideTitle?: string;
        slideTexts?: string[];
        otherSlideTitles?: string[];
        initialPrompt?: string;
      };

      const contextText = slideTexts.filter(Boolean).join('\n• ').slice(0, 3500);
      const userPrompt = [
        `Objetivo: ${purpose === 'create-pptx' ? 'Crear nueva presentación PowerPoint' : 'Editar diapositiva existente'}`,
        `Presentación: "${presentationTitle}"`,
        slideTitle ? `Título actual de la diapositiva: "${slideTitle}"` : '',
        otherSlideTitles.length
          ? `Otras diapositivas del mazo: ${otherSlideTitles.join(' | ')}`
          : '',
        contextText ? `Contenido actual en la diapositiva:\n• ${contextText}` : '',
        initialPrompt.trim() ? `Idea inicial del usuario: ${initialPrompt.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const systemInstruction =
        'Eres el consultor creativo de presentaciones en ALX Office. ' +
        'Genera de 3 a 4 preguntas cortas, claras y prácticas en español para entender exactamente cómo quiere el usuario que edites o crees su presentación. ' +
        'Reglas: ' +
        '- Incluye preguntas relevantes según el tema real de la presentación (ej. enfoque visual, densidad del contenido, estilo de diseño/colores, o si desea respetar el texto actual vs renovarlo). ' +
        '- Cada pregunta debe traer entre 3 y 4 opciones rápidas listas para tocar. ' +
        '- Devuelve JSON válido con: {"intro":"1 frase amable","questions":[{"id":"q1","question":"¿Cómo prefieres el texto existente?","options":["Respetar contenido tal cual","Mejorar redacción manteniendo ideas","Resumir en tarjetas visuales"],"allowCustom":true}]}';

      const teamResult = await runTaskAwareAiOrchestrator({
        taskType: 'quick-edit',
        systemPrompt: systemInstruction,
        userPrompt,
        efficiencyMode: 'low-token',
      });
      const parsed = cleanJsonResponse<{
        intro?: string;
        questions?: { id?: string; question?: string; options?: string[]; allowCustom?: boolean }[];
      }>(teamResult.text, {});

      const fallbackQuestions =
        purpose === 'create-pptx'
          ? [
              {
                id: 'audience',
                question: '¿A quién va dirigida esta presentación?',
                options: ['Directivos / Clientes', 'Equipo interno', 'Estudiantes / Público general'],
                allowCustom: true,
              },
              {
                id: 'style',
                question: '¿Qué estilo visual prefieres para las diapositivas?',
                options: ['Corporativo limpio', 'Moderno estilo Canva', 'Oscuro elegante', 'Editorial minimalista'],
                allowCustom: true,
              },
              {
                id: 'focus',
                question: '¿Qué elementos visuales quieres priorizar?',
                options: ['Tarjetas e ideas clave', 'Gráficos y tablas de datos', 'Diagramas paso a paso'],
                allowCustom: true,
              },
            ]
          : [
              {
                id: 'content_policy',
                question: '¿Cómo quieres tratar el contenido que ya tiene esta diapositiva?',
                options: [
                  'Respetar el texto tal cual y mejorar diseño',
                  'Pulir redacción manteniendo las ideas actuales',
                  'Reorganizar y ampliar con nuevos puntos',
                ],
                allowCustom: true,
              },
              {
                id: 'layout',
                question: '¿Qué formato visual prefieres para esta diapositiva?',
                options: ['Tarjetas Canva', 'Viñetas limpias', 'Diagrama de flujo', 'Tabla o Gráfico'],
                allowCustom: true,
              },
              {
                id: 'palette',
                question: '¿Qué estilo de colores prefieres?',
                options: ['Mantener colores actuales', 'Fondo claro profesional', 'Tema oscuro moderno'],
                allowCustom: true,
              },
            ];

      const cleanQuestions =
        Array.isArray(parsed.questions) && parsed.questions.length > 0
          ? parsed.questions
              .slice(0, 4)
              .map((q, idx) => ({
                id: String(q.id || `q-${idx + 1}`),
                question: String(q.question || '').trim(),
                options: Array.isArray(q.options)
                  ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
                  : [],
                allowCustom: q.allowCustom !== false,
              }))
              .filter((q) => q.question.length > 0 && q.options.length >= 2)
          : fallbackQuestions;

      res.json({
        intro:
          typeof parsed.intro === 'string' && parsed.intro.trim()
            ? parsed.intro.trim()
            : 'Responde estas preguntas rápidas para personalizar tu presentación:',
        questions: cleanQuestions.length > 0 ? cleanQuestions : fallbackQuestions,
        modelUsed: teamResult.modelUsed,
        teamRole: teamResult.teamRole,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 2. Presentations (PPTX / PPT) Canva Studio AI Assistant with full element & theme awareness + creative variation + opt-in images
  app.post('/api/ai/edit-slide', async (req, res) => {
    try {
      const {
        action = 'improve_slide',
        customPrompt = '',
        slideTitle = '',
        slideTexts = [],
        presentationTitle = 'Presentación',
        slideContext = {},
        variationHint,
        preferredModel = 'auto',
        efficiencyMode = 'auto',
        imageMode = 'none',
        preserveContent = false,
        qaAnswers = [],
      } = (req.body || {}) as {
        action?: string;
        customPrompt?: string;
        slideTitle?: string;
        slideTexts?: string[];
        presentationTitle?: string;
        preferredModel?: string;
        efficiencyMode?: AiEfficiencyMode;
        imageMode?: SlideImageMode;
        preserveContent?: boolean;
        qaAnswers?: { question: string; answer: string }[];
        slideContext?: {
          backgroundColor?: string;
          backgroundGradient?: string;
          fontFamily?: string;
          elementsSummary?: string;
          otherSlideTitles?: string[];
        };
        variationHint?: {
          avoidLayout?: string;
          avoidVisualStyle?: string;
          avoidLayouts?: string[];
          avoidVisualStyles?: string[];
          iteration?: number;
        };
      };

      const cleanExistingTexts = slideTexts
        .map((t) => t.trim())
        .filter(
          (t) =>
            Boolean(t) &&
            !/^contenido generado (por|con) ia$/i.test(t) &&
            !/^contenido$/i.test(t),
        );
      const contextText = slideTexts.filter(Boolean).join('\n• ').slice(0, 6000);
      const hasQaAnswers = Array.isArray(qaAnswers) && qaAnswers.some((a) => a.answer?.trim());
      if (!contextText && !slideTitle && !customPrompt.trim() && !hasQaAnswers) {
        res.status(400).json({
          error: 'Describe qué deseas crear o mejorar en la diapositiva.',
        });
        return;
      }

      const qaSection = hasQaAnswers
        ? `Respuestas del usuario en Modo Preguntas (SÍGUELAS FIELMENTE):\n${qaAnswers
            .filter((a) => a.answer?.trim())
            .map((a) => `- ${a.question}: ${a.answer.trim()}`)
            .join('\n')}`
        : '';

      const preserveInstruction =
        preserveContent && (slideTitle.trim() || cleanExistingTexts.length > 0)
          ? 'REGLA ESTRICTA DE PRESERVACIÓN DE CONTENIDO: El usuario solicitó RESPETAR el contenido ya existente en esta presentación. ' +
            'NO inventes datos ni reescribas cambiando el sentido o eliminando el texto original. ' +
            'Conserva el título actual y las ideas/puntos existentes prácticamente intactos, mejorándolos visualmente mediante diseño, colores, tarjetas, diagramas o notas según lo pedido.'
          : '';

      const avoidStylesList = Array.from(
        new Set(
          [
            ...(variationHint?.avoidVisualStyles || []),
            variationHint?.avoidVisualStyle,
          ].filter((s): s is string => Boolean(s)),
        ),
      );
      const avoidLayoutsList = Array.from(
        new Set(
          [
            ...(variationHint?.avoidLayouts || []),
            variationHint?.avoidLayout,
          ].filter((s): s is string => Boolean(s)),
        ),
      );

      const isVariationRequest =
        action === 'vary_design' || Boolean(variationHint?.iteration);
      const slideArchetype = pickFreshDesignArchetype({
        avoidVisualStyles: avoidStylesList,
        iteration: variationHint?.iteration,
      });

      const creativeDirective = buildCreativeDirectionDirective(slideArchetype, {
        palette: isVariationRequest ? 'auto' : undefined,
        avoidVisualStyles: avoidStylesList,
        avoidLayouts: avoidLayoutsList,
        isDeck: false,
      });

      const allVisualStyleNames = VALID_VISUAL_STYLES.join(' | ');
      const variationInstruction = isVariationRequest
        ? [
            `MODO VARIACIÓN CREATIVA (intento #${variationHint?.iteration || 1}):`,
            avoidLayoutsList.length > 0
              ? `- NO repitas layoutType en [${avoidLayoutsList.join(', ')}]. Elige un layout diferente entre: cover, bullets, cards, diagram, chart, table.`
              : '- Explora un layoutType distinto al clásico de viñetas (por ejemplo: cards, diagram, chart, table o cover).',
            avoidStylesList.length > 0
              ? `- NO repitas visualStyle en [${avoidStylesList.join(', ')}]. Cambia obligatoriamente a otro visualStyle entre: ${allVisualStyleNames}.`
              : `- Elige un visualStyle visualmente llamativo entre: ${allVisualStyleNames}.`,
            '- Propón una combinación armónica de color de fondo, color de acento primario y secundario diferente y fresca (sin perder legibilidad ni contraste WCAG).',
          ].join('\n')
        : `Elige el "visualStyle" que mejor luzca para este contenido (${allVisualStyleNames}) evitando repetir siempre el mismo estilo clásico.`;

      const promptUser = [
        `Presentación: "${presentationTitle}"`,
        slideContext.otherSlideTitles?.length
          ? `Otras diapositivas del mazo (para mantener coherencia narrativa): ${slideContext.otherSlideTitles.join(' | ')}`
          : '',
        `Diseño actual de esta diapositiva:\n- Fondo sólido: ${slideContext.backgroundColor || '#FFFFFF'}\n- Degradado actual: ${slideContext.backgroundGradient || 'Ninguno'}\n- Tipografía actual: ${slideContext.fontFamily || '"Plus Jakarta Sans", system-ui, sans-serif'}\n- Elementos en lienzo: ${slideContext.elementsSummary || 'Estructura clásica de título y viñetas'}`,
        `Título actual: ${slideTitle || '(Sin título)'}`,
        `Textos actuales:\n${contextText ? `• ${contextText}` : '(Diapositiva vacía)'}`,
        `Acción solicitada: ${action}`,
        preserveInstruction,
        qaSection,
        creativeDirective,
        variationInstruction,
        imageMode !== 'none'
          ? `Se incluirá una imagen visual del tema ("${imageMode === 'search' ? 'búsqueda de fotografía real' : 'ilustración generada con IA'}"), por lo que redacta puntos concisos para convivir bien con la imagen.`
          : '',
        customPrompt.trim()
          ? `Instrucción explícita del usuario: ${customPrompt.trim()}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const systemInstruction =
        'Eres un director de arte y diseñador Canva experto en presentaciones de ALX Office. ' +
        'Piensa en profundidad sobre composición, jerarquía tipográfica y arquitectura visual para entregar un diseño único y profesional. ' +
        '1) Asocia el contenido estrictamente al tema real de la presentación, sus otras diapositivas y la petición del usuario. Si la diapositiva solo dice "CONTENIDO", "Índice" o está vacía, propón puntos o tarjetas concretas y útiles acordes al tema de la presentación — NUNCA uses textos genéricos como "Contenido generado por IA" o "Idea principal". ' +
        '2) Si el usuario pide variar diseño, nuevo diseño o especifica colores/tema, sigue la DIRECCIÓN DE ARTE ÚNICA asignada con paletas frescas, degradados elegantes y composiciones modernas (bento-grid, editorial-hero, diagonal-band, split-right, etc.); si solo mejora redacción sin variar diseño, armoniza con el fondo actual. ' +
        '3) DEVUELVE ESTRICTAMENTE un objeto JSON válido con ESTAS CLAVES EXACTAS (NO uses una clave "cards" ni "items" ni objetos anidados dentro de bullets): ' +
        `{"title":"Título claro","subtitle":"Subtítulo breve opcional","layoutType":"cover|bullets|cards|diagram|chart|table","visualStyle":"${VALID_VISUAL_STYLES.join('|')}","bullets":["Título breve: explicación concisa de 1 a 2 líneas","Segundo punto...","Tercer punto...","Cuarto punto..."],"notes":"Notas para el orador","backgroundColor":"#HEX","backgroundGradient":"opcional linear-gradient(...)","accentColor":"#HEX","accentSecondaryColor":"#HEX","textColor":"#HEX","fontFamily":"string CSS","chartKind":"bar|horizontalBar|line|donut","chartTitle":"string","chartPoints":[{"label":"Q1","value":45}],"tableHeaders":["Col 1","Col 2"],"tableRows":[["Dato 1","Dato 2"]],"summary":"1 frase describiendo el diseño aplicado"}. ` +
        '4) "bullets" DEBE ser SIEMPRE un arreglo de 3 a 5 strings informativos no vacíos (en layout "cards", escribe cada tarjeta como "Título corto: descripción clara"). ' +
        '5) Si layoutType es "chart", genera 3-6 "chartPoints" ({label, value}). Si es "table", genera "tableHeaders" (2-4 columnas) y "tableRows" (2-5 filas). Garantiza contraste WCAG perfecto.';

      const teamResult = await runTaskAwareAiOrchestrator({
        taskType: 'presentation-design',
        systemPrompt: systemInstruction,
        userPrompt: promptUser,
        efficiencyMode,
        preferredModel,
        validateOutput: (raw) => isValidJsonOutputForKeys(raw, ['title', 'bullets']),
      });

      const rawParsed = cleanJsonResponse<Record<string, unknown>>(teamResult.text, {});
      const normalized = normalizeSlideProposal(rawParsed, {
        title: slideTitle || 'Diapositiva',
        bullets: slideTexts.length > 0 ? slideTexts : undefined,
        backgroundColor: isVariationRequest
          ? slideArchetype.bg
          : slideContext.backgroundColor || slideArchetype.bg,
        backgroundGradient: isVariationRequest
          ? slideArchetype.gradient
          : slideContext.backgroundGradient,
        fontFamily: isVariationRequest
          ? slideArchetype.fontFamily
          : slideContext.fontFamily || slideArchetype.fontFamily,
        requestedLayout:
          action === 'cards' ||
          action === 'diagram' ||
          action === 'chart' ||
          action === 'table'
            ? action
            : undefined,
      });

      // Guarantee fresh visualStyle if the model ignored avoidVisualStyles
      if (isVariationRequest && avoidStylesList.includes(normalized.visualStyle)) {
        const freshStyle =
          slideArchetype.preferredContentStyles.find((s) => !avoidStylesList.includes(s)) ||
          VALID_VISUAL_STYLES.find((s) => !avoidStylesList.includes(s)) ||
          slideArchetype.preferredCoverStyle;
        normalized.visualStyle = freshStyle;
      }
      if (
        isVariationRequest &&
        normalized.accentColor.toLowerCase() === '#7c3aed' &&
        slideArchetype.accent.toLowerCase() !== '#7c3aed'
      ) {
        normalized.backgroundColor = slideArchetype.bg;
        normalized.backgroundGradient = slideArchetype.gradient;
        normalized.accentColor = slideArchetype.accent;
        normalized.accentSecondaryColor = slideArchetype.secondary;
        normalized.textColor = slideArchetype.text;
        normalized.fontFamily = slideArchetype.fontFamily;
      }

      // Strictly respect existing slide content when user requested preservation
      if (preserveContent) {
        if (slideTitle.trim() && !/^contenido$/i.test(slideTitle.trim())) {
          normalized.title = slideTitle.trim();
        }
        if (cleanExistingTexts.length > 0) {
          normalized.bullets = cleanExistingTexts.slice(0, 6);
        }
      }

      // Only resolve topic-matched image if the user explicitly opted in (imageMode !== 'none')
      const resolvedImage = await resolveSlideTopicImage(
        imageMode,
        presentationTitle,
        normalized.title,
        [normalized.subtitle, ...normalized.bullets, customPrompt].filter(Boolean).join(' · '),
        normalized.accentColor,
        normalized.accentSecondaryColor,
      );

      res.json({
        ...normalized,
        ...(resolvedImage
          ? {
              imageUrl: resolvedImage.imageUrl,
              imageAlt: resolvedImage.imageAlt,
              imageSourceRole: resolvedImage.imageSourceRole,
            }
          : {}),
        modelUsed: teamResult.modelUsed,
        teamRole: resolvedImage
          ? `${teamResult.teamRole} + ${resolvedImage.imageSourceRole}`
          : teamResult.teamRole,
        taskProfile: teamResult.taskProfile,
        efficiencyMode: teamResult.efficiencyMode,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 3. PDF Annotation & Review AI Assistant
  app.post('/api/ai/assist-pdf', async (req, res) => {
    try {
      const {
        action = 'summarize_note',
        customPrompt = '',
        pageText = '',
        pageHtml = '',
        pageNumber = 1,
        totalPages = 1,
        documentTitle = 'Documento PDF',
        preferredModel = 'auto',
        efficiencyMode = 'auto',
      } = (req.body || {}) as {
        action?: string;
        customPrompt?: string;
        pageText?: string;
        pageHtml?: string;
        pageNumber?: number;
        totalPages?: number;
        documentTitle?: string;
        preferredModel?: string;
        efficiencyMode?: AiEfficiencyMode;
      };

      const cleanedPageText = pageText.slice(0, 10000).trim();
      const cleanedPageHtml = pageHtml.slice(0, 6000).trim();
      if (!cleanedPageText && !cleanedPageHtml && !customPrompt.trim()) {
        res.status(400).json({
          error:
            'Esta página no tiene texto extraíble; escribe una instrucción personalizada.',
        });
        return;
      }

      const promptUser = [
        `Documento PDF: "${documentTitle}" (Página ${pageNumber} de ${totalPages})`,
        `Acción: ${action}`,
        customPrompt.trim() ? `Instrucción: ${customPrompt.trim()}` : '',
        cleanedPageText
          ? `Texto extraído de la página:\n"""\n${cleanedPageText}\n"""`
          : cleanedPageHtml
            ? `Estructura de la página:\n"""\n${cleanedPageHtml}\n"""`
            : '(Sin texto seleccionable en la página)',
      ]
        .filter(Boolean)
        .join('\n\n');

      const systemInstruction =
        'Eres el asistente analítico y de anotaciones PDF de ALX Office. ' +
        'Analiza con precisión el contenido real de la página solicitada y devuelve JSON válido con: ' +
        '"noteText" (texto claro, preciso y estructurado en máximo 6 líneas listo para adherirse como etiqueta visual sobre el PDF), ' +
        '"bgColor" (color hex suave para tarjeta como #FFFFFF, #FEF9C3, #EDE9FE o #DBEAFE acorde al tono), ' +
        '"textColor" (hex oscuro de alto contraste como #0F172A), y "summary" (breve explicación).';

      const teamResult = await runTaskAwareAiOrchestrator({
        taskType: 'pdf-analysis',
        systemPrompt: systemInstruction,
        userPrompt: promptUser,
        efficiencyMode,
        preferredModel,
        longContextHint: cleanedPageText.length > 5000,
        validateOutput: (raw) => isValidJsonOutputForKeys(raw, ['noteText']),
      });

      const parsed = cleanJsonResponse<{
        noteText: string;
        bgColor?: string;
        textColor?: string;
        summary: string;
      }>(teamResult.text, {
        noteText: (teamResult.text || '').trim(),
        bgColor: '#FFFFFF',
        textColor: '#0F172A',
        summary: 'Anotación creada sobre la página.',
      });

      res.json({
        ...parsed,
        modelUsed: teamResult.modelUsed,
        teamRole: teamResult.teamRole,
        taskProfile: teamResult.taskProfile,
        efficiencyMode: teamResult.efficiencyMode,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 4. Full AI Document Creation (DOCX, PPTX Canva Deck, PDF)
  app.post('/api/ai/create-document', async (req, res) => {
    try {
      const {
        format = 'DOCX',
        prompt = '',
        title = '',
        tone = 'profesional',
        palette = 'auto',
        fontStyle = 'auto',
        sectionCount = 4,
        preferredModel = 'auto',
        imageMode = 'none',
        qaAnswers = [],
        tokenMode = 'standard',
        efficiencyMode,
        freellmapiEndpoint = 'auto',
      } = (req.body || {}) as {
        format?: 'DOCX' | 'PPTX' | 'PDF';
        prompt?: string;
        title?: string;
        tone?: string;
        palette?: string;
        fontStyle?: string;
        sectionCount?: number;
        preferredModel?: string;
        imageMode?: SlideImageMode;
        qaAnswers?: { question: string; answer: string }[];
        tokenMode?: 'standard' | 'low-token';
        efficiencyMode?: AiEfficiencyMode;
        freellmapiEndpoint?: string;
      };

      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) {
        res.status(400).json({
          error: 'Describe el tema o instrucciones del documento que quieres crear.',
        });
        return;
      }

      const resolvedEfficiency: AiEfficiencyMode =
        efficiencyMode || (tokenMode === 'low-token' ? 'low-token' : 'auto');
      const taskType: AiWorkTaskType =
        format === 'PPTX' ? 'presentation-design' : 'document-create';

      const runDocumentModel = async (
        systemInstruction: string,
        promptUser: string,
        validateOutput?: (raw: string) => boolean,
      ): Promise<GroqTeamResult> =>
        runTaskAwareAiOrchestrator({
          taskType,
          systemPrompt: systemInstruction,
          userPrompt: promptUser,
          efficiencyMode: resolvedEfficiency,
          preferredModel,
          preferredEndpointId: freellmapiEndpoint,
          validateOutput,
        });

      const paletteGuide = PALETTE_HINTS[palette] || PALETTE_HINTS.auto;
      const fontGuide = FONT_HINTS[fontStyle] || FONT_HINTS.auto;
      const count = Math.max(2, Math.min(20, Number(sectionCount) || 4));
      const qaSection =
        Array.isArray(qaAnswers) && qaAnswers.some((a) => a.answer?.trim())
          ? `Preferencias elegidas por el usuario en Modo Preguntas:\n${qaAnswers
              .filter((a) => a.answer?.trim())
              .map((a) => `- ${a.question}: ${a.answer.trim()}`)
              .join('\n')}`
          : '';
      const freshArchetype = pickFreshDesignArchetype({ palette });

      if (format === 'PPTX') {
        const deckArtDirection = buildCreativeDirectionDirective(freshArchetype, {
          palette,
          isDeck: true,
        });
        const promptUser = [
          `Crea una presentación completa estilo Canva de ${count} diapositivas.`,
          title.trim() ? `Título sugerido: "${title.trim()}"` : '',
          `Tema e instrucciones del usuario:\n${cleanPrompt}`,
          `Tono: ${tone}`,
          `Paleta visual: ${paletteGuide}`,
          `Tipografía: ${fontGuide}`,
          deckArtDirection,
          qaSection,
        ]
          .filter(Boolean)
          .join('\n\n');

        const systemInstruction =
          'Eres un director de arte y diseñador maestro de presentaciones Canva en ALX Office. ' +
          'Razona la narrativa visual del mazo completo antes de redactar para entregar un diseño original, variado y de nivel editorial. ' +
          `Reglas de composición: Diapositiva 1 SIEMPRE "cover" con subtítulo atractivo. En las siguientes alterna inteligentemente "visualStyle" (${VALID_VISUAL_STYLES.map((s) => `"${s}"`).join(', ')}) y "layoutType" ("cards", "chart", "diagram", "table", "bullets") sin repetir el mismo estilo en dos diapositivas seguidas. ` +
          'Sigue fielmente la DIRECCIÓN DE ARTE ÚNICA recibida (salvo si el usuario pidió otra paleta específica), manteniendo coherencia de colores, tipografía ("fontFamily") y contraste WCAG impecable. ' +
          'Devuelve JSON válido con { "title": "...", "folder": "Presentaciones", "summary": "...", "slides": [ ... ] }. ' +
          'Cada elemento de "slides" DEBE usar EXACTAMENTE estas claves (no uses "cards" ni "items"): ' +
          `{ "title": "...", "subtitle": "...", "layoutType": "cover|bullets|cards|diagram|chart|table", "visualStyle": "${VALID_VISUAL_STYLES.join('|')}", "bullets": ["Título: explicación...", "..."], "notes": "...", "backgroundColor": "#HEX", "backgroundGradient": "opcional", "accentColor": "#HEX", "accentSecondaryColor": "#HEX", "textColor": "#HEX", "fontFamily": "string CSS", "chartKind": "bar|horizontalBar|line|donut", "chartTitle": "...", "chartPoints": [{"label":"...","value":10}], "tableHeaders": ["..."], "tableRows": [["..."]], "summary": "..." }. ` +
          '"bullets" DEBE contener siempre 3 a 5 strings informativos y reales (nunca textos genéricos).';

        const teamResult = await runDocumentModel(
          systemInstruction,
          promptUser,
          (raw) => isValidJsonOutputForKeys(raw, ['slides']),
        );

        const parsed = cleanJsonResponse<{
          title: string;
          folder: string;
          summary: string;
          slides: unknown[];
        }>(teamResult.text, {
          title: title.trim() || 'Presentación',
          folder: 'Presentaciones',
          summary: 'Presentación creada con éxito.',
          slides: [],
        });

        const deckTitle = parsed.title || title.trim() || 'Presentación';
        let normalizedSlides = (Array.isArray(parsed.slides) ? parsed.slides : []).map(
          (slideRaw, idx) =>
            normalizeSlideProposal(slideRaw, {
              title: idx === 0 ? deckTitle || 'Portada' : `Sección ${idx + 1}`,
              requestedLayout: idx === 0 ? 'cover' : 'cards',
              backgroundColor: freshArchetype.bg,
              backgroundGradient: freshArchetype.gradient,
              fontFamily: freshArchetype.fontFamily,
            }),
        );

        if (normalizedSlides.length < count) {
          const needed = count - normalizedSlides.length;
          for (let i = 0; i < needed; i++) {
            const idx = normalizedSlides.length;
            const fallbackStyle =
              freshArchetype.preferredContentStyles[
                idx % freshArchetype.preferredContentStyles.length
              ] || 'bento-grid';
            normalizedSlides.push(
              normalizeSlideProposal(
                {
                  title: `${deckTitle} — Parte ${idx + 1}`,
                  bullets: [
                    `Punto clave sobre ${cleanPrompt.slice(0, 50)}`,
                    `Desarrollo y análisis operativo de la sección ${idx + 1}`,
                    `Conclusiones prácticas y recomendaciones`,
                  ],
                  layoutType: idx % 2 === 0 ? 'cards' : 'diagram',
                  visualStyle: fallbackStyle,
                  backgroundColor: freshArchetype.bg,
                  backgroundGradient: freshArchetype.gradient,
                  accentColor: freshArchetype.accent,
                  accentSecondaryColor: freshArchetype.secondary,
                  textColor: freshArchetype.text,
                  fontFamily: freshArchetype.fontFamily,
                },
                { title: `${deckTitle} — Parte ${idx + 1}` },
              ),
            );
          }
        } else if (normalizedSlides.length > count) {
          normalizedSlides = normalizedSlides.slice(0, count);
        }

        normalizedSlides = enforceDeckDesignQuality(
          normalizedSlides,
          deckTitle,
          palette,
          fontStyle,
          freshArchetype,
        );

        let enrichedSlides: Record<string, unknown>[] = normalizedSlides;
        let usedImageRole = '';
        if (imageMode !== 'none' && normalizedSlides.length > 0) {
          // Attach topic-related images cleanly to key visual slides (cover + up to 2 content slides)
          const imagePromises = normalizedSlides.map(async (s, idx) => {
            if (idx > 2 && s.layoutType === 'table') return s;
            if (idx >= 3) return s;
            const resolved = await resolveSlideTopicImage(
              imageMode,
              deckTitle,
              s.title,
              [s.subtitle, ...s.bullets].filter(Boolean).join(' · '),
              s.accentColor,
              s.accentSecondaryColor,
            );
            if (!resolved) return s;
            usedImageRole = resolved.imageSourceRole;
            return {
              ...s,
              imageUrl: resolved.imageUrl,
              imageAlt: resolved.imageAlt,
              imageSourceRole: resolved.imageSourceRole,
            };
          });
          enrichedSlides = await Promise.all(imagePromises);
        }

        res.json({
          format: 'PPTX',
          title: deckTitle,
          folder: parsed.folder || 'Presentaciones',
          summary: parsed.summary || 'Presentación creada.',
          slides: enrichedSlides,
          modelUsed: teamResult.modelUsed,
          teamRole: usedImageRole
            ? `${teamResult.teamRole} + ${usedImageRole}`
            : teamResult.teamRole,
          taskProfile: teamResult.taskProfile,
          efficiencyMode: teamResult.efficiencyMode,
          tokenMode: resolvedEfficiency === 'low-token' ? 'low-token' : 'standard',
          endpointUsed: teamResult.baseUrl,
        });
        return;
      }

      if (format === 'PDF') {
        const promptUser = [
          `Crea un documento PDF multipágina profesional de ${count} páginas.`,
          title.trim() ? `Título sugerido: "${title.trim()}"` : '',
          `Tema e instrucciones del usuario:\n${cleanPrompt}`,
          `Tono: ${tone}`,
          `Paleta visual: ${paletteGuide}`,
          buildDocumentDesignDirective(freshArchetype, palette),
        ]
          .filter(Boolean)
          .join('\n\n');

        const systemInstruction =
          'Eres un autor técnico y diseñador editorial PDF de ALX Office. ' +
          'Genera "pagesHtml": un arreglo donde cada elemento es el HTML semántico limpio de UNA página del PDF (<h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>, <strong>, <em>, <div class="alx-canva-callout">, <div class="alx-canva-kpi">, <div class="alx-canva-cols">). ' +
          'En la página 1 incluye portada o cabecera ejecutiva nítida siguiendo la DIRECCIÓN EDITORIAL CREATIVA indicada; estiliza encabezados <h1>/<h2> y cabeceras <th> de tablas con colores de alto contraste acordes a la paleta. ' +
          'Evita usar Markdown ``` o etiquetas <html>/<body>. Devuelve JSON con: { title, folder, summary, pagesHtml: [...] }';

        const teamResult = await runDocumentModel(
          systemInstruction,
          promptUser,
          (raw) => isValidJsonOutputForKeys(raw, ['pagesHtml']),
        );

        const parsed = cleanJsonResponse<{
          title: string;
          folder: string;
          summary: string;
          pagesHtml: string[];
        }>(teamResult.text, {
          title: title.trim() || 'Documento PDF',
          folder: 'Documentación',
          summary: 'Documento PDF creado correctamente.',
          pagesHtml: [
            `<h1>${escapeHtmlServer(title.trim() || 'Documento')}</h1><p>${escapeHtmlServer(cleanPrompt)}</p>`,
          ],
        });

        let pagesHtml =
          Array.isArray(parsed.pagesHtml) && parsed.pagesHtml.length > 0
            ? parsed.pagesHtml
            : [
                `<h1>${escapeHtmlServer(parsed.title || 'Documento')}</h1><p>${escapeHtmlServer(cleanPrompt)}</p>`,
              ];

        if (pagesHtml.length < count) {
          const needed = count - pagesHtml.length;
          for (let i = 0; i < needed; i++) {
            pagesHtml.push(
              `<h2>Sección ${pagesHtml.length + 1}</h2><p>Contenido detallado y desarrollo práctico sobre ${escapeHtmlServer(cleanPrompt.slice(0, 60))}.</p>`,
            );
          }
        } else if (pagesHtml.length > count) {
          pagesHtml = pagesHtml.slice(0, count);
        }

        res.json({
          format: 'PDF',
          title: parsed.title || title.trim() || 'Documento PDF IA',
          folder: parsed.folder || 'Documentación',
          summary: parsed.summary || 'Documento PDF creado.',
          pagesHtml,
          modelUsed: teamResult.modelUsed,
          teamRole: teamResult.teamRole,
          taskProfile: teamResult.taskProfile,
          efficiencyMode: teamResult.efficiencyMode,
          tokenMode: resolvedEfficiency === 'low-token' ? 'low-token' : 'standard',
          endpointUsed: teamResult.baseUrl,
        });
        return;
      }

      // Default: DOCX (Rich Word Document)
      const promptUser = [
        `Crea un documento Word profesional y completo con ${count} secciones bien desarrolladas.`,
        title.trim() ? `Título sugerido: "${title.trim()}"` : '',
        `Tema e instrucciones del usuario:\n${cleanPrompt}`,
        `Tono: ${tone}`,
        `Paleta visual: ${paletteGuide}`,
        `Tipografía preferida: ${fontGuide}`,
        buildDocumentDesignDirective(freshArchetype, palette),
      ]
        .filter(Boolean)
        .join('\n\n');

      const systemInstruction =
        'Eres un redactor editorial y diseñador de documentos Word de ALX Office. ' +
        'Genera "contentHtml" completo, bien maquetado y visualmente distintivo siguiendo la DIRECCIÓN EDITORIAL CREATIVA indicada: ' +
        '<h1> para título principal con color acorde a la paleta, un resumen inicial destacado <div class="alx-canva-callout">, al menos un bloque de métricas o puntos clave <div class="alx-canva-kpi"> o comparativa de 2 columnas <div class="alx-canva-cols"><div class="alx-canva-col">...</div><div class="alx-canva-col">...</div></div> cuando aporte claridad, <h2>/<h3> bien espaciados, una tabla comparativa o de datos <table> con encabezados <th> contrastantes estilizados según la paleta, y listas <ul>/<ol>. ' +
        'Devuelve también "pageBgColor" (hex claro u oscuro acorde a la paleta solicitada, por defecto "#FFFFFF") y "fontFamily" ("sans" | "serif" | "mono"). Devuelve JSON con: { title, folder, pageBgColor, fontFamily, contentHtml, summary }';

      const teamResult = await runDocumentModel(
        systemInstruction,
        promptUser,
        (raw) => isValidJsonOutputForKeys(raw, ['contentHtml']),
      );

      const rawDocFallback = (teamResult.text || '').trim();
      const safeDocFallbackHtml = rawDocFallback.startsWith('{')
        ? `<h1>${escapeHtmlServer(title.trim() || 'Documento')}</h1><p>${escapeHtmlServer(cleanPrompt)}</p>`
        : rawDocFallback.startsWith('<')
          ? rawDocFallback
          : `<h1>${escapeHtmlServer(title.trim() || 'Documento')}</h1><p>${escapeHtmlServer(rawDocFallback)}</p>`;

      const parsed = cleanJsonResponse<{
        title: string;
        folder: string;
        pageBgColor?: string;
        fontFamily?: 'sans' | 'serif' | 'mono';
        contentHtml: string;
        summary: string;
      }>(teamResult.text, {
        title: title.trim() || 'Documento',
        folder: 'Trabajo',
        pageBgColor: '#FFFFFF',
        fontFamily: 'sans',
        contentHtml: safeDocFallbackHtml,
        summary: 'Documento Word creado correctamente.',
      });

      const validHexBg =
        parsed.pageBgColor && /^#[0-9a-fA-F]{3,8}$/.test(parsed.pageBgColor.trim())
          ? parsed.pageBgColor.trim()
          : '#FFFFFF';

      res.json({
        format: 'DOCX',
        title: parsed.title || title.trim() || 'Documento IA',
        folder: parsed.folder || 'Trabajo',
        pageBgColor: validHexBg,
        fontFamily:
          parsed.fontFamily === 'serif' ||
          parsed.fontFamily === 'mono' ||
          parsed.fontFamily === 'sans'
            ? parsed.fontFamily
            : 'sans',
        contentHtml: parsed.contentHtml || '<p></p>',
        summary: parsed.summary || 'Documento Word creado.',
        modelUsed: teamResult.modelUsed,
        teamRole: teamResult.teamRole,
        taskProfile: teamResult.taskProfile,
        efficiencyMode: teamResult.efficiencyMode,
        tokenMode: resolvedEfficiency === 'low-token' ? 'low-token' : 'standard',
        endpointUsed: teamResult.baseUrl,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // OpenAlex Scientific API Helper
  async function searchOpenAlexWorks(query: string) {
    try {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=6`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ALXOffice/5.1 (https://alx-office.app; mailto:support@alx-office.app)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: any[] };
      return data.results || [];
    } catch {
      return [];
    }
  }

  // Tavily AI Search Helper
  async function searchTavilyWeb(query: string) {
    try {
      const apiKey = (process.env.TAVILY_API_KEY || '').trim();
      if (!apiKey) return null;
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 5,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // Firecrawl Scrape Helper
  async function scrapeFirecrawlUrl(urlToScrape: string) {
    try {
      const apiKey = (process.env.FIRECRAWL_API_KEY || '').trim();
      if (!apiKey) return null;
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlToScrape, formats: ['markdown', 'html'] }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // Research Endpoints (OpenAlex, Tavily, Firecrawl)
  app.post('/api/research/openalex', async (req, res) => {
    try {
      const { query } = (req.body || {}) as { query?: string };
      if (!query?.trim()) {
        res.status(400).json({ error: 'Falta término de búsqueda para OpenAlex.' });
        return;
      }
      const results = await searchOpenAlexWorks(query.trim());
      res.json({ results, provider: 'OpenAlex Scientific API (https://help.openalex.org/api/)' });
    } catch (err) {
      res.status(500).json({ error: sanitizeErrorText(err) });
    }
  });

  app.post('/api/research/tavily', async (req, res) => {
    try {
      const { query } = (req.body || {}) as { query?: string };
      if (!query?.trim()) {
        res.status(400).json({ error: 'Falta consulta para Tavily.' });
        return;
      }
      const data = await searchTavilyWeb(query.trim());
      res.json(data || { results: [], answer: 'No se pudo completar la búsqueda en Tavily.' });
    } catch (err) {
      res.status(500).json({ error: sanitizeErrorText(err) });
    }
  });

  app.post('/api/research/firecrawl', async (req, res) => {
    try {
      const { url } = (req.body || {}) as { url?: string };
      if (!url?.trim()) {
        res.status(400).json({ error: 'Falta URL para Firecrawl.' });
        return;
      }
      const data = await scrapeFirecrawlUrl(url.trim());
      res.json(data || { success: false, error: 'No se pudo raspar la URL con Firecrawl.' });
    } catch (err) {
      res.status(500).json({ error: sanitizeErrorText(err) });
    }
  });

  // 5. Groq Whisper Voice Dictation Endpoint
  app.post('/api/ai/transcribe-audio', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm', language = 'es' } = (req.body || {}) as {
        audioBase64?: string;
        mimeType?: string;
        language?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'No se recibió audio para transcribir.' });
        return;
      }

      const cleanBase64 = audioBase64.replace(/^data:audio\/[a-z0-9.-]+;base64,/i, '');
      const audioBuffer = Buffer.from(cleanBase64, 'base64');
      const ext = mimeType.includes('wav')
        ? 'wav'
        : mimeType.includes('mp4') || mimeType.includes('m4a')
          ? 'm4a'
          : 'webm';

      const blob = new Blob([audioBuffer], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, `dictation.${ext}`);
      formData.append('model', GROQ_TEAM.whisper.id);
      if (language) {
        formData.append('language', language);
      }
      formData.append('response_format', 'json');

      const apiKey = getEnvSecret('GROQ_API_KEY', 'GROQ_KEY');
      if (!apiKey) {
        res.status(503).json({
          error: 'Configura GROQ_API_KEY en Settings > Secrets para usar la transcripción de voz.',
        });
        return;
      }

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        throw new Error(`Whisper error (${groqRes.status}): ${errText}`);
      }

      const groqData = (await groqRes.json()) as { text?: string };
      res.json({
        text: (groqData.text || '').trim(),
        modelUsed: GROQ_TEAM.whisper.id,
        teamRole: GROQ_TEAM.whisper.role,
      });
    } catch (err) {
      const msg = sanitizeErrorText(err);
      console.error('Audio transcription error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ALX Office server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ALX Office server:', sanitizeErrorText(err));
  process.exit(1);
});
