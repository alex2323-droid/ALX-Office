import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bold,
  Italic,
  Layers,
  Lock,
  Move,
  Palette,
  Plus,
  Shapes,
  Sliders,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Underline,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import type {
  WpsChartKind,
  WpsImageFilterPreset,
  WpsShadowStyle,
  WpsShapeKind,
  WpsSlideElement,
  WpsTextEffect,
} from '../data/wpsDocuments';
import {
  CANVA_COLORS,
  CANVA_FONTS,
  CANVA_GRADIENTS,
  CANVA_SHAPE_DEFINITIONS,
  CANVA_SOLID_BGS,
  CANVA_TEXT_PRESETS,
  CanvaChartRenderer,
  CanvaColorSwatchRow,
  CanvaFloatingActionBar,
  CanvaPositionControls,
  CanvaSelectionBox,
  CanvaShapeSvg,
  ResizeHandle,
  getImageFilterCss,
  getShadowCss,
  getTextEffectStyle,
} from './CanvaControls';
import {
  SnapGuide,
  computeDeltaRotation,
  computeRotatedResize,
  computeSnapDrag,
} from '../lib/canvaTransforms';
import { hideSoftKeyboard } from '../lib/editorDom';

type DocCanvasPanel = null | 'elements' | 'text' | 'charts' | 'background' | 'layers';
type DocElementPanel =
  | null
  | 'font'
  | 'size'
  | 'color'
  | 'format'
  | 'spacing'
  | 'effects'
  | 'border'
  | 'filters'
  | 'opacity'
  | 'position'
  | 'data';

function makeDocLayerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getPlainTextFromElement(el: WpsSlideElement): string {
  if (el.type !== 'text') return '';
  if (el.richHtml) {
    return el.richHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return el.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim();
}

function getElementLabel(el: WpsSlideElement): string {
  switch (el.type) {
    case 'text':
      return 'Texto';
    case 'shape':
      return 'Forma';
    case 'image':
      return 'Imagen';
    case 'chart':
      return 'Gráfico';
    case 'table':
      return 'Tabla';
    case 'diagram':
      return 'Diagrama';
  }
}

export function CanvaDocOverlayStage({
  layers,
  active,
  selectedId,
  editingTextId,
  onSelect,
  onSetEditingTextId,
  onChangeLayers,
}: {
  layers: WpsSlideElement[];
  active: boolean;
  selectedId: string | null;
  editingTextId: string | null;
  onSelect: (id: string | null) => void;
  onSetEditingTextId: (id: string | null) => void;
  onChangeLayers: (next: WpsSlideElement[], immediate: boolean) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [liveBadge, setLiveBadge] = useState<string | null>(null);

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const onChangeRef = useRef(onChangeLayers);
  onChangeRef.current = onChangeLayers;

  const interactionRef = useRef<{
    mode: 'drag' | 'resize' | 'rotate';
    elId: string;
    handle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origRot: number;
    startAngleDeg: number;
    centerPxX: number;
    centerPxY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const act = interactionRef.current;
      const stageEl = stageRef.current;
      if (!act || !stageEl) return;

      const rect = stageEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (Math.hypot(e.clientX - act.startClientX, e.clientY - act.startClientY) > 2) {
        act.moved = true;
      }
      if (!act.moved) return;

      const dxPct = ((e.clientX - act.startClientX) / rect.width) * 100;
      const dyPct = ((e.clientY - act.startClientY) / rect.height) * 100;

      if (act.mode === 'drag') {
        const siblings = layersRef.current.filter((s) => s.id !== act.elId);
        const { xPct, yPct, guides } = computeSnapDrag({
          origX: act.origX,
          origY: act.origY,
          origW: act.origW,
          origH: act.origH,
          dxPct,
          dyPct,
          siblings,
          minX: -10,
          maxX: 95,
          minY: -5,
          maxY: 96,
        });
        setSnapGuides(guides);
        setLiveBadge(`X ${Math.round(xPct)}% · Y ${Math.round(yPct)}%`);
        const next = layersRef.current.map((item) =>
          item.id === act.elId ? ({ ...item, xPct, yPct } as WpsSlideElement) : item,
        );
        onChangeRef.current(next, false);
        return;
      }

      if (act.mode === 'resize' && act.handle) {
        const { xPct, yPct, wPct, hPct } = computeRotatedResize({
          handle: act.handle,
          origX: act.origX,
          origY: act.origY,
          origW: act.origW,
          origH: act.origH,
          rotationDeg: act.origRot,
          dxPx: e.clientX - act.startClientX,
          dyPx: e.clientY - act.startClientY,
          stageWidth: rect.width,
          stageHeight: rect.height,
          minWPct: 5,
          minHPct: 3,
          keepAspectRatio: e.shiftKey,
        });
        setLiveBadge(`${Math.round(wPct)}% × ${Math.round(hPct)}%`);
        const next = layersRef.current.map((item) =>
          item.id === act.elId
            ? ({ ...item, xPct, yPct, wPct, hPct } as WpsSlideElement)
            : item,
        );
        onChangeRef.current(next, false);
        return;
      }

      if (act.mode === 'rotate') {
        const { deg, snapped } = computeDeltaRotation({
          startAngleDeg: act.startAngleDeg,
          origRotDeg: act.origRot,
          centerPxX: act.centerPxX,
          centerPxY: act.centerPxY,
          clientX: e.clientX,
          clientY: e.clientY,
          snapStep15: e.shiftKey,
        });
        setLiveBadge(snapped ? `${deg}° · Ajustado` : `${deg}°`);
        const next = layersRef.current.map((item) =>
          item.id === act.elId ? ({ ...item, rotationDeg: deg } as WpsSlideElement) : item,
        );
        onChangeRef.current(next, false);
      }
    };

    const handleUp = () => {
      const act = interactionRef.current;
      if (!act) return;
      interactionRef.current = null;
      setSnapGuides([]);
      setLiveBadge(null);
      if (act.moved) {
        onChangeRef.current(layersRef.current, true);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, []);

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => a.zIndex - b.zIndex),
    [layers],
  );

  if (layers.length === 0 && !active) {
    return null;
  }

  const startDrag = (el: WpsSlideElement, e: React.PointerEvent) => {
    if (!active || el.locked) return;
    if (el.type === 'text' && editingTextId === el.id) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const now = Date.now();
    if (
      el.type === 'text' &&
      lastTapRef.current &&
      lastTapRef.current.id === el.id &&
      now - lastTapRef.current.time < 340
    ) {
      lastTapRef.current = null;
      onSelect(el.id);
      onSetEditingTextId(el.id);
      return;
    }
    lastTapRef.current = { id: el.id, time: now };

    e.stopPropagation();
    hideSoftKeyboard();
    onSelect(el.id);
    if (editingTextId && editingTextId !== el.id) {
      onSetEditingTextId(null);
    }

    interactionRef.current = {
      mode: 'drag',
      elId: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xPct,
      origY: el.yPct,
      origW: el.wPct,
      origH: el.hPct,
      origRot: el.rotationDeg || 0,
      startAngleDeg: 0,
      centerPxX: 0,
      centerPxY: 0,
      moved: false,
    };
  };

  const startResize = (el: WpsSlideElement, handle: ResizeHandle, e: React.PointerEvent) => {
    if (!active || el.locked) return;
    e.stopPropagation();
    hideSoftKeyboard();
    interactionRef.current = {
      mode: 'resize',
      elId: el.id,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xPct,
      origY: el.yPct,
      origW: el.wPct,
      origH: el.hPct,
      origRot: el.rotationDeg || 0,
      startAngleDeg: 0,
      centerPxX: 0,
      centerPxY: 0,
      moved: false,
    };
  };

  const startRotate = (el: WpsSlideElement, e: React.PointerEvent) => {
    const stageEl = stageRef.current;
    if (!active || el.locked || !stageEl) return;
    e.stopPropagation();
    hideSoftKeyboard();
    const rect = stageEl.getBoundingClientRect();
    const cx = rect.left + ((el.xPct + el.wPct / 2) / 100) * rect.width;
    const cy = rect.top + ((el.yPct + el.hPct / 2) / 100) * rect.height;
    const startAngleDeg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;

    interactionRef.current = {
      mode: 'rotate',
      elId: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xPct,
      origY: el.yPct,
      origW: el.wPct,
      origH: el.hPct,
      origRot: el.rotationDeg || 0,
      startAngleDeg,
      centerPxX: cx,
      centerPxY: cy,
      moved: false,
    };
  };

  return (
    <div
      ref={stageRef}
      onClick={(e) => {
        if (!active) return;
        if (e.target === stageRef.current) {
          onSelect(null);
          onSetEditingTextId(null);
          hideSoftKeyboard();
        }
      }}
      className={`absolute inset-0 z-10 overflow-hidden ${
        active ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {sortedLayers.map((el) => {
        const isSelected = active && selectedId === el.id;
        const isEditingThisText = active && el.type === 'text' && editingTextId === el.id;
        const flipX = 'flippedX' in el && el.flippedX ? -1 : 1;
        const flipY = 'flippedY' in el && el.flippedY ? -1 : 1;
        const rotStr = el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : '';
        const flipStr = flipX !== 1 || flipY !== 1 ? `scale(${flipX}, ${flipY})` : '';

        const outerStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${el.xPct}%`,
          top: `${el.yPct}%`,
          width: `${el.wPct}%`,
          height: `${el.hPct}%`,
          zIndex: isSelected ? Math.max(el.zIndex, 40) : el.zIndex,
          transform: rotStr || undefined,
          transformOrigin: 'center center',
          opacity: el.opacity ?? 1,
          touchAction: active && !isEditingThisText && !el.locked ? 'none' : undefined,
        };

        const selectionOverlay = isSelected ? (
          <CanvaSelectionBox
            locked={Boolean(el.locked)}
            rotationDeg={el.rotationDeg || 0}
            isEditingText={isEditingThisText}
            badgeText={liveBadge}
            onResizeStart={(handle, ev) => startResize(el, handle, ev)}
            onRotateStart={(ev) => startRotate(el, ev)}
          />
        ) : null;

        if (el.type === 'shape') {
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startDrag(el, e)}
              onClick={(e) => {
                if (!active) return;
                e.stopPropagation();
                onSelect(el.id);
              }}
              style={{
                ...outerStyle,
                transform: [rotStr, flipStr].filter(Boolean).join(' ') || undefined,
                boxShadow: el.shapeKind !== 'line' ? getShadowCss(el.shadow) : undefined,
              }}
              className={active ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''}
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
              {selectionOverlay}
            </div>
          );
        }

        if (el.type === 'image') {
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startDrag(el, e)}
              onClick={(e) => {
                if (!active) return;
                e.stopPropagation();
                onSelect(el.id);
              }}
              style={{
                ...outerStyle,
                boxShadow: getShadowCss(el.shadow),
              }}
              className={active ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''}
            >
              <img
                src={el.src}
                alt={el.alt || 'Elemento Canva'}
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: el.imageFit || 'contain',
                  transform: flipStr || undefined,
                  filter: getImageFilterCss(
                    el.filterPreset,
                    el.brightness ?? 100,
                    el.contrast ?? 100,
                    el.saturate ?? 100,
                  ),
                  borderRadius: el.borderRadiusPx ? `${el.borderRadiusPx}px` : undefined,
                  border:
                    el.borderColor || el.borderWidthPx
                      ? `${Math.max(1, el.borderWidthPx || 2)}px solid ${el.borderColor || '#0F172A'}`
                      : undefined,
                }}
              />
              {selectionOverlay}
            </div>
          );
        }

        if (el.type === 'chart') {
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startDrag(el, e)}
              onClick={(e) => {
                if (!active) return;
                e.stopPropagation();
                onSelect(el.id);
              }}
              style={outerStyle}
              className={active ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''}
            >
              <CanvaChartRenderer el={el} />
              {selectionOverlay}
            </div>
          );
        }

        if (el.type === 'diagram') {
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startDrag(el, e)}
              onClick={(e) => {
                if (!active) return;
                e.stopPropagation();
                onSelect(el.id);
              }}
              style={{
                ...outerStyle,
                backgroundColor: el.fillColor || 'rgba(248, 250, 252, 0.96)',
                borderColor: el.borderColor || 'rgba(203, 213, 225, 0.9)',
                borderRadius: `${el.borderRadiusPx ?? 10}px`,
                boxShadow: getShadowCss(el.shadow),
              }}
              className={`flex flex-wrap items-center justify-center gap-1.5 overflow-hidden border p-2.5 text-slate-900 ${
                active ? (el.locked ? 'cursor-not-allowed' : 'cursor-move') : ''
              }`}
            >
              {el.items.slice(0, 8).map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs"
                >
                  {item}
                </div>
              ))}
              {selectionOverlay}
            </div>
          );
        }

        if (el.type === 'table') {
          return (
            <div
              key={el.id}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).tagName === 'INPUT') return;
                startDrag(el, e);
              }}
              onClick={(e) => {
                if (!active) return;
                e.stopPropagation();
                onSelect(el.id);
              }}
              style={{
                ...outerStyle,
                borderRadius: `${el.borderRadiusPx ?? 8}px`,
                borderColor: el.borderColor || '#CBD5E1',
                backgroundColor: el.cellBgColor || 'rgba(255,255,255,0.97)',
                boxShadow: getShadowCss(el.shadow),
              }}
              className="overflow-auto border text-slate-900"
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr
                    style={{
                      backgroundColor: el.headerBgColor || '#0F172A',
                      color: el.headerTextColor || '#FFFFFF',
                    }}
                  >
                    {el.headers.map((h, i) => (
                      <th key={i} className="border-b border-slate-200/40 px-2 py-1.5 font-semibold">
                        {active && isSelected ? (
                          <input
                            type="text"
                            value={h}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const next = layers.map((item) =>
                                item.id === el.id && item.type === 'table'
                                  ? {
                                      ...item,
                                      headers: item.headers.map((hv, hi) =>
                                        hi === i ? e.target.value : hv,
                                      ),
                                    }
                                  : item,
                              );
                              onChangeLayers(next, false);
                            }}
                            className="w-full bg-transparent font-semibold focus:outline-none"
                          />
                        ) : (
                          h
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {el.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-200/70 last:border-b-0">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2 py-1.5">
                          {active && isSelected ? (
                            <input
                              type="text"
                              value={cell}
                              onPointerDown={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const next = layers.map((item) =>
                                  item.id === el.id && item.type === 'table'
                                    ? {
                                        ...item,
                                        rows: item.rows.map((rw, ri) =>
                                          ri === rIdx
                                            ? rw.map((cv, ci) =>
                                                ci === cIdx ? e.target.value : cv,
                                              )
                                            : rw,
                                        ),
                                      }
                                    : item,
                                );
                                onChangeLayers(next, false);
                              }}
                              className="w-full bg-transparent focus:outline-none"
                            />
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectionOverlay}
            </div>
          );
        }

        // Text layer
        const firstPara = el.paragraphs[0];
        const firstRun = firstPara?.runs[0];
        const align = firstPara?.align || 'left';
        const pt = el.fontSizePt || firstRun?.fontSizePt || 18;
        const pxSize = Math.max(11, Math.round(pt * 1.28));
        const textColor = firstRun?.color || '#0F172A';
        const fxStyle = getTextEffectStyle(el.textEffect, el.effectColor, textColor);
        const plainVal = getPlainTextFromElement(el);

        return (
          <div
            key={el.id}
            onPointerDown={(e) => startDrag(el, e)}
            onClick={(e) => {
              if (!active) return;
              e.stopPropagation();
              onSelect(el.id);
            }}
            style={{
              ...outerStyle,
              backgroundColor: el.fillColor || 'transparent',
              border:
                el.borderColor || el.borderWidthPx
                  ? `${Math.max(1, el.borderWidthPx || 1.5)}px ${el.borderStyle || 'solid'} ${el.borderColor || '#0F172A'}`
                  : undefined,
              outline:
                active && !isSelected
                  ? '1px dashed rgba(124, 58, 237, 0.35)'
                  : undefined,
              borderRadius: `${el.borderRadiusPx ?? 8}px`,
              boxShadow: getShadowCss(el.shadow),
              padding: '6px 10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
            className={
              isEditingThisText
                ? 'cursor-text'
                : active
                  ? el.locked
                    ? 'cursor-not-allowed'
                    : 'cursor-move'
                  : ''
            }
          >
            {isEditingThisText ? (
              <textarea
                autoFocus
                value={plainVal}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const val = e.target.value;
                  const next = layers.map((item) =>
                    item.id === el.id && item.type === 'text'
                      ? {
                          ...item,
                          richHtml: undefined,
                          paragraphs: [
                            {
                              align,
                              runs: [
                                {
                                  text: val,
                                  bold: firstRun?.bold,
                                  italic: firstRun?.italic,
                                  underline: firstRun?.underline,
                                  color: textColor,
                                  fontSizePt: pt,
                                },
                              ],
                            },
                          ],
                        }
                      : item,
                  );
                  onChangeLayers(next, false);
                }}
                onBlur={() => onChangeLayers(layersRef.current, true)}
                style={{
                  fontFamily: el.fontFamily,
                  fontSize: `${pxSize}px`,
                  fontWeight: firstRun?.bold ? 700 : 400,
                  fontStyle: firstRun?.italic ? 'italic' : 'normal',
                  textDecoration: firstRun?.underline ? 'underline' : 'none',
                  color: textColor,
                  textAlign: align,
                  lineHeight: el.lineHeight ?? 1.28,
                  letterSpacing: el.letterSpacingEm ? `${el.letterSpacingEm}em` : undefined,
                  textTransform: el.textTransform,
                  transform: flipStr || undefined,
                }}
                className="h-full w-full resize-none bg-transparent outline-none"
              />
            ) : (
              <div
                style={{
                  fontFamily: el.fontFamily,
                  fontSize: `${pxSize}px`,
                  fontWeight: firstRun?.bold ? 700 : 400,
                  fontStyle: firstRun?.italic ? 'italic' : 'normal',
                  textDecoration: firstRun?.underline ? 'underline' : 'none',
                  color: textColor,
                  textAlign: align,
                  lineHeight: el.lineHeight ?? 1.28,
                  letterSpacing: el.letterSpacingEm ? `${el.letterSpacingEm}em` : undefined,
                  textTransform: el.textTransform,
                  transform: flipStr || undefined,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  ...fxStyle,
                }}
              >
                {plainVal || (active ? 'Doble toque para escribir' : '')}
              </div>
            )}
            {selectionOverlay}
          </div>
        );
      })}

      {/* Smart Alignment Snap Guides */}
      {active &&
        snapGuides.map((g, i) =>
          g.axis === 'x' ? (
            <div
              key={`gx-${i}`}
              aria-hidden="true"
              style={{ left: `${g.pct}%` }}
              className="no-print pointer-events-none absolute inset-y-0 z-50 w-[1.5px] bg-[#EC4899]"
            />
          ) : (
            <div
              key={`gy-${i}`}
              aria-hidden="true"
              style={{ top: `${g.pct}%` }}
              className="no-print pointer-events-none absolute inset-x-0 z-50 h-[1.5px] bg-[#EC4899]"
            />
          ),
        )}
    </div>
  );
}

