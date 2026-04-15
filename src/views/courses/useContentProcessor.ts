/**
 * useContentProcessor — מעבד קבצים שהועלו ומייצר תמונות ממוזערות.
 * תומך ב: PDF (pdfjs-dist), PPTX/DOCX (JSZip + XML), תמונות, Vimeo.
 */
import { useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import type { ContentType } from '../../types';

// Worker של pdfjs — חייב להיות מוגדר לפני שימוש
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** הופך canvas לdata URL (JPEG) */
function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/** מרנדר עמוד PDF יחיד לdata URL */
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
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvasToDataUrl(canvas);
}

/** מחלץ תמונה ממוזערת מ-PPTX/DOCX (thumbnail מוטמע או slide ראשון כטקסט) */
async function extractPptxThumbnails(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(file);

  // 1. נסה docProps/thumbnail — PowerPoint מייצר thumbnail כבר בשמירה
  const thumbFile = zip.file('docProps/thumbnail.jpeg') ?? zip.file('docProps/thumbnail.jpg') ?? zip.file('docProps/thumbnail.png');
  if (thumbFile) {
    const blob    = await thumbFile.async('blob');
    const dataUrl = await blobToDataUrl(blob);
    return [dataUrl];
  }

  // 2. Fallback — מחלץ תמונות מ-ppt/media/ ומציג את הראשונה
  const mediaFiles = Object.keys(zip.files).filter(
    name => name.startsWith('ppt/media/') && /\.(png|jpg|jpeg|gif|svg)$/i.test(name),
  );
  if (mediaFiles.length > 0) {
    const results: string[] = [];
    for (const mf of mediaFiles.slice(0, 20)) {
      const blob    = await zip.file(mf)!.async('blob');
      const dataUrl = await blobToDataUrl(blob);
      results.push(dataUrl);
    }
    return results;
  }

  // 3. Fallback אחרון — placeholder עם שם הקובץ
  return [makePlaceholderDataUrl(file.name)];
}

/** מחלץ תמונות מ-DOCX (word/media/) */
async function extractDocxThumbnails(file: File): Promise<string[]> {
  const zip        = await JSZip.loadAsync(file);
  const mediaFiles = Object.keys(zip.files).filter(
    name => name.startsWith('word/media/') && /\.(png|jpg|jpeg|gif)$/i.test(name),
  );
  if (mediaFiles.length > 0) {
    const results: string[] = [];
    for (const mf of mediaFiles.slice(0, 10)) {
      const blob    = await zip.file(mf)!.async('blob');
      const dataUrl = await blobToDataUrl(blob);
      results.push(dataUrl);
    }
    return results;
  }
  return [makePlaceholderDataUrl(file.name)];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** מייצר תמונה placeholder עם שם הקובץ כטקסט */
function makePlaceholderDataUrl(filename: string): string {
  const canvas = document.createElement('canvas');
  canvas.width  = 400;
  canvas.height = 300;
  const ctx     = canvas.getContext('2d')!;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, 400, 300);
  ctx.fillStyle = '#64748b';
  ctx.font      = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(filename.slice(0, 40), 200, 150);
  return canvas.toDataURL('image/png');
}

/** מזהה סוג קובץ לפי סיומת */
export function detectContentType(filename: string): ContentType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext))                       return 'pdf';
  if (['ppt', 'pptx'].includes(ext))               return 'pptx';
  if (['doc', 'docx'].includes(ext))               return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  return 'pdf'; // default fallback
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useContentProcessor() {
  /**
   * מעבד קובץ שהועלה ומחזיר מערך של data URLs לתצוגה מקדימה.
   */
  const processFile = useCallback(async (file: File, type: ContentType): Promise<string[]> => {
    try {
      if (type === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const thumbs: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          thumbs.push(await renderPdfPage(pdf, i));
        }
        return thumbs;
      }

      if (type === 'pptx') {
        return await extractPptxThumbnails(file);
      }

      if (type === 'docx') {
        return await extractDocxThumbnails(file);
      }

      if (type === 'image') {
        const dataUrl = await blobToDataUrl(file);
        return [dataUrl];
      }

      return [makePlaceholderDataUrl(file.name)];
    } catch (err) {
      console.error('processFile error:', err);
      return [makePlaceholderDataUrl(file.name)];
    }
  }, []);

  /**
   * שולף thumbnail מ-Vimeo URL דרך oEmbed API.
   * מחזיר { embedUrl, thumbnailUrl }
   */
  const processVimeoUrl = useCallback(async (url: string): Promise<{ embedUrl: string; thumbnailUrl: string }> => {
    try {
      // נרמול ה-URL לפורמט embed
      const match   = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      const videoId = match?.[1];
      if (!videoId) throw new Error('לא נמצא ID של Vimeo');

      const embedUrl = `https://player.vimeo.com/video/${videoId}`;

      // oEmbed API של Vimeo
      const oembedRes = await fetch(
        `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`,
      );
      if (!oembedRes.ok) throw new Error('oEmbed failed');
      const data         = await oembedRes.json();
      const thumbnailUrl = data.thumbnail_url ?? '';
      return { embedUrl, thumbnailUrl };
    } catch {
      return {
        embedUrl:     url,
        thumbnailUrl: '',
      };
    }
  }, []);

  return { processFile, processVimeoUrl };
}
