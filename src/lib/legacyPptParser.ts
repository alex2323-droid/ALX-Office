import type { WpsSlide, WpsSlideElement } from '../data/wpsDocuments';

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

function readUint16(view: DataView, offset: number): number {
  return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0;
}

function readInt16(view: DataView, offset: number): number {
  return offset + 2 <= view.byteLength ? view.getInt16(offset, true) : 0;
}

function readUint32(view: DataView, offset: number): number {
  return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function isOle2File(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;
  for (let i = 0; i < OLE2_MAGIC.length; i++) {
    if (bytes[i] !== OLE2_MAGIC[i]) return false;
  }
  return true;
}

function readStreamByChain(
  bytes: Uint8Array,
  fat: number[],
  startSector: number,
  sectorSize: number,
  maxBytes?: number,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let sec = startSector;
  const visited = new Set<number>();

  while (sec !== ENDOFCHAIN && sec !== FREESECT && sec < fat.length && !visited.has(sec)) {
    visited.add(sec);
    const offset = (sec + 1) * sectorSize;
    if (offset >= bytes.length) break;
    const end = Math.min(bytes.length, offset + sectorSize);
    const slice = bytes.subarray(offset, end);
    chunks.push(slice);
    total += slice.length;
    if (maxBytes !== undefined && total >= maxBytes) break;
    sec = fat[sec];
  }

  const targetLen = maxBytes !== undefined ? Math.min(total, maxBytes) : total;
  const out = new Uint8Array(targetLen);
  let pos = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, targetLen - pos);
    if (take <= 0) break;
    out.set(chunk.subarray(0, take), pos);
    pos += take;
  }
  return out;
}

