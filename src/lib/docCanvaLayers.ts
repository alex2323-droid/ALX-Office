import type { WpsSlideElement } from '../data/wpsDocuments';

export interface DocCanvaState {
  bodyHtml: string;
  layers: WpsSlideElement[];
  pageBgColor?: string;
  pageBgGradient?: string;
}

const CANVA_LAYER_TAG_RE = /<div[^>]*data-alx-canva-layers="1"[^>]*>[\s\S]*?<\/div>/gi;

function encodeJsonB64(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function decodeJsonB64<T>(b64: string): T | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function stripDocCanvaLayerMarkup(html: string): string {
  return (html || '').replace(CANVA_LAYER_TAG_RE, '').trim();
}

export function extractDocCanvaLayers(contentHtml: string): DocCanvaState {
  const raw = contentHtml || '';
  const bodyHtml = stripDocCanvaLayerMarkup(raw);

  const match = raw.match(/data-alx-canva-layers="1"[^>]*data-layers="([^"]+)"/i);
  let layers: WpsSlideElement[] = [];
  if (match?.[1]) {
    const decoded = decodeJsonB64<WpsSlideElement[]>(match[1]);
    if (Array.isArray(decoded)) {
      layers = decoded;
    }
  }

  const bgMatch = raw.match(/data-page-bg="([^"]*)"/i);
  const gradMatch = raw.match(/data-page-grad="([^"]*)"/i);

  return {
    bodyHtml,
    layers,
    pageBgColor: bgMatch?.[1] || undefined,
    pageBgGradient: gradMatch?.[1] ? decodeURIComponent(gradMatch[1]) : undefined,
  };
}

export function mergeDocCanvaLayers(
  bodyHtml: string,
  layers: WpsSlideElement[],
  options?: { pageBgColor?: string; pageBgGradient?: string },
): string {
  const cleanBody = stripDocCanvaLayerMarkup(bodyHtml);
  const hasLayers = layers.length > 0;
  const hasCustomBg = Boolean(
    options?.pageBgGradient || (options?.pageBgColor && options.pageBgColor !== '#FFFFFF'),
  );

  if (!hasLayers && !hasCustomBg) {
    return cleanBody;
  }

  const encodedLayers = encodeJsonB64(layers);
  const bgAttr = options?.pageBgColor ? ` data-page-bg="${options.pageBgColor.replace(/"/g, '')}"` : '';
  const gradAttr = options?.pageBgGradient
    ? ` data-page-grad="${encodeURIComponent(options.pageBgGradient)}"`
    : '';

  return `${cleanBody}<div data-alx-canva-layers="1" data-layers="${encodedLayers}"${bgAttr}${gradAttr} style="display:none"></div>`;
}
