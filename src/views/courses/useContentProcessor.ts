/**
 * useContentProcessor — מעבד קבצים ומייצר thumbnails.
 * PPTX: רנדרר canvas מלא — רקע + תמונות במיקום + טקסט במיקום.
 * PDF: pdfjs-dist. DOCX: JSZip. תמונות: ישיר. Video: YouTube / Vimeo oEmbed.
 */
import { useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import type { ContentType } from '../../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ── Generic helpers ────────────────────────────────────────────────────────────

function canvasToDataUrl(canvas: HTMLCanvasElement, q = 0.88): string {
  return canvas.toDataURL('image/jpeg', q);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function renderPdfPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale = 1.5,
): Promise<string> {
  const page     = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx      = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvasToDataUrl(canvas);
}

// ── XML helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip XML namespace prefixes so querySelector works cleanly.
 * <p:sp> → <sp>   <a:t> → <t>   r:embed="rId2" → embed="rId2"
 */
function stripNs(xml: string): string {
  return xml
    .replace(/\s+xmlns(?::[a-zA-Z0-9_]+)?="[^"]*"/g, '')
    .replace(/<(\/?)[a-zA-Z0-9_]+:([a-zA-Z0-9_.:-]+)/g, '<$1$2')
    .replace(/\s[a-zA-Z0-9_]+:([a-zA-Z0-9_.-]+)=/g, ' $1=');
}

/** EMU → canvas pixels */
function emu(val: string | null | undefined, scale: number): number {
  if (!val) return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n * scale;
}

/** First direct child with the given tag */
function kid(el: Element, tag: string): Element | null {
  for (const c of el.children) if (c.tagName === tag) return c;
  return null;
}

/** Draw an image at given bounds; resolves even on error */
function drawImg(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number, y: number, w: number, h: number,
): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { ctx.drawImage(img, x, y, w, h); resolve(); };
    img.onerror = () => resolve();
    img.src = src;
  });
}

// ── PPTX full-fidelity renderer ─────────────────────────────────────────────────

/** Data shared across all slides of one PPTX file */
interface PptxCtx {
  zip: JSZip;
  slideW: number;
  slideH: number;
  masterBgColor: string | null;
  masterBgImage: string | null;
}

/** Read slide dimensions + master background, once per file */
async function buildPptxCtx(zip: JSZip): Promise<PptxCtx> {
  // Slide dimensions from presentation.xml
  let slideW = 9144000, slideH = 6858000;
  const presFile = zip.file('ppt/presentation.xml');
  if (presFile) {
    const xml = stripNs(await presFile.async('string'));
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const sz  = doc.querySelector('sldSz');
    if (sz) {
      const cx = parseInt(sz.getAttribute('cx') ?? '0');
      const cy = parseInt(sz.getAttribute('cy') ?? '0');
      if (cx > 0 && cy > 0) { slideW = cx; slideH = cy; }
    }
  }

  // Master background (slideMaster1)
  let masterBgColor: string | null = null;
  let masterBgImage: string | null = null;

  const masterFile = zip.file('ppt/slideMasters/slideMaster1.xml');
  if (masterFile) {
    const mXml = stripNs(await masterFile.async('string'));
    const mDoc = new DOMParser().parseFromString(mXml, 'text/xml');
    const bgPr = mDoc.querySelector('bg bgPr');
    if (bgPr) {
      const sc = bgPr.querySelector('solidFill srgbClr');
      if (sc) masterBgColor = '#' + (sc.getAttribute('val') ?? 'FFFFFF');

      const blip = bgPr.querySelector('blipFill blip');
      if (blip) {
        const rId     = blip.getAttribute('embed');
        const relFile = zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels');
        if (rId && relFile) {
          const rDoc = new DOMParser().parseFromString(
            await relFile.async('string'), 'text/xml',
          );
          const rel = [...rDoc.querySelectorAll('Relationship')].find(
            r => r.getAttribute('Id') === rId && (r.getAttribute('Type') ?? '').includes('/image'),
          );
          if (rel) {
            const t  = rel.getAttribute('Target') ?? '';
            const p  = t.startsWith('../') ? 'ppt/' + t.slice(3) : `ppt/slideMasters/${t}`;
            const mf = zip.file(p);
            if (mf) {
              try { masterBgImage = await blobToDataUrl(await mf.async('blob')); } catch { /* ignore */ }
            }
          }
        }
      }
    }
  }

  return { zip, slideW, slideH, masterBgColor, masterBgImage };
}

