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
    } else {
      // spotlight / header-banner / top-bar cover
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
    const cols =
      isNarrowPanel && cards.length <= 3
        ? 1
        : cards.length === 3 && !isNarrowPanel
          ? 3
          : cards.length <= 2
            ? cards.length
            : 2;
    const rowsCount = Math.ceil(cards.length / cols);
    const gapX = 2.5;
    const gapY = 3.5;
    const cardW = (contentBox.w - gapX * (cols - 1)) / cols;
    const cardH = Math.min(
      rowsCount === 1 ? contentBox.h : (contentBox.h - gapY * (rowsCount - 1)) / rowsCount,
      54,
    );

    cards.forEach((txt, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = contentBox.x + col * (cardW + gapX);
      const y = contentBox.y + row * (cardH + gapY);
      const cardBorder = idx % 2 === 1 ? secondaryAccent : accent;
      const cardFontSize = cols === 3 || rowsCount >= 3 ? 13 : 14;
      const colonIdx = txt.indexOf(':');
      const hasSplit = colonIdx > 1 && colonIdx < 48 && colonIdx < txt.length - 1;
      const cardTitle = hasSplit ? txt.slice(0, colonIdx).trim() : '';
      const cardBody = hasSplit ? txt.slice(colonIdx + 1).trim() : txt;

      builtElements.push({
        id: `ai-card-${now}-${idx}`,
        type: 'text',
        xPct: Number(x.toFixed(1)),
        yPct: Number(y.toFixed(1)),
        wPct: Number(cardW.toFixed(1)),
        hPct: Number(cardH.toFixed(1)),
        fillColor: isDarkBg ? '#1E293B' : '#F8FAFC',
        borderColor: cardBorder,
        borderWidthPx: 1.5,
        borderRadiusPx: 14,
        shadow: 'soft',
        fontFamily,
        fontSizePt: cardFontSize,
        richHtml: hasSplit
          ? `<p><strong>${escapeHtmlText(cardTitle)}</strong></p><p>${escapeHtmlText(cardBody)}</p>`
          : `<p>${escapeHtmlText(txt)}</p>`,
        paragraphs: hasSplit
          ? [
              {
                align: 'left',
                runs: [
                  {
                    text: cardTitle,
                    bold: true,
                    fontSizePt: cardFontSize + 1,
                    color: primaryText,
                  },
                ],
              },
              {
                align: 'left',
                runs: [
                  {
                    text: cardBody,
                    fontSizePt: Math.max(11, cardFontSize - 1),
                    color: secondaryText,
                  },
                ],
              },
            ]
          : [
              {
                align: 'left',
                runs: [
                  {
                    text: txt,
                    fontSizePt: cardFontSize,
                    color: primaryText,
                  },
                ],
              },
            ],
        zIndex: nextZ++,
      });
    });
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
      fontFamily,
      fontSizePt: contentBox.w < 64 ? 14 : 16,
      richHtml: bulletHtml,
      paragraphs: safeBullets.map((b) => ({
        align: 'left' as const,
        bullet: true,
        runs: [
          {
            text: b,
            fontSizePt: contentBox.w < 64 ? 14 : 16,
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
