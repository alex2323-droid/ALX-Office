import type { ResizeHandle } from '../components/CanvaControls';

export interface SnapGuide {
  axis: 'x' | 'y';
  pct: number;
}

export interface CanvaBoxRect {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  rotationDeg?: number;
}

export function normalizeAngle180(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
}

/**
 * Computes smooth delta-based rotation around an element's visual center,
 * preventing any initial jump when grabbing the handle.
 */
export function computeDeltaRotation(params: {
  startAngleDeg: number;
  origRotDeg: number;
  centerPxX: number;
  centerPxY: number;
  clientX: number;
  clientY: number;
  snapStep15?: boolean;
}): { deg: number; snapped: boolean } {
  const {
    startAngleDeg,
    origRotDeg,
    centerPxX,
    centerPxY,
    clientX,
    clientY,
    snapStep15 = false,
  } = params;

  const currentAngleDeg =
    (Math.atan2(clientY - centerPxY, clientX - centerPxX) * 180) / Math.PI;
  const delta = normalizeAngle180(currentAngleDeg - startAngleDeg);
  let deg = Math.round(normalizeAngle180(origRotDeg + delta));

  if (snapStep15) {
    deg = Math.round(deg / 15) * 15;
    if (deg === -180) deg = 180;
    return { deg, snapped: true };
  }

  for (const snap of [0, 45, -45, 90, -90, 135, -135, 180, -180]) {
    if (Math.abs(deg - snap) <= 3.5) {
      return { deg: snap === -180 ? 180 : snap, snapped: true };
    }
  }

  return { deg, snapped: false };
}

/**
 * Rotation-aware 8-handle resizing in pixel space, projected back to canvas percentages.
 * Keeps the opposite edge/corner pinned in place regardless of rotationDeg.
 */
