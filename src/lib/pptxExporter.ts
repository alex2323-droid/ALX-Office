import JSZip from 'jszip';
import type { WpsDocument, WpsSlide, WpsSlideElement } from '../data/wpsDocuments';

const SLIDE_W_EMU = 9144000; // 10 in (16:9 widescreen 960x540)
const SLIDE_H_EMU = 5143500; // 5.625 in

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeHexColor(hex?: string, fallback = '0F172A'): string {
  if (!hex || hex === 'transparent') return fallback;
  const trimmed = hex.trim();
  const clean = trimmed.replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return clean.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return clean
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
  }
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const toHex = (n: string) =>
      Math.max(0, Math.min(255, Number(n) || 0))
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();
    return `${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  const embeddedHex = trimmed.match(/#([0-9a-fA-F]{6})/);
  if (embeddedHex) return embeddedHex[1].toUpperCase();
  return fallback;
}

function isDarkNormalizedHex(hex6: string): boolean {
  if (!/^[0-9A-F]{6}$/i.test(hex6)) return false;
  const r = parseInt(hex6.slice(0, 2), 16);
  const g = parseInt(hex6.slice(2, 4), 16);
  const b = parseInt(hex6.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.48;
}

function htmlToPlainLines(html: string): string[] {
  if (!html) return [];
  if (typeof window === 'undefined') {
    return html
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const div = window.document.createElement('div');
  div.innerHTML = html;
  const items = Array.from(div.querySelectorAll('li, p, h1, h2, h3, blockquote'))
    .map((el) => (el.textContent || '').trim())
    .filter(Boolean);
  if (items.length > 0) return items;
  return (div.innerText || div.textContent || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pctToEmu(pct: number, total: number): number {
  return Math.max(0, Math.round((pct / 100) * total));
}

function mapPresetGeom(shapeKind?: string): string {
  switch (shapeKind) {
    case 'ellipse':
      return 'ellipse';
    case 'roundRect':
    case 'badge':
      return 'roundRect';
    case 'triangle':
      return 'triangle';
    case 'star':
      return 'star5';
    case 'arrowRight':
      return 'rightArrow';
    case 'diamond':
      return 'diamond';
    case 'line':
      return 'line';
    default:
      return 'rect';
  }
}

function mapAlign(align?: string): string {
  switch (align) {
    case 'center':
      return 'ctr';
    case 'right':
      return 'r';
    case 'justify':
      return 'just';
    default:
      return 'l';
  }
}

function buildTextParagraphsXml(
  lines: string[],
  opts: {
    fontSizePt: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    align?: string;
    fontFamily?: string;
  },
): string {
  const sz = Math.max(800, Math.min(12000, Math.round(opts.fontSizePt * 100)));
  const colorHex = normalizeHexColor(opts.color, '0F172A');
  const algn = mapAlign(opts.align);
  const typeface = escapeXml(opts.fontFamily || 'Plus Jakarta Sans');
  const safeLines = lines.length > 0 ? lines : [''];

  return safeLines
    .map(
      (line) => `<a:p>
        <a:pPr algn="${algn}"/>
        <a:r>
          <a:rPr lang="es-ES" sz="${sz}" b="${opts.bold ? 1 : 0}" i="${opts.italic ? 1 : 0}" dirty="0">
            <a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill>
            <a:latin typeface="${typeface}"/>
          </a:rPr>
          <a:t>${escapeXml(line)}</a:t>
        </a:r>
      </a:p>`,
    )
    .join('');
}

function buildSlideShapeXml(
  idNum: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  opts: {
    geom?: string;
    rotDeg?: number;
    fillHex?: string;
    borderHex?: string;
    borderWidthPx?: number;
    paragraphsXml?: string;
  },
): string {
  const rotAttr = opts.rotDeg ? ` rot="${Math.round(opts.rotDeg * 60000)}"` : '';
  const geom = opts.geom || 'rect';
  const fillXml =
    opts.fillHex && opts.fillHex !== 'transparent'
      ? `<a:solidFill><a:srgbClr val="${normalizeHexColor(opts.fillHex)}"/></a:solidFill>`
      : '<a:noFill/>';
  const borderXml =
    opts.borderHex && opts.borderHex !== 'transparent'
      ? `<a:ln w="${Math.round((opts.borderWidthPx ?? 1.5) * 12700)}"><a:solidFill><a:srgbClr val="${normalizeHexColor(opts.borderHex)}"/></a:solidFill></a:ln>`
      : '<a:ln><a:noFill/></a:ln>';

  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${idNum}" name="${escapeXml(name)}"/>
      <p:cNvSpPr/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm${rotAttr}>
        <a:off x="${x}" y="${y}"/>
        <a:ext cx="${Math.max(10000, cx)}" cy="${Math.max(10000, cy)}"/>
      </a:xfrm>
      <a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>
      ${fillXml}
      ${borderXml}
    </p:spPr>
    ${
      opts.paragraphsXml
        ? `<p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>${opts.paragraphsXml}</p:txBody>`
        : '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="es-ES"/></a:p></p:txBody>'
    }
  </p:sp>`;
}

