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
      rotationDeg?: number;
      paragraphs: WpsSlideParagraph[];
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
      borderColor?: string;
      rotationDeg?: number;
      shapeKind?: 'rect' | 'roundRect' | 'ellipse' | 'line';
      zIndex: number;
    }
  | {
      id: string;
      type: 'chart';
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
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
      items: string[];
      zIndex: number;
    };

export interface WpsSlide {
  id: string;
  index: number;
  title: string;
  subtitle?: string;
  bullets: string[];
  table?: { headers: string[]; rows: string[][] };
  notes: string;
  slideWidthPx?: number;
  slideHeightPx?: number;
  backgroundColor?: string;
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
];

export const INITIAL_WPS_DOCUMENTS: WpsDocument[] = [
  {
    id: 'doc-1',
    title: 'Propuesta de Rediseño Editor Móvil',
    format: 'DOCX',
    folder: 'Trabajo',
    starred: true,
    updatedAt: 'Hoy, 12:40',
    contentHtml:
      '<h1>Propuesta de Rediseño: Editor WPS Android</h1><p>El objetivo principal de esta actualización es permitir la edición cómoda de documentos extensos con una sola mano, manteniendo todas las herramientas avanzadas accesibles desde la zona inferior del pulgar.</p><h2>Principios de ergonomía táctil</h2><ul><li><strong>Barra de formato rápido:</strong> Negrita, cursiva, subrayado, listas y deshacer siempre visibles sobre el teclado.</li><li><strong>Panel expandible por pestañas:</strong> Inicio, Insertar, Ver y Revisar organizados en hojas deslizables.</li><li><strong>Ajuste móvil inteligente:</strong> Reflujo automático de párrafos al ancho de pantalla para evitar desplazamiento horizontal.</li></ul><h2>Comparativa de modos de lectura</h2><table><thead><tr><th>Modo</th><th>Ancho de lienzo</th><th>Uso recomendado</th></tr></thead><tbody><tr><td>Ajuste móvil</td><td>100% del viewport</td><td>Edición rápida en teléfono</td></tr><tr><td>Vista de página A4</td><td>794 px proporcional</td><td>Revisión antes de exportar</td></tr></tbody></table><blockquote>Nota: El modo de protección ocular aplica un tono cálido sepia sobre la hoja para reducir la fatiga visual en lectura nocturna.</blockquote>',
    comments: [
      {
        id: 'cm-1',
        author: 'Ana Morales',
        text: 'Validar que los botones de la barra inferior tengan al menos 44px de alto en pantallas pequeñas.',
        quote: 'zona inferior del pulgar',
        createdAt: 'Hoy, 11:15',
        resolved: false,
      },
    ],
  },
  {
    id: 'doc-pdf-1',
    title: 'Manual de Producto WPS Android (3 págs.)',
    format: 'PDF',
    folder: 'Documentación',
    starred: true,
    updatedAt: 'Hoy, 11:50',
    contentHtml: '',
    comments: [],
  },
  {
    id: 'doc-pptx-1',
    title: 'Presentación Trimestral Q4 — Producto Móvil',
    format: 'PPTX',
    folder: 'Presentaciones',
    starred: true,
    updatedAt: 'Hoy, 10:15',
    contentHtml: '',
    slides: [
      {
        id: 's-1',
        index: 1,
        title: 'Resultados Q4: Suite Documental Android',
        subtitle: 'Revisión de rendimiento, lectura multi-formato y experiencia táctil',
        bullets: [
          'Cobertura completa para DOCX, DOC, PDF, PPTX y PPT sin dependencias externas.',
          'Diseño optimizado para pulgar con controles inferiores de 44 px.',
        ],
        notes: 'Abrir la reunión resumiendo el enfoque en lectura rápida y edición sin fricción.',
      },
      {
        id: 's-2',
        index: 2,
        title: 'Uso por tipo de archivo en dispositivos móviles',
        bullets: [
          'PDF representa el 44% de aperturas rápidas para revisión y firma.',
          'DOCX y DOC concentran el 38% de sesiones con edición activa.',
          'PPTX y PPT alcanzan el 18% en consultas previas a reuniones.',
        ],
        table: {
          headers: ['Formato', 'Aperturas / mes', 'Tiempo medio'],
          rows: [
            ['PDF', '68.400', '3m 45s'],
            ['DOCX / DOC', '59.100', '7m 10s'],
            ['PPTX / PPT', '28.200', '2m 50s'],
          ],
        },
        notes: 'Destacar que los usuarios alternan entre modo vertical y vista de notas durante presentaciones.',
      },
      {
        id: 's-3',
        index: 3,
        title: 'Mejoras clave del visor de presentaciones',
        bullets: [
          'Tira inferior de miniaturas para saltar a cualquier diapositiva al instante.',
          'Panel desplegable de notas del orador legible bajo luz solar o modo oscuro.',
          'Modo presentación a pantalla completa con gestos o flechas de teclado.',
        ],
        notes: 'Demostrar el botón Reproducir en la barra superior del visor.',
      },
      {
        id: 's-4',
        index: 4,
        title: 'Hoja de ruta — Próximo trimestre',
        bullets: [
          'Anotaciones manuscritas sobre páginas PDF.',
          'Exportación directa de diapositivas PPTX a documento resumido.',
          'Sincronización offline prioritaria para documentos marcados como destacados.',
        ],
        notes: 'Confirmar fechas límite con el equipo de QA antes del cierre.',
      },
    ],
    comments: [],
  },
  {
    id: 'doc-ppt-1',
    title: 'Resumen Ejecutivo Legacy (Formato PPT)',
    format: 'PPT',
    folder: 'Archivo',
    starred: false,
    updatedAt: 'Ayer, 19:30',
    contentHtml: '',
    slides: [
      {
        id: 'sp-1',
        index: 1,
        title: 'Arquitectura de Compatibilidad Binaria (.ppt / .doc)',
        subtitle: 'Lectura segura en navegador sin ejecución de macros',
        bullets: [
          'Extracción de cadenas UTF-16LE y Latin-1 desde contenedores OLE2.',
          'Visualización estructurada por diapositivas y exportación a HTML.',
        ],
        notes: 'Este documento ilustra cómo el visor presenta archivos .ppt heredados.',
      },
      {
        id: 'sp-2',
        index: 2,
        title: 'Flujo de conversión segura',
        bullets: [
          'Lectura exclusiva en memoria (ArrayBuffer) sin envío a servidores.',
          'Conservación de encabezados, bloques de texto y orden de lectura.',
        ],
        notes: 'Recordar al usuario que puede importar archivos .ppt locales desde la pantalla principal.',
      },
    ],
    comments: [],
  },
  {
    id: 'doc-3',
    title: 'Guía de Estilo Editorial 2026',
    format: 'DOC',
    folder: 'Documentación',
    starred: false,
    updatedAt: '10 nov 2026',
    contentHtml:
      '<h1>Guía de Estilo Editorial</h1><p>Normas base para redactar especificaciones técnicas y manuales de usuario dentro de la suite documental en formato <strong>.doc</strong> compatible con Word.</p><h2>Jerarquía tipográfica</h2><p>Utilizar <strong>Título 1</strong> únicamente para el encabezado principal del documento y <strong>Título 2</strong> para cada sección temática.</p><p>Evitar bloques de texto superiores a cinco líneas sin subtítulos o viñetas que faciliten el escaneo en pantalla móvil.</p>',
    comments: [],
  },
  {
    id: 'doc-2',
    title: 'Minuta Semanal — Equipo Android',
    format: 'DOCX',
    folder: 'Reuniones',
    starred: false,
    updatedAt: 'Ayer, 17:05',
    contentHtml:
      '<h1>Minuta Semanal — Equipo Android</h1><p><strong>Asistentes:</strong> Elena, Marcos, Lucía y Javier.</p><h2>Temas revisados</h2><ol><li>Implementación de Buscar y Reemplazar con contador de coincidencias en vivo.</li><li>Soporte para inserción rápida de tablas editables y listas de verificación.</li><li>Visores nativos para PDF, PPT y PPTX integrados en el gestor.</li></ol><h2>Pendientes</h2><p>Revisar el contraste en modo oscuro para anotaciones resaltadas en amarillo.</p>',
    comments: [],
  },
  {
    id: 'doc-4',
    title: 'Notas Rápidas de Campo',
    format: 'TXT',
    folder: 'Personal',
    starred: false,
    updatedAt: '06 nov 2026',
    contentHtml:
      '<h1>Notas Rápidas de Campo</h1><p>Ideas iniciales para mejorar la experiencia de importación desde almacenamiento local (.pdf, .ppt, .pptx, .doc, .docx, .txt) directamente dentro del gestor de archivos.</p>',
    comments: [],
  },
];

export function computeDocStats(html: string): {
  words: number;
  chars: number;
  paragraphs: number;
  readMinutes: number;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  const rawText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  const words = rawText ? rawText.split(' ').filter(Boolean).length : 0;
  const chars = (doc.body.textContent || '').replace(/\n/g, '').length;
  const blockCount = doc.body.querySelectorAll('p, h1, h2, h3, li, blockquote, tr').length;
  const paragraphs = Math.max(words > 0 ? 1 : 0, blockCount);
  const readMinutes = Math.max(1, Math.ceil(words / 200));
  return { words, chars, paragraphs, readMinutes };
}
