import JSZip from 'jszip';
import type {
  WpsDocument,
  WpsSlide,
  WpsSlideElement,
  WpsSlideParagraph,
  WpsSlideRun,
} from '../data/wpsDocuments';
import { parseLegacyPptToSlides } from './legacyPptParser';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function getZipFile(zip: JSZip, path: string): JSZip.JSZipObject | null {
  const direct = zip.file(path);
  if (direct) return direct;
  const normalized = path.replace(/^\/+/, '').toLowerCase();
  for (const key of Object.keys(zip.files)) {
    if (key.toLowerCase() === normalized) {
      return zip.file(key);
    }
  }
  return null;
}

/**
 * Fallback string extractor for non-OLE2 / damaged legacy binary (.doc, .ppt) files.
 */
function extractLegacyBinaryStrings(bytes: Uint8Array): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  const pushClean = (raw: string) => {
    const cleaned = raw
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 4) return;
    if (
      /^(Root Entry|WordDocument|PowerPoint Document|SummaryInformation|DocumentSummaryInformation|1Table|0Table|Current User|Pictures)$/i.test(
        cleaned,
      )
    ) {
      return;
    }
    if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]{3,}/.test(cleaned)) return;
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      results.push(cleaned);
    }
  };

  let utf16Buf = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      utf16Buf += String.fromCharCode(code);
    } else {
      if (utf16Buf.length >= 6) pushClean(utf16Buf);
      utf16Buf = '';
    }
  }
  if (utf16Buf.length >= 6) pushClean(utf16Buf);

  let asciiBuf = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b >= 160) {
      asciiBuf += String.fromCharCode(b);
    } else {
      if (asciiBuf.length >= 12) pushClean(asciiBuf);
      asciiBuf = '';
    }
  }
  if (asciiBuf.length >= 12) pushClean(asciiBuf);

  return results;
}

// Namespace-safe XML helpers
function directChildren(el: Element, localName?: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (!localName || child.localName === localName) {
      out.push(child);
    }
  }
  return out;
}

function firstChild(el: Element, localName: string): Element | null {
  for (let i = 0; i < el.children.length; i++) {
    if (el.children[i].localName === localName) return el.children[i];
  }
  return null;
}

function findDescendants(root: Element | Document, localName: string): Element[] {
  const result: Element[] = [];
  const start = root instanceof Document ? root.documentElement : root;
  if (!start) return result;
  const stack: Element[] = [start];
  while (stack.length > 0) {
    const node = stack.shift()!;
    if (node.localName === localName) result.push(node);
    for (let i = 0; i < node.children.length; i++) {
      stack.push(node.children[i]);
    }
  }
  return result;
}

function getRelAttr(el: Element | null | undefined, attrName: string): string | null {
  if (!el) return null;
  return (
    el.getAttribute(`r:${attrName}`) ||
    el.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      attrName,
    ) ||
    el.getAttribute(attrName)
  );
}

