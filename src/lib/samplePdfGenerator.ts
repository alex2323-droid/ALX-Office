/**
 * Generates a valid, self-contained multi-page PDF binary (PDF-1.4)
 * so the built-in sample PDF can be rendered page-by-page with pdfjs-dist.
 */
function sanitizePdfAscii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

interface PdfPageSpec {
  heading: string;
  subheading: string;
  lines: string[];
}

const SAMPLE_PDF_PAGES: PdfPageSpec[] = [
  {
    heading: 'Manual de Producto: WPS Office Android',
    subheading: 'Pagina 1 - Arquitectura del visor PDF y documentos',
    lines: [
      'Este documento PDF de muestra se renderiza pagina por pagina mediante pdfjs-dist.',
      'Caracteristicas clave del visor movil:',
      '- Renderizado de alta resolucion en lienzo canvas adaptado al ancho del dispositivo.',
      '- Modo de desplazamiento continuo o navegacion pagina por pagina.',
      '- Busqueda instantanea de texto con salto directo a la pagina coincidente.',
      '- Control de zoom tactil (75% a 200%) y filtro de lectura nocturna / sepia.',
      ' ',
      'Puedes abrir cualquier archivo .pdf desde tu equipo usando el boton Importar archivo.',
    ],
  },
  {
    heading: 'Compatibilidad Multi-Formato',
    subheading: 'Pagina 2 - Formatos soportados: PDF, PPT, PPTX, DOC y DOCX',
    lines: [
      '1. PDF (Portable Document Format):',
      '   Visualizacion fiel de paginas, miniaturas laterales y extraccion de texto.',
      '2. PPTX y PPT (Presentaciones):',
      '   Visor de diapositivas 16:9, tira inferior de miniaturas y notas del orador.',
      '3. DOCX y DOC (Documentos de texto):',
      '   Lectura con ajuste movil o vista A4, edicion enriquecida y exportacion.',
      ' ',
      'Todos los archivos procesados permanecen localmente en el navegador sin subirse a servidores.',
    ],
  },
  {
    heading: 'Guia de Lectura y Exportacion',
    subheading: 'Pagina 3 - Atajos y flujo de trabajo recomendado',
    lines: [
      'En dispositivos Android y pantallas tactiles:',
      '- Toca la barra inferior para cambiar de pagina, abrir miniaturas o ajustar zoom.',
      '- Usa el buscador superior para localizar palabras clave como "presentaciones" o "zoom".',
      '- Activa el modo Sepia o Noche para reducir el cansancio visual en lectura prolongada.',
      ' ',
      'Documento generado localmente para pruebas de visualizacion PDF.',
    ],
  },
];

export function buildSamplePdfBytes(): Uint8Array {
  const objects: string[] = [];

  // 1: Catalog, 2: Pages, 3: Font Helvetica, 4: Font Helvetica-Bold
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  let nextId = 5;
  for (let i = 0; i < SAMPLE_PDF_PAGES.length; i++) {
    pageObjectIds.push(nextId++);
    contentObjectIds.push(nextId++);
  }

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[3] =
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects[4] =
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  SAMPLE_PDF_PAGES.forEach((spec, idx) => {
    const pageId = pageObjectIds[idx];
    const contentId = contentObjectIds[idx];

    const streamOps: string[] = [
      '0.92 0.24 0.18 rg',
      '56 764 483 4 re f',
      '0.06 0.09 0.16 rg',
      'BT',
      '/F2 20 Tf',
      '56 730 Td',
      `(${sanitizePdfAscii(spec.heading)}) Tj`,
      '0 -24 Td',
      '/F1 12 Tf',
      '0.35 0.40 0.48 rg',
      `(${sanitizePdfAscii(spec.subheading)}) Tj`,
      '0.12 0.16 0.23 rg',
      '/F1 11 Tf',
      '0 -32 Td',
    ];

    for (const line of spec.lines) {
      streamOps.push(`(${sanitizePdfAscii(line)}) Tj`);
      streamOps.push('0 -20 Td');
    }

    streamOps.push('ET');
    streamOps.push('0.45 0.50 0.58 rg');
    streamOps.push('BT /F1 9 Tf 56 42 Td');
    streamOps.push(
      `(WPS Office Viewer - Pagina ${idx + 1} de ${SAMPLE_PDF_PAGES.length}) Tj ET`,
    );

    const streamData = streamOps.join('\n');
    objects[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
    objects[contentId] =
      `${contentId} 0 obj\n<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream\nendobj\n`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += objects[id];
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}