/** Load rId → data URL map for one slide */
async function loadMediaMap(zip: JSZip, slideNum: string): Promise<Map<string, string>> {
  const map      = new Map<string, string>();
  const relsFile = zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
  if (!relsFile) return map;

  const rDoc = new DOMParser().parseFromString(
    await relsFile.async('string'), 'text/xml',
  );
  for (const rel of rDoc.querySelectorAll('Relationship')) {
    const id   = rel.getAttribute('Id')     ?? '';
    const tgt  = rel.getAttribute('Target') ?? '';
    const type = rel.getAttribute('Type')   ?? '';
    if (!type.includes('/image')) continue;

    const path = tgt.startsWith('../') ? 'ppt/' + tgt.slice(3)
      : tgt.startsWith('/') ? tgt.slice(1)
      : `ppt/slides/${tgt}`;

    const mf = zip.file(path);
    if (mf) {
      try { map.set(id, await blobToDataUrl(await mf.async('blob'))); } catch { /* ignore */ }
    }
  }
  return map;
}

/** Flatten sp / pic elements, recursing into grpSp */
function flattenSpTree(container: Element): Element[] {
  const out: Element[] = [];
  for (const c of container.children) {
    if      (c.tagName === 'grpSp') out.push(...flattenSpTree(c));
    else if (c.tagName === 'sp' || c.tagName === 'pic') out.push(c);
  }
  return out;
}

