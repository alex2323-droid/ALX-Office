import React, { useId } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit3,
  Lock,
  Paintbrush,
  RotateCw,
  Trash2,
  Unlock,
} from 'lucide-react';
import type {
  WpsChartKind,
  WpsImageFilterPreset,
  WpsShadowStyle,
  WpsShapeKind,
  WpsSlide,
  WpsSlideElement,
  WpsTextEffect,
} from '../data/wpsDocuments';

export interface CanvaFontOption {
  id: string;
  label: string;
  cssFamily: string;
  exportName: string;
}

export const CANVA_FONTS: CanvaFontOption[] = [
  {
    id: 'jakarta',
    label: 'Jakarta Sans',
    cssFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    exportName: 'Plus Jakarta Sans',
  },
  {
    id: 'public',
    label: 'Public Sans',
    cssFamily: '"Public Sans", system-ui, sans-serif',
    exportName: 'Public Sans',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    cssFamily: '"Oswald", Impact, sans-serif',
    exportName: 'Oswald',
  },
  {
    id: 'playfair',
    label: 'Playfair',
    cssFamily: '"Playfair Display", Georgia, serif',
    exportName: 'Playfair Display',
  },
  {
    id: 'lora',
    label: 'Lora Serif',
    cssFamily: '"Lora", Georgia, serif',
    exportName: 'Lora',
  },
  {
    id: 'mono',
    label: 'JetBrains Mono',
    cssFamily: '"JetBrains Mono", monospace',
    exportName: 'JetBrains Mono',
  },
];

export const CANVA_COLORS = [
  '#0F172A',
  '#334155',
  '#64748B',
  '#FFFFFF',
  '#EF4444',
  '#EA580C',
  '#F59E0B',
  '#16A34A',
  '#0D9488',
  '#2563EB',
  '#4F46E5',
  '#7C3AED',
  '#DB2777',
  '#FEF08A',
  '#DBEAFE',
  '#FCE7F3',
];

export const CANVA_SOLID_BGS = [
  { label: 'Blanco', value: '#FFFFFF' },
  { label: 'Crema', value: '#FBF7EE' },
  { label: 'Gris Perla', value: '#F1F5F9' },
  { label: 'Azul Hielo', value: '#EFF6FF' },
  { label: 'Lavanda', value: '#F5F3FF' },
  { label: 'Menta', value: '#ECFDF5' },
  { label: 'Marino', value: '#0F2744' },
  { label: 'Carbón', value: '#0F172A' },
  { label: 'Nocturno', value: '#1E1B4B' },
];

export const CANVA_GRADIENTS = [
  {
    id: 'sunset',
    label: 'Atardecer',
    css: 'linear-gradient(135deg, #FF7E5F 0%, #FEB47B 100%)',
    fallbackColor: '#FF8A65',
  },
  {
    id: 'ocean',
    label: 'Océano',
    css: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)',
    fallbackColor: '#1D4ED8',
  },
  {
    id: 'violet',
    label: 'Estudio Violeta',
    css: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
    fallbackColor: '#7C3AED',
  },
  {
    id: 'midnight',
    label: 'Medianoche',
    css: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #312E81 100%)',
    fallbackColor: '#0F172A',
  },
  {
    id: 'emerald',
    label: 'Esmeralda',
    css: 'linear-gradient(135deg, #059669 0%, #0D9488 100%)',
    fallbackColor: '#059669',
  },
  {
    id: 'pastel',
    label: 'Aura Pastel',
    css: 'linear-gradient(135deg, #FDF2F8 0%, #EFF6FF 100%)',
    fallbackColor: '#F8FAFC',
  },
];

export interface CanvaShapeDef {
  kind: WpsShapeKind;
  label: string;
  defaultFill: string;
  defaultBorder?: string;
}

export const CANVA_SHAPE_DEFINITIONS: CanvaShapeDef[] = [
  { kind: 'rect', label: 'Rectángulo', defaultFill: '#2563EB' },
  { kind: 'roundRect', label: 'Tarjeta', defaultFill: '#7C3AED' },
  { kind: 'ellipse', label: 'Círculo', defaultFill: '#EA580C' },
  { kind: 'triangle', label: 'Triángulo', defaultFill: '#0D9488' },
  { kind: 'star', label: 'Estrella', defaultFill: '#F59E0B' },
  { kind: 'arrowRight', label: 'Flecha', defaultFill: '#2563EB' },
  { kind: 'diamond', label: 'Rombo', defaultFill: '#DB2777' },
  { kind: 'badge', label: 'Etiqueta', defaultFill: '#0F172A' },
  { kind: 'line', label: 'Línea', defaultFill: '#334155' },
];

