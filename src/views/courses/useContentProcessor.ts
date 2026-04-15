/**
 * useContentProcessor — מעבד קבצים שהועלו ומייצר תמונות ממוזערות.
 * תומך ב: PDF (pdfjs-dist), PPTX/DOCX (JSZip), תמונות, Vimeo, YouTube.
 */
import { useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import type { ContentType } from '../../types';

// Worker של pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ── Helpers ────────────────────────────────────────────────────────────────────

function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL('image/jpeg', quality);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function renderPdfPage(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number, scale = 1.5): Promise<string> {
  const page     = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx      = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvasToDataUrl(canvas);
}

// ── PPTX helpers ───────────────────────────────────────────────────────────────

/** מציור רקע לשקופית placeholder */
function fillSlideBg(ctx: CanvasRenderingContext2D, bgColor: string | null, W: number, H: number) {
  const color = bgColor ?? '#6366f1';
  const r = parseInt(color.slice(1, 3), 16) || 99;
  const g = parseInt(color.slice(3, 5), 16) || 102;
  const b = parseInt(color.slice(5, 7), 16) || 241;
  const isNearWhite = r > 230 && g > 230 && b > 230;

  if (isNearWhite) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 6, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `rgb(${r},${g},${b})`);
    grad.addColorStop(1, `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

/** מרנדר thumbnail לשקופית אחת */
async function renderSlideThumbnail(
  slideNum: number,
  text: string,
  bgColor: string | null,
  imgDataUrl: string | null,
): Promise<string> {
  const W = 480, H = 270;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (imgDataUrl) {
    await new Promise<void>(resolve => {
      const img = new Image();
      img.onload  = () => { ctx.drawImage(img, 0, 0, W, H); resolve(); };
      img.onerror = () => { fillSlideBg(ctx, bgColor, W, H); resolve(); };
      img.src = imgDataUrl;
    });
  } else {
    fillSlideBg(ctx, bgColor, W, H);
  }

  // רצועה תחתונה לטקסט
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, H - 36, W, 36);

  // מספר שקופית
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(8, 8, 26, 18);
  ctx.fillStyle = imgDataUrl ? '#ffffff' : '#1e293b';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(slideNum), 21, 17);

  // טקסט ברצועה
  if (text) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const short = text.length > 55 ? text.slice(0, 55) + '…' : text;
    ctx.fillText(short, W / 2, H - 18);
  }

  return canvasToDataUrl(canvas, 0.85);
}

/** מחלץ thumbnails משקופיות PPTX — רנדר canvas מלבני 16:9 לכל שקופית */
async function extractPptxThumbnails(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(file);

  // מציאת קובצי שקופיות בסדר
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const n = (s: string) => parseInt(s.match(/slide(\d+)/)?.[1] ?? '0');
      return n(a) - n(b);
    });

  if (slideFiles.length === 0) {
    // נסה thumbnail כולל
    const thumbFile = zip.file('docProps/thumbnail.jpeg') ?? zip.file('docProps/thumbnail.jpg');
    if (thumbFile) {
      const blob = await thumbFile.async('blob');
      return [await blobToDataUrl(blob)];
    }
    return [makePlaceholderDataUrl(file.name)];
  }

  const thumbnails: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideNum = parseInt(slideFiles[i].match(/slide(\d+)/)?.[1] ?? String(i + 1));
    const xml      = await zip.file(slideFiles[i])!.async('string');

    // טקסט ראשון מהשקופית
    const textMatches = [...xml.matchAll(/<a:t>([^<]{2,})<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean);
    const slideText   = textMatches[0] ?? '';

    // צבע רקע
    const bgMatch = xml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    const bgColor = bgMatch ? `#${bgMatch[1]}` : null;

    // תמונה ראשונה מה-relationships
    let imgDataUrl: string | null = null;
    const relsFile = zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
    if (relsFile) {
      const rXml  = await relsFile.async('string');
      const imgM  = rXml.match(/Target="\.\.\/media\/([^"]*\.(png|jpg|jpeg|PNG|JPG|JPEG))"/);
      if (imgM) {
        const mf = zip.file(`ppt/media/${imgM[1]}`);
        if (mf) {
          try { imgDataUrl = await blobToDataUrl(await mf.async('blob')); } catch { /* ignore */ }
        }
      }
    }

    thumbnails.push(await renderSlideThumbnail(slideNum, slideText, bgColor, imgDataUrl));
  }

  return thumbnails;
}

/** מחלץ תמונות מ-DOCX */
async function extractDocxThumbnails(file: File): Promise<string[]> {
  const zip        = await JSZip.loadAsync(file);
  const mediaFiles = Object.keys(zip.files).filter(
    name => name.startsWith('word/media/') && /\.(png|jpg|jpeg|gif)$/i.test(name),
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

function makePlaceholderDataUrl(filename: string): string {
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
  ctx.fillText(filename.slice(0, 40), 240, 135);
  return canvas.toDataURL('image/png');
}

/** מזהה סוג קובץ לפי סיומת */
export function detectContentType(filename: string): ContentType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf')                                        return 'pdf';
  if (['ppt', 'pptx'].includes(ext))                       return 'pptx';
  if (['doc', 'docx'].includes(ext))                       return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  return 'pdf';
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useContentProcessor() {
  const processFile = useCallback(async (file: File, type: ContentType): Promise<string[]> => {
    try {
      if (type === 'pdf') {
        const pdf   = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const thumbs: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) thumbs.push(await renderPdfPage(pdf, i));
        return thumbs;
      }
      if (type === 'pptx') return await extractPptxThumbnails(file);
      if (type === 'docx') return await extractDocxThumbnails(file);
      if (type === 'image') return [await blobToDataUrl(file)];
      return [makePlaceholderDataUrl(file.name)];
    } catch (err) {
      console.error('processFile error:', err);
      return [makePlaceholderDataUrl(file.name)];
    }
  }, []);

  /**
   * מעבד URL של סרטון — תומך ב-Vimeo וב-YouTube.
   * מחזיר { embedUrl, thumbnailUrl, title }
   */
  const processVideoUrl = useCallback(async (
    url: string,
  ): Promise<{ embedUrl: string; thumbnailUrl: string; title: string }> => {
    try {
      // YouTube
      const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
      if (ytMatch) {
        const videoId      = ytMatch[1];
        const embedUrl     = `https://www.youtube.com/embed/${videoId}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        try {
          const oRes  = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
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
          const oRes  = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`);
          const oData = await oRes.json();
          return { embedUrl, thumbnailUrl: oData.thumbnail_url ?? '', title: oData.title ?? 'סרטון Vimeo' };
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