/** Render one PPTX slide to a 960×540 JPEG data URL */
async function renderPptxSlide(
  pctx: PptxCtx,
  slideFile: string,
  slideNum: string,
): Promise<string> {
  const W = 960, H = 540;
  const sx = W / pctx.slideW;
  const sy = H / pctx.slideH;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 1. Master background (base layer)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  if (pctx.masterBgImage) {
    await drawImg(ctx, pctx.masterBgImage, 0, 0, W, H);
  } else if (pctx.masterBgColor) {
    ctx.fillStyle = pctx.masterBgColor;
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Load slide media
  const mediaMap = await loadMediaMap(pctx.zip, slideNum);

  // 3. Parse slide XML
  const raw = await pctx.zip.file(slideFile)!.async('string');
  const doc = new DOMParser().parseFromString(stripNs(raw), 'text/xml');

  // 4. Slide-specific background (overrides master)
  const bgPr = doc.querySelector('bg bgPr');
  if (bgPr) {
    const sc = bgPr.querySelector('solidFill srgbClr');
    if (sc) {
      ctx.fillStyle = '#' + (sc.getAttribute('val') ?? 'FFFFFF');
      ctx.fillRect(0, 0, W, H);
    }
    const gf = bgPr.querySelector('gradFill');
    if (gf && !sc) {
      const stops = [...gf.querySelectorAll('gs')];
      if (stops.length >= 2) {
        const grad = ctx.createLinearGradient(0, 0, W, H);
        for (const s of stops) {
          const pos = parseInt(s.getAttribute('pos') ?? '0') / 100000;
          const clr = s.querySelector('srgbClr')?.getAttribute('val') ?? 'DDEEFF';
          try { grad.addColorStop(pos, '#' + clr); } catch { /* ignore */ }
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
    }
    const bgBlip = bgPr.querySelector('blipFill blip');
    if (bgBlip) {
      const rId = bgBlip.getAttribute('embed');
      if (rId && mediaMap.has(rId)) await drawImg(ctx, mediaMap.get(rId)!, 0, 0, W, H);
    }
  }

  // 5. Render all spTree elements in z-order
  const spTree = doc.querySelector('spTree');
  if (!spTree) return canvasToDataUrl(canvas);

  for (const el of flattenSpTree(spTree)) {

    // ── Picture ────────────────────────────────────────────────────────────────
    if (el.tagName === 'pic') {
      const blip = el.querySelector('blip');
      const xfrm = el.querySelector('spPr xfrm') ?? el.querySelector('xfrm');
      if (!xfrm) continue;
      const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext');
      if (!off || !ext) continue;
      const x = emu(off.getAttribute('x'), sx);
      const y = emu(off.getAttribute('y'), sy);
      const w = emu(ext.getAttribute('cx'), sx);
      const h = emu(ext.getAttribute('cy'), sy);
      if (w <= 0 || h <= 0) continue;

      const rId = blip?.getAttribute('embed');
      if (!rId || !mediaMap.has(rId)) continue;

      const flipH = xfrm.getAttribute('flipH') === '1';
      const flipV = xfrm.getAttribute('flipV') === '1';
      if (flipH || flipV) {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        await drawImg(ctx, mediaMap.get(rId)!, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        await drawImg(ctx, mediaMap.get(rId)!, x, y, w, h);
      }
      continue;
    }

    // ── Shape (may contain text) ───────────────────────────────────────────────
    if (el.tagName !== 'sp') continue;

    const spPr   = kid(el, 'spPr');
    const txBody = kid(el, 'txBody');

    const xfrm = spPr ? kid(spPr, 'xfrm') : null;
    if (!xfrm) continue;
    const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext');
    if (!off || !ext) continue;
    const x = emu(off.getAttribute('x'), sx);
    const y = emu(off.getAttribute('y'), sy);
    const w = emu(ext.getAttribute('cx'), sx);
    const h = emu(ext.getAttribute('cy'), sy);
    if (w <= 0 || h <= 0) continue;

    // Shape solid fill (behind text)
    if (spPr) {
      const sc = spPr.querySelector(':scope > solidFill srgbClr') ??
                 spPr.querySelector('solidFill srgbClr');
      if (sc) {
        ctx.globalAlpha = 0.88;
        ctx.fillStyle   = '#' + (sc.getAttribute('val') ?? 'F0F4FF');
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
      }
      // Shape blipFill (image-filled rectangle)
      const shapeBlip = spPr.querySelector('blipFill blip');
      if (shapeBlip) {
        const rId = shapeBlip.getAttribute('embed');
        if (rId && mediaMap.has(rId)) await drawImg(ctx, mediaMap.get(rId)!, x, y, w, h);
      }
    }

    if (!txBody) continue;

    // Body properties
    const bodyPr = kid(txBody, 'bodyPr');
    const anchor = bodyPr?.getAttribute('anchor') ?? 'ctr';
    const lIns   = emu(bodyPr?.getAttribute('lIns') ?? '91440', sx);
    const rIns   = emu(bodyPr?.getAttribute('rIns') ?? '91440', sx);
    const tIns   = emu(bodyPr?.getAttribute('tIns') ?? '45720', sy);
    const bIns   = emu(bodyPr?.getAttribute('bIns') ?? '45720', sy);
    const textX  = x + lIns;
    const textW  = Math.max(1, w - lIns - rIns);
    const textH  = Math.max(1, h - tIns - bIns);

    // Parse paragraphs → lines
    interface LineInfo {
      text: string;
      pxSz: number;
      bold: boolean;
      italic: boolean;
      color: string | null;
      align: string;
      lineH: number;
    }
    const lines: LineInfo[] = [];

    for (const para of txBody.querySelectorAll('p')) {
      const pPr   = kid(para, 'pPr');
      const algn  = pPr?.getAttribute('algn') ?? 'l';
      const runs  = [...para.querySelectorAll('r')];
      if (runs.length === 0) {
        lines.push({ text: '', pxSz: 14, bold: false, italic: false, color: null, align: algn, lineH: 16 });
        continue;
      }

      let text   = '';
      let pxSz   = 14;
      let bold   = false;
      let italic = false;
      let color: string | null = null;

      for (const run of runs) {
        const rPr = kid(run, 'rPr');
        text += kid(run, 't')?.textContent ?? '';

        const sz = rPr?.getAttribute('sz');
        if (sz) {
          const pt = parseInt(sz, 10) / 100;
          pxSz = Math.max(8, Math.min(Math.round(pt * 1.333), 96));
        }
        if (rPr?.getAttribute('b') === '1') bold   = true;
        if (rPr?.getAttribute('i') === '1') italic = true;

        const clrEl = rPr?.querySelector('solidFill srgbClr');
        if (clrEl) {
          color = '#' + clrEl.getAttribute('val');
        } else if (!color) {
          const scheme = rPr?.querySelector('solidFill schemeClr')?.getAttribute('val') ?? '';
          if (scheme === 'lt1' || scheme === 'bg1') color = '#FFFFFF';
          else if (scheme === 'dk1' || scheme === 'tx1') color = '#111827';
          else if (scheme.startsWith('accent'))          color = '#4F46E5';
        }
      }

      lines.push({ text, pxSz, bold, italic, color, align: algn, lineH: pxSz * 1.3 });
    }

    if (lines.every(l => !l.text.trim())) continue;

    // Vertical anchor
    const estH = lines.reduce((s, l) => s + (l.text ? l.lineH : l.lineH * 0.35), 0);
    let curY =
      anchor === 't' ? y + tIns
      : anchor === 'b' ? y + h - bIns - estH
      : y + tIns + Math.max(0, (textH - estH) / 2);

    // Clip & render
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    for (const line of lines) {
      if (!line.text.trim()) { curY += line.lineH * 0.35; continue; }
      if (curY > y + h) break;

      ctx.font = `${line.italic ? 'italic ' : ''}${line.bold ? 'bold ' : ''}${line.pxSz}px Arial, sans-serif`;
      ctx.textBaseline = 'top';

      const fillColor = line.color ?? '#1E293B';
      ctx.fillStyle   = fillColor;

      // Subtle shadow for readability on any background
      const isWhite = fillColor.replace('#', '').toLowerCase() === 'ffffff';
      ctx.shadowColor   = isWhite ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.3)';
      ctx.shadowBlur    = 2;
      ctx.shadowOffsetX = 0.4;
      ctx.shadowOffsetY = 0.4;

      // Alignment
      let drawX: number;
      if (line.align === 'ctr' || line.align === 'center') {
        ctx.textAlign = 'center';
        drawX = x + w / 2;
      } else if (line.align === 'r' || line.align === 'right') {
        ctx.textAlign = 'right';
        drawX = x + w - rIns;
      } else {
        ctx.textAlign = 'left';
        drawX = textX;
      }

      // Word wrap
      const words   = line.text.split(' ');
      let current   = '';
      const chunks: string[] = [];
      for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width > textW + 4 && current) {
          chunks.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) chunks.push(current);

      for (const chunk of chunks) {
        if (curY + line.lineH > y + h + 2) break;
        ctx.fillText(chunk, drawX, curY);
        curY += line.lineH;
      }
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.restore();
  }

  return canvasToDataUrl(canvas, 0.92);
}

/** Main PPTX entry — processes all slides */
async function extractPptxThumbnails(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(file);

  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const num = (s: string) => parseInt(s.match(/slide(\d+)/)?.[1] ?? '0');
      return num(a) - num(b);
    });

  if (slideFiles.length === 0) {
    const thumb = zip.file('docProps/thumbnail.jpeg') ?? zip.file('docProps/thumbnail.png');
    if (thumb) return [await blobToDataUrl(await thumb.async('blob'))];
    return [makePlaceholderDataUrl(file.name)];
  }

  const pctx       = await buildPptxCtx(zip);
  const thumbnails: string[] = [];

  for (const sf of slideFiles) {
    const num = sf.match(/slide(\d+)\.xml$/)?.[1] ?? '1';
    try {
      thumbnails.push(await renderPptxSlide(pctx, sf, num));
    } catch (err) {
      console.warn(`Slide ${num} render error:`, err);
      thumbnails.push(makePlaceholderDataUrl(`שקופית ${num}`));
    }
  }

  return thumbnails;
}

// ── DOCX thumbnails ─────────────────────────────────────────────────────────────

async function extractDocxThumbnails(file: File): Promise<string[]> {
  const zip        = await JSZip.loadAsync(file);
  const mediaFiles = Object.keys(zip.files).filter(
    n => n.startsWith('word/media/') && /\.(png|jpg|jpeg|gif)$/i.test(n),
  );
  if (mediaFiles.length > 0) {
    const results: string[] = [];
    for (const mf of mediaFiles.slice(0, 10)) {
      try {
        const blob = await zip.file(mf)!.async('blob');
        results.push(await blobToDataUrl(blob));
      } catch { /* ignore */ }
    }
    if (results.length > 0) return results;
  }
  return [makePlaceholderDataUrl(file.name)];
}

// ── Placeholder ─────────────────────────────────────────────────────────────────

function makePlaceholderDataUrl(label: string): string {
  const canvas  = document.createElement('canvas');
  canvas.width  = 480;
  canvas.height = 270;
  const ctx     = canvas.getContext('2d')!;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, 480, 270);
  ctx.fillStyle = '#94a3b8';
  ctx.font      = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.slice(0, 40), 240, 135);
  return canvas.toDataURL('image/png');
}