export function computeRotatedResize(params: {
  handle: ResizeHandle;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  rotationDeg?: number;
  dxPx: number;
  dyPx: number;
  stageWidth: number;
  stageHeight: number;
  minWPct?: number;
  minHPct?: number;
  keepAspectRatio?: boolean;
}): { xPct: number; yPct: number; wPct: number; hPct: number } {
  const {
    handle,
    origX,
    origY,
    origW,
    origH,
    rotationDeg = 0,
    dxPx,
    dyPx,
    stageWidth,
    stageHeight,
    minWPct = 4,
    minHPct = 3,
    keepAspectRatio = false,
  } = params;

  if (stageWidth <= 0 || stageHeight <= 0) {
    return { xPct: origX, yPct: origY, wPct: origW, hPct: origH };
  }

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Project world pixel delta onto element's rotated local axes
  const localDxPx = dxPx * cos + dyPx * sin;
  const localDyPx = -dxPx * sin + dyPx * cos;

  const origWPx = (origW / 100) * stageWidth;
  const origHPx = (origH / 100) * stageHeight;
  const minWPx = Math.max(18, (minWPct / 100) * stageWidth);
  const minHPx = Math.max(14, (minHPct / 100) * stageHeight);

  let nextWPx = origWPx;
  let nextHPx = origHPx;
  let localCenterShiftX = 0;
  let localCenterShiftY = 0;

  if (handle.includes('e')) {
    const clamped = Math.max(minWPx - origWPx, localDxPx);
    nextWPx = origWPx + clamped;
    localCenterShiftX += clamped / 2;
  } else if (handle.includes('w')) {
    const clamped = Math.min(origWPx - minWPx, localDxPx);
    nextWPx = origWPx - clamped;
    localCenterShiftX += clamped / 2;
  }

  if (handle.includes('s')) {
    const clamped = Math.max(minHPx - origHPx, localDyPx);
    nextHPx = origHPx + clamped;
    localCenterShiftY += clamped / 2;
  } else if (handle.includes('n')) {
    const clamped = Math.min(origHPx - minHPx, localDyPx);
    nextHPx = origHPx - clamped;
    localCenterShiftY += clamped / 2;
  }

  // Optional proportional corner lock
  if (
    keepAspectRatio &&
    origHPx > 0 &&
    (handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw')
  ) {
    const aspect = origWPx / origHPx;
    if (Math.abs(nextWPx / origWPx - 1) >= Math.abs(nextHPx / origHPx - 1)) {
      const targetHPx = Math.max(minHPx, nextWPx / aspect);
      const diffH = targetHPx - origHPx;
      nextHPx = targetHPx;
      localCenterShiftY = handle.includes('s') ? diffH / 2 : -diffH / 2;
    } else {
      const targetWPx = Math.max(minWPx, nextHPx * aspect);
      const diffW = targetWPx - origWPx;
      nextWPx = targetWPx;
      localCenterShiftX = handle.includes('e') ? diffW / 2 : -diffW / 2;
    }
  }

  // Rotate local center shift back into world pixel space
  const worldCenterShiftX = localCenterShiftX * cos - localCenterShiftY * sin;
  const worldCenterShiftY = localCenterShiftX * sin + localCenterShiftY * cos;

  const origCenterXPx = ((origX + origW / 2) / 100) * stageWidth;
  const origCenterYPx = ((origY + origH / 2) / 100) * stageHeight;

  const nextCenterXPx = origCenterXPx + worldCenterShiftX;
  const nextCenterYPx = origCenterYPx + worldCenterShiftY;

  const wPct = Math.round(((nextWPx / stageWidth) * 100) * 10) / 10;
  const hPct = Math.round(((nextHPx / stageHeight) * 100) * 10) / 10;
  const xPct = Math.round((((nextCenterXPx - nextWPx / 2) / stageWidth) * 100) * 10) / 10;
  const yPct = Math.round((((nextCenterYPx - nextHPx / 2) / stageHeight) * 100) * 10) / 10;

  return { xPct, yPct, wPct, hPct };
}

/**
 * Computes Canva smart-snap drag position and guide lines relative to canvas & sibling boxes.
 */
export function computeSnapDrag(params: {
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  dxPct: number;
  dyPct: number;
  siblings: CanvaBoxRect[];
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  threshold?: number;
}): { xPct: number; yPct: number; guides: SnapGuide[] } {
  const {
    origX,
    origY,
    origW,
    origH,
    dxPct,
    dyPct,
    siblings,
    minX = -20,
    maxX = 95,
    minY = -20,
    maxY = 95,
    threshold = 1.25,
  } = params;

  let nextX = origX + dxPct;
  let nextY = origY + dyPct;
  const guides: SnapGuide[] = [];

  const elCenterX = nextX + origW / 2;
  const elCenterY = nextY + origH / 2;

  const xTargets = [
    { val: 50, apply: 50 - origW / 2, guide: 50 },
    { val: 6, apply: 6, guide: 6 },
    { val: 94, apply: 94 - origW, guide: 94 },
  ];
  let snappedX = false;
  for (const t of xTargets) {
    const check = t.guide === 50 ? elCenterX : t.guide === 6 ? nextX : nextX + origW;
    if (Math.abs(check - t.val) < threshold) {
      nextX = t.apply;
      guides.push({ axis: 'x', pct: t.guide });
      snappedX = true;
      break;
    }
  }

  const yTargets = [
    { val: 50, apply: 50 - origH / 2, guide: 50 },
    { val: 8, apply: 8, guide: 8 },
    { val: 92, apply: 92 - origH, guide: 92 },
  ];
  let snappedY = false;
  for (const t of yTargets) {
    const check = t.guide === 50 ? elCenterY : t.guide === 8 ? nextY : nextY + origH;
    if (Math.abs(check - t.val) < threshold) {
      nextY = t.apply;
      guides.push({ axis: 'y', pct: t.guide });
      snappedY = true;
      break;
    }
  }

  for (const sib of siblings) {
    const sibCx = sib.xPct + sib.wPct / 2;
    const sibCy = sib.yPct + sib.hPct / 2;
    const sibRight = sib.xPct + sib.wPct;
    const sibBottom = sib.yPct + sib.hPct;

    if (!snappedX) {
      if (Math.abs(nextX + origW / 2 - sibCx) < threshold) {
        nextX = sibCx - origW / 2;
        guides.push({ axis: 'x', pct: sibCx });
        snappedX = true;
      } else if (Math.abs(nextX - sib.xPct) < threshold) {
        nextX = sib.xPct;
        guides.push({ axis: 'x', pct: sib.xPct });
        snappedX = true;
      } else if (Math.abs(nextX + origW - sibRight) < threshold) {
        nextX = sibRight - origW;
        guides.push({ axis: 'x', pct: sibRight });
        snappedX = true;
      }
    }

    if (!snappedY) {
      if (Math.abs(nextY + origH / 2 - sibCy) < threshold) {
        nextY = sibCy - origH / 2;
        guides.push({ axis: 'y', pct: sibCy });
        snappedY = true;
      } else if (Math.abs(nextY - sib.yPct) < threshold) {
        nextY = sib.yPct;
        guides.push({ axis: 'y', pct: sib.yPct });
        snappedY = true;
      } else if (Math.abs(nextY + origH - sibBottom) < threshold) {
        nextY = sibBottom - origH;
        guides.push({ axis: 'y', pct: sibBottom });
        snappedY = true;
      }
    }
  }

  nextX = Math.max(minX, Math.min(maxX, Math.round(nextX * 10) / 10));
  nextY = Math.max(minY, Math.min(maxY, Math.round(nextY * 10) / 10));

  return { xPct: nextX, yPct: nextY, guides };
}
