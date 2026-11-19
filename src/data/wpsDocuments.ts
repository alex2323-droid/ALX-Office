export interface WpsComment {
  id: string;
  author: string;
  text: string;
  quote: string;
  createdAt: string;
  resolved: boolean;
}

export interface WpsSlideRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSizePt?: number;
}

export interface WpsSlideParagraph {
  runs: WpsSlideRun[];
  align?: 'left' | 'center' | 'right' | 'justify';
  bullet?: boolean;
  level?: number;
}

export type WpsShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'arrowRight'
  | 'diamond'
  | 'badge'
  | 'line';

export type WpsShadowStyle = 'none' | 'soft' | 'elevated' | 'glow';
export type WpsTextEffect = 'none' | 'shadow' | 'lift' | 'hollow' | 'splice' | 'background';
export type WpsImageFilterPreset = 'none' | 'bw' | 'sepia' | 'vivid' | 'warm' | 'cool' | 'blur';
export type WpsChartKind = 'bar' | 'horizontalBar' | 'line' | 'donut';

export type WpsSlideElement =
  | {
      id: string;
      type: 'text';
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
      fillColor?: string;
      borderColor?: string;
      borderWidthPx?: number;
      borderStyle?: 'solid' | 'dashed' | 'dotted';
      borderRadiusPx?: number;
      rotationDeg?: number;
      opacity?: number;
      locked?: boolean;
      flippedX?: boolean;
      flippedY?: boolean;
      shadow?: WpsShadowStyle;
      groupId?: string;
      fontFamily?: string;
      fontSizePt?: number;
      letterSpacingEm?: number;
      lineHeight?: number;
      textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
      textEffect?: WpsTextEffect;
      effectColor?: string;
      verticalAlign?: 'top' | 'middle' | 'bottom';
      paragraphs: WpsSlideParagraph[];
      richHtml?: string;
      isTitle?: boolean;
      zIndex: number;
    }
  | {
      id: string;
      type: 'image';
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
      src: string;
      alt?: string;
      rotationDeg?: number;
      opacity?: number;
      locked?: boolean;
      flippedX?: boolean;
      flippedY?: boolean;
      borderColor?: string;
      borderWidthPx?: number;
      borderRadiusPx?: number;
      shadow?: WpsShadowStyle;
      groupId?: string;
      filterPreset?: WpsImageFilterPreset;
      brightness?: number;
      contrast?: number;
      saturate?: number;
      imageFit?: 'contain' | 'cover' | 'fill';
      zIndex: number;
    }
  | {
      id: string;
      type: 'table';
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
      rotationDeg?: number;
      opacity?: number;
      locked?: boolean;
      borderRadiusPx?: number;
      headerBgColor?: string;
      headerTextColor?: string;
      borderColor?: string;
      cellBgColor?: string;
      shadow?: WpsShadowStyle;
      groupId?: string;
      headers: string[];
      rows: string[][];
      zIndex: number;
    }
  | {
      id: string;
      type: 'shape';
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
      fillColor?: string;
      fillGradient?: string;
      borderColor?: string;
      borderWidthPx?: number;
      borderStyle?: 'solid' | 'dashed' | 'dotted';
      borderRadiusPx?: number;
      rotationDeg?: number;
      opacity?: number;
      locked?: boolean;
      flippedX?: boolean;
      flippedY?: boolean;
      shadow?: WpsShadowStyle;
      groupId?: string;
      shapeKind?: WpsShapeKind;
      zIndex: number;
    }
  | {
      id: string;
      type: 'chart';
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
      rotationDeg?: number;
      opacity?: number;
      locked?: boolean;
      fillColor?: string;
      borderColor?: string;
      borderRadiusPx?: number;
      shadow?: WpsShadowStyle;
      groupId?: string;
      chartKind?: WpsChartKind;
      title?: string;
      series: {
        name: string;
        points: { label: string; value: number }[];
      }[];
      zIndex: number;
    }
  | {
      id: string;
      type: 'diagram';
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
      rotationDeg?: number;
      opacity?: number;
      locked?: boolean;
      fillColor?: string;
      borderColor?: string;
      borderRadiusPx?: number;
      shadow?: WpsShadowStyle;
      groupId?: string;
      items: string[];
      zIndex: number;
    };

