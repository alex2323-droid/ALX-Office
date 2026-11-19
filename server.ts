import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

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

interface GroqTeamResult {
  text: string;
  modelUsed: string;
  teamRole: string;
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

async function fetchGroqChatOnce(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxCompletionTokens: number,
): Promise<Response> {
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
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(22000),
  });
}

async function callGeminiHydrogen(
  systemPrompt: string,
  userPrompt: string,
): Promise<GroqTeamResult> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
    },
  });
  return {
    text: response.text || '',
    modelUsed: MODEL_NAME,
    teamRole: GROQ_TEAM.gemini.role,
  };
}

async function callGemmaViaGeminiApi(
  modelId: string,
  role: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<GroqTeamResult | null> {
  if (!process.env.GEMINI_API_KEY?.trim()) return null;
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
): Promise<Response> {
  const reasoningConfig =
    model === GROQ_TEAM.openrouterFast.id ||
    model === GROQ_TEAM.openrouterUltra.id ||
    model.startsWith('google/gemma-4-')
      ? { reasoning: { effort: 'none' } }
      : model === GROQ_TEAM.openrouterVl.id
        ? { reasoning: { enabled: false } }
        : model === GROQ_TEAM.openrouterRouter.id
          ? { reasoning: { effort: 'low' } }
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
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(8000),
  });
}

