/**
 * useContentProcessor — מעבד קבצים ומייצר thumbnails.
 *
 * PPTX: רנדרר canvas מלא —
 *   • ניתוח theme.xml לצבעים אמיתיים (schemeClr → hex)
 *   • lumMod / lumOff / shade / tint transformations
 *   • דגימת בהירות רקע לצבע טקסט אוטומטי כשאין צבע מפורש
 *   • גדלי גופן מהפלייסהולדר (title=48, body=24 וכו')
 *   • תמונות במיקום מדויק, היפוך, שקיפות
 *
 * PDF: pdfjs-dist  |  DOCX: JSZip  |  Video: YouTube + Vimeo oEmbed
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

function canvasToDataUrl(canvas: HTMLCanvasElement, q = 0.9): string {
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

// ── Color utilities ────────────────────────────────────────────────────────────

function hexToHSL(hex: string): [number, number, number] {
  const h6 = hex.replace('#', '').slice(-6).padStart(6, '0');
  const r  = parseInt(h6.slice(0, 2), 16) / 255;
  const g  = parseInt(h6.slice(2, 4), 16) / 255;
  const b  = parseInt(h6.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let   hh = 0, ss = 0;
  const ll = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    ss = ll > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: hh = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hh = ((b - r) / d + 2) / 6;                break;
      case b: hh = ((r - g) / d + 4) / 6;                break;
    }
  }
  return [hh, ss, ll];
}

function hslToHex(hh: number, ss: number, ll: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (ss === 0) {
    const v = Math.round(clamp(ll) * 255).toString(16).padStart(2, '0');
    return '#' + v + v + v;
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const h2r = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const toH = (x: number) => Math.round(clamp(h2r(x)) * 255).toString(16).padStart(2, '0');
  return '#' + toH(hh + 1 / 3) + toH(hh) + toH(hh - 1 / 3);
}

/** Apply lumMod / lumOff / shade / tint children of a color element */
function applyMods(hex: string, el: Element): string {
  const v = (tag: string) => el.querySelector(tag)?.getAttribute('val');
  const lm = v('lumMod'), lo = v('lumOff'), sh = v('shade'), ti = v('tint');
  if (!lm && !lo && !sh && !ti) return hex;
  let [h, s, l] = hexToHSL(hex);
  if (lm) l  = l * parseInt(lm) / 100000;
  if (lo) l  = l + parseInt(lo) / 100000;
  if (sh) l  = l * parseInt(sh) / 100000;
  if (ti) l  = l + (1 - l) * parseInt(ti) / 100000;
  return hslToHex(h, s, Math.max(0, Math.min(1, l)));
}

type ThemeColors = Record<string, string>;

/** Resolve solidFill element → '#RRGGBB' using parsed theme colors */
function resolveClr(solidEl: Element | null, tc: ThemeColors): string | null {
  if (!solidEl) return null;
  const srgb   = kid(solidEl, 'srgbClr');
  const scheme = kid(solidEl, 'schemeClr');
  if (srgb) {
    return applyMods('#' + (srgb.getAttribute('val') ?? '000000'), srgb);
  }
  if (scheme) {
    const name  = scheme.getAttribute('val') ?? '';
    const alias: Record<string, string> = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };
    const norm  = alias[name] ?? name;
    const base  = tc[norm] ?? (norm.startsWith('lt') ? '#FFFFFF' : '#1E293B');
    return applyMods(base, scheme);
  }
  return null;
}

// ── XML helpers ─────────────────────────────────────────────────────────────────

function stripNs(xml: string): string {
  return xml
    .replace(/\s+xmlns(?::[a-zA-Z0-9_]+)?="[^"]*"/g, '')
    .replace(/<(\/?)[a-zA-Z0-9_]+:([a-zA-Z0-9_.:-]+)/g, '<$1$2')
    .replace(/\s[a-zA-Z0-9_]+:([a-zA-Z0-9_.-]+)=/g, ' $1=');
}

function emu(val: string | null | undefined, scale: number): number {
  if (!val) return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n * scale;
}

function kid(el: Element, tag: string): Element | null {
  for (const c of el.children) if (c.tagName === tag) return c;
  return null;
}

function drawImg(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number, y: number, w: number, h: number,
): Promise<void> {
  return new Promise(resolve => {
    const img    = new Image();
    img.onload   = () => { ctx.drawImage(img, x, y, w, h); resolve(); };
    img.onerror  = () => resolve();
    img.src      = src;
  });
}