function buildSlideTableXml(
  idNum: number,
  headers: string[],
  rows: string[][],
  x: number,
  y: number,
  cx: number,
  cy: number,
  headerBgHex = 'F1F5F9',
  headerTextHex?: string,
  cellBgHex = 'FFFFFF',
): string {
  const colCount = Math.max(1, headers.length);
  const colW = Math.max(100000, Math.round(cx / colCount));
  const rowCount = Math.max(1, rows.length + 1);
  const rowH = Math.max(250000, Math.round(cy / rowCount));

  const resolvedHeaderBg = normalizeHexColor(headerBgHex, 'F1F5F9');
  const resolvedHeaderText = headerTextHex
    ? normalizeHexColor(headerTextHex, '0F172A')
    : isDarkNormalizedHex(resolvedHeaderBg)
      ? 'FFFFFF'
      : '0F172A';
  const resolvedCellBg = normalizeHexColor(cellBgHex, 'FFFFFF');
  const resolvedCellText = isDarkNormalizedHex(resolvedCellBg) ? 'F8FAFC' : '0F172A';

  const gridCols = Array.from({ length: colCount })
    .map(() => `<a:gridCol w="${colW}"/>`)
    .join('');

  const makeRow = (cells: string[], isHeader: boolean) => {
    const tcs = Array.from({ length: colCount })
      .map((_, cIdx) => {
        const text = cells[cIdx] ?? '';
        return `<a:tc>
          <a:txBody>
            <a:bodyPr/>
            <a:lstStyle/>
            <a:p>
              <a:r>
                <a:rPr lang="es-ES" sz="1100" b="${isHeader ? 1 : 0}">
                  <a:solidFill><a:srgbClr val="${isHeader ? resolvedHeaderText : resolvedCellText}"/></a:solidFill>
                </a:rPr>
                <a:t>${escapeXml(text)}</a:t>
              </a:r>
            </a:p>
          </a:txBody>
          <a:tcPr>
            <a:solidFill><a:srgbClr val="${isHeader ? resolvedHeaderBg : resolvedCellBg}"/></a:solidFill>
          </a:tcPr>
        </a:tc>`;
      })
      .join('');
    return `<a:tr h="${rowH}">${tcs}</a:tr>`;
  };

  return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      <p:cNvPr id="${idNum}" name="Tabla ${idNum}"/>
      <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
      <p:nvPr/>
    </p:nvGraphicFramePr>
    <p:xfrm>
      <a:off x="${x}" y="${y}"/>
      <a:ext cx="${Math.max(200000, cx)}" cy="${Math.max(200000, cy)}"/>
    </p:xfrm>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblPr firstRow="1" bandRow="1"/>
          <a:tblGrid>${gridCols}</a:tblGrid>
          ${makeRow(headers, true)}
          ${rows.map((r) => makeRow(r, false)).join('')}
        </a:tbl>
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}

function dataUrlToBinary(dataUrl: string): { ext: 'png' | 'jpg'; bytes: Uint8Array } | null {
  try {
    const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl.trim());
    if (!match) return null;
    const ext = /png/i.test(match[1]) ? 'png' : 'jpg';
    const bin = atob(match[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ext, bytes };
  } catch {
    return null;
  }
}