async function callOpenRouterFreeCascade(
  preferredModelId: string | undefined,
  systemPrompt: string,
  userPrompt: string,
): Promise<GroqTeamResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
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

  // Strict free-only OpenRouter models (verified 0-cost :free endpoints)
  const allCandidates = [
    preferredModelId,
    GROQ_TEAM.openrouterFast.id,
    GROQ_TEAM.openrouterVl.id,
    GROQ_TEAM.gemma4_26b.id,
    GROQ_TEAM.gemma4_31b.id,
    GROQ_TEAM.openrouterErnie.id,
    GROQ_TEAM.openrouterUltra.id,
    GROQ_TEAM.openrouterRouter.id,
  ].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

  const now = Date.now();
  const ready = allCandidates.filter((m) => (groqModelCooldownUntil.get(m) ?? 0) <= now);
  const candidates = (ready.length > 0 ? ready : allCandidates).slice(0, 2);
  const cascadeStart = Date.now();

  for (const model of candidates) {
    if (Date.now() - cascadeStart > 9000) break;
    try {
      const res = await fetchOpenRouterChatOnce(
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        4096,
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
        if (content) {
          groqModelCooldownUntil.delete(model);
          return {
            text: content,
            modelUsed: data.model || model,
            teamRole: roleMap[model] || `OpenRouter Gratis (${data.model || model})`,
          };
        }
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

async function callGroqTeamChat(
  specialist: 'reasoning' | 'structure' | 'fast' | 'gemini',
  systemPrompt: string,
  userPrompt: string,
  preferredModel?: string,
): Promise<GroqTeamResult> {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const wantsGeminiExplicitly =
    preferredModel === 'gemini' || Boolean(preferredModel?.includes('gemini'));
  const explicitOpenRouterMap: Record<string, string> = {
    'nemotron-ultra': GROQ_TEAM.openrouterUltra.id,
    'nemotron-fast': GROQ_TEAM.openrouterFast.id,
    'nemotron-vl': GROQ_TEAM.openrouterVl.id,
    'ernie-flash': GROQ_TEAM.openrouterErnie.id,
    'gemma-4-26b': GROQ_TEAM.gemma4_26b.id,
    'gemma-4-31b': GROQ_TEAM.gemma4_31b.id,
  };
  const explicitOpenRouterId = preferredModel
    ? explicitOpenRouterMap[preferredModel]
    : undefined;

  // 1. Explicit Gemini selection: call Gemini directly and surface config/quota errors honestly
  if (wantsGeminiExplicitly) {
    try {
      return await callGeminiHydrogen(systemPrompt, userPrompt);
    } catch (err) {
      const mapped = mapGeminiError(err);
      throw new Error(mapped.message);
    }
  }

  // 1b. Explicit Gemma-4-E4B-it / Gemma-4-E2B-it edge variants:
  // Try Google Gemini API Gemma 4 endpoint if GEMINI_API_KEY is available, else fall back cleanly via Gemma 4 OpenRouter :free -> Groq team
  if (preferredModel === 'gemma-4-e4b' || preferredModel === 'gemma-4-e2b') {
    const gemmaTarget =
      preferredModel === 'gemma-4-e2b' ? GROQ_TEAM.gemma4E2b : GROQ_TEAM.gemma4E4b;
    const directGemma = await callGemmaViaGeminiApi(
      gemmaTarget.id,
      gemmaTarget.role,
      systemPrompt,
      userPrompt,
    );
    if (directGemma) return directGemma;

    const orGemma = await callOpenRouterFreeCascade(
      GROQ_TEAM.gemma4_26b.id,
      systemPrompt,
      userPrompt,
    );
    if (orGemma) return orGemma;
  }

  // 2. Explicit OpenRouter :free specialist selection (including Gemma 4 26B/31B)
  if (explicitOpenRouterId) {
    const orResult = await callOpenRouterFreeCascade(
      explicitOpenRouterId,
      systemPrompt,
      userPrompt,
    );
    if (orResult) return orResult;

    if (preferredModel === 'gemma-4-26b' || preferredModel === 'gemma-4-31b') {
      const gemmaFallback =
        preferredModel === 'gemma-4-31b' ? GROQ_TEAM.gemma4_31b : GROQ_TEAM.gemma4_26b;
      const viaGoogle = await callGemmaViaGeminiApi(
        gemmaFallback.id.replace(/^google\//, '').replace(/:free$/, ''),
        gemmaFallback.role,
        systemPrompt,
        userPrompt,
      );
      if (viaGoogle) return viaGoogle;
    }
  }

  // 3. Auto mode: if specialist is 'gemini' (e.g. long-context PDF or huge doc), try Gemini then OpenRouter Ultra (1M ctx) before Groq
  if (specialist === 'gemini' && (!preferredModel || preferredModel === 'auto')) {
    if (hasGeminiKey) {
      try {
        return await callGeminiHydrogen(systemPrompt, userPrompt);
      } catch {
        // Hand off cleanly to OpenRouter Ultra / Groq team if Gemini hits transient limit
      }
    }
    const orLongResult = await callOpenRouterFreeCascade(
      GROQ_TEAM.openrouterUltra.id,
      systemPrompt,
      userPrompt,
    );
    if (orLongResult) return orLongResult;
  }

  const effectiveSpecialist = specialist === 'gemini' ? 'reasoning' : specialist;
  let primaryModel = GROQ_TEAM[effectiveSpecialist].id;
  if (preferredModel && preferredModel !== 'auto') {
    if (preferredModel === 'gpt-120b' || preferredModel.includes('120b')) {
      primaryModel = GROQ_TEAM.reasoning.id;
    } else if (
      preferredModel === 'qwen' ||
      preferredModel.includes('qwen') ||
      preferredModel.includes('27b')
    ) {
      primaryModel = GROQ_TEAM.structure.id;
    } else if (preferredModel === 'gpt-20b' || preferredModel.includes('20b')) {
      primaryModel = GROQ_TEAM.fast.id;
    }
  }

  const roleMap: Record<string, string> = {
    [GROQ_TEAM.reasoning.id]: GROQ_TEAM.reasoning.role,
    [GROQ_TEAM.structure.id]: GROQ_TEAM.structure.role,
    [GROQ_TEAM.fast.id]: GROQ_TEAM.fast.role,
  };

  // Fallback cascade puts high-budget models (GPT-120B / GPT-20B) ahead of low-OTPM Qwen when delegating
  const allCandidates = [
    primaryModel,
    GROQ_TEAM.reasoning.id,
    GROQ_TEAM.fast.id,
    GROQ_TEAM.structure.id,
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  const now = Date.now();
  const readyCandidates = allCandidates.filter(
    (m) => (groqModelCooldownUntil.get(m) ?? 0) <= now,
  );
  const candidateModels =
    readyCandidates.length > 0
      ? readyCandidates
      : [...allCandidates].sort(
          (a, b) =>
            (groqModelCooldownUntil.get(a) ?? 0) - (groqModelCooldownUntil.get(b) ?? 0),
        );

  const apiKey = (process.env.GROQ_API_KEY || '').trim();

  if (apiKey) {
    for (const model of candidateModels) {
      // Respect Qwen-27B's 1000 OTPM free-tier cap by keeping single-call output budget <= 750
      const maxTokens = model === GROQ_TEAM.structure.id ? 750 : 2800;

      try {
        let response = await fetchGroqChatOnce(
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          maxTokens,
        );

        // If Groq asks for a sub-1.2s retry (e.g. 360ms), pause briefly and retry once cleanly
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
          const content = data.choices?.[0]?.message?.content || '';
          if (content) {
            return {
              text: content,
              modelUsed: model,
              teamRole: roleMap[model] || model,
            };
          }
        } else if (response.status >= 500) {
          groqModelCooldownUntil.set(model, Date.now() + 8000);
        } else {
          // 4xx non-429 (e.g. json_validate_failed / context length): hand off quietly to teammate
          await response.text();
        }
      } catch {
        groqModelCooldownUntil.set(model, Date.now() + 5000);
      }
    }
  }

  // Backup fallback 1: OpenRouter :free team
  const orBackup = await callOpenRouterFreeCascade(
    effectiveSpecialist === 'fast'
      ? GROQ_TEAM.openrouterFast.id
      : effectiveSpecialist === 'structure'
        ? GROQ_TEAM.openrouterVl.id
        : GROQ_TEAM.openrouterUltra.id,
    systemPrompt,
    userPrompt,
  );
  if (orBackup) return orBackup;

  // Backup fallback 2: Gemini (if GEMINI_API_KEY is configured)
  try {
    return await callGeminiHydrogen(systemPrompt, userPrompt);
  } catch (err) {
    const mapped = mapGeminiError(err);
    throw new Error(mapped.message);
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
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
  return {
    status: 500,
    message: raw.startsWith('{')
      ? 'No se pudo completar la respuesta de Gemini en este momento. Intenta con "Auto (Equipo IA)".'
      : raw || 'Error al procesar la edición con inteligencia artificial.',
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
  'sidebar-left',
  'header-banner',
  'split-left',
  'minimal-frame',
  'spotlight',
  'top-bar',
] as const;

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
        /#0f172a|#1e1b4b|#111827|#1e293b|#312e81/i.test(backgroundGradient),
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
    accentColor:
      typeof raw.accentColor === 'string' && raw.accentColor.trim()
        ? raw.accentColor.trim()
        : '#7C3AED',
    accentSecondaryColor:
      typeof raw.accentSecondaryColor === 'string' && raw.accentSecondaryColor.trim()
        ? raw.accentSecondaryColor.trim()
        : '#EC4899',
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
        'User-Agent': 'ALXOffice/5.0 (https://alx-office.app)',
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
      headers: { 'User-Agent': 'ALXOffice/5.0 (https://alx-office.app)' },
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
      headers: { 'User-Agent': 'ALXOffice/5.0 (https://alx-office.app)' },
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
      headers: { 'Authorization': key, 'User-Agent': 'ALXOffice/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`;
      res = await fetch(pexelsUrl, {
        headers: { 'Authorization': key, 'User-Agent': 'ALXOffice/5.0' },
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
      headers: { 'User-Agent': 'ALXOffice/5.0 (https://alx-office.app)' },
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
    const queryResult = await callGroqTeamChat(
      'fast',
      'Eres un especialista estricto en búsqueda visual de referencia. ' +
        'REGLA OBLIGATORIA: Las consultas de búsqueda visual ("queries") DEBEN incorporar obligatoriamente términos clave, conceptos o palabras del contenido, párrafo o puntos específicos de esta diapositiva actual. ESTÁ PROHIBIDO usar consultas genéricas basadas solo en el título general del mazo. ' +
        'Devuelve JSON con: {"queries":["inglés corto 1","inglés corto 2"],"alt":"descripción en español"}',
      `Título de diapositiva: "${slideTitle}"\nContenido / Puntos específicos de esta sección:\n${slideContextText.slice(0, 600)}`,
    );
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
  if (process.env.GEMINI_API_KEY?.trim()) {
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
      // Gracefully fall back to free AI SVG Vector Illustrator team below
    }
  }

  // 2. Free Team Vector Illustrator (Nemotron Super VL / Gemma 4 / GPT-120B) -> crisp thematic SVG
  try {
    const svgResult = await callGroqTeamChat(
      'structure',
      'Eres un ilustrador vectorial experto para presentaciones ejecutivas Canva. ' +
        'Genera una ilustración SVG limpia, moderna, estética y directamente relacionada con el tema de la diapositiva. ' +
        'Reglas estrictas: ' +
        '- viewBox="0 0 800 500" ' +
        '- Usa degradados (<linearGradient>), formas geométricas limpias, íconos ilustrativos claros del tema, tarjetas flotantes y detalles visuales profesionales acorde a los colores proporcionados. ' +
        '- Evita textos largos dentro del SVG (máximo 1 etiqueta corta opcional). ' +
        '- Devuelve JSON válido con: {"svg":"<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 800 500\\">...</svg>","alt":"descripción en español"}',
      `Tema de la presentación: "${presentationTitle}"\nDiapositiva: "${slideTitle}"\nContenido: ${slideContextText.slice(0, 350)}\nColor acento primario: ${accentColor}\nColor secundario: ${secondaryColor}`,
      'nemotron-vl',
    );
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
      const specialist: 'fast' | 'structure' | 'reasoning' | 'gemini' =
        action === 'fix_grammar' || action === 'concise'
          ? 'fast'
          : action === 'table' || action === 'checklist'
            ? 'structure'
            : isLongContext
              ? 'gemini'
              : 'reasoning';

      const promptUser = [
        `Documento (${fileType}): "${documentTitle}"`,
        `Contexto de diseño actual:\n- Color de hoja: ${designContext.pageBgColor || '#FFFFFF'}\n- Tipografía actual: ${designContext.fontFamily || 'sans'}\n- Colores usados en el documento: ${detectedColorsText}\n- Jerarquía de títulos: ${detectedHeadingsText}\n- Contiene tablas: ${designContext.hasTables ? 'Sí' : 'No'}`,
        `Operación solicitada:\n${instruction}`,
        selectedText
          ? `Fragmento seleccionado para editar:\n"""\n${selectedText.slice(0, 8000)}\n"""`
          : htmlSnippet
            ? `HTML estructural actual del documento (respeta clases, estilos, colores y orden salvo que se pida cambiarlos):\n"""\n${htmlSnippet}\n"""`
            : `Texto actual del documento:\n"""\n${sourceText || '(Documento vacío)'}\n"""`,
      ].join('\n\n');

      const systemInstruction =
        'Eres un editor documental y diseñador editorial experto de ALX Office. ' +
        'Razona paso a paso antes de responder: 1) Analiza el tema real y el objetivo exacto del usuario. ' +
        '2) Identifica la paleta de colores, tipografía, encabezados, tablas y bloques visuales (.alx-canva-callout, .alx-canva-kpi, .alx-canva-cols, p[data-checklist="true"]) del documento actual. ' +
        '3) Respeta SIEMPRE la coherencia temática, colores, tipografía y estructura existente, a menos que el usuario pida explícitamente cambiar el color, la fuente o el diseño. ' +
        '4) Si el usuario pide tarjetas, columnas, bloques destacados o estilos específicos, usa HTML semántico limpio con estilos inline precisos (colores hex, font-family, border-radius, padding, bordes) y/o las clases .alx-canva-callout, .alx-canva-kpi, .alx-canva-cols compatibles con el lienzo. ' +
        '5) En tablas usa style="width:100%;border-collapse:collapse;" y encabezados <th> con fondo y texto contrastante acordes a la paleta. ' +
        '6) Nunca envuelvas en <html>, <body> ni bloques Markdown ```. ' +
        '7) Devuelve JSON válido con: "html", "summary" (1 frase clara), "designNotes" (qué elementos, colores o tipografía se respetaron o aplicaron), y opcionalmente "suggestedPageBgColor" (hex si el usuario pidió cambiar color de hoja) y "suggestedFontFamily" ("sans"|"serif"|"mono" si el usuario pidió cambiar tipografía).';

      const teamResult = await callGroqTeamChat(
        specialist,
        systemInstruction,
        promptUser,
        preferredModel,
      );

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

      const teamResult = await callGroqTeamChat('fast', systemInstruction, userPrompt, 'auto');
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

      const isVariationRequest =
        action === 'vary_design' || Boolean(variationHint?.iteration);
      const variationInstruction = isVariationRequest
        ? [
            `MODO VARIACIÓN CREATIVA (intento #${variationHint?.iteration || 1}):`,
            variationHint?.avoidLayout
              ? `- NO repitas layoutType="${variationHint.avoidLayout}". Elige un layout diferente entre: cover, bullets, cards, diagram, chart, table.`
              : '- Explora un layoutType distinto al clásico de viñetas (por ejemplo: cards, diagram, chart, table o cover).',
            variationHint?.avoidVisualStyle
              ? `- NO repitas visualStyle="${variationHint.avoidVisualStyle}". Cambia obligatoriamente a otro visualStyle entre: sidebar-left, header-banner, split-left, minimal-frame, spotlight, top-bar.`
              : '- Elige un visualStyle visualmente llamativo como sidebar-left, header-banner, split-left, spotlight o minimal-frame.',
            '- Propón una combinación armónica de color de fondo, color de acento primario y secundario diferente y fresca (sin perder legibilidad ni contraste WCAG).',
          ].join('\n')
        : 'Elige el "visualStyle" que mejor luzca para este contenido ("sidebar-left" | "header-banner" | "split-left" | "minimal-frame" | "spotlight" | "top-bar") en lugar de repetir siempre el mismo estilo.';

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
        'Evita generar siempre el mismo diseño monótono: combina inteligentemente composición ("visualStyle") y estructura ("layoutType"). ' +
        '1) Asocia el contenido estrictamente al tema real de la presentación, sus otras diapositivas y la petición del usuario. Si la diapositiva solo dice "CONTENIDO", "Índice" o está vacía, propón puntos o tarjetas concretas y útiles acordes al tema de la presentación — NUNCA uses textos genéricos como "Contenido generado por IA" o "Idea principal". ' +
        '2) Si NO es una solicitud explícita de nuevo diseño o cambio de colores, armoniza con el fondo actual; si el usuario pide variar diseño, nuevo diseño o especifica colores/tema, innova libremente con paletas modernas y degradados elegantes. ' +
        '3) DEVUELVE ESTRICTAMENTE un objeto JSON válido con ESTAS CLAVES EXACTAS (NO uses una clave "cards" ni "items" ni objetos anidados dentro de bullets): ' +
        '{"title":"Título claro","subtitle":"Subtítulo breve opcional","layoutType":"cover|bullets|cards|diagram|chart|table","visualStyle":"sidebar-left|header-banner|split-left|minimal-frame|spotlight|top-bar","bullets":["Título breve: explicación concisa de 1 a 2 líneas","Segundo punto...","Tercer punto...","Cuarto punto..."],"notes":"Notas para el orador","backgroundColor":"#HEX","backgroundGradient":"opcional linear-gradient(...)","accentColor":"#HEX","accentSecondaryColor":"#HEX","textColor":"#HEX","fontFamily":"string CSS","chartKind":"bar|horizontalBar|line|donut","chartTitle":"string","chartPoints":[{"label":"Q1","value":45}],"tableHeaders":["Col 1","Col 2"],"tableRows":[["Dato 1","Dato 2"]],"summary":"1 frase describiendo el diseño aplicado"}. ' +
        '4) "bullets" DEBE ser SIEMPRE un arreglo de 3 a 5 strings informativos no vacíos (en layout "cards", escribe cada tarjeta como "Título corto: descripción clara"). ' +
        '5) Si layoutType es "chart", genera 3-6 "chartPoints" ({label, value}). Si es "table", genera "tableHeaders" (2-4 columnas) y "tableRows" (2-5 filas). Garantiza contraste WCAG perfecto.';

      const teamResult = await callGroqTeamChat(
        'structure',
        systemInstruction,
        promptUser,
        preferredModel,
      );

      const rawParsed = cleanJsonResponse<Record<string, unknown>>(teamResult.text, {});
      const normalized = normalizeSlideProposal(rawParsed, {
        title: slideTitle || 'Diapositiva',
        bullets: slideTexts.length > 0 ? slideTexts : undefined,
        backgroundColor: slideContext.backgroundColor || '#FFFFFF',
        backgroundGradient: slideContext.backgroundGradient,
        fontFamily: slideContext.fontFamily,
        requestedLayout:
          action === 'cards' ||
          action === 'diagram' ||
          action === 'chart' ||
          action === 'table'
            ? action
            : undefined,
      });

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
      } = (req.body || {}) as {
        action?: string;
        customPrompt?: string;
        pageText?: string;
        pageHtml?: string;
        pageNumber?: number;
        totalPages?: number;
        documentTitle?: string;
        preferredModel?: string;
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

      const teamResult = await callGroqTeamChat(
        'gemini',
        systemInstruction,
        promptUser,
        preferredModel,
      );

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
      };

      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) {
        res.status(400).json({
          error: 'Describe el tema o instrucciones del documento que quieres crear.',
        });
        return;
      }

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

      if (format === 'PPTX') {
        const promptUser = [
          `Crea una presentación completa estilo Canva de ${count} diapositivas.`,
          title.trim() ? `Título sugerido: "${title.trim()}"` : '',
          `Tema e instrucciones del usuario:\n${cleanPrompt}`,
          `Tono: ${tone}`,
          `Paleta visual: ${paletteGuide}`,
          `Tipografía: ${fontGuide}`,
          qaSection,
        ]
          .filter(Boolean)
          .join('\n\n');

        const systemInstruction =
          'Eres un diseñador maestro de presentaciones Canva en ALX Office. ' +
          'Genera un mazo completo, coherente y visualmente atractivo de exactamente la cantidad de diapositivas pedida. ' +
          'Usa variedad visual inteligente: empieza con una portada ("cover"), y en el resto alterna entre "visualStyle" ("sidebar-left", "header-banner", "split-left", "minimal-frame", "spotlight", "top-bar") y "layoutType" ("cards", "chart", "diagram", "table", "bullets") para que ninguna diapositiva se vea idéntica a la anterior. ' +
          'Mantén coherencia estricta de paleta de colores, tipografía ("fontFamily"), contraste y tema a lo largo de todas las diapositivas. ' +
          'Devuelve JSON válido con { "title": "...", "folder": "Presentaciones", "summary": "...", "slides": [ ... ] }. ' +
          'Cada elemento de "slides" DEBE usar EXACTAMENTE estas claves (no uses "cards" ni "items"): ' +
          '{ "title": "...", "subtitle": "...", "layoutType": "cover|bullets|cards|diagram|chart|table", "visualStyle": "sidebar-left|header-banner|split-left|minimal-frame|spotlight|top-bar", "bullets": ["Título: explicación...", "..."], "notes": "...", "backgroundColor": "#HEX", "backgroundGradient": "opcional", "accentColor": "#HEX", "accentSecondaryColor": "#HEX", "textColor": "#HEX", "fontFamily": "string CSS", "chartKind": "bar|horizontalBar|line|donut", "chartTitle": "...", "chartPoints": [{"label":"...","value":10}], "tableHeaders": ["..."], "tableRows": [["..."]], "summary": "..." }. ' +
          '"bullets" DEBE contener siempre 3 a 5 strings informativos y reales (nunca textos genéricos).';

        const teamResult = await callGroqTeamChat(
          'reasoning',
          systemInstruction,
          promptUser,
          preferredModel,
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
            }),
        );

        if (normalizedSlides.length < count) {
          const needed = count - normalizedSlides.length;
          for (let i = 0; i < needed; i++) {
            const idx = normalizedSlides.length;
            normalizedSlides.push(
              normalizeSlideProposal(
                {
                  title: `${deckTitle} — Parte ${idx + 1}`,
                  bullets: [
                    `Punto clave sobre ${cleanPrompt.slice(0, 50)}`,
                    `Desarrollo y análisis operativo de la sección ${idx + 1}`,
                    `Conclusiones prácticas y recomendaciones`,
                  ],
                  layoutType: 'cards',
                  visualStyle: 'split-left',
                },
                { title: `${deckTitle} — Parte ${idx + 1}` },
              ),
            );
          }
        } else if (normalizedSlides.length > count) {
          normalizedSlides = normalizedSlides.slice(0, count);
        }

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
        ]
          .filter(Boolean)
          .join('\n\n');

        const systemInstruction =
          'Eres un autor técnico y editor PDF de ALX Office. ' +
          'Genera "pagesHtml": un arreglo donde cada elemento es el HTML semántico limpio de UNA página del PDF (<h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>, <strong>, <em>). ' +
          'Aplica colores de acento en títulos/encabezados acorde a la paleta solicitada usando atributos style="color:#HEX;" para mantener fidelidad visual al compilar a PDF. ' +
          'Evita usar Markdown ``` o etiquetas <html>/<body>. Devuelve JSON con: { title, folder, summary, pagesHtml: [...] }';

        const teamResult = await callGroqTeamChat(
          'reasoning',
          systemInstruction,
          promptUser,
          preferredModel,
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
      ]
        .filter(Boolean)
        .join('\n\n');

      const systemInstruction =
        'Eres un redactor editorial y diseñador de documentos Word de ALX Office. ' +
        'Genera "contentHtml" completo, bien maquetado y visualmente atractivo usando: ' +
        '<h1> para título principal con color acorde a la paleta, <h2>/<h3> para secciones, párrafos claros <p>, al menos un bloque destacado <div class="alx-canva-callout"> o <div class="alx-canva-kpi">, una tabla comparativa o de datos <table> con encabezados estilizados según la paleta, y listas <ul>/<ol>. ' +
        'Devuelve también "pageBgColor" (hex claro u oscuro acorde a la paleta solicitada, por defecto "#FFFFFF") y "fontFamily" ("sans" | "serif" | "mono"). Devuelve JSON con: { title, folder, pageBgColor, fontFamily, contentHtml, summary }';

      const teamResult = await callGroqTeamChat(
        'reasoning',
        systemInstruction,
        promptUser,
        preferredModel,
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
        headers: { 'User-Agent': 'ALXOffice/5.0 (https://alx-office.app; mailto:support@alx-office.app)' },
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
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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

      const apiKey = (process.env.GROQ_API_KEY || '').trim();
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
      console.error('Audio transcription error:', err);
      const msg = err instanceof Error ? err.message : String(err);
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
  console.error('Failed to start ALX Office server:', err);
  process.exit(1);
});
