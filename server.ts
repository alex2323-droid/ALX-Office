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
    lower.includes('403')
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
        'Límite de solicitudes de IA alcanzado temporalmente. Intenta de nuevo en unos segundos.',
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
    message: raw || 'Error al procesar la edición con inteligencia artificial.',
  };
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
        designContext = {},
      } = (req.body || {}) as {
        action?: string;
        customPrompt?: string;
        selectedText?: string;
        fullText?: string;
        currentHtml?: string;
        documentTitle?: string;
        fileType?: string;
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

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          `Documento (${fileType}): "${documentTitle}"`,
          `Contexto de diseño actual:\n- Color de hoja: ${designContext.pageBgColor || '#FFFFFF'}\n- Tipografía actual: ${designContext.fontFamily || 'sans'}\n- Colores usados en el documento: ${detectedColorsText}\n- Jerarquía de títulos: ${detectedHeadingsText}\n- Contiene tablas: ${designContext.hasTables ? 'Sí' : 'No'}`,
          `Operación solicitada:\n${instruction}`,
          selectedText
            ? `Fragmento seleccionado para editar:\n"""\n${selectedText.slice(0, 8000)}\n"""`
            : htmlSnippet
              ? `HTML estructural actual del documento (respeta clases, estilos, colores y orden salvo que se pida cambiarlos):\n"""\n${htmlSnippet}\n"""`
              : `Texto actual del documento:\n"""\n${sourceText || '(Documento vacío)'}\n"""`,
        ].join('\n\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction:
            'Eres un editor documental y diseñador editorial experto de ALX Office. ' +
            'Razona paso a paso antes de responder: 1) Analiza el tema real y el objetivo exacto del usuario. ' +
            '2) Identifica la paleta de colores, tipografía, encabezados, tablas y bloques visuales (.alx-canva-callout, .alx-canva-kpi, .alx-canva-cols, p[data-checklist="true"]) del documento actual. ' +
            '3) Respeta SIEMPRE la coherencia temática, colores, tipografía y estructura existente, a menos que el usuario pida explícitamente cambiar el color, la fuente o el diseño. ' +
            '4) Si el usuario pide tarjetas, columnas, bloques destacados o estilos específicos, usa HTML semántico limpio con estilos inline precisos (colores hex, font-family, border-radius, padding, bordes) y/o las clases .alx-canva-callout, .alx-canva-kpi, .alx-canva-cols compatibles con el lienzo. ' +
            '5) En tablas usa style="width:100%;border-collapse:collapse;" y encabezados <th> con fondo y texto contrastante acordes a la paleta. ' +
            '6) Nunca envuelvas en <html>, <body> ni bloques Markdown ```. ' +
            '7) Devuelve JSON válido con: "html", "summary" (1 frase clara), "designNotes" (qué elementos, colores o tipografía se respetaron o aplicaron), y opcionalmente "suggestedPageBgColor" (hex si el usuario pidió cambiar color de hoja) y "suggestedFontFamily" ("sans"|"serif"|"mono" si el usuario pidió cambiar tipografía).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              html: { type: Type.STRING },
              summary: { type: Type.STRING },
              designNotes: { type: Type.STRING },
              suggestedPageBgColor: { type: Type.STRING },
              suggestedFontFamily: { type: Type.STRING },
            },
            required: ['html', 'summary', 'designNotes'],
          },
        },
      });

      const parsed = cleanJsonResponse<{
        html: string;
        summary: string;
        designNotes?: string;
        suggestedPageBgColor?: string;
        suggestedFontFamily?: 'sans' | 'serif' | 'mono';
      }>(response.text, {
        html: `<p>${escapeHtmlServer((response.text || '').trim())}</p>`,
        summary: 'Edición generada por IA.',
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
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 2. Presentations (PPTX / PPT) Canva Studio AI Assistant with full element & theme awareness + creative variation
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
      } = (req.body || {}) as {
        action?: string;
        customPrompt?: string;
        slideTitle?: string;
        slideTexts?: string[];
        presentationTitle?: string;
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

      const contextText = slideTexts.filter(Boolean).join('\n• ').slice(0, 6000);
      if (!contextText && !slideTitle && !customPrompt.trim()) {
        res.status(400).json({
          error: 'Describe qué deseas crear o mejorar en la diapositiva.',
        });
        return;
      }

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

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          `Presentación: "${presentationTitle}"`,
          slideContext.otherSlideTitles?.length
            ? `Otras diapositivas del mazo (para mantener coherencia narrativa): ${slideContext.otherSlideTitles.join(' | ')}`
            : '',
          `Diseño actual de esta diapositiva:\n- Fondo sólido: ${slideContext.backgroundColor || '#FFFFFF'}\n- Degradado actual: ${slideContext.backgroundGradient || 'Ninguno'}\n- Tipografía actual: ${slideContext.fontFamily || '"Plus Jakarta Sans", system-ui, sans-serif'}\n- Elementos en lienzo: ${slideContext.elementsSummary || 'Estructura clásica de título y viñetas'}`,
          `Título actual: ${slideTitle || '(Sin título)'}`,
          `Textos actuales:\n${contextText ? `• ${contextText}` : '(Diapositiva vacía)'}`,
          `Acción solicitada: ${action}`,
          variationInstruction,
          customPrompt.trim()
            ? `Instrucción explícita del usuario: ${customPrompt.trim()}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction:
            'Eres un director de arte y diseñador Canva experto en presentaciones de ALX Office. ' +
            'Evita generar siempre el mismo diseño monótono: combina inteligentemente composición ("visualStyle") y estructura ("layoutType"). ' +
            '1) Asocia el contenido generado estrictamente al tema real de la presentación y la petición del usuario (datos verosímiles, concisos, máximo 4-5 puntos o tarjetas claras). ' +
            '2) Si NO es una solicitud explícita de nuevo diseño o cambio de colores, armoniza con el fondo actual; si el usuario pide variar diseño, nuevo diseño o especifica colores/tema, innova libremente con paletas modernas y degradados elegantes. ' +
            '3) Usa "layoutType" entre: "cover", "bullets", "cards", "diagram", "chart", "table". ' +
            '4) Usa "visualStyle" entre: "sidebar-left" (columna izquierda acentuada), "header-banner" (cabecera de color completa), "split-left" (diseño editorial dividido 2 columnas), "minimal-frame" (marco fino editorial), "spotlight" (círculos decorativos suaves + insignia), "top-bar" (barra superior limpia). ' +
            '5) Si el layout es "chart" o se piden métricas/gráficos, elige "chartKind" ("bar" | "horizontalBar" | "line" | "donut") y genera 3-6 "chartPoints" ({label, value}) numéricos coherentes con el tema. ' +
            '6) Si el layout es "table", genera "tableHeaders" (2-4 columnas) y "tableRows" (2-5 filas) con datos reales del tema. ' +
            '7) Garantiza contraste WCAG perfecto entre backgroundColor/backgroundGradient y textColor.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              subtitle: { type: Type.STRING },
              layoutType: {
                type: Type.STRING,
                description:
                  'Uno de: cover, bullets, cards, diagram, chart, table',
              },
              visualStyle: {
                type: Type.STRING,
                description:
                  'Uno de: sidebar-left, header-banner, split-left, minimal-frame, spotlight, top-bar',
              },
              bullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              notes: { type: Type.STRING },
              backgroundColor: { type: Type.STRING },
              backgroundGradient: { type: Type.STRING },
              accentColor: { type: Type.STRING },
              accentSecondaryColor: { type: Type.STRING },
              textColor: { type: Type.STRING },
              fontFamily: { type: Type.STRING },
              chartKind: {
                type: Type.STRING,
                description: 'Uno de: bar, horizontalBar, line, donut',
              },
              chartTitle: { type: Type.STRING },
              chartPoints: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.NUMBER },
                  },
                  required: ['label', 'value'],
                },
              },
              tableHeaders: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              tableRows: {
                type: Type.ARRAY,
                items: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              summary: { type: Type.STRING },
            },
            required: [
              'title',
              'layoutType',
              'visualStyle',
              'bullets',
              'notes',
              'summary',
            ],
          },
        },
      });

      const parsed = cleanJsonResponse(response.text, {
        title: slideTitle || 'Diapositiva mejorada',
        subtitle: '',
        layoutType: 'cards' as const,
        visualStyle: 'split-left' as const,
        bullets: slideTexts.length > 0 ? slideTexts : ['Idea principal'],
        notes: '',
        backgroundColor: slideContext.backgroundColor || '#FFFFFF',
        backgroundGradient: slideContext.backgroundGradient,
        accentColor: '#7C3AED',
        accentSecondaryColor: '#EC4899',
        textColor: '#0F172A',
        fontFamily: slideContext.fontFamily,
        chartKind: 'bar' as const,
        chartTitle: '',
        chartPoints: [] as { label: string; value: number }[],
        tableHeaders: [] as string[],
        tableRows: [] as string[][],
        summary: 'Propuesta visual generada por IA.',
      });

      res.json(parsed);
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
      } = (req.body || {}) as {
        action?: string;
        customPrompt?: string;
        pageText?: string;
        pageHtml?: string;
        pageNumber?: number;
        totalPages?: number;
        documentTitle?: string;
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

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
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
          .join('\n\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction:
            'Eres el asistente analítico y de anotaciones PDF de ALX Office. ' +
            'Analiza con precisión el contenido real de la página solicitada y devuelve JSON válido con: ' +
            '"noteText" (texto claro, preciso y estructurado en máximo 6 líneas listo para adherirse como etiqueta visual sobre el PDF), ' +
            '"bgColor" (color hex suave para tarjeta como #FFFFFF, #FEF9C3, #EDE9FE o #DBEAFE acorde al tono), ' +
            '"textColor" (hex oscuro de alto contraste como #0F172A), y "summary" (breve explicación).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              noteText: { type: Type.STRING },
              bgColor: { type: Type.STRING },
              textColor: { type: Type.STRING },
              summary: { type: Type.STRING },
            },
            required: ['noteText', 'summary'],
          },
        },
      });

      const parsed = cleanJsonResponse<{
        noteText: string;
        bgColor?: string;
        textColor?: string;
        summary: string;
      }>(response.text, {
        noteText: (response.text || '').trim(),
        bgColor: '#FFFFFF',
        textColor: '#0F172A',
        summary: 'Anotación generada por IA.',
      });

      res.json(parsed);
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
      } = (req.body || {}) as {
        format?: 'DOCX' | 'PPTX' | 'PDF';
        prompt?: string;
        title?: string;
        tone?: string;
        palette?: string;
        fontStyle?: string;
        sectionCount?: number;
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
      const count = Math.max(2, Math.min(8, Number(sectionCount) || 4));
      const ai = getAiClient();

      if (format === 'PPTX') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: [
            `Crea una presentación completa estilo Canva de ${count} diapositivas.`,
            title.trim() ? `Título sugerido: "${title.trim()}"` : '',
            `Tema e instrucciones del usuario:\n${cleanPrompt}`,
            `Tono: ${tone}`,
            `Paleta visual: ${paletteGuide}`,
            `Tipografía: ${fontGuide}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            systemInstruction:
              'Eres un diseñador maestro de presentaciones Canva en ALX Office. ' +
              'Genera un mazo completo, coherente y visualmente atractivo de exactamente la cantidad de diapositivas pedida. ' +
              'Usa variedad visual inteligente: empieza con una portada ("cover"), y en el resto alterna entre "visualStyle" ("sidebar-left", "header-banner", "split-left", "minimal-frame", "spotlight", "top-bar") y "layoutType" ("cards", "chart", "diagram", "table", "bullets") para que ninguna diapositiva se vea idéntica a la anterior. ' +
              'Mantén coherencia estricta de paleta de colores, tipografía ("fontFamily"), contraste y tema a lo largo de todas las diapositivas.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                folder: { type: Type.STRING },
                summary: { type: Type.STRING },
                slides: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      subtitle: { type: Type.STRING },
                      layoutType: { type: Type.STRING },
                      visualStyle: { type: Type.STRING },
                      bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                      notes: { type: Type.STRING },
                      backgroundColor: { type: Type.STRING },
                      backgroundGradient: { type: Type.STRING },
                      accentColor: { type: Type.STRING },
                      accentSecondaryColor: { type: Type.STRING },
                      textColor: { type: Type.STRING },
                      fontFamily: { type: Type.STRING },
                      chartKind: { type: Type.STRING },
                      chartTitle: { type: Type.STRING },
                      chartPoints: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING },
                            value: { type: Type.NUMBER },
                          },
                          required: ['label', 'value'],
                        },
                      },
                      tableHeaders: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      tableRows: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      summary: { type: Type.STRING },
                    },
                    required: [
                      'title',
                      'layoutType',
                      'visualStyle',
                      'bullets',
                      'notes',
                      'summary',
                    ],
                  },
                },
              },
              required: ['title', 'folder', 'summary', 'slides'],
            },
          },
        });

        const parsed = cleanJsonResponse<{
          title: string;
          folder: string;
          summary: string;
          slides: unknown[];
        }>(response.text, {
          title: title.trim() || 'Presentación IA',
          folder: 'Presentaciones',
          summary: 'Presentación generada con IA.',
          slides: [],
        });

        res.json({
          format: 'PPTX',
          title: parsed.title || title.trim() || 'Presentación IA',
          folder: parsed.folder || 'Presentaciones',
          summary: parsed.summary || 'Presentación generada.',
          slides: parsed.slides || [],
        });
        return;
      }

      if (format === 'PDF') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: [
            `Crea un documento PDF multipágina profesional de ${Math.min(5, count)} páginas.`,
            title.trim() ? `Título sugerido: "${title.trim()}"` : '',
            `Tema e instrucciones del usuario:\n${cleanPrompt}`,
            `Tono: ${tone}`,
            `Paleta visual: ${paletteGuide}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            systemInstruction:
              'Eres un autor técnico y editor PDF de ALX Office. ' +
              'Genera "pagesHtml": un arreglo donde cada elemento es el HTML semántico limpio de UNA página del PDF (<h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>, <strong>, <em>). ' +
              'Aplica colores de acento en títulos/encabezados acorde a la paleta solicitada usando atributos style="color:#HEX;" para mantener fidelidad visual al compilar a PDF. ' +
              'Evita usar Markdown ``` o etiquetas <html>/<body>.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                folder: { type: Type.STRING },
                summary: { type: Type.STRING },
                pagesHtml: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['title', 'folder', 'summary', 'pagesHtml'],
            },
          },
        });

        const parsed = cleanJsonResponse<{
          title: string;
          folder: string;
          summary: string;
          pagesHtml: string[];
        }>(response.text, {
          title: title.trim() || 'Documento PDF IA',
          folder: 'Documentación',
          summary: 'Documento PDF generado con IA.',
          pagesHtml: [
            `<h1>${escapeHtmlServer(title.trim() || 'Documento')}</h1><p>${escapeHtmlServer(cleanPrompt)}</p>`,
          ],
        });

        res.json({
          format: 'PDF',
          title: parsed.title || title.trim() || 'Documento PDF IA',
          folder: parsed.folder || 'Documentación',
          summary: parsed.summary || 'Documento PDF creado.',
          pagesHtml:
            parsed.pagesHtml && parsed.pagesHtml.length > 0
              ? parsed.pagesHtml
              : [
                  `<h1>${escapeHtmlServer(parsed.title || 'Documento')}</h1><p>${escapeHtmlServer(cleanPrompt)}</p>`,
                ],
        });
        return;
      }

      // Default: DOCX (Rich Word Document)
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          `Crea un documento Word profesional y completo con ${count} secciones bien desarrolladas.`,
          title.trim() ? `Título sugerido: "${title.trim()}"` : '',
          `Tema e instrucciones del usuario:\n${cleanPrompt}`,
          `Tono: ${tone}`,
          `Paleta visual: ${paletteGuide}`,
          `Tipografía preferida: ${fontGuide}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction:
            'Eres un redactor editorial y diseñador de documentos Word de ALX Office. ' +
            'Genera "contentHtml" completo, bien maquetado y visualmente atractivo usando: ' +
            '<h1> para título principal con color acorde a la paleta, <h2>/<h3> para secciones, párrafos claros <p>, al menos un bloque destacado <div class="alx-canva-callout"> o <div class="alx-canva-kpi">, una tabla comparativa o de datos <table> con encabezados estilizados según la paleta, y listas <ul>/<ol>. ' +
            'Devuelve también "pageBgColor" (hex claro u oscuro acorde a la paleta solicitada, por defecto "#FFFFFF") y "fontFamily" ("sans" | "serif" | "mono").',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              folder: { type: Type.STRING },
              pageBgColor: { type: Type.STRING },
              fontFamily: { type: Type.STRING },
              contentHtml: { type: Type.STRING },
              summary: { type: Type.STRING },
            },
            required: ['title', 'folder', 'contentHtml', 'summary'],
          },
        },
      });

      const parsed = cleanJsonResponse<{
        title: string;
        folder: string;
        pageBgColor?: string;
        fontFamily?: 'sans' | 'serif' | 'mono';
        contentHtml: string;
        summary: string;
      }>(response.text, {
        title: title.trim() || 'Documento IA',
        folder: 'Trabajo',
        pageBgColor: '#FFFFFF',
        fontFamily: 'sans',
        contentHtml: `<h1>${escapeHtmlServer(title.trim() || 'Documento')}</h1><p>${escapeHtmlServer(cleanPrompt)}</p>`,
        summary: 'Documento Word generado con IA.',
      });

      res.json({
        format: 'DOCX',
        title: parsed.title || title.trim() || 'Documento IA',
        folder: parsed.folder || 'Trabajo',
        pageBgColor: parsed.pageBgColor || '#FFFFFF',
        fontFamily:
          parsed.fontFamily === 'serif' ||
          parsed.fontFamily === 'mono' ||
          parsed.fontFamily === 'sans'
            ? parsed.fontFamily
            : 'sans',
        contentHtml: parsed.contentHtml || '<p></p>',
        summary: parsed.summary || 'Documento Word creado.',
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
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