function readOle2Streams(bytes: Uint8Array, targetNames: string[]): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  if (!isOle2File(bytes)) return result;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = readUint16(view, 0x1e);
  const miniSectorShift = readUint16(view, 0x20);
  const sectorSize = 1 << (sectorShift || 9);
  const miniSectorSize = 1 << (miniSectorShift || 6);
  const firstDirSector = readUint32(view, 0x30);
  const miniStreamCutoff = readUint32(view, 0x38) || 4096;
  const firstMiniFatSector = readUint32(view, 0x3c);
  const numMiniFatSectors = readUint32(view, 0x40);
  const firstDifatSector = readUint32(view, 0x44);
  const numDifatSectors = readUint32(view, 0x48);

  if (sectorSize < 64 || sectorSize > 65536) return result;

  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = readUint32(view, 0x4c + i * 4);
    if (s !== FREESECT && s !== ENDOFCHAIN) fatSectors.push(s);
  }

  let difatSec = firstDifatSector;
  const visitedDifat = new Set<number>();
  for (let d = 0; d < numDifatSectors && difatSec !== ENDOFCHAIN && difatSec !== FREESECT; d++) {
    if (visitedDifat.has(difatSec)) break;
    visitedDifat.add(difatSec);
    const offset = (difatSec + 1) * sectorSize;
    if (offset + sectorSize > bytes.length) break;
    const entriesPerSec = sectorSize / 4 - 1;
    for (let i = 0; i < entriesPerSec; i++) {
      const s = readUint32(view, offset + i * 4);
      if (s !== FREESECT && s !== ENDOFCHAIN) fatSectors.push(s);
    }
    difatSec = readUint32(view, offset + entriesPerSec * 4);
  }

  const fat: number[] = [];
  for (const fs of fatSectors) {
    const offset = (fs + 1) * sectorSize;
    if (offset + sectorSize > bytes.length) continue;
    for (let i = 0; i < sectorSize; i += 4) {
      fat.push(readUint32(view, offset + i));
    }
  }
  if (fat.length === 0) return result;

  const dirBytes = readStreamByChain(bytes, fat, firstDirSector, sectorSize);
  const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);

  let rootStartSector = ENDOFCHAIN;
  let rootStreamSize = 0;
  const matchedEntries: { key: string; startSec: number; size: number }[] = [];
  const normalizedTargets = new Set(targetNames.map((n) => n.toLowerCase()));

  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLen = readUint16(dirView, off + 0x40);
    const objType = dirBytes[off + 0x42];
    if (objType === 0 || nameLen < 2 || nameLen > 64) continue;

    let name = '';
    for (let j = 0; j + 1 < nameLen - 2; j += 2) {
      name += String.fromCharCode(readUint16(dirView, off + j));
    }
    const startSec = readUint32(dirView, off + 0x74);
    const streamSize = readUint32(dirView, off + 0x78);

    if (objType === 5 && name === 'Root Entry') {
      rootStartSector = startSec;
      rootStreamSize = streamSize;
    } else if (objType === 2 && normalizedTargets.has(name.toLowerCase())) {
      matchedEntries.push({ key: name.toLowerCase(), startSec, size: streamSize });
    }
  }

  let miniStreamCache: Uint8Array | null = null;
  let miniFatCache: number[] | null = null;

  for (const entry of matchedEntries) {
    if (entry.startSec === ENDOFCHAIN || entry.size === 0) continue;
    if (entry.size >= miniStreamCutoff) {
      result.set(
        entry.key,
        readStreamByChain(bytes, fat, entry.startSec, sectorSize, entry.size),
      );
      continue;
    }

    if (rootStartSector === ENDOFCHAIN || rootStreamSize === 0) continue;
    if (!miniStreamCache) {
      miniStreamCache = readStreamByChain(bytes, fat, rootStartSector, sectorSize, rootStreamSize);
      const miniFatBytes =
        numMiniFatSectors > 0 && firstMiniFatSector !== ENDOFCHAIN
          ? readStreamByChain(bytes, fat, firstMiniFatSector, sectorSize)
          : new Uint8Array(0);
      const miniFatView = new DataView(
        miniFatBytes.buffer,
        miniFatBytes.byteOffset,
        miniFatBytes.byteLength,
      );
      miniFatCache = [];
      for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) {
        miniFatCache.push(miniFatView.getUint32(i, true));
      }
    }

    const activeMiniFat = miniFatCache ?? [];
    const out = new Uint8Array(entry.size);
    let pos = 0;
    let msec = entry.startSec;
    const visitedMini = new Set<number>();
    while (
      msec !== ENDOFCHAIN &&
      msec !== FREESECT &&
      pos < entry.size &&
      !visitedMini.has(msec)
    ) {
      visitedMini.add(msec);
      const mOff = msec * miniSectorSize;
      if (mOff >= miniStreamCache.length) break;
      const take = Math.min(miniSectorSize, entry.size - pos, miniStreamCache.length - mOff);
      out.set(miniStreamCache.subarray(mOff, mOff + take), pos);
      pos += take;
      msec = msec < activeMiniFat.length ? activeMiniFat[msec] : ENDOFCHAIN;
    }
    result.set(entry.key, out);
  }

  return result;
}

function findImagePayloadOffset(slice: Uint8Array): { offset: number; mime: string } | null {
  const limit = Math.min(slice.length, 64);
  for (let i = 0; i + 8 <= limit; i++) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      slice[i] === 0x89 &&
      slice[i + 1] === 0x50 &&
      slice[i + 2] === 0x4e &&
      slice[i + 3] === 0x47
    ) {
      return { offset: i, mime: 'image/png' };
    }
    // JPEG: FF D8 FF
    if (slice[i] === 0xff && slice[i + 1] === 0xd8 && slice[i + 2] === 0xff) {
      return { offset: i, mime: 'image/jpeg' };
    }
    // GIF87a / GIF89a
    if (
      slice[i] === 0x47 &&
      slice[i + 1] === 0x49 &&
      slice[i + 2] === 0x46 &&
      slice[i + 3] === 0x38
    ) {
      return { offset: i, mime: 'image/gif' };
    }
  }
  return null;
}