export interface CanvaTextPreset {
  id: string;
  label: string;
  previewClass: string;
  sampleText: string;
  fontSizePt: number;
  fontFamily: string;
  bold: boolean;
  color: string;
  fillColor?: string;
  borderRadiusPx?: number;
  wPct: number;
  hPct: number;
  isTitle?: boolean;
}

export const CANVA_TEXT_PRESETS: CanvaTextPreset[] = [
  {
    id: 'heading',
    label: 'Añadir un título',
    previewClass: 'text-base font-bold',
    sampleText: 'Título de impacto',
    fontSizePt: 34,
    fontFamily: '"Oswald", Impact, sans-serif',
    bold: true,
    color: '#0F172A',
    wPct: 72,
    hPct: 16,
    isTitle: true,
  },
  {
    id: 'subheading',
    label: 'Añadir un subtítulo',
    previewClass: 'text-sm font-semibold',
    sampleText: 'Subtítulo claro y directo',
    fontSizePt: 20,
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    bold: true,
    color: '#334155',
    wPct: 68,
    hPct: 12,
  },
  {
    id: 'body',
    label: 'Añadir texto de cuerpo',
    previewClass: 'text-xs font-normal',
    sampleText: 'Escribe aquí los detalles principales, puntos clave o descripción del proyecto.',
    fontSizePt: 14,
    fontFamily: '"Public Sans", system-ui, sans-serif',
    bold: false,
    color: '#334155',
    wPct: 64,
    hPct: 18,
  },
  {
    id: 'quote',
    label: 'Cita editorial',
    previewClass: 'text-sm italic font-serif',
    sampleText: '“El diseño claro convierte ideas complejas en decisiones inmediatas.”',
    fontSizePt: 18,
    fontFamily: '"Playfair Display", Georgia, serif',
    bold: false,
    color: '#1E293B',
    fillColor: '#F8FAFC',
    borderRadiusPx: 12,
    wPct: 66,
    hPct: 18,
  },
  {
    id: 'kpi',
    label: 'Métrica KPI',
    previewClass: 'text-base font-extrabold tracking-tight',
    sampleText: '+148%',
    fontSizePt: 40,
    fontFamily: '"Oswald", Impact, sans-serif',
    bold: true,
    color: '#7C3AED',
    fillColor: '#F5F3FF',
    borderRadiusPx: 14,
    wPct: 30,
    hPct: 18,
  },
  {
    id: 'badge',
    label: 'Insignia destacada',
    previewClass: 'text-xs font-bold uppercase tracking-wider',
    sampleText: 'NUEVO LANZAMIENTO',
    fontSizePt: 12,
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    bold: true,
    color: '#FFFFFF',
    fillColor: '#EA580C',
    borderRadiusPx: 10,
    wPct: 34,
    hPct: 10,
  },
];

export interface CanvaSlideTemplate {
  id: string;
  name: string;
  subtitle: string;
  accent: string;
  build: () => Partial<WpsSlide>;
}