export interface WpsSlide {
  id: string;
  index: number;
  title: string;
  titleHtml?: string;
  subtitle?: string;
  subtitleHtml?: string;
  bullets: string[];
  bodyHtml?: string;
  table?: { headers: string[]; rows: string[][] };
  notes: string;
  slideWidthPx?: number;
  slideHeightPx?: number;
  backgroundColor?: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  elements?: WpsSlideElement[];
}

export type WpsFormat = 'DOCX' | 'DOC' | 'PDF' | 'PPTX' | 'PPT' | 'TXT';

export interface WpsDocument {
  id: string;
  title: string;
  format: WpsFormat;
  folder: string;
  starred: boolean;
  updatedAt: string;
  contentHtml: string;
  pdfBase64?: string;
  slides?: WpsSlide[];
  comments: WpsComment[];
}

export interface WpsTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  contentHtml: string;
}

export const WPS_TEMPLATES: WpsTemplate[] = [
  {
    id: 'tpl-blank',
    title: 'Documento en blanco',
    category: 'General',
    description: 'Página limpia lista para redactar con estilos de título y listas.',
    contentHtml: '<h1>Nuevo documento</h1><p>Comienza a escribir aquí o utiliza la barra inferior para dar formato al texto, insertar tablas o añadir listas de verificación.</p>',
  },
  {
    id: 'tpl-minutes',
    title: 'Minuta de reunión',
    category: 'Trabajo',
    description: 'Agenda estructurada con asistentes, acuerdos y tabla de responsables.',
    contentHtml:
      '<h1>Minuta de reunión</h1><p><strong>Fecha:</strong> 13 de noviembre de 2026 · <strong>Proyecto:</strong> Lanzamiento Android</p><h2>1. Puntos tratados</h2><ul><li>Revisión de rendimiento del editor móvil en pantallas de 6 pulgadas.</li><li>Validación de exportación directa a formato compatible con Word y PDF.</li></ul><h2>2. Tabla de acuerdos</h2><table><thead><tr><th>Responsable</th><th>Entregable</th><th>Fecha límite</th></tr></thead><tbody><tr><td>Laura Méndez</td><td>Pruebas de accesibilidad táctil</td><td>18 nov</td></tr><tr><td>Carlos Vega</td><td>Optimización de carga de fuentes</td><td>20 nov</td></tr></tbody></table><h2>3. Próximos pasos</h2><p>Confirmar disponibilidad del equipo para la revisión del viernes a las 10:00.</p>',
  },
  {
    id: 'tpl-report',
    title: 'Informe ejecutivo',
    category: 'Negocios',
    description: 'Resumen de resultados, métricas clave y recomendaciones.',
    contentHtml:
      '<h1>Informe trimestral de resultados</h1><p>Resumen de indicadores operativos y avances del último trimestre.</p><h2>Resumen general</h2><blockquote>La retención semanal aumentó un 18% tras simplificar la barra de edición rápida en dispositivos móviles.</blockquote><h2>Indicadores principales</h2><table><thead><tr><th>Métrica</th><th>Trimestre anterior</th><th>Actual</th></tr></thead><tbody><tr><td>Documentos creados</td><td>14.200</td><td>19.850</td></tr><tr><td>Tiempo de edición</td><td>4m 10s</td><td>6m 45s</td></tr></tbody></table><h2>Conclusiones</h2><p>Priorizar la vista de ajuste móvil y el modo de protección ocular en la siguiente versión.</p>',
  },
  {
    id: 'tpl-cv',
    title: 'Currículum profesional',
    category: 'Personal',
    description: 'Perfil laboral limpio con experiencia, formación y habilidades.',
    contentHtml:
      '<h1>Sofía Navarro Ruiz</h1><p><strong>Ingeniera de Producto Móvil</strong> · Madrid · sofia.navarro@ejemplo.com</p><h2>Perfil profesional</h2><p>Especialista en diseño de editores de texto enriquecido, ergonomía táctil para Android y sistemas de diseño multiplataforma con más de 6 años de experiencia.</p><h2>Experiencia destacada</h2><p><strong>Líder Técnica Frontend — Estudio Norte (2023 – Actualidad)</strong></p><ul><li>Arquitectura de editor offline con historial de cambios y exportación multi-formato.</li><li>Reducción del 35% en latencia de respuesta en dispositivos de gama media.</li></ul><h2>Formación</h2><p>Grado en Ingeniería Informática — Universidad Politécnica.</p>',
  },
  {
    id: 'tpl-invoice',
    title: 'Factura comercial',
    category: 'Negocios',
    description: 'Plantilla estructurada para cobros, datos fiscales y desglose de servicios.',
    contentHtml:
      '<h1>FACTURA #2026-048</h1><p><strong>Fecha de emisión:</strong> 16 de noviembre de 2026 · <strong>Vencimiento:</strong> 16 de diciembre de 2026</p><h2>Datos del cliente</h2><p><strong>Empresa:</strong> Soluciones Digitales Globales S.A.<br/><strong>NIT:</strong> J-31536656-8 · <strong>Dirección:</strong> Av. Francisco de Miranda, Torre Este</p><h2>Detalle de servicios</h2><table><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio unitario</th><th>Total</th></tr></thead><tbody><tr><td>Desarrollo de Módulo PWA y Editor</td><td>1</td><td>$1,250.00</td><td>$1,250.00</td></tr><tr><td>Consultoría de Accesibilidad UX</td><td>4</td><td>$150.00</td><td>$600.00</td></tr></tbody></table><h2>Total a pagar: $1,850.00</h2><p>Por favor realizar transferencia bancaria a la cuenta indicada en los términos del servicio.</p>',
  },
  {
    id: 'tpl-proposal',
    title: 'Propuesta de proyecto',
    category: 'Trabajo',
    description: 'Estructura para presentar proyectos, objetivos, alcance y presupuesto.',
    contentHtml:
      '<h1>Propuesta técnica: Migración Cloud</h1><p><strong>Cliente:</strong> Innovación Tecnológica C.A.<br/><strong>Líder de propuesta:</strong> Equipo ALX Office</p><h2>1. Objetivo del proyecto</h2><p>Actualizar la infraestructura de almacenamiento y sincronización en tiempo real para soportar más de 50.000 usuarios activos simultáneos.</p><h2>2. Fases de ejecución</h2><ul><li><strong>Fase 1 (Semanas 1-2):</strong> Auditoría de esquemas de base de datos y reglas de seguridad.</li><li><strong>Fase 2 (Semanas 3-5):</strong> Despliegue de microservicios y pruebas de estrés.</li></ul><h2>3. Presupuesto estimado</h2><p>El costo total asciende a $4,800 USD pagaderos en tres hitos de entrega.</p>',
  },
  {
    id: 'tpl-study',
    title: 'Plan de estudio académico',
    category: 'Personal',
    description: 'Organizador de asignaturas, metas de lectura y cronograma de exámenes.',
    contentHtml:
      '<h1>Plan de Estudio Semestral</h1><p><strong>Semestre:</strong> 2026-II · <strong>Meta:</strong> Promedio superior a 9.0</p><h2>Asignaturas inscritas</h2><table><thead><tr><th>Materia</th><th>Profesor</th><th>Días</th><th>Aula</th></tr></thead><tbody><tr><td>Algoritmos Avanzados</td><td>Dr. Roberto Gomez</td><td>Lu / Mi</td><td>Lab 3</td></tr><tr><td>Bases de Datos II</td><td>Dra. Carmen Silva</td><td>Ma / Ju</td><td>Aula 204</td></tr></tbody></table><h2>Cronograma de entregas</h2><ul><li><strong>Parcial 1:</strong> 15 de diciembre de 2026</li><li><strong>Proyecto final:</strong> 20 de enero de 2027</li></ul>',
  },
];

export const INITIAL_WPS_DOCUMENTS: WpsDocument[] = [];

export function computeDocStats(html: string): {
  words: number;
  chars: number;
  paragraphs: number;
  readMinutes: number;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  doc.body.querySelectorAll('[data-alx-canva-layers="1"]').forEach((node) => node.remove());
  const rawText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  const words = rawText ? rawText.split(' ').filter(Boolean).length : 0;
  const chars = (doc.body.textContent || '').replace(/\n/g, '').length;
  const blockCount = doc.body.querySelectorAll('p, h1, h2, h3, li, blockquote, tr').length;
  const paragraphs = Math.max(words > 0 ? 1 : 0, blockCount);
  const readMinutes = Math.max(1, Math.ceil(words / 200));
  return { words, chars, paragraphs, readMinutes };
}