function resolveZipPath(baseFilePath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseFilePath.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

interface RelEntry {
  id: string;
  type: string;
  targetPath: string;
}

async function readRelsMap(
  zip: JSZip,
  ownerFilePath: string,
): Promise<Map<string, RelEntry>> {
  const idx = ownerFilePath.lastIndexOf('/');
  const dir = idx >= 0 ? ownerFilePath.slice(0, idx) : '';
  const fileName = idx >= 0 ? ownerFilePath.slice(idx + 1) : ownerFilePath;
  const relsPath = dir ? `${dir}/_rels/${fileName}.rels` : `_rels/${fileName}.rels`;

  const map = new Map<string, RelEntry>();
  const xmlStr = await getZipFile(zip, relsPath)?.async('string');
  if (!xmlStr) return map;

  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
  for (const rel of findDescendants(doc, 'Relationship')) {
    const id = rel.getAttribute('Id') || '';
    const type = rel.getAttribute('Type') || '';
    const target = rel.getAttribute('Target') || '';
    const mode = rel.getAttribute('TargetMode') || '';
    if (!id || !target || mode === 'External') continue;
    map.set(id, {
      id,
      type,
      targetPath: resolveZipPath(ownerFilePath, target),
    });
  }
  return map;
}

function getMimeForImagePath(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  return null;
}

function applyLumTint(
  hex: string,
  lumMod?: number,
  lumOff?: number,
  tint?: number,
  shade?: number,
): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  let r = parseInt(clean.slice(0, 2), 16) / 255;
  let g = parseInt(clean.slice(2, 4), 16) / 255;
  let b = parseInt(clean.slice(4, 6), 16) / 255;

  if (tint !== undefined) {
    const f = tint / 100000;
    r = r * f + (1 - f);
    g = g * f + (1 - f);
    b = b * f + (1 - f);
  }
  if (shade !== undefined) {
    const f = shade / 100000;
    r *= f;
    g *= f;
    b *= f;
  }
  if (lumMod !== undefined || lumOff !== undefined) {
    const mod = lumMod !== undefined ? lumMod / 100000 : 1;
    const off = lumOff !== undefined ? lumOff / 100000 : 0;
    r = Math.min(1, Math.max(0, r * mod + off));
    g = Math.min(1, Math.max(0, g * mod + off));
    b = Math.min(1, Math.max(0, b * mod + off));
  }

  const toHex = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function resolveColorNode(
  colorContainer: Element | null | undefined,
  themeColors: Map<string, string>,
): string | undefined {
  if (!colorContainer) return undefined;
  const srgb = firstChild(colorContainer, 'srgbClr');
  const scheme = firstChild(colorContainer, 'schemeClr');
  const sys = firstChild(colorContainer, 'sysClr');
  const prst = firstChild(colorContainer, 'prstClr');

  let baseHex: string | undefined;
  let modNode: Element | null = null;

  if (srgb) {
    const val = srgb.getAttribute('val');
    if (val && /^[0-9a-fA-F]{6}$/.test(val)) {
      baseHex = `#${val}`;
      modNode = srgb;
    }
  } else if (scheme) {
    const val = scheme.getAttribute('val') || '';
    const mapped = themeColors.get(val);
    if (mapped) {
      baseHex = mapped;
      modNode = scheme;
    }
  } else if (sys) {
    const lastClr = sys.getAttribute('lastClr');
    if (lastClr && /^[0-9a-fA-F]{6}$/.test(lastClr)) {
      baseHex = `#${lastClr}`;
      modNode = sys;
    }
  } else if (prst) {
    const val = (prst.getAttribute('val') || '').toLowerCase();
    const presetMap: Record<string, string> = {
      black: '#000000',
      white: '#FFFFFF',
      red: '#DC2626',
      blue: '#2563EB',
      green: '#16A34A',
      yellow: '#EAB308',
      gray: '#64748B',
      dkgray: '#334155',
      ltgray: '#CBD5E1',
    };
    if (presetMap[val]) {
      baseHex = presetMap[val];
      modNode = prst;
    }
  }

  if (!baseHex || !modNode) return baseHex;

  const lumModEl = firstChild(modNode, 'lumMod');
  const lumOffEl = firstChild(modNode, 'lumOff');
  const tintEl = firstChild(modNode, 'tint');
  const shadeEl = firstChild(modNode, 'shade');

  const lumMod = lumModEl ? Number(lumModEl.getAttribute('val')) : undefined;
  const lumOff = lumOffEl ? Number(lumOffEl.getAttribute('val')) : undefined;
  const tint = tintEl ? Number(tintEl.getAttribute('val')) : undefined;
  const shade = shadeEl ? Number(shadeEl.getAttribute('val')) : undefined;

  if (
    lumMod !== undefined ||
    lumOff !== undefined ||
    tint !== undefined ||
    shade !== undefined
  ) {
    return applyLumTint(baseHex, lumMod, lumOff, tint, shade);
  }
  return baseHex;
}

function resolveFillColor(
  spPr: Element | null | undefined,
  themeColors: Map<string, string>,
): string | undefined {
  if (!spPr) return undefined;
  if (firstChild(spPr, 'noFill')) return undefined;
  const solidFill = firstChild(spPr, 'solidFill');
  if (solidFill) return resolveColorNode(solidFill, themeColors);

  const gradFill = firstChild(spPr, 'gradFill');
  if (gradFill) {
    const gsLst = firstChild(gradFill, 'gsLst');
    const firstStop = gsLst ? firstChild(gsLst, 'gs') : null;
    if (firstStop) return resolveColorNode(firstStop, themeColors);
  }
  return undefined;
}

function isDarkHex(hex?: string): boolean {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return false;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.45;
}

async function parseThemeColors(zip: JSZip): Promise<Map<string, string>> {
  const map = new Map<string, string>([
    ['dk1', '#0F172A'],
    ['lt1', '#FFFFFF'],
    ['dk2', '#1E293B'],
    ['lt2', '#F1F5F9'],
    ['accent1', '#2563EB'],
    ['accent2', '#EA580C'],
    ['accent3', '#16A34A'],
    ['accent4', '#7C3AED'],
    ['accent5', '#0891B2'],
    ['accent6', '#D97706'],
    ['tx1', '#0F172A'],
    ['tx2', '#334155'],
    ['bg1', '#FFFFFF'],
    ['bg2', '#F8FAFC'],
  ]);

  const themePaths = Object.keys(zip.files).filter((f) =>
    /^ppt\/theme\/theme\d+\.xml$/i.test(f),
  );
  if (themePaths.length === 0) return map;

  const themeXml = await getZipFile(zip, themePaths[0])?.async('string');
  if (!themeXml) return map;

  const doc = new DOMParser().parseFromString(themeXml, 'application/xml');
  const clrScheme = findDescendants(doc, 'clrScheme')[0];
  if (!clrScheme) return map;

  for (const child of directChildren(clrScheme)) {
    const srgb = firstChild(child, 'srgbClr');
    const sys = firstChild(child, 'sysClr');
    const val = srgb?.getAttribute('val') || sys?.getAttribute('lastClr');
    if (val && /^[0-9a-fA-F]{6}$/.test(val)) {
      map.set(child.localName, `#${val}`);
    }
  }

  if (map.has('dk1')) map.set('tx1', map.get('dk1')!);
  if (map.has('dk2')) map.set('tx2', map.get('dk2')!);
  if (map.has('lt1')) map.set('bg1', map.get('lt1')!);
  if (map.has('lt2')) map.set('bg2', map.get('lt2')!);

  return map;
}

async function loadMediaDataUrl(
  zip: JSZip,
  path: string,
  cache: Map<string, string>,
): Promise<string | undefined> {
  const cacheKey = path.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const mime = getMimeForImagePath(path);
  if (!mime) return undefined;
  const fileObj = getZipFile(zip, path);
  if (!fileObj) return undefined;
  const bytes = await fileObj.async('uint8array');
  if (!bytes || bytes.length === 0) return undefined;
  const dataUrl = `data:${mime};base64,${uint8ToBase64(bytes)}`;
  cache.set(cacheKey, dataUrl);
  return dataUrl;
}

async function resolveBlipImageUrl(
  blipFill: Element | null | undefined,
  rels: Map<string, RelEntry>,
  zip: JSZip,
  imageCache: Map<string, string>,
): Promise<string | undefined> {
  if (!blipFill) return undefined;
  const blip = firstChild(blipFill, 'blip');
  if (!blip) return undefined;

  // Prefer svgBlip if present inside extLst, then standard embed
  const svgBlips = findDescendants(blip, 'svgBlip');
  for (const sb of svgBlips) {
    const svgRid = getRelAttr(sb, 'embed');
    if (svgRid && rels.has(svgRid)) {
      const url = await loadMediaDataUrl(zip, rels.get(svgRid)!.targetPath, imageCache);
      if (url) return url;
    }
  }

  const embedId = getRelAttr(blip, 'embed');
  if (embedId && rels.has(embedId)) {
    return loadMediaDataUrl(zip, rels.get(embedId)!.targetPath, imageCache);
  }
  return undefined;
}

async function extractBackgroundFromXml(
  zip: JSZip,
  xmlDoc: Document | null,
  rels: Map<string, RelEntry>,
  themeColors: Map<string, string>,
  imageCache: Map<string, string>,
): Promise<{ backgroundColor?: string; backgroundImage?: string }> {
  if (!xmlDoc) return {};
  const cSld = findDescendants(xmlDoc, 'cSld')[0];
  if (!cSld) return {};
  const bg = firstChild(cSld, 'bg');
  if (!bg) return {};

  const bgPr = firstChild(bg, 'bgPr');
  if (bgPr) {
    const color = resolveFillColor(bgPr, themeColors);
    const blipFill = firstChild(bgPr, 'blipFill');
    const backgroundImage = await resolveBlipImageUrl(
      blipFill,
      rels,
      zip,
      imageCache,
    );
    return { backgroundColor: color, backgroundImage };
  }

  const bgRef = firstChild(bg, 'bgRef');
  if (bgRef) {
    const color = resolveColorNode(bgRef, themeColors);
    return { backgroundColor: color };
  }

  return {};
}

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg?: number;
}

