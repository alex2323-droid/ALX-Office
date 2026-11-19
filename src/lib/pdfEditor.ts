import { PDFDocument, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';

export interface PdfTextAnnotation {
  id: string;
  kind: 'text';
  pageNumber: number;
  xPct: number;
  yPct: number;
  wPct?: number;
  hPct?: number;
  text: string;
  fontSize: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  fontFamily?: 'sans' | 'serif' | 'mono';
  opacity?: number;
  rotationDeg?: number;
  bgFill?: string;
  locked?: boolean;
  flippedX?: boolean;
  flippedY?: boolean;
  zIndex?: number;
}

export interface PdfDrawAnnotation {
  id: string;
  kind: 'draw';
  pageNumber: number;
  points: { xPct: number; yPct: number }[];
  color: string;
  strokeWidth: number;
  opacity?: number;
  locked?: boolean;
  zIndex?: number;
}

export interface PdfRectAnnotation {
  id: string;
  kind:
    | 'highlight'
    | 'redact'
    | 'box'
    | 'circle'
    | 'arrow'
    | 'line'
    | 'triangle'
    | 'star'
    | 'diamond'
    | 'badge';
  pageNumber: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  color: string;
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  rotationDeg?: number;
  borderRadiusPx?: number;
  locked?: boolean;
  flippedX?: boolean;
  flippedY?: boolean;
  zIndex?: number;
}

export interface PdfImageAnnotation {
  id: string;
  kind: 'image';
  pageNumber: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  src: string;
  opacity?: number;
  rotationDeg?: number;
  borderRadiusPx?: number;
  locked?: boolean;
  flippedX?: boolean;
  flippedY?: boolean;
  zIndex?: number;
}

export type PdfAnnotation =
  | PdfTextAnnotation
  | PdfDrawAnnotation
  | PdfRectAnnotation
  | PdfImageAnnotation;

function parseHexRgb(hex: string) {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return rgb(0.06, 0.09, 0.16);
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Standard PDF fonts (Helvetica) use WinAnsi encoding (CP1252).
 * Normalize common Unicode punctuation and strip unsupported glyphs so pdf-lib never throws.
 */
function sanitizeWinAnsi(input: string): string {
  const normalized = input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2022\u25AA\u25B8\u25CF\u25E6]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2191/g, '^')
    .replace(/\u2193/g, 'v')
    .replace(/[\u2713\u2714\u2611]/g, '[v]')
    .replace(/[\u2717\u2718\u2612]/g, '[x]')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2260/g, '!=')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/');

  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (
      code === 10 ||
      code === 13 ||
      (code >= 32 && code <= 126) ||
      (code >= 160 && code <= 255) ||
      code === 0x20ac
    ) {
      out += normalized[i];
    } else {
      out += '?';
    }
  }
  return out;
}

interface PageGeometry {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  rot: 0 | 90 | 180 | 270;
  visualW: number;
  visualH: number;
}

function getPageGeometry(page: PDFPage): PageGeometry {
  const box = page.getCropBox();
  const rawRot = ((page.getRotation().angle % 360) + 360) % 360;
  const rot = (rawRot === 90 || rawRot === 180 || rawRot === 270 ? rawRot : 0) as
    | 0
    | 90
    | 180
    | 270;
  const visualW = rot === 90 || rot === 270 ? box.height : box.width;
  const visualH = rot === 90 || rot === 270 ? box.width : box.height;
  return {
    cropX: box.x,
    cropY: box.y,
    cropW: box.width,
    cropH: box.height,
    rot,
    visualW,
    visualH,
  };
}

function visualUvToPdfPoint(
  geom: PageGeometry,
  u: number,
  v: number,
): { x: number; y: number } {
  switch (geom.rot) {
    case 90:
      return { x: geom.cropX + v, y: geom.cropY + u };
    case 180:
      return {
        x: geom.cropX + geom.cropW - u,
        y: geom.cropY + v,
      };
    case 270:
      return {
        x: geom.cropX + geom.cropW - v,
        y: geom.cropY + geom.cropH - u,
      };
    default:
      return {
        x: geom.cropX + u,
        y: geom.cropY + geom.cropH - v,
      };
  }
}

function visualPctToPdfPoint(
  geom: PageGeometry,
  xPct: number,
  yPct: number,
): { x: number; y: number } {
  const u = Math.max(0, Math.min(1, xPct)) * geom.visualW;
  const v = Math.max(0, Math.min(1, yPct)) * geom.visualH;
  return visualUvToPdfPoint(geom, u, v);
}