// ── detectContentType ────────────────────────────────────────────────────────────

export function detectContentType(filename: string): ContentType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf')                                                return 'pdf';
  if (['ppt', 'pptx'].includes(ext))                               return 'pptx';
  if (['doc', 'docx'].includes(ext))                               return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  return 'pdf';
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useContentProcessor() {
  const processFile = useCallback(async (file: File, type: ContentType): Promise<string[]> => {
    try {
      if (type === 'pdf') {
        const pdf    = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const thumbs: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) thumbs.push(await renderPdfPage(pdf, i));
        return thumbs;
      }
      if (type === 'pptx')  return await extractPptxThumbnails(file);
      if (type === 'docx')  return await extractDocxThumbnails(file);
      if (type === 'image') return [await blobToDataUrl(file)];
      return [makePlaceholderDataUrl(file.name)];
    } catch (err) {
      console.error('processFile error:', err);
      return [makePlaceholderDataUrl(file.name)];
    }
  }, []);

  /**
   * מעבד URL סרטון — תומך YouTube (watch / shorts / youtu.be) ו-Vimeo.
   * מחזיר { embedUrl, thumbnailUrl, title }
   */
  const processVideoUrl = useCallback(async (
    url: string,
  ): Promise<{ embedUrl: string; thumbnailUrl: string; title: string }> => {
    try {
      // YouTube
      const ytMatch = url.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/,
      );
      if (ytMatch) {
        const videoId      = ytMatch[1];
        const embedUrl     = `https://www.youtube.com/embed/${videoId}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        try {
          const oRes  = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          );
          const oData = await oRes.json();
          return { embedUrl, thumbnailUrl, title: oData.title ?? 'סרטון YouTube' };
        } catch {
          return { embedUrl, thumbnailUrl, title: 'סרטון YouTube' };
        }
      }

      // Vimeo
      const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      if (vimeoMatch) {
        const videoId  = vimeoMatch[1];
        const embedUrl = `https://player.vimeo.com/video/${videoId}`;
        try {
          const oRes  = await fetch(
            `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`,
          );
          const oData = await oRes.json();
          return {
            embedUrl,
            thumbnailUrl: oData.thumbnail_url ?? '',
            title:        oData.title         ?? 'סרטון Vimeo',
          };
        } catch {
          return { embedUrl, thumbnailUrl: '', title: 'סרטון Vimeo' };
        }
      }

      return { embedUrl: url, thumbnailUrl: '', title: 'סרטון' };
    } catch {
      return { embedUrl: url, thumbnailUrl: '', title: 'סרטון' };
    }
  }, []);

  return { processFile, processVideoUrl };
}