const makeElId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const CANVA_SLIDE_TEMPLATES: CanvaSlideTemplate[] = [
  {
    id: 'modern-cover',
    name: 'Portada Moderna',
    subtitle: 'Fondo nocturno + acento',
    accent: '#7C3AED',
    build: () => ({
      title: 'Estrategia & Producto 2026',
      subtitle: 'Presentación ejecutiva',
      backgroundColor: '#0F172A',
      backgroundGradient: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #312E81 100%)',
      elements: [
        {
          id: makeElId('sh'),
          type: 'shape',
          shapeKind: 'ellipse',
          xPct: 70,
          yPct: -14,
          wPct: 40,
          hPct: 68,
          fillColor: '#7C3AED',
          opacity: 0.25,
          zIndex: 1,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 8,
          yPct: 16,
          wPct: 30,
          hPct: 9,
          fillColor: '#7C3AED',
          borderRadiusPx: 8,
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
          fontSizePt: 11,
          letterSpacingEm: 0.08,
          textTransform: 'uppercase',
          richHtml: '<p><strong>INFORME ANUAL 2026</strong></p>',
          paragraphs: [
            {
              align: 'center',
              runs: [{ text: 'INFORME ANUAL 2026', bold: true, color: '#FFFFFF', fontSizePt: 11 }],
            },
          ],
          zIndex: 2,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          isTitle: true,
          xPct: 8,
          yPct: 30,
          wPct: 78,
          hPct: 28,
          fontFamily: '"Oswald", Impact, sans-serif',
          fontSizePt: 38,
          richHtml: '<p><strong>Estrategia &amp; Producto 2026</strong></p>',
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: 'Estrategia & Producto 2026', bold: true, color: '#FFFFFF', fontSizePt: 38 }],
            },
          ],
          zIndex: 3,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 8,
          yPct: 62,
          wPct: 68,
          hPct: 16,
          fontFamily: '"Public Sans", system-ui, sans-serif',
          fontSizePt: 16,
          richHtml: '<p>Hoja de ruta, métricas clave y metas del equipo para el próximo trimestre.</p>',
          paragraphs: [
            {
              align: 'left',
              runs: [
                {
                  text: 'Hoja de ruta, métricas clave y metas del equipo para el próximo trimestre.',
                  color: '#CBD5E1',
                  fontSizePt: 16,
                },
              ],
            },
          ],
          zIndex: 4,
        },
      ],
    }),
  },
  {
    id: 'two-columns',
    name: '2 Columnas Tarjetas',
    subtitle: 'Comparar ideas claras',
    accent: '#2563EB',
    build: () => ({
      title: 'Propuesta de Valor',
      backgroundColor: '#F8FAFC',
      backgroundGradient: undefined,
      elements: [
        {
          id: makeElId('tx'),
          type: 'text',
          isTitle: true,
          xPct: 7,
          yPct: 8,
          wPct: 86,
          hPct: 14,
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
          fontSizePt: 28,
          richHtml: '<p><strong>Propuesta de Valor en Dos Ejes</strong></p>',
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: 'Propuesta de Valor en Dos Ejes', bold: true, color: '#0F172A', fontSizePt: 28 }],
            },
          ],
          zIndex: 1,
        },
        {
          id: makeElId('sh'),
          type: 'shape',
          shapeKind: 'roundRect',
          xPct: 7,
          yPct: 26,
          wPct: 41,
          hPct: 62,
          fillColor: '#FFFFFF',
          borderColor: '#DBEAFE',
          borderWidthPx: 2,
          borderRadiusPx: 14,
          shadow: 'soft',
          zIndex: 2,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 10,
          yPct: 31,
          wPct: 35,
          hPct: 50,
          fontSizePt: 15,
          richHtml:
            '<p><strong style="color:#2563EB">01 · Velocidad móvil</strong></p><p>Flujo optimizado para editar en pantalla táctil sin fricción y con sincronización instantánea.</p>',
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: '01 · Velocidad móvil', bold: true, color: '#2563EB', fontSizePt: 16 }],
            },
          ],
          zIndex: 3,
        },
        {
          id: makeElId('sh'),
          type: 'shape',
          shapeKind: 'roundRect',
          xPct: 52,
          yPct: 26,
          wPct: 41,
          hPct: 62,
          fillColor: '#FFFFFF',
          borderColor: '#EDE9FE',
          borderWidthPx: 2,
          borderRadiusPx: 14,
          shadow: 'soft',
          zIndex: 4,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 55,
          yPct: 31,
          wPct: 35,
          hPct: 50,
          fontSizePt: 15,
          richHtml:
            '<p><strong style="color:#7C3AED">02 · Diseño flexible</strong></p><p>Capas libres, formas vectoriales, gráficos editables y exportación real en formato PPTX.</p>',
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: '02 · Diseño flexible', bold: true, color: '#7C3AED', fontSizePt: 16 }],
            },
          ],
          zIndex: 5,
        },
      ],
    }),
  },
  {
    id: 'kpi-metrics',
    name: 'Métricas KPI',
    subtitle: '3 indicadores + gráfico',
    accent: '#059669',
    build: () => ({
      title: 'Resultados del Trimestre',
      backgroundColor: '#FFFFFF',
      backgroundGradient: undefined,
      elements: [
        {
          id: makeElId('tx'),
          type: 'text',
          isTitle: true,
          xPct: 6,
          yPct: 7,
          wPct: 88,
          hPct: 12,
          fontSizePt: 26,
          richHtml: '<p><strong>Resultados del Trimestre</strong></p>',
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: 'Resultados del Trimestre', bold: true, color: '#0F172A', fontSizePt: 26 }],
            },
          ],
          zIndex: 1,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 6,
          yPct: 23,
          wPct: 27,
          hPct: 22,
          fillColor: '#ECFDF5',
          borderRadiusPx: 12,
          fontFamily: '"Oswald", Impact, sans-serif',
          fontSizePt: 26,
          richHtml: '<p><strong style="color:#059669">+42%</strong></p><p>Adopción activa</p>',
          paragraphs: [
            { align: 'center', runs: [{ text: '+42% Adopción activa', bold: true, color: '#059669', fontSizePt: 18 }] },
          ],
          zIndex: 2,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 36,
          yPct: 23,
          wPct: 27,
          hPct: 22,
          fillColor: '#EFF6FF',
          borderRadiusPx: 12,
          fontFamily: '"Oswald", Impact, sans-serif',
          fontSizePt: 26,
          richHtml: '<p><strong style="color:#2563EB">98.4%</strong></p><p>Disponibilidad</p>',
          paragraphs: [
            { align: 'center', runs: [{ text: '98.4% Disponibilidad', bold: true, color: '#2563EB', fontSizePt: 18 }] },
          ],
          zIndex: 3,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 66,
          yPct: 23,
          wPct: 28,
          hPct: 22,
          fillColor: '#FFF7ED',
          borderRadiusPx: 12,
          fontFamily: '"Oswald", Impact, sans-serif',
          fontSizePt: 26,
          richHtml: '<p><strong style="color:#EA580C">4.9 / 5</strong></p><p>Satisfacción</p>',
          paragraphs: [
            { align: 'center', runs: [{ text: '4.9 / 5 Satisfacción', bold: true, color: '#EA580C', fontSizePt: 18 }] },
          ],
          zIndex: 4,
        },
        {
          id: makeElId('ch'),
          type: 'chart',
          xPct: 6,
          yPct: 50,
          wPct: 88,
          hPct: 42,
          chartKind: 'bar',
          title: 'Evolución mensual',
          series: [
            {
              name: '2026',
              points: [
                { label: 'Ene', value: 42 },
                { label: 'Feb', value: 58 },
                { label: 'Mar', value: 74 },
                { label: 'Abr', value: 92 },
              ],
            },
          ],
          zIndex: 5,
        },
      ],
    }),
  },
  {
    id: 'process-flow',
    name: 'Flujo de Proceso',
    subtitle: '4 pasos visuales',
    accent: '#EA580C',
    build: () => ({
      title: 'Flujo de Trabajo en 4 Pasos',
      backgroundColor: '#FBF7EE',
      backgroundGradient: undefined,
      elements: [
        {
          id: makeElId('tx'),
          type: 'text',
          isTitle: true,
          xPct: 7,
          yPct: 9,
          wPct: 86,
          hPct: 14,
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSizePt: 28,
          richHtml: '<p><strong>Flujo de Trabajo en 4 Pasos</strong></p>',
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: 'Flujo de Trabajo en 4 Pasos', bold: true, color: '#0F172A', fontSizePt: 28 }],
            },
          ],
          zIndex: 1,
        },
        {
          id: makeElId('dg'),
          type: 'diagram',
          xPct: 7,
          yPct: 30,
          wPct: 86,
          hPct: 46,
          borderRadiusPx: 14,
          items: ['1. Descubrimiento', '2. Prototipo Canva', '3. Validación móvil', '4. Lanzamiento'],
          zIndex: 2,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 7,
          yPct: 80,
          wPct: 86,
          hPct: 12,
          fontSizePt: 13,
          richHtml: '<p>Toca cualquier bloque para editar el contenido o ajustar el estilo visual.</p>',
          paragraphs: [
            {
              align: 'center',
              runs: [{ text: 'Toca cualquier bloque para editar el contenido.', color: '#475569', fontSizePt: 13 }],
            },
          ],
          zIndex: 3,
        },
      ],
    }),
  },
  {
    id: 'comparison-table',
    name: 'Tabla Comparativa',
    subtitle: 'Resumen estructurado',
    accent: '#0D9488',
    build: () => ({
      title: 'Comparativa de Planes',
      backgroundColor: '#FFFFFF',
      backgroundGradient: undefined,
      elements: [
        {
          id: makeElId('tx'),
          type: 'text',
          isTitle: true,
          xPct: 7,
          yPct: 8,
          wPct: 86,
          hPct: 14,
          fontSizePt: 26,
          richHtml: '<p><strong>Comparativa de Soluciones</strong></p>',
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: 'Comparativa de Soluciones', bold: true, color: '#0F172A', fontSizePt: 26 }],
            },
          ],
          zIndex: 1,
        },
        {
          id: makeElId('tb'),
          type: 'table',
          xPct: 7,
          yPct: 26,
          wPct: 86,
          hPct: 60,
          headerBgColor: '#0F172A',
          headerTextColor: '#FFFFFF',
          borderRadiusPx: 10,
          headers: ['Capacidad', 'Estándar', 'Estudio Canva'],
          rows: [
            ['Capas y alineación inteligente', 'Básico', 'Completo'],
            ['Efectos tipográficos y filtros', 'No', 'Incluido'],
            ['Exportación real PPTX / PDF', 'Parcial', 'Nativa'],
          ],
          zIndex: 2,
        },
      ],
    }),
  },
  {
    id: 'impact-closing',
    name: 'Cierre de Impacto',
    subtitle: 'Degradado vibrante',
    accent: '#DB2777',
    build: () => ({
      title: '¡Gracias por su atención!',
      backgroundColor: '#7C3AED',
      backgroundGradient: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
      elements: [
        {
          id: makeElId('sh'),
          type: 'shape',
          shapeKind: 'star',
          xPct: 43,
          yPct: 16,
          wPct: 14,
          hPct: 22,
          fillColor: '#FEF08A',
          zIndex: 1,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          isTitle: true,
          xPct: 10,
          yPct: 42,
          wPct: 80,
          hPct: 22,
          fontFamily: '"Oswald", Impact, sans-serif',
          fontSizePt: 40,
          richHtml: '<p style="text-align:center"><strong>¡GRACIAS POR SU ATENCIÓN!</strong></p>',
          paragraphs: [
            {
              align: 'center',
              runs: [{ text: '¡GRACIAS POR SU ATENCIÓN!', bold: true, color: '#FFFFFF', fontSizePt: 40 }],
            },
          ],
          zIndex: 2,
        },
        {
          id: makeElId('tx'),
          type: 'text',
          xPct: 16,
          yPct: 68,
          wPct: 68,
          hPct: 14,
          fontSizePt: 16,
          richHtml: '<p style="text-align:center">¿Preguntas o comentarios? Conversemos ahora.</p>',
          paragraphs: [
            {
              align: 'center',
              runs: [{ text: '¿Preguntas o comentarios? Conversemos ahora.', color: '#FCE7F3', fontSizePt: 16 }],
            },
          ],
          zIndex: 3,
        },
      ],
    }),
  },
];