function readXfrm(container: Element | null | undefined): BoxRect | null {
  if (!container) return null;
  const xfrm = firstChild(container, 'xfrm');
  if (!xfrm) return null;
  const off = firstChild(xfrm, 'off');
  const ext = firstChild(xfrm, 'ext');
  if (!off || !ext) return null;

  const x = Number(off.getAttribute('x') || 0);
  const y = Number(off.getAttribute('y') || 0);
  let w = Number(ext.getAttribute('cx') || 0);
  let h = Number(ext.getAttribute('cy') || 0);
  if (w <= 0 && h <= 0) return null;
  if (w <= 0) w = 19050; // ~2px line width
  if (h <= 0) h = 19050; // ~2px line thickness
  const rotRaw = Number(xfrm.getAttribute('rot') || 0);
  const rotationDeg = rotRaw ? Math.round((rotRaw / 60000) * 10) / 10 : undefined;

  return { x, y, w, h, rotationDeg };
}

function mapGroupRect(
  rect: BoxRect,
  groupBox?: { parent: BoxRect; childOffset: BoxRect },
): BoxRect {
  if (!groupBox) return rect;
  const scaleX = groupBox.childOffset.w > 0 ? groupBox.parent.w / groupBox.childOffset.w : 1;
  const scaleY = groupBox.childOffset.h > 0 ? groupBox.parent.h / groupBox.childOffset.h : 1;
  return {
    x: groupBox.parent.x + (rect.x - groupBox.childOffset.x) * scaleX,
    y: groupBox.parent.y + (rect.y - groupBox.childOffset.y) * scaleY,
    w: rect.w * scaleX,
    h: rect.h * scaleY,
    rotationDeg: rect.rotationDeg,
  };
}

function toPct(rect: BoxRect, slideW: number, slideH: number) {
  return {
    xPct: (rect.x / slideW) * 100,
    yPct: (rect.y / slideH) * 100,
    wPct: (rect.w / slideW) * 100,
    hPct: (rect.h / slideH) * 100,
  };
}

