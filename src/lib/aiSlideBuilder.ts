import type { WpsSlide, WpsSlideElement } from '../data/wpsDocuments';
import type { AiSlideEditResponse, SlideVisualStyle } from './aiEditorClient';

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isDarkHexColor(hex: string | undefined): boolean {
  if (!hex) return false;
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.48;
}

const VISUAL_STYLE_CYCLE: SlideVisualStyle[] = [
  'bento-grid',
  'editorial-hero',
  'split-right',
  'diagonal-band',
  'header-banner',
  'split-left',
  'sidebar-left',
  'spotlight',
  'minimal-frame',
  'top-bar',
];

function resolveVisualStyle(
  requested: SlideVisualStyle | undefined,
  slideIndex: number,
): SlideVisualStyle {
  if (requested && VISUAL_STYLE_CYCLE.includes(requested)) {
    return requested;
  }
  return VISUAL_STYLE_CYCLE[Math.abs(slideIndex) % VISUAL_STYLE_CYCLE.length];
}

export function buildWpsSlideFromAiProposal(
  result: AiSlideEditResponse,
  slideIndex: number,
  idPrefix = `s-${Date.now()}`,
): WpsSlide {
  const now = `${idPrefix}-${slideIndex}`;
  const bg = result.backgroundColor?.trim() || '#FFFFFF';
  const gradient = result.backgroundGradient?.trim() || undefined;
  const accent = result.accentColor?.trim() || '#7C3AED';
  const secondaryAccent = result.accentSecondaryColor?.trim() || accent;
  const isDarkBg =
    isDarkHexColor(bg) ||
    Boolean(gradient && /#0f172a|#1e1b4b|#111827|#1e293b|#312e81/i.test(gradient));

  const primaryText =
    result.textColor?.trim() || (isDarkBg ? '#F8FAFC' : '#0F172A');
  const secondaryText = isDarkBg ? '#CBD5E1' : '#475569';
  const onAccentText = isDarkHexColor(accent) ? '#FFFFFF' : '#0F172A';
  const onAccentSub = isDarkHexColor(accent) ? '#E2E8F0' : '#334155';
  const fontFamily =
    result.fontFamily?.trim() || '"Plus Jakarta Sans", system-ui, sans-serif';
  const visualStyle = resolveVisualStyle(result.visualStyle, slideIndex);

  const rawAny = result as unknown as Record<string, unknown>;
  const rawBulletSource =
    Array.isArray(result.bullets) && result.bullets.length > 0
      ? result.bullets
      : Array.isArray(rawAny.cards)
        ? rawAny.cards
        : Array.isArray(rawAny.items)
          ? rawAny.items
          : Array.isArray(rawAny.points)
            ? rawAny.points
            : [];

  const extractedBullets = rawBulletSource
    .map((entry: unknown) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const head = String(obj.title ?? obj.heading ?? obj.label ?? '').trim();
        const body = String(obj.description ?? obj.body ?? obj.text ?? '').trim();
        if (head && body) return `${head}: ${body}`;
        return head || body;
      }
      return '';
    })
    .filter(
      (line: string) =>
        line.length > 0 && !/^contenido generado (por|con) ia$/i.test(line),
    );

  const safeBullets =
    extractedBullets.length > 0
      ? extractedBullets
      : result.subtitle?.trim()
        ? [result.subtitle.trim()]
        : [result.title?.trim() || 'Resumen'];

  // COVER LAYOUTS WITH VARIED CANVA COMPOSITIONS
  if (result.layoutType === 'cover') {
    const elements: WpsSlideElement[] = [];
    const sub = result.subtitle || safeBullets[0] || '';

    if (visualStyle === 'split-left') {
      elements.push(
        {
          id: `ai-cover-panel-${now}`,
          type: 'shape',
          shapeKind: 'rect',
          xPct: 62,
          yPct: 0,
          wPct: 38,
          hPct: 100,
          fillColor: accent,
          zIndex: 1,
        },
        {
          id: `ai-cover-orb-${now}`,
          type: 'shape',
          shapeKind: 'ellipse',
          xPct: 71,
          yPct: 24,
          wPct: 20,
          hPct: 35.5,
          fillColor: '#FFFFFF',
          opacity: 0.16,
          zIndex: 2,
        },
        {
          id: `ai-cover-pill-${now}`,
          type: 'shape',
          shapeKind: 'roundRect',
          xPct: 7,
          yPct: 22,
          wPct: 14,
          hPct: 2,
          fillColor: accent,
          borderRadiusPx: 99,
          zIndex: 3,
        },
        {
          id: `ai-cover-title-${now}`,
          type: 'text',
          isTitle: true,
          xPct: 7,
          yPct: 28,
          wPct: 50,
          hPct: 28,
          fontFamily,
          fontSizePt: 32,
          richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [
                {
                  text: result.title,
                  bold: true,
                  fontSizePt: 32,
                  color: primaryText,
                },
              ],
            },
          ],
          zIndex: 4,
        },
      );
      if (sub) {
        elements.push({
          id: `ai-cover-sub-${now}`,
          type: 'text',
          xPct: 7,
          yPct: 58,
          wPct: 50,
          hPct: 20,
          fontFamily,
          fontSizePt: 15,
          richHtml: `<p>${escapeHtmlText(sub)}</p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: sub, fontSizePt: 15, color: secondaryText }],
            },
          ],
          zIndex: 5,
        });
      }
    } else if (visualStyle === 'sidebar-left') {
      elements.push(
        {
          id: `ai-cover-side-${now}`,
          type: 'shape',
          shapeKind: 'rect',
          xPct: 0,
          yPct: 0,
          wPct: 26,
          hPct: 100,
          fillColor: accent,
          zIndex: 1,
        },
        {
          id: `ai-cover-dot-${now}`,
          type: 'shape',
          shapeKind: 'ellipse',
          xPct: 6,
          yPct: 66,
          wPct: 14,
          hPct: 25,
          fillColor: '#FFFFFF',
          opacity: 0.18,
          zIndex: 2,
        },
        {
          id: `ai-cover-title-${now}`,
          type: 'text',
          isTitle: true,
          xPct: 33,
          yPct: 28,
          wPct: result.imageUrl ? 25 : 60,
          hPct: 26,
          fontFamily,
          fontSizePt: result.imageUrl ? 26 : 34,
          richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [
                {
                  text: result.title,
                  bold: true,
                  fontSizePt: result.imageUrl ? 26 : 34,
                  color: primaryText,
                },
              ],
            },
          ],
          zIndex: 3,
        },
      );
      if (sub) {
        elements.push({
          id: `ai-cover-sub-${now}`,
          type: 'text',
          xPct: 33,
          yPct: 56,
          wPct: result.imageUrl ? 25 : 58,
          hPct: 20,
          fontFamily,
          fontSizePt: 16,
          richHtml: `<p>${escapeHtmlText(sub)}</p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: sub, fontSizePt: 16, color: secondaryText }],
            },
          ],
          zIndex: 4,
        });
      }
    } else if (visualStyle === 'minimal-frame') {
      elements.push(
        {
          id: `ai-cover-frame-${now}`,
          type: 'shape',
          shapeKind: 'roundRect',
          xPct: 4,
          yPct: 6,
          wPct: 92,
          hPct: 88,
          fillColor: 'transparent',
          borderColor: accent,
          borderWidthPx: 2,
          borderRadiusPx: 18,
          opacity: 0.55,
          zIndex: 1,
        },
        {
          id: `ai-cover-title-${now}`,
          type: 'text',
          isTitle: true,
          xPct: result.imageUrl ? 8 : 12,
          yPct: 28,
          wPct: result.imageUrl ? 48 : 76,
          hPct: 26,
          fontFamily,
          fontSizePt: result.imageUrl ? 28 : 34,
          richHtml: `<p style="text-align:${result.imageUrl ? 'left' : 'center'}"><strong>${escapeHtmlText(result.title)}</strong></p>`,
          paragraphs: [
            {
              align: result.imageUrl ? 'left' : 'center',
              runs: [
                {
                  text: result.title,
                  bold: true,
                  fontSizePt: result.imageUrl ? 28 : 34,
                  color: primaryText,
                },
              ],
            },
          ],
          zIndex: 2,
        },
        {
          id: `ai-cover-line-${now}`,
          type: 'shape',
          shapeKind: 'line',
          xPct: result.imageUrl ? 8 : 42,
          yPct: 55,
          wPct: 16,
          hPct: 1,
          borderColor: accent,
          borderWidthPx: 3,
          zIndex: 3,
        },
      );
      if (sub) {
        elements.push({
          id: `ai-cover-sub-${now}`,
          type: 'text',
          xPct: result.imageUrl ? 8 : 14,
          yPct: 60,
          wPct: result.imageUrl ? 48 : 72,
          hPct: 18,
          fontFamily,
          fontSizePt: 16,
          richHtml: `<p style="text-align:${result.imageUrl ? 'left' : 'center'}">${escapeHtmlText(sub)}</p>`,
          paragraphs: [
            {
              align: result.imageUrl ? 'left' : 'center',
              runs: [{ text: sub, fontSizePt: 16, color: secondaryText }],
            },
          ],
          zIndex: 4,
        });
      }
    } else if (visualStyle === 'editorial-hero') {
      elements.push(
        {
          id: `ai-cover-ed-top-${now}`,
          type: 'shape',
          shapeKind: 'rect',
          xPct: 6,
          yPct: 10,
          wPct: 88,
          hPct: 0.7,
          fillColor: accent,
          zIndex: 1,
        },
        {
          id: `ai-cover-ed-num-${now}`,
          type: 'text',
          xPct: 6,
          yPct: 14,
          wPct: 24,
          hPct: 10,
          fontFamily,
          fontSizePt: 12,
          richHtml: `<p><strong style="color:${accent}">EDICIÓN · 01</strong></p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: 'EDICIÓN · 01', bold: true, fontSizePt: 12, color: accent }],
            },
          ],
          zIndex: 2,
        },
        {
          id: `ai-cover-title-${now}`,
          type: 'text',
          isTitle: true,
          xPct: 6,
          yPct: 25,
          wPct: result.imageUrl ? 50 : 84,
          hPct: 32,
          fontFamily,
          fontSizePt: result.imageUrl ? 30 : 38,
          richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [
                {
                  text: result.title,
                  bold: true,
                  fontSizePt: result.imageUrl ? 30 : 38,
                  color: primaryText,
                },
              ],
            },
          ],
          zIndex: 3,
        },
        {
          id: `ai-cover-ed-bot-${now}`,
          type: 'shape',
          shapeKind: 'rect',
          xPct: 6,
          yPct: 86,
          wPct: 22,
          hPct: 1.8,
          fillColor: secondaryAccent,
          borderRadiusPx: 99,
          zIndex: 2,
        },
      );
      if (sub) {
        elements.push({
          id: `ai-cover-sub-${now}`,
          type: 'text',
          xPct: 6,
          yPct: 60,
          wPct: result.imageUrl ? 50 : 68,
          hPct: 20,
          fontFamily,
          fontSizePt: 16,
          richHtml: `<p>${escapeHtmlText(sub)}</p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: sub, fontSizePt: 16, color: secondaryText }],
            },
          ],
          zIndex: 4,
        });
      }
    } else if (visualStyle === 'diagonal-band' || visualStyle === 'split-right') {
      elements.push(
        {
          id: `ai-cover-diag-1-${now}`,
          type: 'shape',
          shapeKind: 'rect',
          xPct: 58,
          yPct: -12,
          wPct: 54,
          hPct: 124,
          fillColor: accent,
          rotationDeg: visualStyle === 'diagonal-band' ? -10 : 0,
          zIndex: 1,
        },
        {
          id: `ai-cover-diag-2-${now}`,
          type: 'shape',
          shapeKind: 'roundRect',
          xPct: 64,
          yPct: 68,
          wPct: 28,
          hPct: 22,
          fillColor: secondaryAccent,
          borderRadiusPx: 20,
          opacity: 0.35,
          zIndex: 2,
        },
        {
          id: `ai-cover-title-${now}`,
          type: 'text',
          isTitle: true,
          xPct: 6,
          yPct: 24,
          wPct: 48,
          hPct: 30,
          fontFamily,
          fontSizePt: 33,
          richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: result.title, bold: true, fontSizePt: 33, color: primaryText }],
            },
          ],
          zIndex: 4,
        },
      );
      if (sub) {
        elements.push({
          id: `ai-cover-sub-${now}`,
          type: 'text',
          xPct: 6,
          yPct: 57,
          wPct: 46,
          hPct: 22,
          fontFamily,
          fontSizePt: 15,
          richHtml: `<p>${escapeHtmlText(sub)}</p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: sub, fontSizePt: 15, color: secondaryText }],
            },
          ],
          zIndex: 5,
        });
      }
    } else {
      // spotlight / header-banner / top-bar / bento-grid cover
      elements.push(
        {
          id: `ai-cover-orb1-${now}`,
          type: 'shape',
          shapeKind: 'ellipse',
          xPct: 74,
          yPct: -14,
          wPct: 32,
          hPct: 56,
          fillColor: accent,
          opacity: 0.16,
          zIndex: 1,
        },
        {
          id: `ai-cover-orb2-${now}`,
          type: 'shape',
          shapeKind: 'ellipse',
          xPct: 80,
          yPct: 58,
          wPct: 22,
          hPct: 38,
          fillColor: secondaryAccent,
          opacity: 0.12,
          zIndex: 1,
        },
        {
          id: `ai-cover-badge-${now}`,
          type: 'shape',
          shapeKind: 'roundRect',
          xPct: 8,
          yPct: 22,
          wPct: 14,
          hPct: 2,
          fillColor: accent,
          borderRadiusPx: 99,
          zIndex: 2,
        },
        {
          id: `ai-cover-title-${now}`,
          type: 'text',
          isTitle: true,
          xPct: 8,
          yPct: 28,
          wPct: result.imageUrl ? 48 : 74,
          hPct: 28,
          fontFamily,
          fontSizePt: result.imageUrl ? 28 : 34,
          richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [
                {
                  text: result.title,
                  bold: true,
                  fontSizePt: result.imageUrl ? 28 : 34,
                  color: primaryText,
                },
              ],
            },
          ],
          zIndex: 3,
        },
      );
      if (sub) {
        elements.push({
          id: `ai-cover-sub-${now}`,
          type: 'text',
          xPct: 8,
          yPct: 58,
          wPct: result.imageUrl ? 48 : 72,
          hPct: 18,
          fontFamily,
          fontSizePt: 16,
          richHtml: `<p>${escapeHtmlText(sub)}</p>`,
          paragraphs: [
            {
              align: 'left',
              runs: [{ text: sub, fontSizePt: 16, color: secondaryText }],
            },
          ],
          zIndex: 4,
        });
      }
    }

    if (result.imageUrl) {
      elements.push({
        id: `ai-cover-img-${now}`,
        type: 'image',
        src: result.imageUrl,
        alt: result.imageAlt || result.title,
        xPct: visualStyle === 'split-left' ? 64 : 60,
        yPct: 18,
        wPct: 33,
        hPct: 64,
        imageFit: 'cover',
        borderRadiusPx: 16,
        borderColor: visualStyle === 'split-left' ? '#FFFFFF' : accent,
        borderWidthPx: 2,
        shadow: 'elevated',
        zIndex: 6,
      });
    }

    return {
      id: now,
      index: slideIndex,
      title: result.title,
      subtitle: result.subtitle,
      bullets: safeBullets,
      notes: result.notes || '',
      backgroundColor: bg,
      backgroundGradient: gradient,
      elements,
    };
  }

  // CONTENT SLIDES WITH 6 DISTINCT CANVA COMPOSITIONS
  const builtElements: WpsSlideElement[] = [];
  let nextZ = 1;
  let contentBox = { x: 6, y: 28, w: 88, h: 64 };

  if (visualStyle === 'sidebar-left') {
    builtElements.push(
      {
        id: `ai-side-bg-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 0,
        yPct: 0,
        wPct: 31,
        hPct: 100,
        fillColor: accent,
        zIndex: nextZ++,
      },
      {
        id: `ai-side-orb-${now}`,
        type: 'shape',
        shapeKind: 'ellipse',
        xPct: -5,
        yPct: 68,
        wPct: 20,
        hPct: 35,
        fillColor: '#FFFFFF',
        opacity: 0.14,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 3.5,
        yPct: 12,
        wPct: 24,
        hPct: 32,
        fontFamily,
        fontSizePt: 23,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.title,
                bold: true,
                fontSizePt: 23,
                color: onAccentText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 3.5,
        yPct: 46,
        wPct: 24,
        hPct: 26,
        fontFamily,
        fontSizePt: 13,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.subtitle,
                fontSizePt: 13,
                color: onAccentSub,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      });
    }
    contentBox = { x: 35, y: 10, w: 60, h: 80 };
  } else if (visualStyle === 'header-banner') {
    builtElements.push(
      {
        id: `ai-banner-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 0,
        yPct: 0,
        wPct: 100,
        hPct: result.subtitle ? 25 : 20,
        fillColor: accent,
        zIndex: nextZ++,
      },
      {
        id: `ai-banner-orb-${now}`,
        type: 'shape',
        shapeKind: 'ellipse',
        xPct: 84,
        yPct: -12,
        wPct: 20,
        hPct: 36,
        fillColor: '#FFFFFF',
        opacity: 0.14,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 6,
        yPct: 4.5,
        wPct: 84,
        hPct: 11,
        fontFamily,
        fontSizePt: 25,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.title,
                bold: true,
                fontSizePt: 25,
                color: onAccentText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 6,
        yPct: 15.5,
        wPct: 84,
        hPct: 7.5,
        fontFamily,
        fontSizePt: 13,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.subtitle,
                fontSizePt: 13,
                color: onAccentSub,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      });
    }
    const startY = result.subtitle ? 30 : 25;
    contentBox = { x: 6, y: startY, w: 88, h: 93 - startY };
  } else if (visualStyle === 'split-left') {
    builtElements.push(
      {
        id: `ai-split-bar-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 5,
        yPct: 14,
        wPct: 1.4,
        hPct: 26,
        fillColor: accent,
        borderRadiusPx: 8,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 8.5,
        yPct: 13,
        wPct: 35,
        hPct: 28,
        fontFamily,
        fontSizePt: 24,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.title,
                bold: true,
                fontSizePt: 24,
                color: primaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
      {
        id: `ai-split-pill-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 8.5,
        yPct: 76,
        wPct: 14,
        hPct: 2,
        fillColor: secondaryAccent,
        borderRadiusPx: 99,
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 8.5,
        yPct: 43,
        wPct: 35,
        hPct: 28,
        fontFamily,
        fontSizePt: 14,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.subtitle,
                fontSizePt: 14,
                color: secondaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      });
    }
    contentBox = { x: 47, y: 10, w: 47, h: 80 };
  } else if (visualStyle === 'minimal-frame') {
    builtElements.push(
      {
        id: `ai-frame-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 3,
        yPct: 4,
        wPct: 94,
        hPct: 92,
        fillColor: 'transparent',
        borderColor: accent,
        borderWidthPx: 1.5,
        borderRadiusPx: 14,
        opacity: 0.4,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 7,
        yPct: 8,
        wPct: 86,
        hPct: 12,
        fontFamily,
        fontSizePt: 25,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.title,
                bold: true,
                fontSizePt: 25,
                color: primaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
      {
        id: `ai-divider-${now}`,
        type: 'shape',
        shapeKind: 'line',
        xPct: 7,
        yPct: 21,
        wPct: 16,
        hPct: 1,
        borderColor: accent,
        borderWidthPx: 3,
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 26,
        yPct: 19,
        wPct: 67,
        hPct: 8,
        fontFamily,
        fontSizePt: 13,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.subtitle,
                fontSizePt: 13,
                color: secondaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      });
    }
    contentBox = { x: 7, y: 29, w: 86, h: 61 };
  } else if (visualStyle === 'spotlight') {
    builtElements.push(
      {
        id: `ai-spot-orb1-${now}`,
        type: 'shape',
        shapeKind: 'ellipse',
        xPct: 82,
        yPct: -8,
        wPct: 24,
        hPct: 42,
        fillColor: accent,
        opacity: 0.12,
        zIndex: nextZ++,
      },
      {
        id: `ai-spot-orb2-${now}`,
        type: 'shape',
        shapeKind: 'ellipse',
        xPct: -6,
        yPct: 76,
        wPct: 20,
        hPct: 34,
        fillColor: secondaryAccent,
        opacity: 0.09,
        zIndex: nextZ++,
      },
      {
        id: `ai-spot-pill-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 6,
        yPct: 6,
        wPct: 11,
        hPct: 2,
        fillColor: accent,
        borderRadiusPx: 99,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 6,
        yPct: 10,
        wPct: 82,
        hPct: 12,
        fontFamily,
        fontSizePt: 26,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.title,
                bold: true,
                fontSizePt: 26,
                color: primaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 6,
        yPct: 22,
        wPct: 82,
        hPct: 8,
        fontFamily,
        fontSizePt: 14,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.subtitle,
                fontSizePt: 14,
                color: secondaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      });
    }
    const startY = result.subtitle ? 31 : 25;
    contentBox = { x: 6, y: startY, w: 88, h: 92 - startY };
  } else if (visualStyle === 'bento-grid') {
    builtElements.push(
      {
        id: `ai-bento-kicker-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 5,
        yPct: 5.5,
        wPct: 9,
        hPct: 2.2,
        fillColor: accent,
        borderRadiusPx: 99,
        zIndex: nextZ++,
      },
      {
        id: `ai-bento-dot-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 15.2,
        yPct: 5.5,
        wPct: 4.5,
        hPct: 2.2,
        fillColor: secondaryAccent,
        borderRadiusPx: 99,
        opacity: 0.75,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 5,
        yPct: 9.5,
        wPct: 64,
        hPct: 12,
        fontFamily,
        fontSizePt: 25,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.title,
                bold: true,
                fontSizePt: 25,
                color: primaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
      {
        id: `ai-bento-index-${now}`,
        type: 'text',
        xPct: 82,
        yPct: 7,
        wPct: 13,
        hPct: 10,
        fillColor: isDarkBg ? 'rgba(30, 41, 59, 0.75)' : '#F1F5F9',
        borderColor: accent,
        borderWidthPx: 1,
        borderRadiusPx: 12,
        fontFamily,
        fontSizePt: 13,
        richHtml: `<p style="text-align:center"><strong style="color:${accent}">${String(slideIndex).padStart(2, '0')}</strong></p>`,
        paragraphs: [
          {
            align: 'center',
            runs: [
              {
                text: String(slideIndex).padStart(2, '0'),
                bold: true,
                fontSizePt: 13,
                color: accent,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 5,
        yPct: 20.5,
        wPct: 88,
        hPct: 7,
        fontFamily,
        fontSizePt: 13,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: result.subtitle, fontSizePt: 13, color: secondaryText }],
          },
        ],
        zIndex: nextZ++,
      });
    }
    const startY = result.subtitle ? 29 : 23.5;
    contentBox = { x: 5, y: startY, w: 90, h: 94 - startY };
  } else if (visualStyle === 'editorial-hero') {
    const idxLabel = String(slideIndex).padStart(2, '0');
    builtElements.push(
      {
        id: `ai-ed-num-${now}`,
        type: 'text',
        xPct: 5,
        yPct: 5,
        wPct: 13,
        hPct: 16,
        fontFamily,
        fontSizePt: 34,
        richHtml: `<p><strong style="color:${accent}">${idxLabel}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: idxLabel, bold: true, fontSizePt: 34, color: accent }],
          },
        ],
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 19,
        yPct: 6.5,
        wPct: 75,
        hPct: 13,
        fontFamily,
        fontSizePt: 25,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: result.title, bold: true, fontSizePt: 25, color: primaryText }],
          },
        ],
        zIndex: nextZ++,
      },
      {
        id: `ai-ed-rule-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 5,
        yPct: 22.5,
        wPct: 90,
        hPct: 0.6,
        fillColor: isDarkBg ? 'rgba(148,163,184,0.35)' : '#CBD5E1',
        zIndex: nextZ++,
      },
      {
        id: `ai-ed-accent-rule-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 5,
        yPct: 22.2,
        wPct: 22,
        hPct: 1.2,
        fillColor: accent,
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 19,
        yPct: 16.5,
        wPct: 75,
        hPct: 5.5,
        fontFamily,
        fontSizePt: 12.5,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: result.subtitle, fontSizePt: 12.5, color: secondaryText }],
          },
        ],
        zIndex: nextZ++,
      });
    }
    contentBox = { x: 5, y: 27, w: 90, h: 66 };
  } else if (visualStyle === 'diagonal-band') {
    builtElements.push(
      {
        id: `ai-diag-strip-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 72,
        yPct: -14,
        wPct: 38,
        hPct: 48,
        fillColor: accent,
        opacity: 0.16,
        rotationDeg: -14,
        zIndex: nextZ++,
      },
      {
        id: `ai-diag-pill-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 0,
        yPct: 0,
        wPct: 2.2,
        hPct: 100,
        fillColor: accent,
        zIndex: nextZ++,
      },
      {
        id: `ai-diag-pill2-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 2.2,
        yPct: 0,
        wPct: 0.8,
        hPct: 100,
        fillColor: secondaryAccent,
        opacity: 0.7,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 7,
        yPct: 6.5,
        wPct: 82,
        hPct: 13,
        fontFamily,
        fontSizePt: 26,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: result.title, bold: true, fontSizePt: 26, color: primaryText }],
          },
        ],
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 7,
        yPct: 19,
        wPct: 80,
        hPct: 7.5,
        fontFamily,
        fontSizePt: 13.5,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: result.subtitle, fontSizePt: 13.5, color: secondaryText }],
          },
        ],
        zIndex: nextZ++,
      });
    }
    const startY = result.subtitle ? 29 : 23;
    contentBox = { x: 7, y: startY, w: 87, h: 93 - startY };
  } else if (visualStyle === 'split-right') {
    builtElements.push(
      {
        id: `ai-sr-panel-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 66,
        yPct: 0,
        wPct: 34,
        hPct: 100,
        fillColor: accent,
        zIndex: nextZ++,
      },
      {
        id: `ai-sr-accent-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 70,
        yPct: 82,
        wPct: 14,
        hPct: 2.2,
        fillColor: secondaryAccent,
        borderRadiusPx: 99,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 69.5,
        yPct: 14,
        wPct: 27,
        hPct: 34,
        fontFamily,
        fontSizePt: 23,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: result.title, bold: true, fontSizePt: 23, color: onAccentText }],
          },
        ],
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 69.5,
        yPct: 49,
        wPct: 27,
        hPct: 26,
        fontFamily,
        fontSizePt: 13,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [{ text: result.subtitle, fontSizePt: 13, color: onAccentSub }],
          },
        ],
        zIndex: nextZ++,
      });
    }
    contentBox = { x: 5, y: 10, w: 57, h: 80 };
  } else {
    // top-bar
    builtElements.push(
      {
        id: `ai-bar-${now}`,
        type: 'shape',
        shapeKind: 'rect',
        xPct: 0,
        yPct: 0,
        wPct: 100,
        hPct: 2.5,
        fillColor: accent,
        zIndex: nextZ++,
      },
      {
        id: `ai-top-pill-${now}`,
        type: 'shape',
        shapeKind: 'roundRect',
        xPct: 88,
        yPct: 7.5,
        wPct: 6,
        hPct: 2,
        fillColor: secondaryAccent,
        borderRadiusPx: 99,
        opacity: 0.7,
        zIndex: nextZ++,
      },
      {
        id: `ai-title-${now}`,
        type: 'text',
        isTitle: true,
        xPct: 6,
        yPct: 6,
        wPct: 80,
        hPct: result.subtitle ? 12 : 15,
        fontFamily,
        fontSizePt: 26,
        richHtml: `<p><strong>${escapeHtmlText(result.title)}</strong></p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.title,
                bold: true,
                fontSizePt: 26,
                color: primaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      },
    );
    if (result.subtitle) {
      builtElements.push({
        id: `ai-sub-${now}`,
        type: 'text',
        xPct: 6,
        yPct: 18,
        wPct: 84,
        hPct: 8,
        fontFamily,
        fontSizePt: 14,
        richHtml: `<p>${escapeHtmlText(result.subtitle)}</p>`,
        paragraphs: [
          {
            align: 'left',
            runs: [
              {
                text: result.subtitle,
                fontSizePt: 14,
                color: secondaryText,
              },
            ],
          },
        ],
        zIndex: nextZ++,
      });
    }
    const startY = result.subtitle ? 28 : 23;
    contentBox = { x: 6, y: startY, w: 88, h: 92 - startY };
  }

  if (result.imageUrl) {
    const imgW = contentBox.w >= 70 ? 33 : 24;
    const gap = 3;
    const imgX = Number((contentBox.x + contentBox.w - imgW).toFixed(1));
    const imgY = Number(contentBox.y.toFixed(1));
    const imgH = Number(Math.min(contentBox.h, 58).toFixed(1));
    builtElements.push({
      id: `ai-img-${now}`,
      type: 'image',
      src: result.imageUrl,
      alt: result.imageAlt || result.title,
      xPct: imgX,
      yPct: imgY,
      wPct: imgW,
      hPct: imgH,
      imageFit: 'cover',
      borderRadiusPx: 14,
      borderColor: accent,
      borderWidthPx: 1.5,
      shadow: 'soft',
      zIndex: nextZ++,
    });
    contentBox = {
      ...contentBox,
      w: Math.max(30, Number((contentBox.w - imgW - gap).toFixed(1))),
    };
  }

  // PLACE MAIN CONTENT ELEMENT(S) INSIDE contentBox
  if (
    result.layoutType === 'chart' &&
    result.chartPoints &&
    result.chartPoints.length > 0
  ) {
    builtElements.push({
      id: `ai-chart-${now}`,
      type: 'chart',
      chartKind: result.chartKind || 'bar',
      xPct: contentBox.x,
      yPct: contentBox.y,
      wPct: contentBox.w,
      hPct: contentBox.h,
      title: result.chartTitle || result.title,
      fillColor: isDarkBg ? 'rgba(15, 23, 42, 0.85)' : '#FFFFFF',
      borderColor: accent,
      borderRadiusPx: 14,
      shadow: 'soft',
      series: [
        {
          name: result.title,
          points: result.chartPoints.slice(0, 6),
        },
      ],
      zIndex: nextZ++,
    });
  } else if (result.layoutType === 'diagram') {
    builtElements.push({
      id: `ai-diag-${now}`,
      type: 'diagram',
      xPct: contentBox.x,
      yPct: contentBox.y + 1,
      wPct: contentBox.w,
      hPct: Math.min(54, contentBox.h - 2),
      fillColor: isDarkBg ? 'rgba(30, 41, 59, 0.92)' : '#F8FAFC',
      borderRadiusPx: 14,
      borderColor: accent,
      shadow: 'soft',
      items: safeBullets.slice(0, 6),
      zIndex: nextZ++,
    });
  } else if (result.layoutType === 'table') {
    const headers =
      result.tableHeaders && result.tableHeaders.length >= 2
        ? result.tableHeaders
        : ['Concepto', 'Detalle'];
    const rows =
      result.tableRows && result.tableRows.length > 0
        ? result.tableRows
        : safeBullets.slice(0, 5).map((item, idx) => {
            const splitIdx = item.indexOf(':');
            if (splitIdx > 0 && splitIdx < item.length - 1) {
              return [
                item.slice(0, splitIdx).trim(),
                item.slice(splitIdx + 1).trim(),
              ];
            }
            return [`Punto ${idx + 1}`, item];
          });

    builtElements.push({
      id: `ai-tbl-${now}`,
      type: 'table',
      xPct: contentBox.x,
      yPct: contentBox.y,
      wPct: contentBox.w,
      hPct: contentBox.h,
      headerBgColor: accent,
      headerTextColor: onAccentText,
      cellBgColor: isDarkBg ? '#1E293B' : '#FFFFFF',
      borderColor: accent,
      borderRadiusPx: 10,
      shadow: 'soft',
      headers,
      rows,
      zIndex: nextZ++,
    });
  } else if (result.layoutType === 'cards') {
    const cards = safeBullets.slice(0, 4);
    const isNarrowPanel = contentBox.w < 64;
    const useBentoAsymmetric =
      visualStyle === 'bento-grid' && !isNarrowPanel && cards.length >= 3;
    const useEditorialStrips =
      (visualStyle === 'editorial-hero' || visualStyle === 'split-right') && cards.length <= 4;

    const cols = useEditorialStrips
      ? 1
      : isNarrowPanel && cards.length <= 3
        ? 1
        : cards.length === 3 && !isNarrowPanel
          ? 3
          : cards.length <= 2
            ? cards.length
            : 2;
    const rowsCount = Math.ceil(cards.length / cols);
    const gapX = 2.6;
    const gapY = useEditorialStrips ? 2.4 : 3.4;
    const defaultCardW = (contentBox.w - gapX * (cols - 1)) / cols;
    const defaultCardH = Math.min(
      rowsCount === 1 ? contentBox.h : (contentBox.h - gapY * (rowsCount - 1)) / rowsCount,
      useEditorialStrips ? 21 : 54,
    );

    cards.forEach((txt, idx) => {
      let x: number;
      let y: number;
      let cardW: number;
      let cardH: number;
      let isHeroBento = false;

      if (useBentoAsymmetric) {
        if (idx === 0) {
          // Tall focal hero bento card on left
          isHeroBento = true;
          x = contentBox.x;
          y = contentBox.y;
          cardW = contentBox.w * 0.44;
          cardH = Math.min(contentBox.h, 62);
        } else {
          const rightCount = cards.length - 1;
          const rightIdx = idx - 1;
          const rightGap = 2.6;
          x = contentBox.x + contentBox.w * 0.44 + gapX;
          cardW = contentBox.w * 0.56 - gapX;
          cardH = (Math.min(contentBox.h, 62) - rightGap * (rightCount - 1)) / rightCount;
          y = contentBox.y + rightIdx * (cardH + rightGap);
        }
      } else {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        x = contentBox.x + col * (defaultCardW + gapX);
        y = contentBox.y + row * (defaultCardH + gapY);
        cardW = defaultCardW;
        cardH = defaultCardH;
      }

      const cardBorder = idx % 2 === 1 ? secondaryAccent : accent;
      const cardFontSize = useEditorialStrips ? 13 : cols === 3 || rowsCount >= 3 ? 12.5 : 14;
      const colonIdx = txt.indexOf(':');
      const hasSplit = colonIdx > 1 && colonIdx < 48 && colonIdx < txt.length - 1;
      const cardTitle = hasSplit ? txt.slice(0, colonIdx).trim() : '';
      const cardBody = hasSplit ? txt.slice(colonIdx + 1).trim() : txt;
      const numPrefix = `0${idx + 1}`;
      const displayHead = hasSplit ? `${numPrefix} · ${cardTitle}` : `${numPrefix} · Clave`;

      const cardFill = isHeroBento
        ? accent
        : isDarkBg
          ? '#1E293B'
          : '#F8FAFC';
      const headColor = isHeroBento
        ? onAccentText
        : isDarkBg
          ? primaryText
          : cardBorder;
      const bodyColor = isHeroBento ? onAccentSub : secondaryText;

      if (!isHeroBento) {
        builtElements.push({
          id: `ai-card-bar-${now}-${idx}`,
          type: 'shape',
          shapeKind: 'roundRect',
          xPct: Number((useEditorialStrips ? x : x + 1.4).toFixed(1)),
          yPct: Number((useEditorialStrips ? y + 1.8 : y + 1.2).toFixed(1)),
          wPct: Number(
            (useEditorialStrips ? 1.1 : Math.max(6, Math.min(14, cardW * 0.28))).toFixed(1),
          ),
          hPct: Number((useEditorialStrips ? Math.max(6, cardH - 3.6) : 1.3).toFixed(1)),
          fillColor: cardBorder,
          borderRadiusPx: 99,
          zIndex: nextZ + cards.length + idx + 1,
        });
      }

      builtElements.push({
        id: `ai-card-${now}-${idx}`,
        type: 'text',
        xPct: Number(x.toFixed(1)),
        yPct: Number(y.toFixed(1)),
        wPct: Number(cardW.toFixed(1)),
        hPct: Number(cardH.toFixed(1)),
        fillColor: cardFill,
        borderColor: isHeroBento ? accent : cardBorder,
        borderWidthPx: isHeroBento ? 0 : 1.5,
        borderRadiusPx: isHeroBento ? 18 : 14,
        shadow: isHeroBento ? 'elevated' : 'soft',
        fontFamily,
        fontSizePt: cardFontSize,
        richHtml: hasSplit
          ? `<p><strong style="color:${headColor}">${escapeHtmlText(displayHead)}</strong></p><p>${escapeHtmlText(cardBody)}</p>`
          : `<p><strong style="color:${headColor}">${numPrefix}</strong></p><p>${escapeHtmlText(txt)}</p>`,
        paragraphs: hasSplit
          ? [
              {
                align: 'left',
                runs: [
                  {
                    text: displayHead,
                    bold: true,
                    fontSizePt: isHeroBento ? cardFontSize + 3 : cardFontSize + 1,
                    color: headColor,
                  },
                ],
              },
              {
                align: 'left',
                runs: [
                  {
                    text: cardBody,
                    fontSizePt: Math.max(11, isHeroBento ? cardFontSize : cardFontSize - 1),
                    color: bodyColor,
                  },
                ],
              },
            ]
          : [
              {
                align: 'left',
                runs: [
                  {
                    text: numPrefix,
                    bold: true,
                    fontSizePt: isHeroBento ? 14 : 11,
                    color: headColor,
                  },
                ],
              },
              {
                align: 'left',
                runs: [
                  {
                    text: txt,
                    fontSizePt: cardFontSize,
                    color: isHeroBento ? onAccentText : primaryText,
                  },
                ],
              },
            ],
        zIndex: nextZ++,
      });
    });
    nextZ += cards.length + 1;
  } else {
    const bulletHtml = `<ul>${safeBullets
      .map((b) => `<li>${escapeHtmlText(b)}</li>`)
      .join('')}</ul>`;
    builtElements.push({
      id: `ai-body-${now}`,
      type: 'text',
      xPct: contentBox.x,
      yPct: contentBox.y,
      wPct: contentBox.w,
      hPct: contentBox.h,
      fillColor: isDarkBg ? 'rgba(30, 41, 59, 0.52)' : 'rgba(248, 250, 252, 0.85)',
      borderColor: isDarkBg ? 'rgba(148, 163, 184, 0.25)' : '#E2E8F0',
      borderWidthPx: 1,
      borderRadiusPx: 14,
      fontFamily,
      fontSizePt: contentBox.w < 64 ? 14 : 15.5,
      richHtml: bulletHtml,
      paragraphs: safeBullets.map((b) => ({
        align: 'left' as const,
        bullet: true,
        runs: [
          {
            text: b,
            fontSizePt: contentBox.w < 64 ? 14 : 15.5,
            color: primaryText,
          },
        ],
      })),
      zIndex: nextZ++,
    });
  }

  return {
    id: now,
    index: slideIndex,
    title: result.title,
    subtitle: result.subtitle,
    bullets: safeBullets,
    notes: result.notes || '',
    backgroundColor: bg,
    backgroundGradient: gradient,
    elements: builtElements,
  };
}