export function getShadowCss(shadow?: WpsShadowStyle): string | undefined {
  switch (shadow) {
    case 'soft':
      return '0 6px 18px rgba(15, 23, 42, 0.14)';
    case 'elevated':
      return '0 16px 36px rgba(15, 23, 42, 0.28)';
    case 'glow':
      return '0 0 24px rgba(124, 58, 237, 0.45)';
    default:
      return undefined;
  }
}

export function getImageFilterCss(
  preset?: WpsImageFilterPreset,
  brightness = 100,
  contrast = 100,
  saturate = 100,
): string | undefined {
  const parts: string[] = [];
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
  if (saturate !== 100) parts.push(`saturate(${saturate}%)`);

  switch (preset) {
    case 'bw':
      parts.push('grayscale(100%) contrast(112%)');
      break;
    case 'sepia':
      parts.push('sepia(82%) contrast(104%)');
      break;
    case 'vivid':
      parts.push('saturate(145%) contrast(110%)');
      break;
    case 'warm':
      parts.push('sepia(25%) saturate(120%) brightness(104%)');
      break;
    case 'cool':
      parts.push('hue-rotate(18deg) saturate(110%) contrast(104%)');
      break;
    case 'blur':
      parts.push('blur(2.5px)');
      break;
    default:
      break;
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function getTextEffectStyle(
  effect?: WpsTextEffect,
  effectColor?: string,
  textColor?: string,
): React.CSSProperties {
  const accent = effectColor || '#7C3AED';
  switch (effect) {
    case 'shadow':
      return {
        textShadow: `3px 3px 0px ${accent}80`,
      };
    case 'lift':
      return {
        textShadow: '0 6px 16px rgba(15, 23, 42, 0.42)',
      };
    case 'hollow':
      return {
        WebkitTextStroke: `1.5px ${textColor || '#0F172A'}`,
        WebkitTextFillColor: 'transparent',
      };
    case 'splice':
      return {
        WebkitTextStroke: `1px ${textColor || '#0F172A'}`,
        textShadow: `3px 3px 0px ${accent}`,
      };
    case 'background':
      return {
        backgroundColor: accent,
        borderRadius: '8px',
        padding: '4px 10px',
      };
    default:
      return {};
  }
}

export function CanvaShapeSvg({
  shapeKind = 'rect',
  fillColor = '#2563EB',
  fillGradient,
  borderColor,
  borderWidthPx = 0,
  borderStyle = 'solid',
  borderRadiusPx = 0,
}: {
  shapeKind?: WpsShapeKind;
  fillColor?: string;
  fillGradient?: string;
  borderColor?: string;
  borderWidthPx?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  borderRadiusPx?: number;
}) {
  const gradId = useId();
  const dashArray =
    borderStyle === 'dashed'
      ? '6 4'
      : borderStyle === 'dotted'
        ? '2 3'
        : undefined;

  if (shapeKind === 'line') {
    return (
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-full w-full">
        <line
          x1="0"
          y1="10"
          x2="100"
          y2="10"
          stroke={borderColor || fillColor || '#334155'}
          strokeWidth={Math.max(2, borderWidthPx || 3)}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (
    shapeKind === 'rect' ||
    shapeKind === 'roundRect' ||
    shapeKind === 'ellipse' ||
    shapeKind === 'badge'
  ) {
    const radius =
      shapeKind === 'ellipse'
        ? '9999px'
        : shapeKind === 'badge'
          ? '18px'
          : shapeKind === 'roundRect'
            ? `${borderRadiusPx || 14}px`
            : `${borderRadiusPx || 0}px`;
    return (
      <div
        className="h-full w-full"
        style={{
          background: fillGradient || fillColor || 'transparent',
          border:
            borderColor || borderWidthPx
              ? `${Math.max(1, borderWidthPx || 2)}px ${borderStyle} ${borderColor || '#0F172A'}`
              : undefined,
          borderRadius: radius,
        }}
      />
    );
  }

  const strokeAttr = borderColor || (borderWidthPx > 0 ? '#0F172A' : 'none');
  const strokeWidth = borderColor || borderWidthPx > 0 ? Math.max(1.5, borderWidthPx || 2) : 0;

  let points = '50,4 96,94 4,94'; // triangle
  if (shapeKind === 'star') {
    points = '50,4 63,34 96,38 71,60 78,94 50,76 22,94 29,60 4,38 37,34';
  } else if (shapeKind === 'arrowRight') {
    points = '4,30 60,30 60,10 96,50 60,90 60,70 4,70';
  } else if (shapeKind === 'diamond') {
    points = '50,4 96,50 50,96 4,50';
  }

  // Extract two hex stops from CSS linear-gradient if present
  const hexMatches = fillGradient?.match(/#[0-9a-fA-F]{3,6}/g);
  const useGrad = Boolean(hexMatches && hexMatches.length >= 2);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      {useGrad && hexMatches && (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={hexMatches[0]} />
            <stop offset="100%" stopColor={hexMatches[1]} />
          </linearGradient>
        </defs>
      )}
      <polygon
        points={points}
        fill={useGrad ? `url(#${gradId})` : fillColor || '#2563EB'}
        stroke={strokeAttr}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function CanvaSelectionBox({
  locked = false,
  rotationDeg = 0,
  isEditingText = false,
  onResizeStart,
  onRotateStart,
  badgeText,
}: {
  locked?: boolean;
  rotationDeg?: number;
  isEditingText?: boolean;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent) => void;
  onRotateStart: (e: React.PointerEvent) => void;
  badgeText?: string | null;
}) {
  const corners: { id: ResizeHandle; pos: string; cursor: string }[] = [
    { id: 'nw', pos: '-top-3 -left-3', cursor: 'nwse-resize' },
    { id: 'ne', pos: '-top-3 -right-3', cursor: 'nesw-resize' },
    { id: 'se', pos: '-bottom-3 -right-3', cursor: 'nwse-resize' },
    { id: 'sw', pos: '-bottom-3 -left-3', cursor: 'nesw-resize' },
  ];

  const edges: { id: ResizeHandle; pos: string; barClass: string; cursor: string }[] = [
    { id: 'n', pos: '-top-3 left-1/2 -translate-x-1/2', barClass: 'h-1.5 w-6', cursor: 'ns-resize' },
    { id: 's', pos: '-bottom-3 left-1/2 -translate-x-1/2', barClass: 'h-1.5 w-6', cursor: 'ns-resize' },
    { id: 'e', pos: 'top-1/2 -right-3 -translate-y-1/2', barClass: 'h-6 w-1.5', cursor: 'ew-resize' },
    { id: 'w', pos: 'top-1/2 -left-3 -translate-y-1/2', barClass: 'h-6 w-1.5', cursor: 'ew-resize' },
  ];

  const frameColor = locked ? '#F59E0B' : '#7C3AED';

  return (
    <div
      aria-hidden="true"
      className="no-print pointer-events-none absolute inset-0 z-30"
      style={{
        outline: `2px solid ${frameColor}`,
        outlineOffset: '0px',
        borderRadius: '2px',
      }}
    >
      {badgeText && (
        <div
          className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow-md"
        >
          {badgeText}
        </div>
      )}

      {!locked && !isEditingText && (
        <>
          {corners.map((h) => (
            <div
              key={h.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeStart(h.id, e);
              }}
              style={{ cursor: h.cursor, touchAction: 'none' }}
              className={`pointer-events-auto absolute ${h.pos} flex h-6 w-6 items-center justify-center`}
            >
              <span className="h-3.5 w-3.5 rounded-full border-2 border-[#7C3AED] bg-white shadow-sm" />
            </div>
          ))}

          {edges.map((h) => (
            <div
              key={h.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeStart(h.id, e);
              }}
              style={{ cursor: h.cursor, touchAction: 'none' }}
              className={`pointer-events-auto absolute ${h.pos} flex h-6 w-6 items-center justify-center`}
            >
              <span className={`${h.barClass} rounded-full border border-[#7C3AED] bg-white shadow-sm`} />
            </div>
          ))}

          {/* Bottom rotation stem & handle */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onRotateStart(e);
            }}
            style={{ touchAction: 'none' }}
            title={`Rotar (${Math.round(rotationDeg)}°)`}
            className="pointer-events-auto absolute -bottom-10 left-1/2 flex h-8 w-8 -translate-x-1/2 cursor-grab items-center justify-center active:cursor-grabbing"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-md">
              <RotateCw className="h-3.5 w-3.5" />
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function CanvaFloatingActionBar({
  canEditText,
  isEditingText,
  locked,
  hasCopiedStyle,
  onToggleEditText,
  onCopyStyle,
  onPasteStyle,
  onDuplicate,
  onToggleLock,
  onBringForward,
  onSendBackward,
  onDelete,
}: {
  canEditText: boolean;
  isEditingText: boolean;
  locked: boolean;
  hasCopiedStyle: boolean;
  onToggleEditText?: () => void;
  onCopyStyle?: () => void;
  onPasteStyle?: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="no-print flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95"
    >
      {canEditText && onToggleEditText && !locked && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleEditText}
          className={`inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
            isEditingText
              ? 'bg-[#7C3AED] text-white'
              : 'text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Edit3 className="h-3.5 w-3.5" />
          <span>{isEditingText ? 'Listo' : 'Editar'}</span>
        </button>
      )}

      {onCopyStyle && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={hasCopiedStyle && onPasteStyle ? onPasteStyle : onCopyStyle}
          title={hasCopiedStyle ? 'Pegar estilo copiado' : 'Copiar estilo'}
          aria-label={hasCopiedStyle ? 'Pegar estilo' : 'Copiar estilo'}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            hasCopiedStyle
              ? 'bg-violet-50 text-[#7C3AED] dark:bg-violet-950/60 dark:text-violet-300'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Paintbrush className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDuplicate}
        title="Duplicar"
        aria-label="Duplicar elemento"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleLock}
        title={locked ? 'Desbloquear' : 'Bloquear posición'}
        aria-label={locked ? 'Desbloquear' : 'Bloquear'}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          locked
            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
        }`}
      >
        {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onBringForward}
        title="Traer adelante"
        aria-label="Traer adelante"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSendBackward}
        title="Enviar atrás"
        aria-label="Enviar atrás"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>

      {!locked && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDelete}
          title="Eliminar"
          aria-label="Eliminar elemento"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function CanvaColorSwatchRow({
  label,
  value,
  colors = CANVA_COLORS,
  allowTransparent = false,
  onChange,
}: {
  label?: string;
  value?: string;
  colors?: string[];
  allowTransparent?: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <div>
      {label && (
        <div className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {label}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
      {allowTransparent && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange('transparent')}
          aria-label="Sin relleno"
          className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold text-slate-600 dark:text-slate-300 ${
            !value || value === 'transparent'
              ? 'border-[#7C3AED] ring-2 ring-[#7C3AED]/30'
              : 'border-slate-300 dark:border-slate-600'
          }`}
        >
          ×
        </button>
      )}
      {colors.map((c) => {
        const active = value?.toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(c)}
            aria-label={`Color ${c}`}
            style={{ backgroundColor: c }}
            className={`h-9 w-9 rounded-full border transition-transform active:scale-95 ${
              active
                ? 'scale-105 border-[#7C3AED] ring-2 ring-[#7C3AED]/35'
                : 'border-slate-300 dark:border-slate-600'
            }`}
          />
        );
      })}
      <label
        title="Color personalizado"
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500 text-xs font-bold text-white shadow-xs dark:border-slate-600"
      >
        <span>+</span>
        <input
          type="color"
          value={value && value.startsWith('#') && value.length === 7 ? value : '#7C3AED'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      </div>
    </div>
  );
}

export function CanvaChartRenderer({
  el,
}: {
  el: Extract<WpsSlideElement, { type: 'chart' }>;
}) {
  const kind: WpsChartKind = el.chartKind || 'bar';
  const colors = ['#7C3AED', '#2563EB', '#EA580C', '#059669', '#DB2777'];
  const firstSeries = el.series[0];
  const points = firstSeries?.points || [];
  const allVals = el.series.flatMap((s) => s.points.map((p) => p.value));
  const maxVal = Math.max(1, ...allVals);
  const totalSum = Math.max(
    1,
    points.reduce((acc, p) => acc + Math.max(0, p.value), 0),
  );

  return (
    <div
      style={{
        backgroundColor: el.fillColor || 'rgba(255,255,255,0.96)',
        borderColor: el.borderColor || '#CBD5E1',
        borderRadius: `${el.borderRadiusPx ?? 10}px`,
        boxShadow: getShadowCss(el.shadow),
      }}
      className="flex h-full w-full flex-col justify-between overflow-hidden border p-3 text-slate-900"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-display text-xs font-bold text-slate-800">
          {el.title || 'Gráfico'}
        </span>
        <div className="flex flex-wrap gap-2">
          {el.series.slice(0, 3).map((s, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 text-[10px] text-slate-600">
              <span
                className="h-2 w-2 rounded-xs"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {kind === 'donut' && points.length > 0 && (
        <div className="mt-2 flex flex-1 items-center justify-center gap-4">
          <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90">
            {(() => {
              let offset = 0;
              const r = 42;
              const circ = 2 * Math.PI * r;
              return points.slice(0, 5).map((pt, idx) => {
                const frac = Math.max(0, pt.value) / totalSum;
                const dash = frac * circ;
                const elCircle = (
                  <circle
                    key={idx}
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke={colors[idx % colors.length]}
                    strokeWidth="20"
                    strokeDasharray={`${dash} ${circ - dash}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += dash;
                return elCircle;
              });
            })()}
          </svg>
          <div className="space-y-1 text-[11px]">
            {points.slice(0, 5).map((pt, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: colors[idx % colors.length] }}
                />
                <span className="truncate text-slate-700">{pt.label}</span>
                <span className="font-mono font-semibold text-slate-900">{pt.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {kind === 'horizontalBar' && points.length > 0 && (
        <div className="mt-2 flex flex-1 flex-col justify-center gap-2">
          {points.slice(0, 5).map((pt, idx) => {
            const wPct = Math.max(6, Math.round((pt.value / maxVal) * 100));
            return (
              <div key={idx} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 truncate text-right font-medium text-slate-600">
                  {pt.label}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="h-full rounded-md"
                    style={{
                      width: `${wPct}%`,
                      backgroundColor: colors[idx % colors.length],
                    }}
                  />
                </div>
                <span className="w-8 font-mono font-semibold tabular-nums text-slate-800">
                  {pt.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {kind === 'line' && points.length > 0 && (
        <div className="mt-2 flex flex-1 flex-col">
          <svg viewBox="0 0 240 110" className="h-full w-full flex-1 overflow-visible">
            {[20, 50, 80].map((gy) => (
              <line key={gy} x1="12" y1={gy} x2="228" y2={gy} stroke="#E2E8F0" strokeWidth="1" />
            ))}
            {el.series.slice(0, 3).map((s, sIdx) => {
              const pts = s.points.slice(0, 8);
              if (pts.length === 0) return null;
              const coords = pts.map((p, i) => {
                const x = pts.length === 1 ? 120 : 18 + (i / (pts.length - 1)) * 204;
                const y = 90 - (p.value / maxVal) * 74;
                return { x, y, label: p.label };
              });
              const poly = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
              return (
                <g key={sIdx}>
                  <polyline
                    fill="none"
                    stroke={colors[sIdx % colors.length]}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={poly}
                  />
                  {coords.map((c, ci) => (
                    <circle
                      key={ci}
                      cx={c.x}
                      cy={c.y}
                      r="4"
                      fill="#FFFFFF"
                      stroke={colors[sIdx % colors.length]}
                      strokeWidth="2.5"
                    />
                  ))}
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex justify-between px-2 text-[10px] text-slate-600">
            {points.slice(0, 8).map((p, i) => (
              <span key={i} className="truncate">
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {kind === 'bar' && firstSeries && (
        <div className="mt-2 flex flex-1 items-end gap-2 pt-2">
          {points.slice(0, 8).map((pt, pIdx) => (
            <div key={pIdx} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                {el.series.slice(0, 3).map((s, sIdx) => {
                  const val = s.points[pIdx]?.value ?? 0;
                  const hPct = Math.max(6, Math.round((val / maxVal) * 100));
                  return (
                    <div
                      key={sIdx}
                      title={`${s.name}: ${val}`}
                      style={{
                        height: `${hPct}%`,
                        backgroundColor: colors[sIdx % colors.length],
                      }}
                      className="w-full max-w-[18px] rounded-t-xs"
                    />
                  );
                })}
              </div>
              <span className="w-full truncate text-center text-[10px] text-slate-600">
                {pt.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