function visualRectToPdfBounds(
  geom: PageGeometry,
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number,
) {
  const p1 = visualPctToPdfPoint(geom, xPct, yPct);
  const p2 = visualPctToPdfPoint(geom, xPct + wPct, yPct + hPct);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

/**
 * Computes exact pdf-lib (x, y, rotateDeg) for a rectangle/image rotated CSS-clockwise
 * by `cssRotDeg` around its geometric center, matching on-screen transformOrigin: center.
 */
function centeredPdfRectTransform(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  pageRotDeg: number,
  cssRotDeg = 0,
): { x: number; y: number; rotateDeg: number } {
  const pdfThetaDeg = pageRotDeg - cssRotDeg;
  const rad = (pdfThetaDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    x: centerX - (halfW * cos - halfH * sin),
    y: centerY - (halfW * sin + halfH * cos),
    rotateDeg: pdfThetaDeg,
  };
}

function rotateVisualPoint(
  cx: number,
  cy: number,
  px: number,
  py: number,
  cssRotDeg = 0,
): { u: number; v: number } {
  if (!cssRotDeg) return { u: px, v: py };
  const rad = (cssRotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    u: cx + (dx * cos - dy * sin),
    v: cy + (dx * sin + dy * cos),
  };
}

export async function applyPdfEdits(
  pdfBytes: Uint8Array,
  annotations: PdfAnnotation[],
): Promise<Uint8Array> {
  if (annotations.length === 0) return pdfBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontHelveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const pages = pdfDoc.getPages();

  const sortedAnns = [...annotations].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  for (const ann of sortedAnns) {
    const page = pages[ann.pageNumber - 1];
    if (!page) continue;
    const geom = getPageGeometry(page);
    const opacity = ann.opacity !== undefined ? Math.max(0.05, Math.min(1, ann.opacity)) : 1;

    if (
      ann.kind === 'highlight' ||
      ann.kind === 'redact' ||
      ann.kind === 'box' ||
      ann.kind === 'circle' ||
      ann.kind === 'arrow' ||
      ann.kind === 'line' ||
      ann.kind === 'triangle' ||
      ann.kind === 'star' ||
      ann.kind === 'diamond' ||
      ann.kind === 'badge'
    ) {
      const boxW = Math.max(0, ann.wPct) * geom.visualW;
      const boxH = Math.max(0, ann.hPct) * geom.visualH;
      if (boxW <= 0 && boxH <= 0) continue;

      const cxU = (ann.xPct + ann.wPct / 2) * geom.visualW;
      const cyV = (ann.yPct + ann.hPct / 2) * geom.visualH;
      const pdfCenter = visualUvToPdfPoint(geom, cxU, cyV);
      const cssRot = ann.rotationDeg ?? 0;

      if (ann.kind === 'highlight') {
        const tr = centeredPdfRectTransform(
          pdfCenter.x,
          pdfCenter.y,
          boxW,
          boxH,
          geom.rot,
          cssRot,
        );
        page.drawRectangle({
          x: tr.x,
          y: tr.y,
          width: boxW,
          height: boxH,
          color: parseHexRgb(ann.color),
          opacity: Math.min(0.95, 0.34 * opacity),
          rotate: degrees(tr.rotateDeg),
        });
      } else if (ann.kind === 'redact') {
        const tr = centeredPdfRectTransform(
          pdfCenter.x,
          pdfCenter.y,
          boxW,
          boxH,
          geom.rot,
          cssRot,
        );
        page.drawRectangle({
          x: tr.x,
          y: tr.y,
          width: boxW,
          height: boxH,
          color: parseHexRgb(ann.color || '#FFFFFF'),
          opacity,
          rotate: degrees(tr.rotateDeg),
        });
      } else if (ann.kind === 'circle') {
        page.drawEllipse({
          x: pdfCenter.x,
          y: pdfCenter.y,
          xScale: Math.max(2, boxW / 2),
          yScale: Math.max(2, boxH / 2),
          borderColor: parseHexRgb(ann.color),
          borderWidth: ann.strokeWidth ?? 1.8,
          ...(ann.fillColor && ann.fillColor !== 'transparent'
            ? { color: parseHexRgb(ann.fillColor) }
            : {}),
          opacity,
          borderOpacity: opacity,
          rotate: degrees(geom.rot - cssRot),
        });
      } else if (ann.kind === 'line' || ann.kind === 'arrow') {
        const flipFactor = ann.flippedX ? -1 : 1;
        const leftUv = rotateVisualPoint(
          cxU,
          cyV,
          cxU - (boxW / 2) * flipFactor,
          cyV,
          cssRot,
        );
        const rightUv = rotateVisualPoint(
          cxU,
          cyV,
          cxU + (boxW / 2) * flipFactor,
          cyV,
          cssRot,
        );
        const startPt = visualUvToPdfPoint(geom, leftUv.u, leftUv.v);
        const endPt = visualUvToPdfPoint(geom, rightUv.u, rightUv.v);
        const thickness = ann.strokeWidth ?? 2;
        const lineColor = parseHexRgb(ann.color);
        page.drawLine({
          start: startPt,
          end: endPt,
          thickness,
          color: lineColor,
          opacity,
        });
        if (ann.kind === 'arrow') {
          const angle = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x);
          const headLen = Math.max(8, thickness * 4);
          page.drawLine({
            start: endPt,
            end: {
              x: endPt.x - headLen * Math.cos(angle - Math.PI / 6),
              y: endPt.y - headLen * Math.sin(angle - Math.PI / 6),
            },
            thickness,
            color: lineColor,
            opacity,
          });
          page.drawLine({
            start: endPt,
            end: {
              x: endPt.x - headLen * Math.cos(angle + Math.PI / 6),
              y: endPt.y - headLen * Math.sin(angle + Math.PI / 6),
            },
            thickness,
            color: lineColor,
            opacity,
          });
        }
      } else if (
        ann.kind === 'triangle' ||
        ann.kind === 'star' ||
        ann.kind === 'diamond'
      ) {
        const normPts: [number, number][] =
          ann.kind === 'triangle'
            ? [
                [0.5, 0.04],
                [0.96, 0.94],
                [0.04, 0.94],
              ]
            : ann.kind === 'diamond'
              ? [
                  [0.5, 0.04],
                  [0.96, 0.5],
                  [0.5, 0.96],
                  [0.04, 0.5],
                ]
              : [
                  [0.5, 0.04],
                  [0.63, 0.34],
                  [0.96, 0.38],
                  [0.71, 0.6],
                  [0.78, 0.94],
                  [0.5, 0.76],
                  [0.22, 0.94],
                  [0.29, 0.6],
                  [0.04, 0.38],
                  [0.37, 0.34],
                ];

        const u0 = ann.xPct * geom.visualW;
        const v0 = ann.yPct * geom.visualH;
        const ptsUv = normPts.map(([nx, ny]) => {
          const fx = ann.flippedX ? 1 - nx : nx;
          const fy = ann.flippedY ? 1 - ny : ny;
          return rotateVisualPoint(cxU, cyV, u0 + fx * boxW, v0 + fy * boxH, cssRot);
        });

        if (geom.rot === 0) {
          const svgD =
            ptsUv
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.u.toFixed(2)} ${p.v.toFixed(2)}`)
              .join(' ') + ' Z';
          page.drawSvgPath(svgD, {
            x: geom.cropX,
            y: geom.cropY + geom.cropH,
            borderColor: parseHexRgb(ann.color),
            borderWidth: ann.strokeWidth ?? 1.75,
            ...(ann.fillColor && ann.fillColor !== 'transparent'
              ? { color: parseHexRgb(ann.fillColor) }
              : {}),
            opacity,
            borderOpacity: opacity,
          });
        } else {
          const pdfPts = ptsUv.map((p) => visualUvToPdfPoint(geom, p.u, p.v));
          const strokeCol = parseHexRgb(ann.color);
          for (let i = 0; i < pdfPts.length; i++) {
            const a = pdfPts[i];
            const b = pdfPts[(i + 1) % pdfPts.length];
            page.drawLine({
              start: a,
              end: b,
              thickness: ann.strokeWidth ?? 1.75,
              color: strokeCol,
              opacity,
            });
          }
        }
      } else {
        // 'box' or 'badge'
        const tr = centeredPdfRectTransform(
          pdfCenter.x,
          pdfCenter.y,
          boxW,
          boxH,
          geom.rot,
          cssRot,
        );
        page.drawRectangle({
          x: tr.x,
          y: tr.y,
          width: boxW,
          height: boxH,
          borderColor: parseHexRgb(ann.color),
          borderWidth: ann.strokeWidth ?? 1.75,
          ...(ann.fillColor && ann.fillColor !== 'transparent'
            ? { color: parseHexRgb(ann.fillColor) }
            : {}),
          opacity,
          borderOpacity: opacity,
          rotate: degrees(tr.rotateDeg),
        });
      }
    } else if (ann.kind === 'image') {
      try {
        const boxW = Math.max(0, ann.wPct) * geom.visualW;
        const boxH = Math.max(0, ann.hPct) * geom.visualH;
        if (boxW <= 0 || boxH <= 0) continue;
        const cxU = (ann.xPct + ann.wPct / 2) * geom.visualW;
        const cyV = (ann.yPct + ann.hPct / 2) * geom.visualH;
        const pdfCenter = visualUvToPdfPoint(geom, cxU, cyV);
        const tr = centeredPdfRectTransform(
          pdfCenter.x,
          pdfCenter.y,
          boxW,
          boxH,
          geom.rot,
          ann.rotationDeg ?? 0,
        );

        const dataIdx = ann.src.indexOf(',');
        const base64Body = dataIdx >= 0 ? ann.src.slice(dataIdx + 1) : ann.src;
        const bin = atob(base64Body);
        const imgBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) imgBytes[i] = bin.charCodeAt(i);
        const embedded = /image\/png/i.test(ann.src)
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
        page.drawImage(embedded, {
          x: tr.x,
          y: tr.y,
          width: boxW,
          height: boxH,
          opacity,
          rotate: degrees(tr.rotateDeg),
        });
      } catch {
        // Ignore invalid/corrupt image embeds cleanly
      }
    } else if (ann.kind === 'draw') {
      if (ann.points.length < 2) continue;
      const color = parseHexRgb(ann.color);
      const thickness = Math.max(1, ann.strokeWidth);
      for (let i = 1; i < ann.points.length; i++) {
        const start = visualPctToPdfPoint(
          geom,
          ann.points[i - 1].xPct,
          ann.points[i - 1].yPct,
        );
        const end = visualPctToPdfPoint(
          geom,
          ann.points[i].xPct,
          ann.points[i].yPct,
        );
        page.drawLine({
          start,
          end,
          thickness,
          color,
          opacity: 0.95 * opacity,
        });
      }
    } else if (ann.kind === 'text') {
      const clean = sanitizeWinAnsi(ann.text);
      const lines = clean.split(/\r?\n/);
      const font =
        ann.fontFamily === 'serif'
          ? ann.bold
            ? fontTimesBold
            : fontTimes
          : ann.fontFamily === 'mono'
            ? ann.bold
              ? fontCourierBold
              : fontCourier
            : ann.bold && ann.italic
              ? fontHelveticaBoldOblique
              : ann.italic
                ? fontHelveticaOblique
                : ann.bold
                  ? fontHelveticaBold
                  : fontHelvetica;
      const size = Math.max(8, Math.min(72, ann.fontSize || 14));
      const lineHeight = size * 1.25;
      const color = parseHexRgb(ann.color);
      const cssRot = ann.rotationDeg ?? 0;

      const maxLineWidth = Math.max(
        24,
        ...lines.map((line) => font.widthOfTextAtSize(line || ' ', size)),
      );
      const boxW = ann.wPct ? ann.wPct * geom.visualW : maxLineWidth + 8;
      const boxH = ann.hPct ? ann.hPct * geom.visualH : lines.length * lineHeight + 6;
      const cxU = ann.xPct * geom.visualW + boxW / 2;
      const cyV = ann.yPct * geom.visualH + boxH / 2;

      if (ann.bgFill) {
        const pdfCenter = visualUvToPdfPoint(geom, cxU, cyV);
        const tr = centeredPdfRectTransform(
          pdfCenter.x,
          pdfCenter.y,
          boxW,
          boxH,
          geom.rot,
          cssRot,
        );
        page.drawRectangle({
          x: tr.x,
          y: tr.y,
          width: boxW,
          height: boxH,
          color: parseHexRgb(ann.bgFill),
          opacity,
          rotate: degrees(tr.rotateDeg),
        });
      }

      for (let idx = 0; idx < lines.length; idx++) {
        const lineText = lines[idx];
        if (!lineText) continue;
        const uLine = ann.xPct * geom.visualW + 4;
        const vBaseline =
          ann.yPct * geom.visualH + size * 0.92 + idx * lineHeight + 2;
        const rotatedStart = rotateVisualPoint(cxU, cyV, uLine, vBaseline, cssRot);
        const pt = visualUvToPdfPoint(geom, rotatedStart.u, rotatedStart.v);
        page.drawText(lineText, {
          x: pt.x,
          y: pt.y,
          size,
          font,
          color,
          opacity,
          rotate: degrees(geom.rot - cssRot),
        });
      }
    }
  }

  return pdfDoc.save();
}

export async function rotatePdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  deltaDeg: 90 | -90 = 90,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  if (!page) return pdfBytes;
  const current = page.getRotation().angle;
  const next = (((current + deltaDeg) % 360) + 360) % 360;
  page.setRotation(degrees(next));
  return pdfDoc.save();
}

export async function insertBlankPdfPage(
  pdfBytes: Uint8Array,
  afterPageIndex: number,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const refPage = pages[Math.max(0, Math.min(pages.length - 1, afterPageIndex))];
  const size = refPage ? refPage.getSize() : { width: 595.28, height: 841.89 };
  const insertAt = Math.max(0, Math.min(pages.length, afterPageIndex + 1));
  pdfDoc.insertPage(insertAt, [size.width, size.height]);
  return pdfDoc.save();
}

export async function deletePdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  if (pdfDoc.getPageCount() <= 1) return pdfBytes;
  if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) return pdfBytes;
  pdfDoc.removePage(pageIndex);
  return pdfDoc.save();
}

export async function movePdfPage(
  pdfBytes: Uint8Array,
  fromIndex: number,
  toIndex: number,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const count = srcDoc.getPageCount();
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= count ||
    toIndex >= count
  ) {
    return pdfBytes;
  }

  const order = Array.from({ length: count }, (_, i) => i);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);

  const outDoc = await PDFDocument.create();
  const copiedPages = await outDoc.copyPages(srcDoc, order);
  for (const p of copiedPages) {
    outDoc.addPage(p);
  }
  return outDoc.save();
}

export function buildEditableHtmlFromPdfPages(
  title: string,
  pages: { pageNumber: number; text: string }[],
): string {
  const escape = (val: string) =>
    val
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const body = pages
    .map((p) => {
      const content = p.text.trim()
        ? `<p>${escape(p.text.trim())}</p>`
        : '<p><em>(Página sin texto extraíble)</em></p>';
      return `<h2>Página ${p.pageNumber}</h2>${content}`;
    })
    .join('');

  return `<h1>${escape(title)}</h1>${body || '<p></p>'}`;
}

interface PdfTextItemLike {
  str?: string;
  transform?: number[];
  height?: number;
  width?: number;
  fontName?: string;
}

interface PdfPageLike {
  getTextContent: () => Promise<{
    items: Array<PdfTextItemLike | object>;
    styles?: Record<string, { fontFamily?: string }>;
  }>;
}

interface PdfProxyLike {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Extracts one structured HTML document per page (<h1>, <h2>, <ul>, <ol>, <p>, <strong>)
 * from a pdfjs document proxy so each PDF page can be edited directly in place.
 */
export async function extractStructuredHtmlPerPage(
  pdfDoc: PdfProxyLike,
  fallbackTitle: string,
): Promise<string[]> {
  interface RawLine {
    pageNumber: number;
    y: number;
    fontSize: number;
    isBold: boolean;
    text: string;
  }

  const allLines: RawLine[] = [];
  const fontSizeSamples: number[] = [];

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const styles = content.styles || {};

    interface ItemRun {
      x: number;
      y: number;
      fontSize: number;
      isBold: boolean;
      text: string;
    }

    const runs: ItemRun[] = [];
    for (const rawItem of content.items) {
      const raw = rawItem as PdfTextItemLike;
      const text = typeof raw.str === 'string' ? raw.str : '';
      if (!text.trim()) continue;
      const tr = raw.transform || [1, 0, 0, 12, 0, 0];
      const measuredSize = Math.max(
        raw.height || 0,
        Math.hypot(tr[2] || 0, tr[3] || 0),
      );
      const fontSize = Math.max(
        6,
        Math.round((measuredSize || 11) * 10) / 10,
      );
      const fontFamily =
        (raw.fontName && styles[raw.fontName]?.fontFamily) ||
        raw.fontName ||
        '';
      const isBold = /bold|black|heavy|semibold|demi|f2/i.test(fontFamily);
      runs.push({
        x: tr[4] || 0,
        y: tr[5] || 0,
        fontSize,
        isBold,
        text,
      });
      const weight = Math.max(1, Math.min(40, text.trim().length));
      for (let w = 0; w < weight; w++) {
        fontSizeSamples.push(fontSize);
      }
    }

    // Group runs into lines by y-coordinate
    runs.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageLines: { y: number; runs: ItemRun[] }[] = [];

    for (const run of runs) {
      const tolerance = Math.max(3.5, run.fontSize * 0.45);
      const match = pageLines.find((ln) => Math.abs(ln.y - run.y) <= tolerance);
      if (match) {
        match.runs.push(run);
      } else {
        pageLines.push({ y: run.y, runs: [run] });
      }
    }

    pageLines.sort((a, b) => b.y - a.y);

    for (const ln of pageLines) {
      ln.runs.sort((a, b) => a.x - b.x);
      const text = ln.runs
        .map((r) => r.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      // Skip synthetic viewer footer lines on re-extraction
      if (
        /^(ALX Office|WPS Office Viewer)\s*[·-]\s*P[aá]gina\s+\d+\s+de\s+\d+$/i.test(
          text,
        )
      ) {
        continue;
      }
      const avgSize =
        ln.runs.reduce((acc, r) => acc + r.fontSize, 0) / ln.runs.length;
      const boldChars = ln.runs
        .filter((r) => r.isBold)
        .reduce((acc, r) => acc + r.text.length, 0);
      const totalChars = Math.max(1, text.length);

      allLines.push({
        pageNumber: p,
        y: ln.y,
        fontSize: avgSize,
        isBold: boldChars / totalChars >= 0.6,
        text,
      });
    }
  }

  const pageCount = Math.max(1, pdfDoc.numPages);
  if (allLines.length === 0) {
    return Array.from({ length: pageCount }, (_, i) =>
      i === 0
        ? `<h1>${escapeHtmlText(fallbackTitle)}</h1><p>Página sin texto seleccionable. Escribe aquí para editar contenido o cambia a Anotar sobre el PDF.</p>`
        : '<p></p>',
    );
  }

  fontSizeSamples.sort((a, b) => a - b);
  const medianSize =
    fontSizeSamples[Math.floor(fontSizeSamples.length / 2)] || 11;

  const resultPages: string[] = [];

  for (let p = 1; p <= pageCount; p++) {
    const lines = allLines.filter((ln) => ln.pageNumber === p);
    if (lines.length === 0) {
      resultPages.push('<p></p>');
      continue;
    }

    const htmlParts: string[] = [];
    let openList: 'ul' | 'ol' | null = null;
    let paragraphBuf: string[] = [];
    let prevLine: RawLine | null = null;

    const flushParagraph = () => {
      if (paragraphBuf.length > 0) {
        htmlParts.push(`<p>${paragraphBuf.join(' ')}</p>`);
        paragraphBuf = [];
      }
    };

    const closeList = () => {
      if (openList) {
        htmlParts.push(`</${openList}>`);
        openList = null;
      }
    };

    for (const line of lines) {
      const bulletMatch = line.text.match(/^[•\-*▪▸]\s+(.*)$/);
      const numMatch = line.text.match(/^\d{1,2}[.)]\s+(.*)$/);
      const isH1 = line.fontSize >= medianSize * 1.45;
      const isH2 = !isH1 && line.fontSize >= medianSize * 1.18;

      if (isH1) {
        flushParagraph();
        closeList();
        htmlParts.push(`<h1>${escapeHtmlText(line.text)}</h1>`);
        prevLine = line;
        continue;
      }

      if (isH2) {
        flushParagraph();
        closeList();
        htmlParts.push(`<h2>${escapeHtmlText(line.text)}</h2>`);
        prevLine = line;
        continue;
      }

      if (bulletMatch) {
        flushParagraph();
        if (openList !== 'ul') {
          closeList();
          htmlParts.push('<ul>');
          openList = 'ul';
        }
        htmlParts.push(`<li>${escapeHtmlText(bulletMatch[1])}</li>`);
        prevLine = line;
        continue;
      }

      if (numMatch) {
        flushParagraph();
        if (openList !== 'ol') {
          closeList();
          htmlParts.push('<ol>');
          openList = 'ol';
        }
        htmlParts.push(`<li>${escapeHtmlText(numMatch[1])}</li>`);
        prevLine = line;
        continue;
      }

      closeList();
      const yGap = prevLine ? prevLine.y - line.y : 0;
      const shouldBreakParagraph =
        prevLine !== null && yGap > line.fontSize * 1.9;
      if (shouldBreakParagraph) {
        flushParagraph();
      }

      const formatted = line.isBold
        ? `<strong>${escapeHtmlText(line.text)}</strong>`
        : escapeHtmlText(line.text);
      paragraphBuf.push(formatted);
      prevLine = line;
    }

    flushParagraph();
    closeList();
    resultPages.push(htmlParts.join('') || '<p></p>');
  }

  return resultPages;
}

/**
 * Extracts structured HTML (<h1>, <h2>, <ul>, <ol>, <p>, <strong>) from a pdfjs document proxy
 * by analyzing line y-coordinates, font heights, and bold font metadata.
 */
export async function extractStructuredHtmlFromPdfProxy(
  pdfDoc: PdfProxyLike,
  fallbackTitle: string,
): Promise<string> {
  const pages = await extractStructuredHtmlPerPage(pdfDoc, fallbackTitle);
  return pages.join('<hr />') || `<h1>${escapeHtmlText(fallbackTitle)}</h1><p></p>`;
}

interface StyledRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough?: boolean;
  color: string;
  bgColor?: string;
}

function parseColorString(val: string | null | undefined): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const toHex = (n: string) =>
      Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  return undefined;
}

function collectInlineRuns(
  node: Node,
  inherited: Omit<StyledRun, 'text'>,
  out: StyledRun[],
) {
  if (node.nodeType === 3) {
    const raw = node.textContent || '';
    if (raw) {
      out.push({ text: raw, ...inherited });
    }
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    out.push({ text: '\n', ...inherited });
    return;
  }

  if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') {
    const checked = (el as HTMLInputElement).checked;
    out.push({ text: checked ? '[x] ' : '[ ] ', ...inherited });
    return;
  }

  const nextStyle = { ...inherited };
  if (tag === 'strong' || tag === 'b') nextStyle.bold = true;
  if (tag === 'em' || tag === 'i') nextStyle.italic = true;
  if (tag === 'u' || tag === 'a') nextStyle.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') {
    nextStyle.strikethrough = true;
  }
  if (tag === 'a' && !el.style?.color) nextStyle.color = '#2563eb';

  const inlineColor = parseColorString(el.style?.color);
  if (inlineColor) nextStyle.color = inlineColor;
  const inlineBg = parseColorString(el.style?.backgroundColor);
  if (inlineBg) nextStyle.bgColor = inlineBg;

  for (let i = 0; i < el.childNodes.length; i++) {
    collectInlineRuns(el.childNodes[i], nextStyle, out);
  }
}

function decodeDataUrlBytes(dataUrl: string): {
  mime: 'png' | 'jpg';
  bytes: Uint8Array;
} | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  const kind = match[1].toLowerCase() === 'png' ? 'png' : 'jpg';
  const b64 = match[2];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mime: kind, bytes };
}

/**
 * Compiles one HTML string per PDF page into a multi-page A4 PDF binary using pdf-lib,
 * keeping each page aligned to its source page while wrapping overflow cleanly.
 */
export async function buildPdfBytesFromPageHtmls(
  title: string,
  pageHtmls: string[],
): Promise<Uint8Array> {
  const chunks = pageHtmls.length > 0 ? pageHtmls : ['<p></p>'];
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(sanitizeWinAnsi(title || 'Documento'));

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await pdfDoc.embedFont(
    StandardFonts.HelveticaBoldOblique,
  );

  const pickFont = (bold: boolean, italic: boolean) => {
    if (bold && italic) return fontBoldItalic;
    if (bold) return fontBold;
    if (italic) return fontItalic;
    return fontRegular;
  };

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 56;
  const topY = pageHeight - 56;
  const bottomY = 56;
  const contentWidth = pageWidth - marginX * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = topY;

  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight < bottomY) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      cursorY = topY;
    }
  };

  interface Token {
    text: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough?: boolean;
    color: string;
    bgColor?: string;
    width: number;
  }

  const wrapRuns = (
    runs: StyledRun[],
    fontSize: number,
    maxWidth: number,
  ): Token[][] => {
    const lines: Token[][] = [[]];
    let currentLineWidth = 0;

    for (const run of runs) {
      const clean = sanitizeWinAnsi(run.text);
      const segments = clean.split('\n');

      for (let sIdx = 0; sIdx < segments.length; sIdx++) {
        if (sIdx > 0) {
          lines.push([]);
          currentLineWidth = 0;
        }
        const seg = segments[sIdx];
        if (!seg) continue;

        const words = seg.split(/(\s+)/);
        const font = pickFont(run.bold, run.italic);

        for (const word of words) {
          if (!word) continue;
          const isSpace = /^\s+$/.test(word);
          if (isSpace && lines[lines.length - 1].length === 0) continue;
          const w = font.widthOfTextAtSize(word, fontSize);

          if (
            !isSpace &&
            lines[lines.length - 1].length > 0 &&
            currentLineWidth + w > maxWidth
          ) {
            lines.push([]);
            currentLineWidth = 0;
          }

          lines[lines.length - 1].push({
            text: word,
            bold: run.bold,
            italic: run.italic,
            underline: run.underline,
            strikethrough: run.strikethrough,
            color: run.color,
            bgColor: run.bgColor,
            width: w,
          });
          currentLineWidth += w;
        }
      }
    }

    return lines;
  };

  const drawWrappedRuns = (
    runs: StyledRun[],
    opts: {
      fontSize: number;
      lineHeight: number;
      x: number;
      maxWidth: number;
      align?: 'left' | 'center' | 'right' | 'justify';
      blockquote?: boolean;
      spaceAfter?: number;
      prefix?: string;
    },
  ) => {
    const wrapped = wrapRuns(runs, opts.fontSize, opts.maxWidth);
    if (wrapped.length === 0) return;

    for (let i = 0; i < wrapped.length; i++) {
      ensureSpace(opts.lineHeight);
      const tokens = wrapped[i];
      const trimmedTokens = [...tokens];
      while (
        trimmedTokens.length > 0 &&
        /^\s+$/.test(trimmedTokens[trimmedTokens.length - 1].text)
      ) {
        trimmedTokens.pop();
      }

      const lineW = trimmedTokens.reduce((sum, t) => sum + t.width, 0);

      if (opts.blockquote) {
        page.drawRectangle({
          x: opts.x - 10,
          y: cursorY - opts.lineHeight + 3,
          width: opts.maxWidth + 20,
          height: opts.lineHeight + 2,
          color: rgb(0.95, 0.96, 0.98),
        });
      }

      let drawX = opts.x;
      if (opts.align === 'center') {
        drawX = opts.x + Math.max(0, (opts.maxWidth - lineW) / 2);
      } else if (opts.align === 'right') {
        drawX = opts.x + Math.max(0, opts.maxWidth - lineW);
      }

      const textY = cursorY - opts.fontSize;

      if (i === 0 && opts.prefix) {
        page.drawText(sanitizeWinAnsi(opts.prefix), {
          x: opts.x - 14,
          y: textY,
          size: opts.fontSize,
          font: fontBold,
          color: rgb(0.2, 0.25, 0.33),
        });
      }

      for (const tok of trimmedTokens) {
        if (tok.bgColor) {
          page.drawRectangle({
            x: drawX,
            y: textY - 2,
            width: tok.width,
            height: opts.fontSize + 4,
            color: parseHexRgb(tok.bgColor),
          });
        }
        const font = pickFont(tok.bold, tok.italic);
        const color = parseHexRgb(tok.color);
        if (tok.text.trim()) {
          page.drawText(tok.text, {
            x: drawX,
            y: textY,
            size: opts.fontSize,
            font,
            color,
          });
          if (tok.underline) {
            page.drawLine({
              start: { x: drawX, y: textY - 1.5 },
              end: { x: drawX + tok.width, y: textY - 1.5 },
              thickness: 0.8,
              color,
            });
          }
          if (tok.strikethrough) {
            page.drawLine({
              start: { x: drawX, y: textY + opts.fontSize * 0.32 },
              end: { x: drawX + tok.width, y: textY + opts.fontSize * 0.32 },
              thickness: 0.8,
              color,
            });
          }
        }
        drawX += tok.width;
      }

      cursorY -= opts.lineHeight;
    }

    if (opts.spaceAfter) {
      cursorY -= opts.spaceAfter;
    }
  };

  const renderElement = async (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();
    const textAlignRaw = el.style?.textAlign || '';
    const align: 'left' | 'center' | 'right' | 'justify' =
      textAlignRaw === 'center' ||
      textAlignRaw === 'right' ||
      textAlignRaw === 'justify'
        ? textAlignRaw
        : 'left';

    if (tag === 'h1') {
      const runs: StyledRun[] = [];
      collectInlineRuns(
        el,
        { bold: true, italic: false, underline: false, color: '#0f172a' },
        runs,
      );
      ensureSpace(34);
      cursorY -= 4;
      drawWrappedRuns(runs, {
        fontSize: 20,
        lineHeight: 26,
        x: marginX,
        maxWidth: contentWidth,
        align,
        spaceAfter: 10,
      });
      return;
    }

    if (tag === 'h2') {
      const runs: StyledRun[] = [];
      collectInlineRuns(
        el,
        { bold: true, italic: false, underline: false, color: '#0f172a' },
        runs,
      );
      ensureSpace(26);
      cursorY -= 6;
      drawWrappedRuns(runs, {
        fontSize: 15,
        lineHeight: 21,
        x: marginX,
        maxWidth: contentWidth,
        align,
        spaceAfter: 7,
      });
      return;
    }

    if (tag === 'h3') {
      const runs: StyledRun[] = [];
      collectInlineRuns(
        el,
        { bold: true, italic: false, underline: false, color: '#1e293b' },
        runs,
      );
      ensureSpace(22);
      cursorY -= 4;
      drawWrappedRuns(runs, {
        fontSize: 12.5,
        lineHeight: 18,
        x: marginX,
        maxWidth: contentWidth,
        align,
        spaceAfter: 5,
      });
      return;
    }

    if (tag === 'blockquote') {
      const runs: StyledRun[] = [];
      collectInlineRuns(
        el,
        { bold: false, italic: true, underline: false, color: '#334155' },
        runs,
      );
      cursorY -= 4;
      drawWrappedRuns(runs, {
        fontSize: 11,
        lineHeight: 17,
        x: marginX + 12,
        maxWidth: contentWidth - 24,
        align,
        blockquote: true,
        spaceAfter: 10,
      });
      return;
    }

    if (tag === 'hr') {
      ensureSpace(18);
      cursorY -= 6;
      page.drawLine({
        start: { x: marginX, y: cursorY },
        end: { x: marginX + contentWidth, y: cursorY },
        thickness: 0.8,
        color: rgb(0.8, 0.84, 0.89),
      });
      cursorY -= 12;
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.children).filter(
        (c) => c.tagName.toLowerCase() === 'li',
      ) as HTMLElement[];
      for (let i = 0; i < items.length; i++) {
        const runs: StyledRun[] = [];
        collectInlineRuns(
          items[i],
          { bold: false, italic: false, underline: false, color: '#1e293b' },
          runs,
        );
        drawWrappedRuns(runs, {
          fontSize: 11,
          lineHeight: 16.5,
          x: marginX + 18,
          maxWidth: contentWidth - 18,
          prefix: tag === 'ol' ? `${i + 1}.` : '-',
          spaceAfter: 3,
        });
      }
      cursorY -= 6;
      return;
    }

    if (tag === 'table') {
      const trs = Array.from(el.querySelectorAll('tr'));
      if (trs.length === 0) return;
      const colCount = Math.max(
        1,
        ...trs.map((tr) => tr.querySelectorAll('th, td').length),
      );
      const colWidth = contentWidth / colCount;
      const cellPadX = 6;
      const cellPadY = 5;
      const cellFontSize = 10;
      const cellLineHeight = 14;

      cursorY -= 4;
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll('th, td')) as HTMLElement[];
        const isHeader = cells.some((c) => c.tagName.toLowerCase() === 'th');
        const trBgHex = parseColorString(tr.style?.backgroundColor);
        const cellBgHexes = cells.map(
          (cell) =>
            parseColorString(cell.style?.backgroundColor) ||
            trBgHex ||
            (isHeader ? '#F2F5FA' : '#FFFFFF'),
        );
        const wrappedCells = cells.map((cell, cIdx) => {
          const bgHex = cellBgHexes[cIdx] || '#FFFFFF';
          const clean = bgHex.replace('#', '');
          const isDarkBg =
            /^[0-9a-fA-F]{6}$/.test(clean) &&
            (0.299 * parseInt(clean.slice(0, 2), 16) +
              0.587 * parseInt(clean.slice(2, 4), 16) +
              0.114 * parseInt(clean.slice(4, 6), 16)) /
              255 <
              0.48;
          const runs: StyledRun[] = [];
          collectInlineRuns(
            cell,
            {
              bold: isHeader,
              italic: false,
              underline: false,
              color: isDarkBg ? '#FFFFFF' : '#0f172a',
            },
            runs,
          );
          const adjustedRuns = runs.map((r) => {
            const cHex = r.color.replace('#', '');
            if (!/^[0-9a-fA-F]{6}$/.test(cHex)) return r;
            const lum =
              (0.299 * parseInt(cHex.slice(0, 2), 16) +
                0.587 * parseInt(cHex.slice(2, 4), 16) +
                0.114 * parseInt(cHex.slice(4, 6), 16)) /
              255;
            if (!isDarkBg && lum > 0.78) {
              return { ...r, color: '#0f172a' };
            }
            if (isDarkBg && lum < 0.35) {
              return { ...r, color: '#ffffff' };
            }
            return r;
          });
          return wrapRuns(adjustedRuns, cellFontSize, Math.max(20, colWidth - cellPadX * 2));
        });

        const maxLines = Math.max(1, ...wrappedCells.map((wc) => wc.length));
        const rowHeight = maxLines * cellLineHeight + cellPadY * 2;
        ensureSpace(rowHeight);

        for (let c = 0; c < colCount; c++) {
          const cellX = marginX + c * colWidth;
          const cellYBottom = cursorY - rowHeight;
          const bgHex = cellBgHexes[c] || (isHeader ? '#F2F5FA' : '#FFFFFF');

          page.drawRectangle({
            x: cellX,
            y: cellYBottom,
            width: colWidth,
            height: rowHeight,
            color: parseHexRgb(bgHex),
            borderColor: rgb(0.8, 0.84, 0.89),
            borderWidth: 0.75,
          });

          const cellLines = wrappedCells[c] || [];
          for (let li = 0; li < cellLines.length; li++) {
            let tx = cellX + cellPadX;
            const ty = cursorY - cellPadY - cellFontSize - li * cellLineHeight;
            for (const tok of cellLines[li]) {
              if (tok.text.trim()) {
                page.drawText(tok.text, {
                  x: tx,
                  y: ty,
                  size: cellFontSize,
                  font: pickFont(tok.bold, tok.italic),
                  color: parseHexRgb(tok.color),
                });
              }
              tx += tok.width;
            }
          }
        }
        cursorY -= rowHeight;
      }
      cursorY -= 10;
      return;
    }

    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      const decoded = decodeDataUrlBytes(src);
      if (decoded) {
        try {
          const embedded =
            decoded.mime === 'png'
              ? await pdfDoc.embedPng(decoded.bytes)
              : await pdfDoc.embedJpg(decoded.bytes);
          const scale = Math.min(1, contentWidth / embedded.width, 260 / embedded.height);
          const drawW = embedded.width * scale;
          const drawH = embedded.height * scale;
          ensureSpace(drawH + 10);
          page.drawImage(embedded, {
            x: marginX,
            y: cursorY - drawH,
            width: drawW,
            height: drawH,
          });
          cursorY -= drawH + 10;
        } catch {
          // Ignore unreadable image payloads
        }
      }
      return;
    }

    // Check if container wraps block children (like <div> with nested <p>/<img>)
    const blockTags = new Set([
      'p',
      'div',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'blockquote',
      'table',
      'hr',
      'img',
    ]);
    const hasBlockChild = Array.from(el.children).some((c) =>
      blockTags.has(c.tagName.toLowerCase()),
    );
    if (hasBlockChild) {
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i];
        if (child.nodeType === 1) {
          await renderElement(child as HTMLElement);
        } else if (child.nodeType === 3 && child.textContent?.trim()) {
          drawWrappedRuns(
            [
              {
                text: child.textContent.trim(),
                bold: false,
                italic: false,
                underline: false,
                color: '#1e293b',
              },
            ],
            {
              fontSize: 11,
              lineHeight: 17,
              x: marginX,
              maxWidth: contentWidth,
              spaceAfter: 6,
            },
          );
        }
      }
      return;
    }

    const runs: StyledRun[] = [];
    collectInlineRuns(
      el,
      { bold: false, italic: false, underline: false, color: '#1e293b' },
      runs,
    );
    if (runs.some((r) => r.text.trim())) {
      drawWrappedRuns(runs, {
        fontSize: 11,
        lineHeight: 17,
        x: marginX,
        maxWidth: contentWidth,
        align,
        spaceAfter: 7,
      });
    }
  };

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    if (chunkIdx > 0) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      cursorY = topY;
    }
    const html = chunks[chunkIdx] || '<p></p>';

    if (typeof DOMParser !== 'undefined') {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      for (let i = 0; i < parsed.body.childNodes.length; i++) {
        const node = parsed.body.childNodes[i];
        if (node.nodeType === 1) {
          await renderElement(node as HTMLElement);
        } else if (node.nodeType === 3 && node.textContent?.trim()) {
          drawWrappedRuns(
            [
              {
                text: node.textContent.trim(),
                bold: false,
                italic: false,
                underline: false,
                color: '#1e293b',
              },
            ],
            {
              fontSize: 11,
              lineHeight: 17,
              x: marginX,
              maxWidth: contentWidth,
              spaceAfter: 7,
            },
          );
        }
      }
    } else {
      // Fallback for non-DOM environments (Node smoke tests)
      const plain = html
        .replace(/<\/(h[1-3]|p|li|tr|blockquote|div)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+\n/g, '\n')
        .trim();
      for (const para of plain.split(/\n+/)) {
        if (!para.trim()) continue;
        drawWrappedRuns(
          [
            {
              text: para.trim(),
              bold: false,
              italic: false,
              underline: false,
              color: '#1e293b',
            },
          ],
          {
            fontSize: 11,
            lineHeight: 17,
            x: marginX,
            maxWidth: contentWidth,
            spaceAfter: 7,
          },
        );
      }
    }
  }

  // Quiet footer pagination across all pages
  const allPages = pdfDoc.getPages();
  allPages.forEach((p, idx) => {
    p.drawText(
      sanitizeWinAnsi(`ALX Office · Página ${idx + 1} de ${allPages.length}`),
      {
        x: marginX,
        y: 28,
        size: 9,
        font: fontRegular,
        color: rgb(0.45, 0.5, 0.58),
      },
    );
  });

  return pdfDoc.save();
}

/**
 * Compiles rich Word-style HTML into a multi-page A4 PDF binary using pdf-lib.
 */
export async function buildPdfBytesFromHtml(
  title: string,
  html: string,
): Promise<Uint8Array> {
  return buildPdfBytesFromPageHtmls(title, [html]);
}