function extractPicturesFromStream(picturesStream: Uint8Array): Map<number, string> {
  const byOffset = new Map<number, string>();
  const view = new DataView(
    picturesStream.buffer,
    picturesStream.byteOffset,
    picturesStream.byteLength,
  );
  let offset = 0;

  while (offset + 8 <= picturesStream.length) {
    const recType = readUint16(view, offset + 2);
    const recLen = readUint32(view, offset + 4);
    const bodyStart = offset + 8;
    const bodyEnd = Math.min(picturesStream.length, bodyStart + recLen);

    if (recType >= 0xf01a && recType <= 0xf029 && recLen > 16) {
      const body = picturesStream.subarray(bodyStart, bodyEnd);
      const found = findImagePayloadOffset(body);
      if (found) {
        const imgBytes = body.subarray(found.offset);
        byOffset.set(
          offset,
          `data:${found.mime};base64,${uint8ToBase64(imgBytes)}`,
        );
      }
    }

    if (recLen === 0) break;
    offset = bodyStart + recLen;
  }

  return byOffset;
}

function decodeTextCharsAtom(slice: Uint8Array): string {
  let text = '';
  for (let i = 0; i + 1 < slice.length; i += 2) {
    const code = slice[i] | (slice[i + 1] << 8);
    if (code === 0x0d || code === 0x0b) {
      text += '\n';
    } else if (code >= 0x20 || code === 0x09) {
      text += String.fromCharCode(code);
    }
  }
  return text;
}

function decodeTextBytesAtom(slice: Uint8Array): string {
  let text = '';
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    if (b === 0x0d || b === 0x0b) {
      text += '\n';
    } else if (b >= 0x20 || b === 0x09) {
      text += String.fromCharCode(b);
    }
  }
  return text;
}

interface RawPptSlideBucket {
  titleLines: string[];
  subtitleLines: string[];
  bodyLines: string[];
}

interface LegacyPictureRef {
  pib: number; // 1-based into BSE list
  top: number;
  left: number;
  right: number;
  bottom: number;
}

function parseSlideListWithTextRecords(
  stream: Uint8Array,
  start: number,
  end: number,
): RawPptSlideBucket[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const buckets: RawPptSlideBucket[] = [];
  let current: RawPptSlideBucket | null = null;
  let currentRole = 1;

  let offset = start;
  while (offset + 8 <= end) {
    const recType = readUint16(view, offset + 2);
    const recLen = readUint32(view, offset + 4);
    const bodyStart = offset + 8;
    const bodyEnd = Math.min(end, bodyStart + recLen);

    if (recType === 0x03f3) {
      current = { titleLines: [], subtitleLines: [], bodyLines: [] };
      buckets.push(current);
      currentRole = 1;
    } else if (recType === 0x0f9f && bodyStart + 4 <= bodyEnd) {
      currentRole = readUint32(view, bodyStart);
    } else if (recType === 0x0fa0 || recType === 0x0fa8) {
      if (!current) {
        current = { titleLines: [], subtitleLines: [], bodyLines: [] };
        buckets.push(current);
      }
      const raw =
        recType === 0x0fa0
          ? decodeTextCharsAtom(stream.subarray(bodyStart, bodyEnd))
          : decodeTextBytesAtom(stream.subarray(bodyStart, bodyEnd));
      const lines = raw
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length > 0 && l !== '*');

      if (lines.length > 0) {
        if (currentRole === 0 || currentRole === 6) {
          current.titleLines.push(...lines);
        } else if (currentRole === 7) {
          current.subtitleLines.push(...lines);
        } else {
          current.bodyLines.push(...lines);
        }
      }
    }

    offset = bodyStart + recLen;
    if (recLen === 0 && bodyStart >= end) break;
  }

  return buckets;
}

