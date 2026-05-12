import { useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import type { ContentType } from '../../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type XmlDoc = Document;
type SlideAsset =
  | { kind: 'image'; x: number; y: number; w: number; h: number; href: string }
  | { kind: 'text'; x: number; y: number; w: number; h: number; paragraphs: TextParagraph[] };

interface TextParagraph {
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'start' | 'middle' | 'end';
  direction: 'rtl' | 'ltr';
}

interface Affine {
  ax: number;
  bx: number;
  ay: number;
  by: number;
}

interface Size {
  cx: number;
  cy: number;
}

const ROOT_AFFINE: Affine = { ax: 1, bx: 0, ay: 1, by: 0 };
const DEFAULT_SLIDE_SIZE: Size = { cx: 9144000, cy: 6858000 };
const OOXML_IMAGE_RE = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function renderPdfPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale = 1.5,
): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL('image/jpeg', 0.9);
}

function makePlaceholderDataUrl(icon: string, label: string): string {
  const width = 480;
  const height = 270;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#eef2ff');
  gradient.addColorStop(1, '#e0e7ff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.font = '64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, width / 2, height / 2 - 20);

  ctx.fillStyle = '#4f46e5';
  ctx.font = 'bold 16px Arial, sans-serif';
  const safeLabel = label.length > 40 ? `${label.slice(0, 37)}...` : label;
  ctx.fillText(safeLabel, width / 2, height / 2 + 40);

  return canvas.toDataURL('image/jpeg', 0.88);
}