export async function exportDocumentToPptxBytes(doc: WpsDocument): Promise<Uint8Array> {
  const zip = new JSZip();
  const slides: WpsSlide[] =
    doc.slides && doc.slides.length > 0
      ? doc.slides
      : [
          {
            id: 'slide-1',
            index: 1,
            title: doc.title,
            bullets: [],
            notes: '',
          },
        ];

  const mediaEntries: { path: string; bytes: Uint8Array }[] = [];
  const slideMediaFlags = { hasPng: false, hasJpg: false };
  let mediaCounter = 1;

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ALX Office Theme">
  <a:themeElements>
    <a:clrScheme name="ALX">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="334155"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="EA580C"/></a:accent1>
      <a:accent2><a:srgbClr val="2563EB"/></a:accent2>
      <a:accent3><a:srgbClr val="7C3AED"/></a:accent3>
      <a:accent4><a:srgbClr val="16A34A"/></a:accent4>
      <a:accent5><a:srgbClr val="D97706"/></a:accent5>
      <a:accent6><a:srgbClr val="0891B2"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="ALX">
      <a:majorFont><a:latin typeface="Plus Jakarta Sans"/></a:majorFont>
      <a:minorFont><a:latin typeface="Public Sans"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="ALX">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`,
  );

  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`,
  );

  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
  );

  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`,
  );

  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
  );

  const slideContentTypes: string[] = [];
  const presRels: string[] = [
    '<Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
  ];
  const sldIdLst: string[] = [];

  for (let sIdx = 0; sIdx < slides.length; sIdx++) {
    const slide = slides[sIdx];
    const slideNum = sIdx + 1;
    const rels: string[] = [
      '<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
    ];
    let relCounter = 1;
    let shapeId = 2;
    const shapeNodes: string[] = [];

    const bgHex = normalizeHexColor(
      slide.backgroundColor || slide.backgroundGradient,
      'FFFFFF',
    );
    const bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;

    const elements: WpsSlideElement[] =
      slide.elements && slide.elements.length > 0
        ? [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)
        : [
            {
              id: 't',
              type: 'text',
              xPct: 6,
              yPct: 8,
              wPct: 88,
              hPct: 18,
              isTitle: true,
              zIndex: 1,
              paragraphs: [
                {
                  align: 'left',
                  runs: [{ text: slide.title, bold: true, fontSizePt: 26, color: '#0F172A' }],
                },
              ],
            },
            ...(slide.subtitle
              ? [
                  {
                    id: 'sub',
                    type: 'text' as const,
                    xPct: 6,
                    yPct: 26,
                    wPct: 88,
                    hPct: 10,
                    zIndex: 2,
                    paragraphs: [
                      {
                        align: 'left' as const,
                        runs: [{ text: slide.subtitle, fontSizePt: 15, color: '#475569' }],
                      },
                    ],
                  },
                ]
              : []),
            ...(slide.bullets.length > 0 || slide.bodyHtml
              ? [
                  {
                    id: 'body',
                    type: 'text' as const,
                    xPct: 6,
                    yPct: slide.subtitle ? 38 : 29,
                    wPct: 88,
                    hPct: slide.table ? 30 : 54,
                    zIndex: 3,
                    richHtml: slide.bodyHtml,
                    paragraphs: slide.bullets.map((b) => ({
                      align: 'left' as const,
                      bullet: true,
                      runs: [{ text: b, fontSizePt: 15, color: '#1E293B' }],
                    })),
                  },
                ]
              : []),
            ...(slide.table
              ? [
                  {
                    id: 'tbl',
                    type: 'table' as const,
                    xPct: 6,
                    yPct: 68,
                    wPct: 88,
                    hPct: 26,
                    headers: slide.table.headers,
                    rows: slide.table.rows,
                    zIndex: 4,
                  },
                ]
              : []),
          ];

    for (const el of elements) {
      const x = pctToEmu(el.xPct, SLIDE_W_EMU);
      const y = pctToEmu(el.yPct, SLIDE_H_EMU);
      const cx = pctToEmu(el.wPct, SLIDE_W_EMU);
      const cy = pctToEmu(el.hPct, SLIDE_H_EMU);

      if (el.type === 'shape') {
        shapeNodes.push(
          buildSlideShapeXml(shapeId++, `Forma ${shapeId}`, x, y, cx, cy, {
            geom: mapPresetGeom(el.shapeKind),
            rotDeg: el.rotationDeg,
            fillHex: el.fillColor,
            borderHex: el.borderColor,
            borderWidthPx: el.borderWidthPx,
          }),
        );
      } else if (el.type === 'text') {
        const lines = el.richHtml
          ? htmlToPlainLines(el.richHtml)
          : el.paragraphs.map((p) => p.runs.map((r) => r.text).join(''));
        const firstRun = el.paragraphs[0]?.runs[0];
        const paragraphsXml = buildTextParagraphsXml(lines, {
          fontSizePt: el.fontSizePt || firstRun?.fontSizePt || (el.isTitle ? 26 : 16),
          bold: firstRun?.bold || el.isTitle,
          italic: firstRun?.italic,
          color: firstRun?.color || '#0F172A',
          align: el.paragraphs[0]?.align,
          fontFamily: el.fontFamily,
        });
        shapeNodes.push(
          buildSlideShapeXml(shapeId++, `Texto ${shapeId}`, x, y, cx, cy, {
            geom: 'rect',
            rotDeg: el.rotationDeg,
            fillHex: el.fillColor,
            borderHex: el.borderColor,
            borderWidthPx: el.borderWidthPx,
            paragraphsXml,
          }),
        );
      } else if (el.type === 'table') {
        shapeNodes.push(
          buildSlideTableXml(
            shapeId++,
            el.headers,
            el.rows,
            x,
            y,
            cx,
            cy,
            el.headerBgColor,
            el.headerTextColor,
            el.cellBgColor,
          ),
        );
      } else if (el.type === 'image') {
        const decoded = dataUrlToBinary(el.src);
        if (decoded) {
          const mediaName = `image${mediaCounter++}.${decoded.ext}`;
          if (decoded.ext === 'png') slideMediaFlags.hasPng = true;
          else slideMediaFlags.hasJpg = true;
          mediaEntries.push({ path: `ppt/media/${mediaName}`, bytes: decoded.bytes });
          const rId = `rIdImg${relCounter++}`;
          rels.push(
            `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`,
          );
          const rotAttr = el.rotationDeg ? ` rot="${Math.round(el.rotationDeg * 60000)}"` : '';
          shapeNodes.push(`<p:pic>
            <p:nvPicPr>
              <p:cNvPr id="${shapeId++}" name="${escapeXml(el.alt || 'Imagen')}"/>
              <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
              <p:nvPr/>
            </p:nvPicPr>
            <p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
            <p:spPr>
              <a:xfrm${rotAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(10000, cx)}" cy="${Math.max(10000, cy)}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </p:spPr>
          </p:pic>`);
        }
      } else if (el.type === 'chart') {
        const summaryLines = [
          el.title || 'Gráfico',
          ...(el.series[0]?.points.map((pt) => `${pt.label}: ${pt.value}`) || []),
        ];
        const chartBgHex = normalizeHexColor(el.fillColor, 'F8FAFC');
        shapeNodes.push(
          buildSlideShapeXml(shapeId++, el.title || 'Gráfico', x, y, cx, cy, {
            geom: 'roundRect',
            fillHex: chartBgHex,
            borderHex: el.borderColor || '#CBD5E1',
            paragraphsXml: buildTextParagraphsXml(summaryLines, {
              fontSizePt: 13,
              color: isDarkNormalizedHex(chartBgHex) ? '#F8FAFC' : '#0F172A',
            }),
          }),
        );
      } else if (el.type === 'diagram') {
        const diagBgHex = normalizeHexColor(el.fillColor, 'F8FAFC');
        shapeNodes.push(
          buildSlideShapeXml(shapeId++, 'Diagrama', x, y, cx, cy, {
            geom: 'roundRect',
            fillHex: diagBgHex,
            borderHex: el.borderColor || '#CBD5E1',
            paragraphsXml: buildTextParagraphsXml(el.items, {
              fontSizePt: 13,
              color: isDarkNormalizedHex(diagBgHex) ? '#F8FAFC' : '#0F172A',
            }),
          }),
        );
      }
    }

    zip.file(
      `ppt/slides/slide${slideNum}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    ${bgXml}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapeNodes.join('\n')}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`,
    );

    zip.file(
      `ppt/slides/_rels/slide${slideNum}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join('\n')}
</Relationships>`,
    );

    const rIdSlide = `rIdSlide${slideNum}`;
    presRels.push(
      `<Relationship Id="${rIdSlide}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`,
    );
    sldIdLst.push(`<p:sldId id="${256 + sIdx}" r:id="${rIdSlide}"/>`);
    slideContentTypes.push(
      `<Override PartName="/ppt/slides/slide${slideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
  }

  for (const m of mediaEntries) {
    zip.file(m.path, m.bytes);
  }

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster1"/></p:sldMasterIdLst>
  <p:sldIdLst>${sldIdLst.join('')}</p:sldIdLst>
  <p:sldSz cx="${SLIDE_W_EMU}" cy="${SLIDE_H_EMU}" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,
  );

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${presRels.join('\n')}
</Relationships>`,
  );

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${slideMediaFlags.hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}
  ${slideMediaFlags.hasJpg ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : ''}
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideContentTypes.join('\n  ')}
</Types>`,
  );

  return zip.generateAsync({ type: 'uint8array' });
}