async function parseChartXml(
  zip: JSZip,
  chartPath: string,
): Promise<{
  title?: string;
  series: { name: string; points: { label: string; value: number }[] }[];
} | null> {
  const xmlStr = await getZipFile(zip, chartPath)?.async('string');
  if (!xmlStr) return null;
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');

  const titleEl = findDescendants(doc, 'title')[0];
  const title = titleEl
    ? findDescendants(titleEl, 't')
        .map((t) => t.textContent || '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    : undefined;

  const serEls = findDescendants(doc, 'ser');
  const series: { name: string; points: { label: string; value: number }[] }[] = [];

  for (let sIdx = 0; sIdx < serEls.length; sIdx++) {
    const ser = serEls[sIdx];
    const txEl = firstChild(ser, 'tx');
    const serName = txEl
      ? findDescendants(txEl, 'v')[0]?.textContent?.trim() ||
        findDescendants(txEl, 't')
          .map((t) => t.textContent || '')
          .join('')
          .trim() ||
        `Serie ${sIdx + 1}`
      : `Serie ${sIdx + 1}`;

    const catEl = firstChild(ser, 'cat') || firstChild(ser, 'xVal');
    const valEl = firstChild(ser, 'val') || firstChild(ser, 'yVal');
    const labels = catEl
      ? findDescendants(catEl, 'pt').map(
          (pt) => firstChild(pt, 'v')?.textContent?.trim() || '',
        )
      : [];
    const values = valEl
      ? findDescendants(valEl, 'pt').map((pt) =>
          Number(firstChild(pt, 'v')?.textContent || 0),
        )
      : [];

    if (values.length > 0) {
      series.push({
        name: serName,
        points: values.map((v, i) => ({
          label: labels[i] || `${i + 1}`,
          value: Number.isFinite(v) ? v : 0,
        })),
      });
    }
  }

  if (series.length === 0 && !title) return null;
  return { title, series };
}

async function parseDiagramDataXml(zip: JSZip, dataPath: string): Promise<string[]> {
  const xmlStr = await getZipFile(zip, dataPath)?.async('string');
  if (!xmlStr) return [];
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
  const items: string[] = [];
  const seen = new Set<string>();
  for (const pt of findDescendants(doc, 'pt')) {
    const tContainer = firstChild(pt, 't');
    if (!tContainer) continue;
    const text = findDescendants(tContainer, 't')
      .map((n) => n.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      items.push(text);
    }
  }
  return items;
}

async function parseDocxToHtml(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await getZipFile(zip, 'word/document.xml')?.async('string');
  if (!docXml) {
    return '<p>No se encontró contenido XML legible dentro del archivo DOCX.</p>';
  }

  const xml = new DOMParser().parseFromString(docXml, 'application/xml');
  const paragraphs = Array.from(xml.getElementsByTagName('w:p'));
  const htmlParts: string[] = [];

  for (const p of paragraphs) {
    const pStyle =
      p.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') || '';
    const runs = Array.from(p.getElementsByTagName('w:r'));
    let lineHtml = '';

    for (const r of runs) {
      const texts = Array.from(r.getElementsByTagName('w:t'))
        .map((t) => t.textContent || '')
        .join('');
      if (!texts) continue;

      const rPr = r.getElementsByTagName('w:rPr')[0];
      const isBold = rPr && rPr.getElementsByTagName('w:b').length > 0;
      const isItalic = rPr && rPr.getElementsByTagName('w:i').length > 0;

      let chunk = escapeHtml(texts);
      if (isBold) chunk = `<strong>${chunk}</strong>`;
      if (isItalic) chunk = `<em>${chunk}</em>`;
      lineHtml += chunk;
    }

    if (!lineHtml.trim()) continue;
    if (/heading1|title/i.test(pStyle)) {
      htmlParts.push(`<h1>${lineHtml}</h1>`);
    } else if (/heading2/i.test(pStyle)) {
      htmlParts.push(`<h2>${lineHtml}</h2>`);
    } else if (/heading3/i.test(pStyle)) {
      htmlParts.push(`<h3>${lineHtml}</h3>`);
    } else {
      htmlParts.push(`<p>${lineHtml}</p>`);
    }
  }

  const tables = Array.from(xml.getElementsByTagName('w:tbl'));
  for (const tbl of tables) {
    const rows = Array.from(tbl.getElementsByTagName('w:tr'));
    if (rows.length === 0) continue;
    const rowsHtml = rows
      .map((tr, rIdx) => {
        const cells = Array.from(tr.getElementsByTagName('w:tc'));
        const tag = rIdx === 0 ? 'th' : 'td';
        const cellsHtml = cells
          .map((tc) => `<${tag}>${escapeHtml(tc.textContent?.trim() || '')}</${tag}>`)
          .join('');
        return `<tr>${cellsHtml}</tr>`;
      })
      .join('');
    htmlParts.push(`<table><tbody>${rowsHtml}</tbody></table>`);
  }

  return htmlParts.join('') || '<p>(Documento DOCX vacío)</p>';
}

async function parsePptxToSlides(buffer: ArrayBuffer): Promise<WpsSlide[]> {
  const zip = await JSZip.loadAsync(buffer);
  const themeColors = await parseThemeColors(zip);
  const imageCache = new Map<string, string>();

  let slideWidthEmu = 12192000;
  let slideHeightEmu = 6858000;
  let orderedSlidePaths: string[] = [];

  const presXmlStr = await getZipFile(zip, 'ppt/presentation.xml')?.async('string');
  const presRels = await readRelsMap(zip, 'ppt/presentation.xml');

  if (presXmlStr) {
    const presDoc = new DOMParser().parseFromString(presXmlStr, 'application/xml');
    const sldSz = findDescendants(presDoc, 'sldSz')[0];
    if (sldSz) {
      const cx = Number(sldSz.getAttribute('cx') || 0);
      const cy = Number(sldSz.getAttribute('cy') || 0);
      if (cx > 0 && cy > 0) {
        slideWidthEmu = cx;
        slideHeightEmu = cy;
      }
    }

    const sldIds = findDescendants(presDoc, 'sldId');
    for (const sldId of sldIds) {
      const rid = getRelAttr(sldId, 'id');
      if (rid && presRels.has(rid)) {
        const target = presRels.get(rid)!.targetPath;
        if (getZipFile(zip, target)) orderedSlidePaths.push(target);
      }
    }
  }

  if (orderedSlidePaths.length === 0) {
    orderedSlidePaths = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const numA = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
        const numB = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
        return numA - numB;
      });
  }

  const slideWidthPx = Math.max(640, Math.round(slideWidthEmu / 9525));
  const slideHeightPx = Math.max(360, Math.round(slideHeightEmu / 9525));
  const slides: WpsSlide[] = [];

  for (let idx = 0; idx < orderedSlidePaths.length; idx++) {
    const slidePath = orderedSlidePaths[idx];
    const slideNum = idx + 1;
    const xmlStr = await getZipFile(zip, slidePath)?.async('string');
    if (!xmlStr) continue;

    const slideDoc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    const slideRels = await readRelsMap(zip, slidePath);

    const placeholderRects = new Map<string, BoxRect>();
    const collectPlaceholdersFromDoc = (xmlDoc: Document) => {
      for (const sp of findDescendants(xmlDoc, 'sp')) {
        const nvSpPr = firstChild(sp, 'nvSpPr');
        const nvPr = nvSpPr ? firstChild(nvSpPr, 'nvPr') : null;
        const ph = nvPr ? firstChild(nvPr, 'ph') : null;
        if (!ph) continue;
        const spPr = firstChild(sp, 'spPr');
        const rect = readXfrm(spPr);
        if (!rect) continue;
        const t = (ph.getAttribute('type') || '').toLowerCase();
        const i = ph.getAttribute('idx') || '';
        if (t && i && !placeholderRects.has(`${t}:${i}`)) {
          placeholderRects.set(`${t}:${i}`, rect);
        }
        if (t && !placeholderRects.has(`type:${t}`)) {
          placeholderRects.set(`type:${t}`, rect);
        }
        if (i && !placeholderRects.has(`idx:${i}`)) {
          placeholderRects.set(`idx:${i}`, rect);
        }
      }
    };

    let bgInfo = await extractBackgroundFromXml(
      zip,
      slideDoc,
      slideRels,
      themeColors,
      imageCache,
    );

    let layoutDoc: Document | null = null;
    let layoutRels = new Map<string, RelEntry>();
    let masterDoc: Document | null = null;
    let masterRels = new Map<string, RelEntry>();

    const layoutRel = Array.from(slideRels.values()).find((r) =>
      r.type.toLowerCase().endsWith('/slidelayout'),
    );
    if (layoutRel) {
      const layoutStr = await getZipFile(zip, layoutRel.targetPath)?.async('string');
      if (layoutStr) {
        layoutDoc = new DOMParser().parseFromString(layoutStr, 'application/xml');
        layoutRels = await readRelsMap(zip, layoutRel.targetPath);
        collectPlaceholdersFromDoc(layoutDoc);

        if (!bgInfo.backgroundColor && !bgInfo.backgroundImage) {
          bgInfo = await extractBackgroundFromXml(
            zip,
            layoutDoc,
            layoutRels,
            themeColors,
            imageCache,
          );
        }

        const masterRel = Array.from(layoutRels.values()).find((r) =>
          r.type.toLowerCase().endsWith('/slidemaster'),
        );
        if (masterRel) {
          const masterStr = await getZipFile(zip, masterRel.targetPath)?.async('string');
          if (masterStr) {
            masterDoc = new DOMParser().parseFromString(masterStr, 'application/xml');
            masterRels = await readRelsMap(zip, masterRel.targetPath);
            collectPlaceholdersFromDoc(masterDoc);

            if (!bgInfo.backgroundColor && !bgInfo.backgroundImage) {
              bgInfo = await extractBackgroundFromXml(
                zip,
                masterDoc,
                masterRels,
                themeColors,
                imageCache,
              );
            }
          }
        }
      }
    }

    const slideDark = isDarkHex(bgInfo.backgroundColor);
    const defaultTextColor = slideDark ? '#F8FAFC' : '#0F172A';

    const elements: WpsSlideElement[] = [];
    let zCounter = 1;
    let detectedTitle = '';
    let detectedSubtitle = '';
    const collectedBullets: string[] = [];
    let firstTable: { headers: string[]; rows: string[][] } | undefined;

    const processTreeNode = async (
      node: Element,
      activeRels: Map<string, RelEntry>,
      isMasterOrLayout: boolean,
      groupBox?: { parent: BoxRect; childOffset: BoxRect },
    ): Promise<void> => {
      const tag = node.localName;

      // Unwrap mc:AlternateContent (SmartArt fallbacks, SVG/vector image fallbacks, modern charts)
      if (tag === 'AlternateContent') {
        const fallback = firstChild(node, 'Fallback');
        const choice = firstChild(node, 'Choice');
        const chosen =
          fallback && directChildren(fallback).length > 0 ? fallback : choice;
        if (chosen) {
          for (const child of directChildren(chosen)) {
            await processTreeNode(child, activeRels, isMasterOrLayout, groupBox);
          }
        }
        return;
      }

      if (tag === 'grpSp') {
        const grpSpPr = firstChild(node, 'grpSpPr');
        const xfrm = grpSpPr ? firstChild(grpSpPr, 'xfrm') : null;
        const off = xfrm ? firstChild(xfrm, 'off') : null;
        const ext = xfrm ? firstChild(xfrm, 'ext') : null;
        const chOff = xfrm ? firstChild(xfrm, 'chOff') : null;
        const chExt = xfrm ? firstChild(xfrm, 'chExt') : null;

        let nextGroup = groupBox;
        if (off && ext && chOff && chExt) {
          const parentRect = mapGroupRect(
            {
              x: Number(off.getAttribute('x') || 0),
              y: Number(off.getAttribute('y') || 0),
              w: Number(ext.getAttribute('cx') || 1),
              h: Number(ext.getAttribute('cy') || 1),
            },
            groupBox,
          );
          nextGroup = {
            parent: parentRect,
            childOffset: {
              x: Number(chOff.getAttribute('x') || 0),
              y: Number(chOff.getAttribute('y') || 0),
              w: Number(chExt.getAttribute('cx') || 1),
              h: Number(chExt.getAttribute('cy') || 1),
            },
          };
        }

        for (const child of directChildren(node)) {
          await processTreeNode(child, activeRels, isMasterOrLayout, nextGroup);
        }
        return;
      }

      if (tag === 'pic') {
        const nvPicPr = firstChild(node, 'nvPicPr');
        const nvPr = nvPicPr ? firstChild(nvPicPr, 'nvPr') : null;
        const hasPh = Boolean(nvPr && firstChild(nvPr, 'ph'));
        if (isMasterOrLayout && hasPh) return;

        const spPr = firstChild(node, 'spPr');
        const rawRect = readXfrm(spPr);
        const blipFill = firstChild(node, 'blipFill');
        const src = await resolveBlipImageUrl(blipFill, activeRels, zip, imageCache);
        if (rawRect && src) {
          const mapped = mapGroupRect(rawRect, groupBox);
          const pct = toPct(mapped, slideWidthEmu, slideHeightEmu);
          elements.push({
            id: `el-${slideNum}-${zCounter}`,
            type: 'image',
            ...pct,
            src,
            alt: `Imagen diapositiva ${slideNum}`,
            rotationDeg: mapped.rotationDeg,
            imageFit: 'contain',
            zIndex: zCounter++,
          });
        }
        return;
      }

      if (tag === 'graphicFrame') {
        if (isMasterOrLayout) return;
        const xfrmEl = firstChild(node, 'xfrm');
        let rawRect: BoxRect | null = null;
        if (xfrmEl) {
          const off = firstChild(xfrmEl, 'off');
          const ext = firstChild(xfrmEl, 'ext');
          if (off && ext) {
            rawRect = {
              x: Number(off.getAttribute('x') || 0),
              y: Number(off.getAttribute('y') || 0),
              w: Number(ext.getAttribute('cx') || 0),
              h: Number(ext.getAttribute('cy') || 0),
            };
          }
        }

        const effectiveRect =
          rawRect && rawRect.w > 0 && rawRect.h > 0
            ? rawRect
            : {
                x: Math.round(slideWidthEmu * 0.08),
                y: Math.round(slideHeightEmu * 0.25),
                w: Math.round(slideWidthEmu * 0.84),
                h: Math.round(slideHeightEmu * 0.6),
              };
        const pct = toPct(
          mapGroupRect(effectiveRect, groupBox),
          slideWidthEmu,
          slideHeightEmu,
        );

        // 1. Table
        const tbl = findDescendants(node, 'tbl')[0];
        if (tbl) {
          const trList = directChildren(tbl, 'tr');
          const parsedRows = trList.map((tr) =>
            directChildren(tr, 'tc').map((tc) =>
              findDescendants(tc, 't')
                .map((t) => t.textContent || '')
                .join('')
                .replace(/\s+/g, ' ')
                .trim(),
            ),
          );
          if (parsedRows.length > 0) {
            const headers = parsedRows[0];
            const rows = parsedRows.slice(1);
            if (!firstTable) firstTable = { headers, rows };
            elements.push({
              id: `el-${slideNum}-${zCounter}`,
              type: 'table',
              ...pct,
              headers,
              rows,
              zIndex: zCounter++,
            });
          }
          return;
        }

        // 2. Embedded Chart
        const chartEl = findDescendants(node, 'chart')[0];
        const chartRid = getRelAttr(chartEl, 'id');
        if (chartRid && activeRels.has(chartRid)) {
          const parsedChart = await parseChartXml(
            zip,
            activeRels.get(chartRid)!.targetPath,
          );
          if (parsedChart) {
            elements.push({
              id: `el-${slideNum}-${zCounter}`,
              type: 'chart',
              ...pct,
              title: parsedChart.title,
              series: parsedChart.series,
              zIndex: zCounter++,
            });
            if (parsedChart.title) collectedBullets.push(parsedChart.title);
          }
          return;
        }

        // 3. SmartArt Diagram
        const dgmEl = findDescendants(node, 'relIds')[0];
        const dmRid = getRelAttr(dgmEl, 'dm');
        if (dmRid && activeRels.has(dmRid)) {
          const items = await parseDiagramDataXml(
            zip,
            activeRels.get(dmRid)!.targetPath,
          );
          if (items.length > 0) {
            elements.push({
              id: `el-${slideNum}-${zCounter}`,
              type: 'diagram',
              ...pct,
              items,
              zIndex: zCounter++,
            });
            collectedBullets.push(...items.slice(0, 5));
          }
        }
        return;
      }

      if (tag === 'sp' || tag === 'cxnSp') {
        const nvSpPr = firstChild(node, 'nvSpPr') || firstChild(node, 'nvCxnSpPr');
        const nvPr = nvSpPr ? firstChild(nvSpPr, 'nvPr') : null;
        const ph = nvPr ? firstChild(nvPr, 'ph') : null;
        const phType = (ph?.getAttribute('type') || '').toLowerCase();
        const phIdx = ph?.getAttribute('idx') || '';

        // Skip layout/master placeholder hints ("Click to add title", etc.)
        if (isMasterOrLayout && ph) return;

        const spPr = firstChild(node, 'spPr');
        let rawRect = readXfrm(spPr);
        if (!rawRect && ph) {
          rawRect =
            (phType && phIdx ? placeholderRects.get(`${phType}:${phIdx}`) : undefined) ||
            (phType ? placeholderRects.get(`type:${phType}`) : undefined) ||
            (phIdx ? placeholderRects.get(`idx:${phIdx}`) : undefined) ||
            null;
        }

        // Check blipFill inside shape (e.g., photo inside rounded rect or circle)
        const shapeBlipFill = spPr ? firstChild(spPr, 'blipFill') : null;
        const shapeImageSrc = await resolveBlipImageUrl(
          shapeBlipFill,
          activeRels,
          zip,
          imageCache,
        );

        // Read <p:style> fallback fill/line/font references
        const styleEl = firstChild(node, 'style');
        const fillRef = styleEl ? firstChild(styleEl, 'fillRef') : null;
        const lnRef = styleEl ? firstChild(styleEl, 'lnRef') : null;
        const fontRef = styleEl ? firstChild(styleEl, 'fontRef') : null;

        const styleFillColor =
          fillRef && Number(fillRef.getAttribute('idx') || 0) > 0
            ? resolveColorNode(fillRef, themeColors)
            : undefined;
        const styleBorderColor =
          lnRef && Number(lnRef.getAttribute('idx') || 0) > 0
            ? resolveColorNode(lnRef, themeColors)
            : undefined;
        const styleFontColor = fontRef
          ? resolveColorNode(fontRef, themeColors)
          : undefined;

        const fillColor = resolveFillColor(spPr, themeColors) || styleFillColor;
        const lnEl = spPr ? firstChild(spPr, 'ln') : null;
        const borderColor =
          lnEl && firstChild(lnEl, 'noFill')
            ? undefined
            : resolveFillColor(lnEl, themeColors) || styleBorderColor;
        const prstGeom = spPr ? firstChild(spPr, 'prstGeom') : null;
        const prst = prstGeom?.getAttribute('prst') || (tag === 'cxnSp' ? 'line' : 'rect');

        const txBody = firstChild(node, 'txBody');
        const paragraphs: WpsSlideParagraph[] = [];

        if (txBody) {
          const lstStyle = firstChild(txBody, 'lstStyle');
          const pNodes = directChildren(txBody, 'p');

          for (const pNode of pNodes) {
            const pPr = firstChild(pNode, 'pPr');
            const lvl = Number(pPr?.getAttribute('lvl') || 0);
            const algnRaw = pPr?.getAttribute('algn') || '';
            const align: WpsSlideParagraph['align'] =
              algnRaw === 'ctr'
                ? 'center'
                : algnRaw === 'r'
                  ? 'right'
                  : algnRaw === 'just'
                    ? 'justify'
                    : 'left';

            const hasBuNone = !!(pPr && firstChild(pPr, 'buNone'));
            const hasExplicitBullet = !!(
              pPr &&
              (firstChild(pPr, 'buChar') || firstChild(pPr, 'buAutoNum'))
            );
            const isBodyPlaceholder =
              phType === 'body' || phType === 'obj' || phType === '';
            const bullet =
              !hasBuNone &&
              (hasExplicitBullet || (phType === 'body' && isBodyPlaceholder));

            const lvlTag = `lvl${Math.min(9, lvl + 1)}pPr`;
            const lvlStyle = lstStyle ? firstChild(lstStyle, lvlTag) : null;
            const defRPr =
              (pPr ? firstChild(pPr, 'defRPr') : null) ||
              (lvlStyle ? firstChild(lvlStyle, 'defRPr') : null);
            const defSzAttr = defRPr?.getAttribute('sz');
            const defaultFontSizePt = defSzAttr
              ? Number(defSzAttr) / 100
              : phType === 'title' || phType === 'ctrtitle'
                ? 30
                : phType === 'subtitle'
                  ? 18
                  : 15;
            const defaultRunColor =
              resolveFillColor(defRPr, themeColors) ||
              styleFontColor ||
              (fillColor
                ? isDarkHex(fillColor)
                  ? '#F8FAFC'
                  : '#0F172A'
                : defaultTextColor);

            const runs: WpsSlideRun[] = [];
            for (const child of directChildren(pNode)) {
              if (child.localName === 'r' || child.localName === 'fld') {
                const tEl = firstChild(child, 't');
                const text = tEl?.textContent || '';
                if (!text) continue;
                const rPr = firstChild(child, 'rPr');
                const szAttr = rPr?.getAttribute('sz');
                const fontSizePt = szAttr
                  ? Number(szAttr) / 100
                  : defaultFontSizePt;
                const bold = rPr?.getAttribute('b') === '1';
                const italic = rPr?.getAttribute('i') === '1';
                const uAttr = rPr?.getAttribute('u');
                const underline = Boolean(uAttr && uAttr !== 'none');
                const runColor =
                  resolveFillColor(rPr, themeColors) || defaultRunColor;

                runs.push({
                  text,
                  bold,
                  italic,
                  underline,
                  color: runColor,
                  fontSizePt,
                });
              } else if (child.localName === 'br') {
                runs.push({ text: '\n' });
              }
            }

            const plainLine = runs
              .map((r) => r.text)
              .join('')
              .replace(/\s+/g, ' ')
              .trim();
            if (plainLine) {
              paragraphs.push({
                runs,
                align,
                bullet:
                  bullet &&
                  phType !== 'title' &&
                  phType !== 'ctrtitle' &&
                  phType !== 'subtitle',
                level: lvl,
              });

              if (
                !isMasterOrLayout &&
                phType !== 'sldnum' &&
                phType !== 'ftr' &&
                phType !== 'dt'
              ) {
                if ((phType === 'title' || phType === 'ctrtitle') && !detectedTitle) {
                  detectedTitle = plainLine;
                } else if (phType === 'subtitle' && !detectedSubtitle) {
                  detectedSubtitle = plainLine;
                } else {
                  collectedBullets.push(plainLine);
                }
              }
            }
          }
        }

        if (
          !rawRect &&
          paragraphs.length > 0 &&
          phType !== 'sldnum' &&
          phType !== 'ftr' &&
          phType !== 'dt'
        ) {
          if (phType === 'title' || phType === 'ctrtitle') {
            rawRect = {
              x: Math.round(slideWidthEmu * 0.06),
              y: Math.round(slideHeightEmu * 0.07),
              w: Math.round(slideWidthEmu * 0.88),
              h: Math.round(slideHeightEmu * 0.16),
            };
          } else if (phType === 'subtitle') {
            rawRect = {
              x: Math.round(slideWidthEmu * 0.06),
              y: Math.round(slideHeightEmu * 0.24),
              w: Math.round(slideWidthEmu * 0.88),
              h: Math.round(slideHeightEmu * 0.12),
            };
          } else {
            rawRect = {
              x: Math.round(slideWidthEmu * 0.06),
              y: Math.round(slideHeightEmu * 0.26),
              w: Math.round(slideWidthEmu * 0.88),
              h: Math.round(slideHeightEmu * 0.64),
            };
          }
        }

        if (rawRect) {
          const mapped = mapGroupRect(rawRect, groupBox);
          const pct = toPct(mapped, slideWidthEmu, slideHeightEmu);

          if (shapeImageSrc) {
            elements.push({
              id: `el-${slideNum}-${zCounter}`,
              type: 'image',
              ...pct,
              src: shapeImageSrc,
              alt: `Imagen en forma diapositiva ${slideNum}`,
              rotationDeg: mapped.rotationDeg,
              imageFit: 'cover',
              zIndex: zCounter++,
            });
          }

          if (paragraphs.length > 0) {
            elements.push({
              id: `el-${slideNum}-${zCounter}`,
              type: 'text',
              ...pct,
              fillColor: shapeImageSrc ? undefined : fillColor,
              borderColor,
              rotationDeg: mapped.rotationDeg,
              paragraphs,
              isTitle: phType === 'title' || phType === 'ctrtitle',
              zIndex: zCounter++,
            });
          } else if (!shapeImageSrc && (fillColor || borderColor)) {
            const shapeKind =
              prst === 'ellipse'
                ? 'ellipse'
                : prst === 'roundRect'
                  ? 'roundRect'
                  : prst === 'line' || prst.includes('Connector')
                    ? 'line'
                    : 'rect';
            elements.push({
              id: `el-${slideNum}-${zCounter}`,
              type: 'shape',
              ...pct,
              fillColor,
              borderColor,
              rotationDeg: mapped.rotationDeg,
              shapeKind,
              zIndex: zCounter++,
            });
          }
        }
      }
    };

    // 1. Decorative graphics/logos from slideMaster & slideLayout (behind slide elements)
    if (masterDoc) {
      const masterTree = findDescendants(masterDoc, 'spTree')[0];
      if (masterTree) {
        for (const child of directChildren(masterTree)) {
          await processTreeNode(child, masterRels, true);
        }
      }
    }
    if (layoutDoc) {
      const layoutTree = findDescendants(layoutDoc, 'spTree')[0];
      if (layoutTree) {
        for (const child of directChildren(layoutTree)) {
          await processTreeNode(child, layoutRels, true);
        }
      }
    }

    // 2. Slide's own elements
    const spTree = findDescendants(slideDoc, 'spTree')[0];
    if (spTree) {
      for (const child of directChildren(spTree)) {
        await processTreeNode(child, slideRels, false);
      }
    }

    // Speaker notes via exact slideN.xml.rels relationship
    let notes = '';
    const notesRel = Array.from(slideRels.values()).find((r) =>
      r.type.toLowerCase().endsWith('/notesslide'),
    );
    const fallbackNotePath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    const noteXmlPath = notesRel?.targetPath || fallbackNotePath;
    const noteStr = await getZipFile(zip, noteXmlPath)?.async('string');
    if (noteStr) {
      const noteDoc = new DOMParser().parseFromString(noteStr, 'application/xml');
      const noteShapes = findDescendants(noteDoc, 'sp');
      const noteParts: string[] = [];
      for (const sp of noteShapes) {
        const ph = findDescendants(sp, 'ph')[0];
        const phType = (ph?.getAttribute('type') || '').toLowerCase();
        if (
          phType === 'sldnum' ||
          phType === 'sldimg' ||
          phType === 'hdr' ||
          phType === 'ftr'
        ) {
          continue;
        }
        const t = findDescendants(sp, 't')
          .map((n) => n.textContent || '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (t) noteParts.push(t);
      }
      notes = noteParts.join(' ').trim();
    }

    const fallbackTitle =
      detectedTitle || collectedBullets[0] || `Diapositiva ${slideNum}`;
    const finalBullets = detectedTitle
      ? collectedBullets
      : collectedBullets.slice(1);

    slides.push({
      id: `slide-${slideNum}`,
      index: slideNum,
      title: fallbackTitle,
      subtitle: detectedSubtitle || undefined,
      bullets: finalBullets,
      table: firstTable,
      notes,
      slideWidthPx,
      slideHeightPx,
      backgroundColor: bgInfo.backgroundColor || '#FFFFFF',
      backgroundImage: bgInfo.backgroundImage,
      elements: elements.length > 0 ? elements : undefined,
    });
  }

  return slides.length > 0
    ? slides
    : [
        {
          id: 'slide-1',
          index: 1,
          title: 'Presentación PPTX sin elementos visibles',
          bullets: [
            'No se encontraron diapositivas con contenido extraíble en el paquete XML.',
          ],
          notes: '',
        },
      ];
}