/** Sample average brightness (0–1) of a canvas region */
function sampleBrightness(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
): number {
  try {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const ix = Math.max(0, Math.floor(x));
    const iy = Math.max(0, Math.floor(y));
    const iw = Math.min(Math.floor(w), cw - ix);
    const ih = Math.min(Math.floor(h), ch - iy);
    if (iw <= 0 || ih <= 0) return 0.5;
    const d = ctx.getImageData(ix, iy, iw, ih).data;
    let   s = 0;
    for (let i = 0; i < d.length; i += 4)
      s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    return s / (d.length / 4) / 255;
  } catch { return 0.5; }
}

// ── PPTX context ────────────────────────────────────────────────────────────────

interface PptxCtx {
  zip:           JSZip;
  slideW:        number;          // EMU
  slideH:        number;          // EMU
  themeColors:   ThemeColors;     // schemeClr → '#RRGGBB'
  masterBgColor: string | null;
  masterBgImage: string | null;
}

async function loadThemeColors(zip: JSZip): Promise<ThemeColors> {
  const colors: ThemeColors = {};
  for (let i = 1; i <= 3; i++) {
    const f = zip.file(`ppt/theme/theme${i}.xml`);
    if (!f) continue;
    const doc = new DOMParser().parseFromString(
      stripNs(await f.async('string')), 'text/xml',
    );
    const cs = doc.querySelector('clrScheme');
    if (!cs) continue;
    for (const child of cs.children) {
      const name = child.tagName;
      const srgb = kid(child, 'srgbClr');
      const sys  = kid(child, 'sysClr');
      if      (srgb) colors[name] = '#' + srgb.getAttribute('val');
      else if (sys)  colors[name] = '#' + (sys.getAttribute('lastClr') ?? '000000');
    }
    break;
  }
  // Canonical aliases
  if (colors.dk1) colors.tx1 = colors.dk1;
  if (colors.lt1) colors.bg1 = colors.lt1;
  if (colors.dk2) colors.tx2 = colors.dk2;
  if (colors.lt2) colors.bg2 = colors.lt2;
  return colors;
}

async function buildPptxCtx(zip: JSZip): Promise<PptxCtx> {
  // Slide size
  let slideW = 9144000, slideH = 6858000;
  const pf = zip.file('ppt/presentation.xml');
  if (pf) {
    const doc = new DOMParser().parseFromString(
      stripNs(await pf.async('string')), 'text/xml',
    );
    const sz = doc.querySelector('sldSz');
    if (sz) {
      const cx = parseInt(sz.getAttribute('cx') ?? '0');
      const cy = parseInt(sz.getAttribute('cy') ?? '0');
      if (cx > 0 && cy > 0) { slideW = cx; slideH = cy; }
    }
  }

  // Theme colors
  const themeColors = await loadThemeColors(zip);

  // Master background
  let masterBgColor: string | null = null;
  let masterBgImage: string | null = null;

  const mf = zip.file('ppt/slideMasters/slideMaster1.xml');
  if (mf) {
    const doc  = new DOMParser().parseFromString(
      stripNs(await mf.async('string')), 'text/xml',
    );
    const bgPr = doc.querySelector('bg bgPr');
    if (bgPr) {
      const solid = kid(bgPr, 'solidFill');
      if (solid) masterBgColor = resolveClr(solid, themeColors);

      const blip = bgPr.querySelector('blipFill blip');
      if (blip) {
        const rId     = blip.getAttribute('embed');
        const relFile = zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels');
        if (rId && relFile) {
          const rDoc = new DOMParser().parseFromString(
            await relFile.async('string'), 'text/xml',
          );
          const rel  = [...rDoc.querySelectorAll('Relationship')].find(
            r => r.getAttribute('Id') === rId && (r.getAttribute('Type') ?? '').includes('/image'),
          );
          if (rel) {
            const t  = rel.getAttribute('Target') ?? '';
            const p  = t.startsWith('../') ? 'ppt/' + t.slice(3) : `ppt/slideMasters/${t}`;
            const img = zip.file(p);
            if (img) {
              try { masterBgImage = await blobToDataUrl(await img.async('blob')); } catch { /* ignore */ }
            }
          }
        }
      }
    }
  }

  return { zip, slideW, slideH, themeColors, masterBgColor, masterBgImage };
}

