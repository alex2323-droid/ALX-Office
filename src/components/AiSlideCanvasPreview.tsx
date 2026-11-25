import { useEffect, useRef, useState } from 'react';
import type { WpsSlide, WpsSlideElement } from '../data/wpsDocuments';
import {
  CanvaChartRenderer,
  CanvaShapeSvg,
  getImageFilterCss,
  getShadowCss,
} from './CanvaControls';

interface AiSlideCanvasPreviewProps {
  slide: WpsSlide;
  className?: string;
}

const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;

export default function AiSlideCanvasPreview({
  slide,
  className = '',
}: AiSlideCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      const width = el.clientWidth;
      if (width > 0) {
        setScale(width / LOGICAL_WIDTH);
      }
    };
    updateScale();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(updateScale);
      obs.observe(el);
      return () => obs.disconnect();
    }
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const elements: WpsSlideElement[] = [...(slide.elements || [])].sort(
    (a, b) => a.zIndex - b.zIndex,
  );

  return (
    <div
      ref={containerRef}
      className={`relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700 ${className}`}
      style={{
        backgroundColor: slide.backgroundColor || '#FFFFFF',
        backgroundImage: slide.backgroundGradient || undefined,
      }}
    >
      <div
        style={{
          width: `${LOGICAL_WIDTH}px`,
          height: `${LOGICAL_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
        className="relative"
      >
        {elements.map((el) => {
          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${el.xPct}%`,
            top: `${el.yPct}%`,
            width: `${el.wPct}%`,
            height: `${el.hPct}%`,
            zIndex: el.zIndex,
            opacity: el.opacity ?? 1,
          };

          if (el.type === 'shape') {
            return (
              <div
                key={el.id}
                style={{
                  ...style,
                  boxShadow: el.shapeKind !== 'line' ? getShadowCss(el.shadow) : undefined,
                }}
              >
                <CanvaShapeSvg
                  shapeKind={el.shapeKind}
                  fillColor={el.fillColor}
                  fillGradient={el.fillGradient}
                  borderColor={el.borderColor}
                  borderWidthPx={el.borderWidthPx}
                  borderStyle={el.borderStyle}
                  borderRadiusPx={el.borderRadiusPx}
                />
              </div>
            );
          }

          if (el.type === 'image') {
            return (
              <div
                key={el.id}
                style={{
                  ...style,
                  boxShadow: getShadowCss(el.shadow),
                }}
                className="overflow-hidden"
              >
                <img
                  src={el.src}
                  alt={el.alt || 'Imagen de diapositiva'}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: el.imageFit || 'cover',
                    filter: getImageFilterCss(
                      el.filterPreset,
                      el.brightness ?? 100,
                      el.contrast ?? 100,
                      el.saturate ?? 100,
                    ),
                    borderRadius: el.borderRadiusPx ? `${el.borderRadiusPx}px` : undefined,
                    border:
                      el.borderColor || el.borderWidthPx
                        ? `${Math.max(1, el.borderWidthPx || 1.5)}px solid ${el.borderColor || '#CBD5E1'}`
                        : undefined,
                  }}
                />
              </div>
            );
          }

          if (el.type === 'chart') {
            return (
              <div key={el.id} style={style}>
                <CanvaChartRenderer el={el} />
              </div>
            );
          }

          if (el.type === 'diagram') {
            const visibleItems = el.items.slice(0, 6);
            return (
              <div
                key={el.id}
                style={{
                  ...style,
                  backgroundColor: el.fillColor || '#F8FAFC',
                  borderColor: el.borderColor || '#CBD5E1',
                  borderRadius: `${el.borderRadiusPx ?? 12}px`,
                  boxShadow: getShadowCss(el.shadow),
                }}
                className="flex flex-wrap items-center justify-center gap-2.5 overflow-hidden border p-4 text-slate-900"
              >
                {visibleItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5">
                    <div
                      style={{ borderColor: el.borderColor || '#CBD5E1' }}
                      className="flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-xs"
                    >
                      <span
                        style={{ backgroundColor: el.borderColor || '#7C3AED' }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      >
                        {idx + 1}
                      </span>
                      <span className="max-w-[190px] leading-snug">{item}</span>
                    </div>
                    {idx < visibleItems.length - 1 && (
                      <span
                        aria-hidden="true"
                        style={{ color: el.borderColor || '#7C3AED' }}
                        className="text-base font-bold select-none"
                      >
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          }

          if (el.type === 'table') {
            const cellBg = el.cellBgColor || '#FFFFFF';
            const cleanHex = cellBg.trim().replace('#', '');
            let isDarkCellBg = false;
            if (/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
              const r = parseInt(cleanHex.slice(0, 2), 16);
              const g = parseInt(cleanHex.slice(2, 4), 16);
              const b = parseInt(cleanHex.slice(4, 6), 16);
              isDarkCellBg = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.48;
            }
            const cellTextColor = isDarkCellBg ? '#F8FAFC' : '#1E293B';
            const rowBorderColor = isDarkCellBg
              ? 'rgba(148, 163, 184, 0.25)'
              : 'rgba(203, 213, 225, 0.85)';

            return (
              <div
                key={el.id}
                style={{
                  ...style,
                  borderRadius: `${el.borderRadiusPx ?? 10}px`,
                  borderColor: el.borderColor || '#CBD5E1',
                  backgroundColor: cellBg,
                  color: cellTextColor,
                  boxShadow: getShadowCss(el.shadow),
                }}
                className="overflow-hidden border"
              >
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr
                      style={{
                        backgroundColor: el.headerBgColor || '#0F172A',
                        color: el.headerTextColor || '#FFFFFF',
                      }}
                    >
                      {el.headers.map((h, i) => (
                        <th key={i} className="px-4 py-2.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {el.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        style={{
                          color: cellTextColor,
                          borderTop: `1px solid ${rowBorderColor}`,
                        }}
                      >
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-4 py-2.5">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          if (el.type === 'text') {
            const firstRun = el.paragraphs[0]?.runs[0];
            const fontPx = Math.max(
              14,
              Math.round((el.fontSizePt || firstRun?.fontSizePt || 16) * 1.333),
            );
            return (
              <div
                key={el.id}
                style={{
                  ...style,
                  backgroundColor: el.fillColor || 'transparent',
                  border:
                    el.borderColor || el.borderWidthPx
                      ? `${Math.max(1, el.borderWidthPx || 1.5)}px ${el.borderStyle || 'solid'} ${el.borderColor || '#CBD5E1'}`
                      : undefined,
                  borderRadius: `${el.borderRadiusPx ?? 8}px`,
                  boxShadow: getShadowCss(el.shadow),
                  fontFamily: el.fontFamily || '"Public Sans", sans-serif',
                  fontSize: `${fontPx}px`,
                  color: firstRun?.color || '#0F172A',
                  padding: el.fillColor ? '12px 16px' : '4px 6px',
                  lineHeight: 1.35,
                }}
                className="flex flex-col justify-center overflow-hidden"
              >
                {el.paragraphs.map((p, pi) => (
                  <div
                    key={pi}
                    style={{ textAlign: p.align || 'left' }}
                    className={p.bullet ? 'flex items-start gap-2.5 py-1' : 'py-0.5'}
                  >
                    {p.bullet && (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: firstRun?.color || '#0F172A' }}
                      />
                    )}
                    <span className="min-w-0">
                      {p.runs.map((r, ri) => (
                        <span
                          key={ri}
                          style={{
                            fontWeight: r.bold ? 700 : 400,
                            fontStyle: r.italic ? 'italic' : 'normal',
                            textDecoration: r.underline ? 'underline' : 'none',
                            color: r.color || 'inherit',
                          }}
                        >
                          {r.text}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