function walkPowerPointRecords(stream: Uint8Array): {
  slideBuckets: RawPptSlideBucket[];
  notesBuckets: RawPptSlideBucket[];
  directSlideTexts: RawPptSlideBucket[];
  bseOffsets: number[];
  slidePictures: LegacyPictureRef[][];
} {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const slideBuckets: RawPptSlideBucket[] = [];
  const notesBuckets: RawPptSlideBucket[] = [];
  const directSlideTexts: RawPptSlideBucket[] = [];
  const bseOffsets: number[] = [];
  const slidePictures: LegacyPictureRef[][] = [];

  function collectPicturesInContainer(start: number, end: number, out: LegacyPictureRef[], depth: number) {
    if (depth > 10) return;
    let offset = start;
    while (offset + 8 <= end) {
      const verInst = readUint16(view, offset);
      const recVer = verInst & 0x0f;
      const recType = readUint16(view, offset + 2);
      const recLen = readUint32(view, offset + 4);
      const bodyStart = offset + 8;
      const bodyEnd = Math.min(end, bodyStart + recLen);

      if (recType === 0xf004) {
        // OfficeArtSpContainer
        let pib = 0;
        let anchor: { top: number; left: number; right: number; bottom: number } | null = null;
        let subOff = bodyStart;
        while (subOff + 8 <= bodyEnd) {
          const sVerInst = readUint16(view, subOff);
          const sInst = (sVerInst >> 4) & 0x0fff;
          const sType = readUint16(view, subOff + 2);
          const sLen = readUint32(view, subOff + 4);
          const sBodyStart = subOff + 8;
          const sBodyEnd = Math.min(bodyEnd, sBodyStart + sLen);

          if ((sType === 0xf00b || sType === 0xf122) && sInst > 0) {
            for (let p = 0; p < sInst; p++) {
              const pOff = sBodyStart + p * 6;
              if (pOff + 6 > sBodyEnd) break;
              const propId = readUint16(view, pOff) & 0x3fff;
              const propVal = readUint32(view, pOff + 2);
              if (propId === 0x0104 && propVal > 0) {
                pib = propVal;
              }
            }
          } else if (sType === 0xf010 && sBodyStart + 8 <= sBodyEnd) {
            if (sLen === 8) {
              anchor = {
                top: readInt16(view, sBodyStart),
                left: readInt16(view, sBodyStart + 2),
                right: readInt16(view, sBodyStart + 4),
                bottom: readInt16(view, sBodyStart + 6),
              };
            } else if (sLen >= 16) {
              anchor = {
                top: view.getInt32(sBodyStart, true),
                left: view.getInt32(sBodyStart + 4, true),
                right: view.getInt32(sBodyStart + 8, true),
                bottom: view.getInt32(sBodyStart + 12, true),
              };
            }
          }
          subOff = sBodyStart + sLen;
          if (sLen === 0) break;
        }
        if (pib > 0) {
          out.push({
            pib,
            top: anchor?.top ?? 1200,
            left: anchor?.left ?? 800,
            right: anchor?.right ?? 4800,
            bottom: anchor?.bottom ?? 3800,
          });
        }
      } else if (recVer === 0x0f && recLen > 0) {
        collectPicturesInContainer(bodyStart, bodyEnd, out, depth + 1);
      }

      offset = bodyStart + recLen;
      if (recLen === 0 && bodyStart >= end) break;
    }
  }

  function collectSlideContainerText(
    buf: Uint8Array,
    start: number,
    end: number,
    bucket: RawPptSlideBucket,
    depth: number,
  ) {
    if (depth > 12) return;
    let offset = start;
    let role = 1;
    while (offset + 8 <= end) {
      const verInst = readUint16(view, offset);
      const recVer = verInst & 0x0f;
      const recType = readUint16(view, offset + 2);
      const recLen = readUint32(view, offset + 4);
      const bodyStart = offset + 8;
      const bodyEnd = Math.min(end, bodyStart + recLen);

      if (recType === 0x0f9f && bodyStart + 4 <= bodyEnd) {
        role = readUint32(view, bodyStart);
      } else if (recType === 0x0fa0 || recType === 0x0fa8) {
        const raw =
          recType === 0x0fa0
            ? decodeTextCharsAtom(buf.subarray(bodyStart, bodyEnd))
            : decodeTextBytesAtom(buf.subarray(bodyStart, bodyEnd));
        const lines = raw
          .split('\n')
          .map((l) => l.replace(/\s+/g, ' ').trim())
          .filter((l) => l.length > 0 && l !== '*');
        if (role === 0 || role === 6) {
          bucket.titleLines.push(...lines);
        } else if (role === 7) {
          bucket.subtitleLines.push(...lines);
        } else {
          bucket.bodyLines.push(...lines);
        }
      } else if (recVer === 0x0f && recLen > 0) {
        collectSlideContainerText(buf, bodyStart, bodyEnd, bucket, depth + 1);
      }

      offset = bodyStart + recLen;
      if (recLen === 0 && bodyStart >= end) break;
    }
  }

  function walk(start: number, end: number, depth: number) {
    if (depth > 16) return;
    let offset = start;
    while (offset + 8 <= end) {
      const verInst = readUint16(view, offset);
      const recVer = verInst & 0x0f;
      const recInstance = (verInst >> 4) & 0x0fff;
      const recType = readUint16(view, offset + 2);
      const recLen = readUint32(view, offset + 4);
      const bodyStart = offset + 8;
      const bodyEnd = Math.min(end, bodyStart + recLen);

      if (recType === 0x0ff0) {
        if (recInstance === 0) {
          slideBuckets.push(...parseSlideListWithTextRecords(stream, bodyStart, bodyEnd));
        } else if (recInstance === 2) {
          notesBuckets.push(...parseSlideListWithTextRecords(stream, bodyStart, bodyEnd));
        }
      } else if (recType === 0xf007) {
        // OfficeArtBSE: foDelay at bodyStart + 28 (4 bytes)
        if (bodyStart + 32 <= bodyEnd) {
          bseOffsets.push(readUint32(view, bodyStart + 28));
        } else {
          bseOffsets.push(-1);
        }
      } else if (recType === 0x03ee && recVer === 0x0f) {
        const pics: LegacyPictureRef[] = [];
        collectPicturesInContainer(bodyStart, bodyEnd, pics, 0);
        slidePictures.push(pics);

        const bucket: RawPptSlideBucket = { titleLines: [], subtitleLines: [], bodyLines: [] };
        collectSlideContainerText(stream, bodyStart, bodyEnd, bucket, 0);
        if (
          bucket.titleLines.length > 0 ||
          bucket.subtitleLines.length > 0 ||
          bucket.bodyLines.length > 0 ||
          pics.length > 0
        ) {
          directSlideTexts.push(bucket);
        }
      } else if (recVer === 0x0f && recLen > 0) {
        walk(bodyStart, bodyEnd, depth + 1);
      }

      offset = bodyStart + recLen;
      if (recLen === 0 && bodyStart >= end) break;
    }
  }

  walk(0, stream.length, 0);
  return { slideBuckets, notesBuckets, directSlideTexts, bseOffsets, slidePictures };
}