async function loadMediaMap(zip: JSZip, slideNum: string): Promise<Map<string, string>> {
  const map  = new Map<string, string>();
  const rf   = zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
  if (!rf) return map;
  const rDoc = new DOMParser().parseFromString(await rf.async('string'), 'text/xml');
  for (const rel of rDoc.querySelectorAll('Relationship')) {
    const id   = rel.getAttribute('Id')     ?? '';
    const tgt  = rel.getAttribute('Target') ?? '';
    const type = rel.getAttribute('Type')   ?? '';
    if (!type.includes('/image')) continue;
    const path = tgt.startsWith('../') ? 'ppt/' + tgt.slice(3)
      : tgt.startsWith('/') ? tgt.slice(1)
      : `ppt/slides/${tgt}`;
    const mf = zip.file(path);
    if (mf) try { map.set(id, await blobToDataUrl(await mf.async('blob'))); } catch { /* ignore */ }
  }
  return map;
}

function flattenSpTree(container: Element): Element[] {
  const out: Element[] = [];
  for (const c of container.children) {
    if      (c.tagName === 'grpSp') out.push(...flattenSpTree(c));
    else if (c.tagName === 'sp' || c.tagName === 'pic') out.push(c);
  }
  return out;
}

/** Render one slide → 960×540 JPEG data URL */
async function renderPptxSlide(
  pctx: PptxCtx,
  slideFile: string,
  slideNum: string,
): Promise<string> {
  const W  = 960, H = 540;
  const sx = W / pctx.slideW;
  const sy = H / pctx.slideH;
  const tc = pctx.themeColors;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 1. White base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 2. Master background
  if (pctx.masterBgImage) {
    await drawImg(ctx, pctx.masterBgImage, 0, 0, W, H);
  } else if (pctx.masterBgColor) {
    ctx.fillStyle = pctx.masterBgColor;
    ctx.fillRect(0, 0, W, H);
  }

  // 3. Media map for this slide
  const mediaMap = await loadMediaMap(pctx.zip, slideNum);

  // 4. Parse slide XML
  const raw = await pctx.zip.file(slideFile)!.async('string');
  const doc = new DOMParser().parseFromString(stripNs(raw), 'text/xml');

  // 5. Slide-specific background
  const bgPr = doc.querySelector('bg bgPr');
  if (bgPr) {
    const solid = kid(bgPr, 'solidFill');
    if (solid) {
      const c = resolveClr(solid, tc);
      if (c) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }
    }
    const gf = kid(bgPr, 'gradFill');
    if (gf) {
      const stops = [...gf.querySelectorAll('gs')];
      if (stops.length >= 2) {
        const grad = ctx.createLinearGradient(0, 0, W, H);
        for (const s of stops) {
          const pos  = parseInt(s.getAttribute('pos') ?? '0') / 100000;
          const sf   = kid(s, 'solidFill') ?? s;
          const clr  = resolveClr(sf, tc) ?? '#DDEEFF';
          try { grad.addColorStop(pos, clr); } catch { /* ignore */ }
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

  // 6. Render spTree
  const spTree = doc.querySelector('spTree');
  if (!spTree) return canvasToDataUrl(canvas);

  for (const el of flattenSpTree(spTree)) {

    // ── Picture ──────────────────────────────────────────────────────────────
    if (el.tagName === 'pic') {
      const blip = el.querySelector('blip');
      const xfrm = el.querySelector('spPr xfrm') ?? el.querySelector('xfrm');
      if (!xfrm) continue;
      const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext');
      if (!off || !ext) continue;
      const x = emu(off.getAttribute('x'), sx),  y = emu(off.getAttribute('y'), sy);
      const w = emu(ext.getAttribute('cx'), sx),  h = emu(ext.getAttribute('cy'), sy);
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

    // ── Shape ─────────────────────────────────────────────────────────────────
    if (el.tagName !== 'sp') continue;

    const spPr   = kid(el, 'spPr');
    const txBody = kid(el, 'txBody');
    const xfrm   = spPr ? kid(spPr, 'xfrm') : null;
    if (!xfrm) continue;
    const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext');
    if (!off || !ext) continue;
    const x = emu(off.getAttribute('x'), sx),  y = emu(off.getAttribute('y'), sy);
    const w = emu(ext.getAttribute('cx'), sx),  h = emu(ext.getAttribute('cy'), sy);
    if (w <= 0 || h <= 0) continue;

    // Placeholder type → font-size defaults
    const phType  = el.querySelector('nvSpPr nvPr ph')?.getAttribute('type');
    const defPxSz = phType === 'title' || phType === 'ctrTitle' ? 48
      : phType === 'subTitle' ? 32
      : phType === 'body'     ? 24
      : phType === 'dt' || phType === 'ftr' || phType === 'sldNum' ? 12
      : 20;
    const defBold = phType === 'title' || phType === 'ctrTitle';

    // Shape fill
    if (spPr) {
      const solid = kid(spPr, 'solidFill');
      if (solid) {
        const c = resolveClr(solid, tc);
        if (c) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle   = c;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 1;
        }
      }
      const shapeBlip = spPr.querySelector('blipFill blip');
      if (shapeBlip) {
        const rId = shapeBlip.getAttribute('embed');
        if (rId && mediaMap.has(rId)) await drawImg(ctx, mediaMap.get(rId)!, x, y, w, h);
      }
    }

    if (!txBody) continue;

    const bodyPr = kid(txBody, 'bodyPr');
    const anchor = bodyPr?.getAttribute('anchor') ?? 'ctr';
    const lIns   = emu(bodyPr?.getAttribute('lIns') ?? '91440', sx);
    const rIns   = emu(bodyPr?.getAttribute('rIns') ?? '91440', sx);
    const tIns   = emu(bodyPr?.getAttribute('tIns') ?? '45720', sy);
    const bIns   = emu(bodyPr?.getAttribute('bIns') ?? '45720', sy);
    const textX  = x + lIns;
    const textW  = Math.max(1, w - lIns - rIns);
    const textH  = Math.max(1, h - tIns - bIns);

    interface LineInfo {
      text: string; pxSz: number; bold: boolean; italic: boolean;
      color: string | null; align: string; lineH: number; fontName: string;
    }
    const lines: LineInfo[] = [];

    for (const para of txBody.querySelectorAll('p')) {
      const pPr    = kid(para, 'pPr');
      const defRPr = pPr ? kid(pPr, 'defRPr') : null;
      const algn   = pPr?.getAttribute('algn') ?? 'l';
      const runs   = [...para.querySelectorAll('r')];

      if (runs.length === 0) {
        lines.push({ text:'', pxSz:defPxSz, bold:defBold, italic:false, color:null, align:algn, lineH:defPxSz*1.3, fontName:'Arial' });
        continue;
      }

      // Paragraph-level defaults
      const pDefSzStr = defRPr?.getAttribute('sz');
      const pDefSz    = pDefSzStr ? Math.max(8, Math.min(Math.round(parseInt(pDefSzStr)/100 * 1.333), 96)) : defPxSz;
      const pDefBold  = defRPr?.getAttribute('b') === '1' || defBold;

      let   text    = '';
      let   pxSz    = pDefSz;
      let   bold    = pDefBold;
      let   italic  = false;
      let   color: string | null = null;
      let   fontName = 'Arial';

      for (const run of runs) {
        const rPr = kid(run, 'rPr');
        text += kid(run, 't')?.textContent ?? '';

        // Font size
        const sz = rPr?.getAttribute('sz');
        if (sz) pxSz = Math.max(8, Math.min(Math.round(parseInt(sz) / 100 * 1.333), 96));

        // Style
        if (rPr?.getAttribute('b')  === '1') bold   = true;
        if (rPr?.getAttribute('i')  === '1') italic = true;

        // Font face (for best-effort match)
        const latin = rPr ? kid(rPr, 'latin') : null;
        if (latin) fontName = latin.getAttribute('typeface') ?? 'Arial';

        // Color (explicit wins)
        if (!color) {
          const solid = rPr ? kid(rPr, 'solidFill') : null;
          if (solid) color = resolveClr(solid, tc);
        }
      }

      lines.push({ text, pxSz, bold, italic, color, align: algn, lineH: pxSz * 1.3, fontName });
    }

    if (lines.every(l => !l.text.trim())) continue;

    // Vertical anchor
    const estH = lines.reduce((s, l) => s + (l.text ? l.lineH : l.lineH * 0.35), 0);
    let curY =
      anchor === 't' ? y + tIns
      : anchor === 'b' ? y + h - bIns - estH
      : y + tIns + Math.max(0, (textH - estH) / 2);

    // Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    for (const line of lines) {
      if (!line.text.trim()) { curY += line.lineH * 0.35; continue; }
      if (curY > y + h)      break;

      // ── Color: explicit → theme → auto-contrast from background ─────────────
      let fillColor = line.color;
      if (!fillColor) {
        const brightness = sampleBrightness(ctx, x, y, Math.max(1, w), Math.min(Math.max(1, h), 40));
        fillColor = brightness > 0.55
          ? (tc.dk1 ?? '#1E293B')   // light background → dark text
          : (tc.lt1 ?? '#FFFFFF');  // dark background  → light text
      }

      // ── Font: named font → Almoni variants → Hebrew fallbacks ──────────────
      const safeFontName = (line.fontName || 'Arial').replace(/'/g, "\\'");
      ctx.font = `${line.italic ? 'italic ' : ''}${line.bold ? 'bold ' : ''}${line.pxSz}px '${safeFontName}', 'Almoni AAA', 'Almoni DL AAA', 'Almoni Neue AAA', 'Almoni CLM', 'Almoni Tzar CLM', 'Arial Hebrew', Heebo, Arial, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle    = fillColor;

      // Shadow for readability on any background
      const isLight = parseInt(fillColor.replace('#','').slice(0,2), 16) > 128;
      ctx.shadowColor   = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)';
      ctx.shadowBlur    = 2;
      ctx.shadowOffsetX = ctx.shadowOffsetY = 0.5;

      // Alignment
      let drawX: number;
      if      (line.align === 'ctr' || line.align === 'center') { ctx.textAlign = 'center'; drawX = x + w / 2; }
      else if (line.align === 'r'   || line.align === 'right')  { ctx.textAlign = 'right';  drawX = x + w - rIns; }
      else                                                        { ctx.textAlign = 'left';   drawX = textX; }

      // Word wrap
      const words: string[] = line.text.split(' ');
      const chunks: string[] = [];
      let   cur = '';
      for (const word of words) {
        const test = cur ? cur + ' ' + word : word;
        if (ctx.measureText(test).width > textW + 4 && cur) { chunks.push(cur); cur = word; }
        else cur = test;
      }
      if (cur) chunks.push(cur);

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

  return canvasToDataUrl(canvas, 0.93);
}

// ── Font preload ────────────────────────────────────────────────────────────────

let _fontsLoaded = false;
async function preloadAlmoniFonts(): Promise<void> {
  if (_fontsLoaded) return;
  try {
    const variants = [
      '400 16px "Almoni AAA"',
      '500 16px "Almoni AAA"',
      '700 16px "Almoni AAA"',
      '400 16px "Almoni DL AAA"',
      '700 16px "Almoni DL AAA"',
      '400 16px "Almoni Neue AAA"',
      '700 16px "Almoni Neue AAA"',
    ];
    await Promise.all(variants.map(v => document.fonts.load(v).catch(() => {})));
    _fontsLoaded = true;
  } catch { /* not a browser env or fonts not available */ }
}

/** Main PPTX entry — processes all slides in order */
async function extractPptxThumbnails(file: File): Promise<string[]> {
  await preloadAlmoniFonts();
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
  const zip   = await JSZip.loadAsync(file);
  const media = Object.keys(zip.files).filter(
    n => n.startsWith('word/media/') && /\.(png|jpg|jpeg|gif)$/i.test(n),
  );
  if (media.length > 0) {
    const results: string[] = [];
    for (const mf of media.slice(0, 10)) {
      try { results.push(await blobToDataUrl(await zip.file(mf)!.async('blob'))); } catch { /* ignore */ }
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
  ctx.fillStyle    = '#94a3b8';
  ctx.font         = 'bold 16px Arial, sans-serif';
  ctx.textAlign    = 'center';
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

  const processVideoUrl = useCallback(async (
    url: string,
  ): Promise<{ embedUrl: string; thumbnailUrl: string; title: string }> => {
    try {
      // YouTube
      const ytM = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
      if (ytM) {
        const videoId      = ytM[1];
        const embedUrl     = `https://www.youtube.com/embed/${videoId}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        try {
          const d = await (await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          )).json();
          return { embedUrl, thumbnailUrl, title: d.title ?? 'סרטון YouTube' };
        } catch { return { embedUrl, thumbnailUrl, title: 'סרטון YouTube' }; }
      }
      // Vimeo
      const vmM = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      if (vmM) {
        const videoId  = vmM[1];
        const embedUrl = `https://player.vimeo.com/video/${videoId}`;
        try {
          const d = await (await fetch(
            `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`,
          )).json();
          return { embedUrl, thumbnailUrl: d.thumbnail_url ?? '', title: d.title ?? 'סרטון Vimeo' };
        } catch { return { embedUrl, thumbnailUrl: '', title: 'סרטון Vimeo' }; }
      }
      return { embedUrl: url, thumbnailUrl: '', title: 'סרטון' };
    } catch { return { embedUrl: url, thumbnailUrl: '', title: 'סרטון' }; }
  }, []);

  return { processFile, processVideoUrl };
}
