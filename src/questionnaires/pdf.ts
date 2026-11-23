/**
 * צילום עמודי המסמך ל-PDF, בדפדפן (העברית יוצאת מושלמת, כי הדפדפן עצמו מצייר אותה).
 */
import { domToJpeg } from 'modern-screenshot';
import { jsPDF } from 'jspdf';
import { PAGE_W, PAGE_H } from './QuestionnaireDoc';

async function build(pages: HTMLElement[], scale: number, quality: number): Promise<string> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const opts = { scale, quality, backgroundColor: '#ffffff', width: PAGE_W, height: PAGE_H };
  await domToJpeg(pages[0], opts).catch(() => null); // "חימום" לפונטים בספארי
  for (let i = 0; i < pages.length; i++) {
    const img = await domToJpeg(pages[i], opts);
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }
  return pdf.output('datauristring').split(',')[1];
}

/** מחזיר PDF כ-base64 (בלי הקידומת), קטן מספיק לשליחה לשרת */
export async function pagesToPdfBase64(pages: HTMLElement[]): Promise<string> {
  let b64 = await build(pages, 1.6, 0.84);
  if (b64.length > 3_900_000) b64 = await build(pages, 1.2, 0.74);
  if (b64.length > 4_100_000) b64 = await build(pages, 0.9, 0.62);
  return b64;
}

export function downloadBase64Pdf(b64: string, fileName: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