function parseXml(xml: string): XmlDoc {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function childElements(node: ParentNode | null): Element[] {
  if (!node) return [];
  return Array.from(node.children);
}

function childrenByName(node: ParentNode | null, localName: string): Element[] {
  return childElements(node).filter(child => child.localName === localName);
}

function firstChildByName(node: ParentNode | null, localName: string): Element | null {
  return childrenByName(node, localName)[0] ?? null;
}

function descendantsByName(node: Document | Element | null, localName: string): Element[] {
  if (!node) return [];
  return Array.from(node.getElementsByTagName('*'))
    .filter((el): el is Element => el instanceof Element && el.localName === localName);
}

function firstDescendantByName(node: Document | Element | null, localName: string): Element | null {
  return descendantsByName(node, localName)[0] ?? null;
}

function getAttr(node: Element | null, ...names: string[]): string | undefined {
  if (!node) return undefined;
  for (const attr of Array.from(node.attributes)) {
    if (names.includes(attr.name) || names.includes(attr.localName)) return attr.value;
  }
  return undefined;
}

function parseIntAttr(node: Element | null, ...names: string[]): number {
  const raw = getAttr(node, ...names);
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvePath(fromPath: string, target: string): string {
  const normalizedBase = fromPath.replace(/\\/g, '/');
  const normalizedTarget = target.replace(/\\/g, '/');
  if (/^[a-z]+:\/\//i.test(normalizedTarget)) return normalizedTarget;

  const baseParts = normalizedBase.split('/');
  baseParts.pop();

  for (const part of normalizedTarget.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }

  return baseParts.join('/');
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  return file ? file.async('string') : null;
}

async function readZipXml(zip: JSZip, path: string): Promise<XmlDoc | null> {
  const xml = await readZipText(zip, path);
  return xml ? parseXml(xml) : null;
}

async function readRelationships(zip: JSZip, sourcePath: string): Promise<Record<string, string>> {
  const relsPath = resolvePath(sourcePath, `./_rels/${sourcePath.split('/').pop()}.rels`);
  const relsDoc = await readZipXml(zip, relsPath);
  if (!relsDoc) return {};

  const result: Record<string, string> = {};
  for (const rel of descendantsByName(relsDoc, 'Relationship')) {
    const id = getAttr(rel, 'Id');
    const target = getAttr(rel, 'Target');
    if (!id || !target) continue;
    result[id] = resolvePath(relsPath, target);
  }

  return result;
}

async function loadThemeColorMap(zip: JSZip): Promise<Record<string, string>> {
  const rels = await readRelationships(zip, 'ppt/presentation.xml');
  const themePath = Object.values(rels).find(path => /\/theme\d+\.xml$/i.test(path)) ?? 'ppt/theme/theme1.xml';
  const themeDoc = await readZipXml(zip, themePath);

  const map: Record<string, string> = {
    tx1: '#111827',
    tx2: '#4b5563',
    bg1: '#ffffff',
    bg2: '#f3f4f6',
  };

  const clrScheme = firstDescendantByName(themeDoc, 'clrScheme');
  for (const entry of childElements(clrScheme)) {
    const key = entry.localName;
    const srgb = firstDescendantByName(entry, 'srgbClr');
    const sys = firstDescendantByName(entry, 'sysClr');
    const value = getAttr(srgb, 'val') ?? getAttr(sys, 'lastClr');
    if (value) map[key] = `#${value}`;
  }

  return map;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isRtlText(value: string): boolean {
  return /[\u0590-\u05FF\u0600-\u06FF]/.test(value);
}

function emuToPx(value: number): number {
  return value / 9525;
}

function mapCoord(affine: Affine, x: number, y: number, w: number, h: number) {
  return {
    x: affine.ax * x + affine.bx,
    y: affine.ay * y + affine.by,
    w: affine.ax * w,
    h: affine.ay * h,
  };
}

function parseColor(source: Element | null, themeColors: Record<string, string>, fallback = '#111827'): string {
  const solidFill = source?.localName === 'solidFill' ? source : firstDescendantByName(source, 'solidFill');
  const srgb = firstDescendantByName(solidFill, 'srgbClr');
  if (srgb) {
    const hex = getAttr(srgb, 'val');
    if (hex) return `#${hex}`;
  }

  const scheme = firstDescendantByName(solidFill, 'schemeClr');
  if (scheme) {
    const key = getAttr(scheme, 'val');
    if (key && themeColors[key]) return themeColors[key];
  }

  return fallback;
}

function parseTextParagraphs(shape: Element, themeColors: Record<string, string>): TextParagraph[] {
  const txBody = firstChildByName(shape, 'txBody');
  if (!txBody) return [];

  const paragraphs = childrenByName(txBody, 'p');
  return paragraphs
    .map(paragraph => {
      const pPr = firstChildByName(paragraph, 'pPr');
      const defRPr = firstChildByName(pPr, 'defRPr') ?? firstChildByName(paragraph, 'endParaRPr');
      const pieces: string[] = [];
      let runStyle: Element | null = null;

      for (const child of childElements(paragraph)) {
        if (child.localName === 'r' || child.localName === 'fld') {
          const text = descendantsByName(child, 't').map(node => node.textContent ?? '').join('');
          if (text) {
            pieces.push(text);
            runStyle ??= firstChildByName(child, 'rPr');
          }
        } else if (child.localName === 'br') {
          pieces.push('\n');
        }
      }

      const text = pieces.join('').trim();
      if (!text) return null;

      const rPr = runStyle ?? defRPr;
      const sz = parseIntAttr(rPr, 'sz') || parseIntAttr(defRPr, 'sz') || 1800;
      const fontSize = Math.max(12, (sz / 100) * (96 / 72));
      const color = parseColor(rPr, themeColors, parseColor(defRPr, themeColors, '#111827'));
      const alignRaw = getAttr(pPr, 'algn') ?? 'l';
      const align: TextParagraph['align'] =
        alignRaw === 'ctr' ? 'middle' :
          alignRaw === 'r' ? 'end' :
            'start';

      return {
        text,
        fontSize,
        color,
        bold: getAttr(rPr, 'b') === '1' || getAttr(defRPr, 'b') === '1',
        italic: getAttr(rPr, 'i') === '1' || getAttr(defRPr, 'i') === '1',
        align,
        direction: isRtlText(text) ? 'rtl' : 'ltr',
      };
    })
    .filter((paragraph): paragraph is TextParagraph => paragraph !== null);
}

function parseShapeTransform(node: Element): { x: number; y: number; w: number; h: number } | null {
  const spPr = firstChildByName(node, 'spPr') ?? firstChildByName(node, 'grpSpPr');
  const xfrm = firstChildByName(spPr, 'xfrm');
  if (!xfrm) return null;

  const off = firstChildByName(xfrm, 'off');
  const ext = firstChildByName(xfrm, 'ext');
  return {
    x: parseIntAttr(off, 'x'),
    y: parseIntAttr(off, 'y'),
    w: parseIntAttr(ext, 'cx'),
    h: parseIntAttr(ext, 'cy'),
  };
}

function parseGroupAffine(node: Element, parent: Affine): Affine {
  const grpSpPr = firstChildByName(node, 'grpSpPr');
  const xfrm = firstChildByName(grpSpPr, 'xfrm');
  if (!xfrm) return parent;

  const off = firstChildByName(xfrm, 'off');
  const ext = firstChildByName(xfrm, 'ext');
  const chOff = firstChildByName(xfrm, 'chOff');
  const chExt = firstChildByName(xfrm, 'chExt');

  const offX = parseIntAttr(off, 'x');
  const offY = parseIntAttr(off, 'y');
  const extX = parseIntAttr(ext, 'cx') || 1;
  const extY = parseIntAttr(ext, 'cy') || 1;
  const childOffX = parseIntAttr(chOff, 'x');
  const childOffY = parseIntAttr(chOff, 'y');
  const childExtX = parseIntAttr(chExt, 'cx') || extX;
  const childExtY = parseIntAttr(chExt, 'cy') || extY;

  const scaleX = extX / childExtX;
  const scaleY = extY / childExtY;

  return {
    ax: parent.ax * scaleX,
    bx: parent.ax * (offX - childOffX * scaleX) + parent.bx,
    ay: parent.ay * scaleY,
    by: parent.ay * (offY - childOffY * scaleY) + parent.by,
  };
}

function parseSlideBackground(slideDoc: XmlDoc | null, themeColors: Record<string, string>): string {
  const bgPr = firstDescendantByName(slideDoc, 'bgPr');
  return parseColor(bgPr, themeColors, '#ffffff');
}

async function collectSlideAssets(
  zip: JSZip,
  slideDoc: XmlDoc,
  rels: Record<string, string>,
  themeColors: Record<string, string>,
  imageCache: Map<string, string>,
): Promise<SlideAsset[]> {
  const assets: SlideAsset[] = [];

  async function walk(node: Element, affine: Affine): Promise<void> {
    if (node.localName === 'sp') {
      const transform = parseShapeTransform(node);
      const paragraphs = parseTextParagraphs(node, themeColors);
      if (transform && paragraphs.length > 0) {
        const box = mapCoord(affine, transform.x, transform.y, transform.w, transform.h);
        assets.push({
          kind: 'text',
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          paragraphs,
        });
      }
      return;
    }

    if (node.localName === 'pic') {
      const transform = parseShapeTransform(node);
      const blip = firstDescendantByName(node, 'blip');
      const relId = getAttr(blip, 'r:embed', 'embed');
      const target = relId ? rels[relId] : undefined;
      if (!transform || !target) return;

      let href = imageCache.get(target);
      if (!href) {
        const imageFile = zip.file(target);
        if (!imageFile) return;
        href = await blobToDataUrl(await imageFile.async('blob'));
        imageCache.set(target, href);
      }

      const box = mapCoord(affine, transform.x, transform.y, transform.w, transform.h);
      assets.push({
        kind: 'image',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        href,
      });
      return;
    }

    if (node.localName === 'grpSp') {
      const nextAffine = parseGroupAffine(node, affine);
      for (const child of childElements(node)) {
        if (child.localName === 'grpSpPr' || child.localName === 'nvGrpSpPr') continue;
        await walk(child, nextAffine);
      }
    }
  }

  const spTree = firstDescendantByName(slideDoc, 'spTree');
  if (!spTree) return assets;

  for (const child of childElements(spTree)) {
    if (child.localName === 'nvGrpSpPr' || child.localName === 'grpSpPr') continue;
    await walk(child, ROOT_AFFINE);
  }

  if (assets.length === 0) {
    const fallback = Object.keys(zip.files)
      .filter(name => name.startsWith('ppt/media/') && OOXML_IMAGE_RE.test(name))
      .sort()[0];

    if (fallback) {
      const href = await blobToDataUrl(await zip.file(fallback)!.async('blob'));
      assets.push({
        kind: 'image',
        x: 0,
        y: 0,
        w: DEFAULT_SLIDE_SIZE.cx,
        h: DEFAULT_SLIDE_SIZE.cy,
        href,
      });
    }
  }

  return assets;
}

function buildSlideSvg(size: Size, background: string, assets: SlideAsset[]): string {
  const width = emuToPx(size.cx);
  const height = emuToPx(size.cy);

  const body = assets.map(asset => {
    if (asset.kind === 'image') {
      return `<image href="${asset.href}" x="${emuToPx(asset.x)}" y="${emuToPx(asset.y)}" width="${emuToPx(asset.w)}" height="${emuToPx(asset.h)}" preserveAspectRatio="none" />`;
    }

    const lines: string[] = [];
    let currentY = emuToPx(asset.y) + asset.paragraphs[0].fontSize * 1.2;
    for (const paragraph of asset.paragraphs) {
      const textX =
        paragraph.align === 'middle'
          ? emuToPx(asset.x + asset.w / 2)
          : paragraph.align === 'end'
            ? emuToPx(asset.x + asset.w)
            : emuToPx(asset.x);

      const weight = paragraph.bold ? '700' : '400';
      const style = paragraph.italic ? 'italic' : 'normal';
      const anchor = paragraph.align;
      const direction = paragraph.direction;

      for (const rawLine of paragraph.text.split('\n')) {
        lines.push(
          `<text x="${textX}" y="${currentY}" font-size="${paragraph.fontSize}" font-family="Arial, 'Noto Sans Hebrew', sans-serif" font-weight="${weight}" font-style="${style}" fill="${paragraph.color}" text-anchor="${anchor}" direction="${direction}" unicode-bidi="plaintext">${escapeXml(rawLine)}</text>`,
        );
        currentY += paragraph.fontSize * 1.35;
      }

      currentY += paragraph.fontSize * 0.2;
    }

    return lines.join('');
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${background}" />`,
    body,
    '</svg>',
  ].join('');
}

function rasterizeSvg(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not create canvas context'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Failed to rasterize SVG'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function renderPowerPointSlides(file: File): Promise<{ thumbnails: string[]; slideCount: number }> {
  const zip = await JSZip.loadAsync(file);
  const presentationDoc = await readZipXml(zip, 'ppt/presentation.xml');
  if (!presentationDoc) throw new Error('Missing ppt/presentation.xml');

  const presentationRels = await readRelationships(zip, 'ppt/presentation.xml');
  const themeColors = await loadThemeColorMap(zip);
  const imageCache = new Map<string, string>();

  const sldSz = firstDescendantByName(presentationDoc, 'sldSz');
  const size: Size = {
    cx: parseIntAttr(sldSz, 'cx') || DEFAULT_SLIDE_SIZE.cx,
    cy: parseIntAttr(sldSz, 'cy') || DEFAULT_SLIDE_SIZE.cy,
  };

  const slidePaths = descendantsByName(presentationDoc, 'sldId')
    .map(slide => getAttr(slide, 'r:id', 'id'))
    .filter((id): id is string => !!id)
    .map(id => presentationRels[id])
    .filter((path): path is string => !!path);

  const thumbnails: string[] = [];
  for (const slidePath of slidePaths) {
    try {
      const slideDoc = await readZipXml(zip, slidePath);
      if (!slideDoc) continue;

      const slideRels = await readRelationships(zip, slidePath);
      const background = parseSlideBackground(slideDoc, themeColors);
      const assets = await collectSlideAssets(zip, slideDoc, slideRels, themeColors, imageCache);
      const svg = buildSlideSvg(size, background, assets);
      const width = 1600;
      const height = Math.round((width * size.cy) / size.cx);
      thumbnails.push(await rasterizeSvg(svg, width, height));
    } catch (error) {
      console.warn(`Failed to render slide ${slidePath}:`, error);
    }
  }

  if (thumbnails.length === 0) {
    throw new Error('No PowerPoint slides were rendered successfully');
    return {
      thumbnails: [makePlaceholderDataUrl('PPT', 'לחץ לצפייה מלאה')],
      slideCount: 0,
    };
  }

  return { thumbnails, slideCount: slidePaths.length || thumbnails.length };
}

async function extractOpenXmlCover(
  file: File,
  kind: 'pptx' | 'docx',
): Promise<{ thumbnails: string[]; slideCount: number }> {
  const icon = kind === 'pptx' ? 'PPT' : 'DOC';
  const fallback = (label: string) => ({
    thumbnails: [makePlaceholderDataUrl(icon, label)],
    slideCount: 0,
  });

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return fallback(`${file.name.replace(/\.[^.]+$/, '')} - לחץ לצפייה`);
  }

  let slideCount = 0;
  if (kind === 'pptx') {
    slideCount = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .length;
  } else {
    const appXml = await readZipText(zip, 'docProps/app.xml');
    const match = appXml?.match(/<Pages>(\d+)<\/Pages>/);
    if (match) slideCount = Number.parseInt(match[1], 10);
  }

  const coverFile =
    zip.file('docProps/thumbnail.jpeg') ??
    zip.file('docProps/thumbnail.jpg') ??
    zip.file('docProps/thumbnail.png');

  if (coverFile) {
    try {
      return {
        thumbnails: [await blobToDataUrl(await coverFile.async('blob'))],
        slideCount,
      };
    } catch {
      // Keep falling back.
    }
  }

  const mediaPrefix = kind === 'pptx' ? 'ppt/media/' : 'word/media/';
  const firstMedia = Object.keys(zip.files)
    .filter(name => name.startsWith(mediaPrefix) && OOXML_IMAGE_RE.test(name))
    .sort()[0];

  if (firstMedia) {
    try {
      return {
        thumbnails: [await blobToDataUrl(await zip.file(firstMedia)!.async('blob'))],
        slideCount,
      };
    } catch {
      // Keep falling back.
    }
  }

  return {
    thumbnails: [makePlaceholderDataUrl(icon, 'לחץ לצפייה מלאה')],
    slideCount,
  };
}

export function detectContentType(filename: string): ContentType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['ppt', 'pptx', 'pptm', 'ppsx', 'pps', 'ppsm', 'potx', 'potm'].includes(ext)) return 'pptx';
  if (['doc', 'docx', 'docm', 'dotx', 'dotm', 'rtf', 'xls', 'xlsx', 'xlsm', 'xlsb', 'csv'].includes(ext)) {
    return 'docx';
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext)) return 'image';
  return 'pdf';
}

export interface ProcessResult {
  thumbnails: string[];
  slideCount?: number;
}

export function useContentProcessor() {
  const processFile = useCallback(async (file: File, type: ContentType): Promise<ProcessResult> => {
    try {
      if (type === 'pdf') {
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const thumbnails: string[] = [];
        for (let i = 1; i <= pdf.numPages; i += 1) {
          thumbnails.push(await renderPdfPage(pdf, i));
        }
        return { thumbnails, slideCount: pdf.numPages };
      }

      if (type === 'pptx') {
        return await extractOpenXmlCover(file, 'pptx');
      }

      if (type === 'docx') return await extractOpenXmlCover(file, 'docx');
      if (type === 'image') return { thumbnails: [await blobToDataUrl(file)] };
      return { thumbnails: [makePlaceholderDataUrl('FILE', file.name)] };
    } catch (error) {
      console.error('processFile error:', error);
      return { thumbnails: [makePlaceholderDataUrl('ERR', 'שגיאה בעיבוד')] };
    }
  }, []);

  const processVideoUrl = useCallback(async (
    url: string,
  ): Promise<{ embedUrl: string; thumbnailUrl: string; title: string }> => {
    try {
      const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
      if (youtubeMatch) {
        const videoId = youtubeMatch[1];
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        try {
          const data = await (await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          )).json();
          return { embedUrl, thumbnailUrl, title: data.title ?? 'סרטון YouTube' };
        } catch {
          return { embedUrl, thumbnailUrl, title: 'סרטון YouTube' };
        }
      }

      const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      if (vimeoMatch) {
        const videoId = vimeoMatch[1];
        const embedUrl = `https://player.vimeo.com/video/${videoId}`;
        try {
          const data = await (await fetch(
            `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`,
          )).json();
          return { embedUrl, thumbnailUrl: data.thumbnail_url ?? '', title: data.title ?? 'סרטון Vimeo' };
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