export async function parseUploadedOfficeFile(file: File): Promise<WpsDocument> {
  const lower = file.name.toLowerCase();
  const baseTitle = file.name.replace(/\.[^.]+$/, '') || 'Documento importado';
  const id = `doc-${Date.now()}`;

  if (lower.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const pdfBase64 = uint8ToBase64(bytes);
    return {
      id,
      title: baseTitle,
      format: 'PDF',
      folder: 'Importados',
      starred: false,
      updatedAt: 'Ahora mismo',
      contentHtml: '',
      pdfBase64,
      comments: [],
    };
  }

  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (isZipBytes(bytes)) {
      const slides = await parsePptxToSlides(buffer);
      return {
        id,
        title: baseTitle,
        format: lower.endsWith('.ppt') ? 'PPT' : 'PPTX',
        folder: 'Importados',
        starred: false,
        updatedAt: 'Ahora mismo',
        contentHtml: slides
          .map((s) => `<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.bullets.join(' '))}</p>`)
          .join(''),
        slides,
        comments: [],
      };
    }

    let slides = parseLegacyPptToSlides(bytes, baseTitle);
    if (slides.length === 0) {
      const extracted = extractLegacyBinaryStrings(bytes);
      if (extracted.length === 0) {
        slides = [
          {
            id: 'slide-1',
            index: 1,
            title: baseTitle,
            bullets: [
              'No se encontraron cadenas de texto sin comprimir en este archivo .ppt.',
            ],
            notes:
              'Este archivo binario puede estar cifrado o contener únicamente diapositivas rasterizadas.',
          },
        ];
      } else {
        const chunkSize = 5;
        for (let i = 0; i < extracted.length; i += chunkSize) {
          const chunk = extracted.slice(i, i + chunkSize);
          const idx = slides.length + 1;
          slides.push({
            id: `slide-${idx}`,
            index: idx,
            title: chunk[0],
            bullets: chunk.slice(1),
            notes: 'Texto recuperado del archivo binario (.ppt).',
          });
        }
      }
    }

    return {
      id,
      title: baseTitle,
      format: 'PPT',
      folder: 'Importados',
      starred: false,
      updatedAt: 'Ahora mismo',
      contentHtml: slides
        .map((s) => `<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.bullets.join(' '))}</p>`)
        .join(''),
      slides,
      comments: [],
    };
  }

  if (lower.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    const contentHtml = await parseDocxToHtml(buffer);
    return {
      id,
      title: baseTitle,
      format: 'DOCX',
      folder: 'Importados',
      starred: false,
      updatedAt: 'Ahora mismo',
      contentHtml,
      comments: [],
    };
  }

  if (lower.endsWith('.doc')) {
    const buffer = await file.arrayBuffer();
    const textPreview = new TextDecoder('utf-8', { fatal: false }).decode(
      buffer.slice(0, 4096),
    );

    if (/<html|<body|<!doctype/i.test(textPreview)) {
      const fullHtml = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      const parsed = new DOMParser().parseFromString(fullHtml, 'text/html');
      return {
        id,
        title: baseTitle,
        format: 'DOC',
        folder: 'Importados',
        starred: false,
        updatedAt: 'Ahora mismo',
        contentHtml: parsed.body.innerHTML || '<p></p>',
        comments: [],
      };
    }

    const bytes = new Uint8Array(buffer);
    if (isZipBytes(bytes)) {
      const contentHtml = await parseDocxToHtml(buffer);
      return {
        id,
        title: baseTitle,
        format: 'DOC',
        folder: 'Importados',
        starred: false,
        updatedAt: 'Ahora mismo',
        contentHtml,
        comments: [],
      };
    }

    const extracted = extractLegacyBinaryStrings(bytes);
    const contentHtml =
      extracted.length > 0
        ? `<h1>${escapeHtml(baseTitle)}</h1>` +
          extracted.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
        : `<h1>${escapeHtml(baseTitle)}</h1><p>No se pudieron extraer párrafos legibles de este archivo binario .doc.</p>`;

    return {
      id,
      title: baseTitle,
      format: 'DOC',
      folder: 'Importados',
      starred: false,
      updatedAt: 'Ahora mismo',
      contentHtml,
      comments: [],
    };
  }

  const raw = await file.text();
  const isHtml = /\.html?$/i.test(file.name);
  const contentHtml = isHtml
    ? raw
    : raw
        .split(/\r?\n\r?\n/)
        .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br/>')}</p>`)
        .join('');

  return {
    id,
    title: baseTitle,
    format: isHtml ? 'DOCX' : 'TXT',
    folder: 'Importados',
    starred: false,
    updatedAt: 'Ahora mismo',
    contentHtml: contentHtml || '<p></p>',
    comments: [],
  };
}