export function parseLegacyPptToSlides(bytes: Uint8Array, baseTitle: string): WpsSlide[] {
  const streams = readOle2Streams(bytes, ['PowerPoint Document', 'Pictures']);
  const pptStream = streams.get('powerpoint document');
  if (!pptStream) return [];

  const picturesStream = streams.get('pictures');
  const pictureDataByOffset = picturesStream
    ? extractPicturesFromStream(picturesStream)
    : new Map<number, string>();

  const { slideBuckets, notesBuckets, directSlideTexts, bseOffsets, slidePictures } =
    walkPowerPointRecords(pptStream);

  const chosen = slideBuckets.length > 0 ? slideBuckets : directSlideTexts;
  const totalSlides = Math.max(chosen.length, pictureDataByOffset.size > 0 && chosen.length === 0 ? 1 : 0);
  if (totalSlides === 0) return [];

  const allExtractedImages = Array.from(pictureDataByOffset.values());
  const usedImages = new Set<string>();

  const slides: WpsSlide[] = [];
  for (let idx = 0; idx < totalSlides; idx++) {
    const slideNum = idx + 1;
    const bucket = chosen[idx] || { titleLines: [], subtitleLines: [], bodyLines: [] };
    const title =
      bucket.titleLines.join(' ').trim() ||
      bucket.bodyLines[0] ||
      `${baseTitle} — Diapositiva ${slideNum}`;
    const subtitle = bucket.subtitleLines.join(' ').trim() || undefined;
    const bullets =
      bucket.titleLines.length > 0
        ? bucket.bodyLines
        : bucket.bodyLines.slice(1);
    const noteBucket = notesBuckets[idx];
    const notes = noteBucket
      ? [...noteBucket.titleLines, ...noteBucket.bodyLines].join(' ').trim()
      : '';

    // Resolve matched images on this slide
    const slideRefs = slidePictures[idx] || [];
    const slideElements: WpsSlideElement[] = [];

    // Build structured text elements alongside images if images exist on this slide
    let hasMatchedImages = false;
    let z = 10;

    for (const pic of slideRefs) {
      const picOffset = bseOffsets[pic.pib - 1];
      const src =
        picOffset !== undefined && pictureDataByOffset.has(picOffset)
          ? pictureDataByOffset.get(picOffset)
          : allExtractedImages[pic.pib - 1];
      if (!src) continue;

      usedImages.add(src);
      hasMatchedImages = true;

      // Standard PPT master coordinate space ~ 5760 x 4320
      const xPct = Math.max(0, Math.min(90, (pic.left / 5760) * 100));
      const yPct = Math.max(0, Math.min(85, (pic.top / 4320) * 100));
      const wPct = Math.max(10, Math.min(100 - xPct, ((pic.right - pic.left) / 5760) * 100));
      const hPct = Math.max(10, Math.min(100 - yPct, ((pic.bottom - pic.top) / 4320) * 100));

      slideElements.push({
        id: `ppt-img-${slideNum}-${z}`,
        type: 'image',
        xPct,
        yPct,
        wPct,
        hPct,
        src,
        alt: `Imagen diapositiva ${slideNum}`,
        imageFit: 'contain',
        zIndex: z++,
      });
    }

    if (hasMatchedImages) {
      slideElements.unshift({
        id: `ppt-txt-title-${slideNum}`,
        type: 'text',
        xPct: 5,
        yPct: 5,
        wPct: 90,
        hPct: 16,
        isTitle: true,
        zIndex: 20,
        paragraphs: [
          {
            runs: [{ text: title, bold: true, fontSizePt: 26, color: '#0F172A' }],
          },
        ],
      });
      if (bullets.length > 0) {
        slideElements.push({
          id: `ppt-txt-body-${slideNum}`,
          type: 'text',
          xPct: 5,
          yPct: 24,
          wPct: 52,
          hPct: 68,
          zIndex: 21,
          paragraphs: bullets.slice(0, 7).map((line) => ({
            bullet: true,
            runs: [{ text: line, fontSizePt: 15, color: '#1E293B' }],
          })),
        });
      }
    }

    slides.push({
      id: `ppt-slide-${slideNum}`,
      index: slideNum,
      title,
      subtitle,
      bullets,
      notes,
      elements: slideElements.length > 0 ? slideElements : undefined,
    });
  }

  // Attach any remaining unmapped Pictures stream images onto slides cleanly
  const unmapped = allExtractedImages.filter((src) => !usedImages.has(src));
  if (unmapped.length > 0 && slides.length > 0) {
    unmapped.forEach((src, uIdx) => {
      const targetSlide = slides[Math.min(uIdx, slides.length - 1)];
      if (!targetSlide.elements) {
        const els: WpsSlideElement[] = [
          {
            id: `ppt-auto-title-${targetSlide.index}`,
            type: 'text',
            xPct: 5,
            yPct: 5,
            wPct: 90,
            hPct: 15,
            isTitle: true,
            zIndex: 5,
            paragraphs: [
              { runs: [{ text: targetSlide.title, bold: true, fontSizePt: 25, color: '#0F172A' }] },
            ],
          },
        ];
        if (targetSlide.bullets.length > 0) {
          els.push({
            id: `ppt-auto-body-${targetSlide.index}`,
            type: 'text',
            xPct: 5,
            yPct: 23,
            wPct: 48,
            hPct: 70,
            zIndex: 6,
            paragraphs: targetSlide.bullets.slice(0, 6).map((b) => ({
              bullet: true,
              runs: [{ text: b, fontSizePt: 15, color: '#1E293B' }],
            })),
          });
        }
        targetSlide.elements = els;
      }
      targetSlide.elements.push({
        id: `ppt-unmapped-img-${uIdx}`,
        type: 'image',
        xPct: 56,
        yPct: 24,
        wPct: 38,
        hPct: 62,
        src,
        alt: `Imagen ${uIdx + 1}`,
        imageFit: 'contain',
        zIndex: 4,
      });
    });
  }

  return slides;
}