export function CanvaDocStudioDock({
  layers,
  selectedId,
  editingTextId,
  pageBgColor,
  pageBgGradient,
  onSelect,
  onSetEditingTextId,
  onChangeLayers,
  onChangePageBackground,
}: {
  layers: WpsSlideElement[];
  selectedId: string | null;
  editingTextId: string | null;
  pageBgColor: string;
  pageBgGradient?: string;
  onSelect: (id: string | null) => void;
  onSetEditingTextId: (id: string | null) => void;
  onChangeLayers: (next: WpsSlideElement[], immediate: boolean) => void;
  onChangePageBackground: (bgColor: string, bgGradient?: string) => void;
}) {
  const [canvasPanel, setCanvasPanel] = useState<DocCanvasPanel>(null);
  const [elementPanel, setElementPanel] = useState<DocElementPanel>(null);
  const [copiedStyle, setCopiedStyle] = useState<Partial<WpsSlideElement> | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);

  const selectedEl = useMemo(
    () => layers.find((l) => l.id === selectedId) ?? null,
    [layers, selectedId],
  );

  useEffect(() => {
    setElementPanel(null);
    if (selectedId) setCanvasPanel(null);
  }, [selectedId]);

  const maxZ = useMemo(
    () => layers.reduce((acc, l) => Math.max(acc, l.zIndex || 1), 1),
    [layers],
  );

  const updateSelected = (patch: Partial<WpsSlideElement>, immediate: boolean) => {
    if (!selectedEl) return;
    onChangeLayers(
      layers.map((item) =>
        item.id === selectedEl.id ? ({ ...item, ...patch } as WpsSlideElement) : item,
      ),
      immediate,
    );
  };

  const addLayer = (el: WpsSlideElement) => {
    onChangeLayers([...layers, el], true);
    onSelect(el.id);
    setCanvasPanel(null);
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return;
    addLayer({
      id: makeDocLayerId('img'),
      type: 'image',
      xPct: 26,
      yPct: 18,
      wPct: 48,
      hPct: 26,
      src: dataUrl,
      imageFit: 'contain',
      borderRadiusPx: 8,
      zIndex: maxZ + 1,
    });
  };

  const handleAddShape = (kind: WpsShapeKind, defaultFill: string) => {
    addLayer({
      id: makeDocLayerId('sh'),
      type: 'shape',
      shapeKind: kind,
      xPct: 30,
      yPct: 20,
      wPct: kind === 'line' || kind === 'arrowRight' ? 40 : 28,
      hPct: kind === 'line' ? 5 : 18,
      fillColor: defaultFill,
      borderRadiusPx: kind === 'roundRect' ? 14 : 0,
      zIndex: maxZ + 1,
    });
  };

  const handleAddTextPreset = (presetId: string) => {
    const preset = CANVA_TEXT_PRESETS.find((p) => p.id === presetId) || CANVA_TEXT_PRESETS[0];
    addLayer({
      id: makeDocLayerId('tx'),
      type: 'text',
      xPct: 14,
      yPct: 16,
      wPct: 72,
      hPct: 14,
      fontFamily: preset.fontFamily,
      fontSizePt: preset.fontSizePt,
      fillColor: preset.fillColor,
      borderRadiusPx: preset.borderRadiusPx ?? 10,
      textTransform: preset.id === 'badge' ? 'uppercase' : 'none',
      paragraphs: [
        {
          align: 'center',
          runs: [
            {
              text: preset.sampleText,
              bold: preset.bold,
              color: preset.color,
              fontSizePt: preset.fontSizePt,
            },
          ],
        },
      ],
      zIndex: maxZ + 1,
    });
  };

  const handleAddChart = (kind: WpsChartKind) => {
    addLayer({
      id: makeDocLayerId('ch'),
      type: 'chart',
      chartKind: kind,
      title: 'Indicadores Clave',
      xPct: 12,
      yPct: 20,
      wPct: 76,
      hPct: 34,
      series: [
        {
          name: 'Serie A',
          points: [
            { label: 'Q1', value: 40 },
            { label: 'Q2', value: 65 },
            { label: 'Q3', value: 82 },
            { label: 'Q4', value: 95 },
          ],
        },
      ],
      zIndex: maxZ + 1,
    });
  };

  const handleAddTable = () => {
    addLayer({
      id: makeDocLayerId('tb'),
      type: 'table',
      xPct: 10,
      yPct: 22,
      wPct: 80,
      hPct: 28,
      headerBgColor: '#0F172A',
      headerTextColor: '#FFFFFF',
      headers: ['Elemento', 'Detalle', 'Estado'],
      rows: [
        ['Fase 1', 'Diseño visual Canva', 'Listo'],
        ['Fase 2', 'Revisión editorial', 'Activo'],
      ],
      zIndex: maxZ + 1,
    });
  };

  const handleAddDiagram = () => {
    addLayer({
      id: makeDocLayerId('dg'),
      type: 'diagram',
      xPct: 10,
      yPct: 22,
      wPct: 80,
      hPct: 22,
      items: ['1. Idea', '2. Borrador', '3. Diseño Canva', '4. Entrega'],
      zIndex: maxZ + 1,
    });
  };

  const handleReorder = (id: string, dir: 'front' | 'forward' | 'backward' | 'back') => {
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((item) => item.id === id);
    if (idx < 0) return;
    const [picked] = sorted.splice(idx, 1);
    if (dir === 'front') sorted.push(picked);
    else if (dir === 'back') sorted.unshift(picked);
    else if (dir === 'forward') sorted.splice(Math.min(sorted.length, idx + 1), 0, picked);
    else sorted.splice(Math.max(0, idx - 1), 0, picked);
    onChangeLayers(
      sorted.map((item, i) => ({ ...item, zIndex: i + 1 })),
      true,
    );
  };

  const handleAlign = (mode: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => {
    if (!selectedEl || selectedEl.locked) return;
    const patch: Partial<WpsSlideElement> = {};
    if (mode === 'left') patch.xPct = 5;
    if (mode === 'centerH') patch.xPct = Math.round((50 - selectedEl.wPct / 2) * 10) / 10;
    if (mode === 'right') patch.xPct = Math.round((95 - selectedEl.wPct) * 10) / 10;
    if (mode === 'top') patch.yPct = 4;
    if (mode === 'centerV') patch.yPct = Math.round((50 - selectedEl.hPct / 2) * 10) / 10;
    if (mode === 'bottom') patch.yPct = Math.round((96 - selectedEl.hPct) * 10) / 10;
    updateSelected(patch, true);
  };

  const handleDuplicate = (id: string) => {
    const src = layers.find((l) => l.id === id);
    if (!src) return;
    const copy = {
      ...(JSON.parse(JSON.stringify(src)) as WpsSlideElement),
      id: makeDocLayerId(src.type.slice(0, 2)),
      xPct: Math.min(82, src.xPct + 4),
      yPct: Math.min(86, src.yPct + 4),
      zIndex: maxZ + 1,
      locked: false,
    };
    addLayer(copy);
  };

  const handleDelete = (id: string) => {
    onChangeLayers(
      layers.filter((l) => l.id !== id),
      true,
    );
    if (selectedId === id) onSelect(null);
    if (editingTextId === id) onSetEditingTextId(null);
  };

  const elementChips: { id: Exclude<DocElementPanel, null>; label: string; Icon: React.ElementType }[] =
    useMemo(() => {
      if (!selectedEl) return [];
      const chips: {
        id: Exclude<DocElementPanel, null>;
        label: string;
        Icon: React.ElementType;
      }[] = [];
      if (selectedEl.type === 'text') {
        chips.push(
          { id: 'font', label: 'Fuente', Icon: Type },
          { id: 'size', label: 'Tamaño', Icon: Sliders },
          { id: 'color', label: 'Color', Icon: Palette },
          { id: 'format', label: 'Formato', Icon: Bold },
          { id: 'spacing', label: 'Espaciado', Icon: AlignCenter },
          { id: 'effects', label: 'Efectos', Icon: Sparkles },
          { id: 'border', label: 'Fondo/Borde', Icon: Shapes },
        );
      } else if (selectedEl.type === 'shape') {
        chips.push(
          { id: 'color', label: 'Color', Icon: Palette },
          { id: 'border', label: 'Borde', Icon: Shapes },
          { id: 'effects', label: 'Sombra', Icon: Sparkles },
        );
      } else if (selectedEl.type === 'image') {
        chips.push(
          { id: 'filters', label: 'Filtros', Icon: Sparkles },
          { id: 'border', label: 'Borde', Icon: Shapes },
          { id: 'effects', label: 'Sombra', Icon: Layers },
        );
      } else {
        chips.push(
          { id: 'data', label: 'Datos', Icon: Table2 },
          { id: 'color', label: 'Color', Icon: Palette },
          { id: 'effects', label: 'Sombra', Icon: Sparkles },
        );
      }
      chips.push(
        { id: 'opacity', label: 'Opacidad', Icon: Sliders },
        { id: 'position', label: 'Posición', Icon: Move },
      );
      return chips;
    }, [selectedEl]);

  const sortedForLayers = useMemo(
    () => [...layers].sort((a, b) => b.zIndex - a.zIndex),
    [layers],
  );

  return (
    <div className="no-print fixed right-0 bottom-0 left-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleUploadImage(e)}
      />

      {/* Quick Floating Bar for selected layer */}
      {selectedEl && (
        <div className="flex justify-center border-b border-slate-100 px-2 py-1.5 dark:border-slate-800">
          <CanvaFloatingActionBar
            canEditText={selectedEl.type === 'text'}
            isEditingText={editingTextId === selectedEl.id}
            locked={Boolean(selectedEl.locked)}
            hasCopiedStyle={Boolean(copiedStyle)}
            onToggleEditText={() =>
              onSetEditingTextId(editingTextId === selectedEl.id ? null : selectedEl.id)
            }
            onCopyStyle={() =>
              setCopiedStyle({
                fillColor: 'fillColor' in selectedEl ? selectedEl.fillColor : undefined,
                borderColor: 'borderColor' in selectedEl ? selectedEl.borderColor : undefined,
                borderWidthPx:
                  'borderWidthPx' in selectedEl ? selectedEl.borderWidthPx : undefined,
                borderRadiusPx:
                  'borderRadiusPx' in selectedEl ? selectedEl.borderRadiusPx : undefined,
                opacity: selectedEl.opacity,
                shadow: 'shadow' in selectedEl ? selectedEl.shadow : undefined,
              })
            }
            onPasteStyle={() => {
              if (copiedStyle) {
                updateSelected(copiedStyle, true);
                setCopiedStyle(null);
              }
            }}
            onDuplicate={() => handleDuplicate(selectedEl.id)}
            onToggleLock={() => updateSelected({ locked: !selectedEl.locked }, true)}
            onBringForward={() => handleReorder(selectedEl.id, 'forward')}
            onSendBackward={() => handleReorder(selectedEl.id, 'backward')}
            onDelete={() => handleDelete(selectedEl.id)}
          />
        </div>
      )}

      {/* Expandable Panel Content */}
      {(canvasPanel || (selectedEl && elementPanel)) && (
        <div className="max-h-[45vh] overflow-y-auto border-b border-slate-100 p-3 dark:border-slate-800">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {selectedEl ? getElementLabel(selectedEl) : 'Estudio Canva · Documento'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCanvasPanel(null);
                  setElementPanel(null);
                }}
                aria-label="Cerrar panel"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!selectedEl && canvasPanel === 'elements' && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {CANVA_SHAPE_DEFINITIONS.map((sh) => (
                  <button
                    key={sh.kind}
                    type="button"
                    onClick={() => handleAddShape(sh.kind, sh.defaultFill)}
                    className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="h-6 w-6">
                      <CanvaShapeSvg shapeKind={sh.kind} fillColor={sh.defaultFill} />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                      {sh.label}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddDiagram}
                  className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                >
                  <Layers className="h-5 w-5 text-[#7C3AED]" />
                  <span className="text-[11px] font-medium">Flujo</span>
                </button>
              </div>
            )}

            {!selectedEl && canvasPanel === 'text' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CANVA_TEXT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAddTextPreset(p.id)}
                    className="flex min-h-[46px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                  >
                    <span className={p.previewClass}>{p.label}</span>
                    <Plus className="h-4 w-4 shrink-0 text-[#7C3AED]" />
                  </button>
                ))}
              </div>
            )}

            {!selectedEl && canvasPanel === 'charts' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    { id: 'bar', label: 'Barras', action: () => handleAddChart('bar') },
                    {
                      id: 'hbar',
                      label: 'Barras H',
                      action: () => handleAddChart('horizontalBar'),
                    },
                    { id: 'line', label: 'Líneas', action: () => handleAddChart('line') },
                    { id: 'donut', label: 'Dona', action: () => handleAddChart('donut') },
                    { id: 'table', label: 'Tabla', action: handleAddTable },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-medium hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800"
                  >
                    {item.id === 'table' ? (
                      <Table2 className="h-5 w-5 text-blue-600" />
                    ) : (
                      <BarChart3 className="h-5 w-5 text-[#7C3AED]" />
                    )}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}

            {!selectedEl && canvasPanel === 'background' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {CANVA_SOLID_BGS.map((bg) => (
                    <button
                      key={bg.value}
                      type="button"
                      title={bg.label}
                      onClick={() => onChangePageBackground(bg.value, undefined)}
                      style={{ backgroundColor: bg.value }}
                      className={`h-9 w-9 rounded-full border ${
                        pageBgColor === bg.value && !pageBgGradient
                          ? 'border-[#7C3AED] ring-2 ring-[#7C3AED]/30'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    />
                  ))}
                  <label
                    title="Color personalizado"
                    className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500 text-xs font-bold text-white"
                  >
                    <span>+</span>
                    <input
                      type="color"
                      value={pageBgColor}
                      onChange={(e) => onChangePageBackground(e.target.value, undefined)}
                      className="absolute inset-0 opacity-0"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CANVA_GRADIENTS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      title={g.label}
                      onClick={() => onChangePageBackground(g.fallbackColor, g.css)}
                      style={{ backgroundImage: g.css }}
                      className={`h-9 w-14 rounded-xl border ${
                        pageBgGradient === g.css
                          ? 'border-[#7C3AED] ring-2 ring-[#7C3AED]/30'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {!selectedEl && canvasPanel === 'layers' && (
              <div className="space-y-2">
                {sortedForLayers.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-500">
                    Añade texto, formas o imágenes con los botones de abajo para gestionar sus capas.
                  </p>
                ) : (
                  sortedForLayers.map((el) => (
                    <div
                      key={el.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(el.id);
                          setCanvasPanel(null);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium"
                      >
                        <span className="font-mono text-[10px] text-[#7C3AED]">z{el.zIndex}</span>
                        <span className="truncate">
                          {getElementLabel(el)}
                          {el.type === 'text' && ` · ${getPlainTextFromElement(el).slice(0, 24)}`}
                        </span>
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleReorder(el.id, 'forward')}
                          aria-label="Subir capa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorder(el.id, 'backward')}
                          aria-label="Bajar capa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeLayers(
                              layers.map((item) =>
                                item.id === el.id ? { ...item, locked: !item.locked } : item,
                              ),
                              true,
                            )
                          }
                          aria-label="Bloquear capa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          {el.locked ? (
                            <Lock className="h-3.5 w-3.5 text-amber-500" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(el.id)}
                          aria-label="Eliminar capa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Selected element panels */}
            {selectedEl && elementPanel === 'position' && (
              <CanvaPositionControls
                rotationDeg={selectedEl.rotationDeg || 0}
                flippedX={Boolean('flippedX' in selectedEl && selectedEl.flippedX)}
                flippedY={Boolean('flippedY' in selectedEl && selectedEl.flippedY)}
                locked={Boolean(selectedEl.locked)}
                canFlip={
                  selectedEl.type === 'shape' ||
                  selectedEl.type === 'image' ||
                  selectedEl.type === 'text'
                }
                onChangeRotation={(deg, immediate) =>
                  updateSelected({ rotationDeg: deg }, immediate)
                }
                onCommitRotation={() => onChangeLayers(layers, true)}
                onNudge={(dx, dy) =>
                  updateSelected(
                    {
                      xPct: Math.round((selectedEl.xPct + dx) * 10) / 10,
                      yPct: Math.round((selectedEl.yPct + dy) * 10) / 10,
                    },
                    true,
                  )
                }
                onReorderLayer={(dir) => handleReorder(selectedEl.id, dir)}
                onAlign={handleAlign}
                onToggleFlipX={() =>
                  updateSelected(
                    { flippedX: !('flippedX' in selectedEl && selectedEl.flippedX) },
                    true,
                  )
                }
                onToggleFlipY={() =>
                  updateSelected(
                    { flippedY: !('flippedY' in selectedEl && selectedEl.flippedY) },
                    true,
                  )
                }
                onToggleLock={() => updateSelected({ locked: !selectedEl.locked }, true)}
              />
            )}

            {selectedEl && elementPanel === 'opacity' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Opacidad</span>
                  <span className="font-mono font-bold tabular-nums">
                    {Math.round((selectedEl.opacity ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={100}
                  value={Math.round((selectedEl.opacity ?? 1) * 100)}
                  onChange={(e) =>
                    updateSelected({ opacity: Number(e.target.value) / 100 }, false)
                  }
                  onPointerUp={() => onChangeLayers(layers, true)}
                  className="w-full accent-[#7C3AED]"
                />
              </div>
            )}

            {selectedEl && elementPanel === 'font' && selectedEl.type === 'text' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CANVA_FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updateSelected({ fontFamily: f.cssFamily }, true)}
                    style={{ fontFamily: f.cssFamily }}
                    className={`min-h-[40px] rounded-xl border px-3 text-left text-xs ${
                      selectedEl.fontFamily === f.cssFamily
                        ? 'border-[#7C3AED] bg-violet-50 font-semibold text-[#7C3AED] dark:bg-violet-950/40'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {selectedEl && elementPanel === 'size' && selectedEl.type === 'text' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Tamaño de letra</span>
                  <span className="font-mono font-bold">{selectedEl.fontSizePt || 18} pt</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={56}
                  value={selectedEl.fontSizePt || 18}
                  onChange={(e) => updateSelected({ fontSizePt: Number(e.target.value) }, false)}
                  onPointerUp={() => onChangeLayers(layers, true)}
                  className="w-full accent-[#7C3AED]"
                />
              </div>
            )}

            {selectedEl && elementPanel === 'color' && (
              <div className="space-y-3">
                {selectedEl.type === 'text' ? (
                  <CanvaColorSwatchRow
                    label="Color del texto"
                    value={selectedEl.paragraphs[0]?.runs[0]?.color || '#0F172A'}
                    onChange={(color) => {
                      const nextParas = selectedEl.paragraphs.map((p) => ({
                        ...p,
                        runs: p.runs.map((r) => ({ ...r, color })),
                      }));
                      updateSelected({ paragraphs: nextParas }, true);
                    }}
                  />
                ) : selectedEl.type === 'shape' ? (
                  <CanvaColorSwatchRow
                    label="Relleno de forma"
                    value={selectedEl.fillColor}
                    colors={CANVA_COLORS}
                    allowTransparent
                    onChange={(color) =>
                      updateSelected(
                        {
                          fillColor: color === 'transparent' ? 'transparent' : color,
                          fillGradient: undefined,
                        },
                        true,
                      )
                    }
                  />
                ) : (
                  <CanvaColorSwatchRow
                    label="Color de fondo"
                    value={'fillColor' in selectedEl ? selectedEl.fillColor : '#FFFFFF'}
                    onChange={(color) => updateSelected({ fillColor: color }, true)}
                  />
                )}
              </div>
            )}

            {selectedEl && elementPanel === 'format' && selectedEl.type === 'text' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const b = !selectedEl.paragraphs[0]?.runs[0]?.bold;
                    updateSelected(
                      {
                        paragraphs: selectedEl.paragraphs.map((p) => ({
                          ...p,
                          runs: p.runs.map((r) => ({ ...r, bold: b })),
                        })),
                      },
                      true,
                    );
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const it = !selectedEl.paragraphs[0]?.runs[0]?.italic;
                    updateSelected(
                      {
                        paragraphs: selectedEl.paragraphs.map((p) => ({
                          ...p,
                          runs: p.runs.map((r) => ({ ...r, italic: it })),
                        })),
                      },
                      true,
                    );
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const un = !selectedEl.paragraphs[0]?.runs[0]?.underline;
                    updateSelected(
                      {
                        paragraphs: selectedEl.paragraphs.map((p) => ({
                          ...p,
                          runs: p.runs.map((r) => ({ ...r, underline: un })),
                        })),
                      },
                      true,
                    );
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <Underline className="h-4 w-4" />
                </button>
                {(
                  [
                    { a: 'left', Icon: AlignLeft },
                    { a: 'center', Icon: AlignCenter },
                    { a: 'right', Icon: AlignRight },
                  ] as const
                ).map(({ a, Icon }) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() =>
                      updateSelected(
                        {
                          paragraphs: selectedEl.paragraphs.map((p) => ({ ...p, align: a })),
                        },
                        true,
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}

            {selectedEl && elementPanel === 'spacing' && selectedEl.type === 'text' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>Interlineado</span>
                    <span className="font-mono">{selectedEl.lineHeight ?? 1.28}</span>
                  </div>
                  <input
                    type="range"
                    min={0.9}
                    max={2.2}
                    step={0.05}
                    value={selectedEl.lineHeight ?? 1.28}
                    onChange={(e) =>
                      updateSelected({ lineHeight: Number(e.target.value) }, false)
                    }
                    onPointerUp={() => onChangeLayers(layers, true)}
                    className="w-full accent-[#7C3AED]"
                  />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>Espaciado letras</span>
                    <span className="font-mono">{selectedEl.letterSpacingEm ?? 0}em</span>
                  </div>
                  <input
                    type="range"
                    min={-0.04}
                    max={0.25}
                    step={0.01}
                    value={selectedEl.letterSpacingEm ?? 0}
                    onChange={(e) =>
                      updateSelected({ letterSpacingEm: Number(e.target.value) }, false)
                    }
                    onPointerUp={() => onChangeLayers(layers, true)}
                    className="w-full accent-[#7C3AED]"
                  />
                </div>
              </div>
            )}

            {selectedEl && elementPanel === 'effects' && (
              <div className="space-y-3">
                {selectedEl.type === 'text' && (
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'none', label: 'Ninguno' },
                        { id: 'shadow', label: 'Sombra' },
                        { id: 'lift', label: 'Elevado' },
                        { id: 'hollow', label: 'Hueco' },
                        { id: 'splice', label: 'Desfasado' },
                        { id: 'background', label: 'Fondo' },
                      ] as { id: WpsTextEffect; label: string }[]
                    ).map((fx) => (
                      <button
                        key={fx.id}
                        type="button"
                        onClick={() => updateSelected({ textEffect: fx.id }, true)}
                        className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                          (selectedEl.textEffect || 'none') === fx.id
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {fx.label}
                      </button>
                    ))}
                  </div>
                )}
                {selectedEl.type !== 'text' && (
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'none', label: 'Sin sombra' },
                        { id: 'soft', label: 'Suave' },
                        { id: 'elevated', label: 'Elevada' },
                        { id: 'glow', label: 'Neón' },
                      ] as { id: WpsShadowStyle; label: string }[]
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => updateSelected({ shadow: s.id }, true)}
                        className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                          ('shadow' in selectedEl ? selectedEl.shadow || 'none' : 'none') === s.id
                            ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedEl && elementPanel === 'border' && (
              <div className="space-y-3">
                {selectedEl.type === 'text' && (
                  <CanvaColorSwatchRow
                    label="Fondo de tarjeta"
                    value={selectedEl.fillColor || 'transparent'}
                    allowTransparent
                    onChange={(color) =>
                      updateSelected(
                        { fillColor: color === 'transparent' ? undefined : color },
                        true,
                      )
                    }
                  />
                )}
                <CanvaColorSwatchRow
                  label="Color de borde"
                  value={
                    ('borderColor' in selectedEl ? selectedEl.borderColor : undefined) ||
                    'transparent'
                  }
                  allowTransparent
                  onChange={(color) =>
                    updateSelected(
                      {
                        borderColor: color === 'transparent' ? undefined : color,
                        borderWidthPx:
                          color === 'transparent'
                            ? 0
                            : ('borderWidthPx' in selectedEl ? selectedEl.borderWidthPx : 0) || 2,
                      },
                      true,
                    )
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>Grosor</span>
                      <span className="font-mono">
                        {('borderWidthPx' in selectedEl ? selectedEl.borderWidthPx : 0) || 0}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={('borderWidthPx' in selectedEl ? selectedEl.borderWidthPx : 0) || 0}
                      onChange={(e) =>
                        updateSelected({ borderWidthPx: Number(e.target.value) }, false)
                      }
                      onPointerUp={() => onChangeLayers(layers, true)}
                      className="w-full accent-[#7C3AED]"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>Esquinas</span>
                      <span className="font-mono">
                        {('borderRadiusPx' in selectedEl ? selectedEl.borderRadiusPx : 0) || 0}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={('borderRadiusPx' in selectedEl ? selectedEl.borderRadiusPx : 0) || 0}
                      onChange={(e) =>
                        updateSelected({ borderRadiusPx: Number(e.target.value) }, false)
                      }
                      onPointerUp={() => onChangeLayers(layers, true)}
                      className="w-full accent-[#7C3AED]"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedEl && elementPanel === 'filters' && selectedEl.type === 'image' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'none', label: 'Original' },
                      { id: 'vivid', label: 'Vívido' },
                      { id: 'bw', label: 'B&N' },
                      { id: 'sepia', label: 'Sepia' },
                      { id: 'warm', label: 'Cálido' },
                      { id: 'cool', label: 'Frío' },
                    ] as { id: WpsImageFilterPreset; label: string }[]
                  ).map((fl) => (
                    <button
                      key={fl.id}
                      type="button"
                      onClick={() => updateSelected({ filterPreset: fl.id }, true)}
                      className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                        (selectedEl.filterPreset || 'none') === fl.id
                          ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {fl.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['contain', 'cover', 'fill'] as const).map((fit) => (
                    <button
                      key={fit}
                      type="button"
                      onClick={() => updateSelected({ imageFit: fit }, true)}
                      className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                        (selectedEl.imageFit || 'contain') === fit
                          ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {fit === 'contain' ? 'Ajustar' : fit === 'cover' ? 'Rellenar' : 'Estirar'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedEl && elementPanel === 'data' && selectedEl.type === 'chart' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'bar', label: 'Barras' },
                      { id: 'horizontalBar', label: 'Barras H' },
                      { id: 'line', label: 'Líneas' },
                      { id: 'donut', label: 'Dona' },
                    ] as { id: WpsChartKind; label: string }[]
                  ).map((ck) => (
                    <button
                      key={ck.id}
                      type="button"
                      onClick={() => updateSelected({ chartKind: ck.id }, true)}
                      className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-medium ${
                        (selectedEl.chartKind || 'bar') === ck.id
                          ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {ck.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={selectedEl.title || ''}
                  onChange={(e) => updateSelected({ title: e.target.value }, false)}
                  placeholder="Título del gráfico"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            )}

            {selectedEl && elementPanel === 'data' && selectedEl.type === 'table' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateSelected(
                      { rows: [...selectedEl.rows, selectedEl.headers.map(() => 'Dato')] },
                      true,
                    )
                  }
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                >
                  + Añadir fila
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSelected(
                      {
                        headers: [...selectedEl.headers, `Col ${selectedEl.headers.length + 1}`],
                        rows: selectedEl.rows.map((r) => [...r, 'Dato']),
                      },
                      true,
                    )
                  }
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                >
                  + Añadir columna
                </button>
              </div>
            )}

            {selectedEl && elementPanel === 'data' && selectedEl.type === 'diagram' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {selectedEl.items.map((item, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={item}
                      onChange={(e) =>
                        updateSelected(
                          {
                            items: selectedEl.items.map((it, i) =>
                              i === idx ? e.target.value : it,
                            ),
                          },
                          false,
                        )
                      }
                      className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSelected(
                      { items: [...selectedEl.items, `${selectedEl.items.length + 1}. Paso`] },
                      true,
                    )
                  }
                  className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                >
                  + Añadir paso
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Horizontal Dock Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
        {selectedEl ? (
          <>
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onSetEditingTextId(null);
              }}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
              <span>Deseleccionar</span>
            </button>
            {elementChips.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setElementPanel((p) => (p === id ? null : id))}
                className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                  elementPanel === id
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </>
        ) : (
          <>
            {(
              [
                { id: 'elements', label: 'Elementos', Icon: Shapes },
                { id: 'text', label: 'Texto Canva', Icon: Type },
                { id: 'charts', label: 'Gráficos/Tabla', Icon: BarChart3 },
                { id: 'background', label: 'Fondo', Icon: Palette },
                { id: 'layers', label: `Capas (${layers.length})`, Icon: Layers },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCanvasPanel((p) => (p === id ? null : id))}
                className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                  canvasPanel === id
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-medium text-slate-800 hover:bg-slate-200 whitespace-nowrap dark:bg-slate-800 dark:text-slate-100"
            >
              <Upload className="h-3.5 w-3.5 text-[#7C3AED]" />
              <span>Subir imagen</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
