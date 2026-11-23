/**
 * הפקת PDF מעמודי ההסכם, בדפדפן.
 * כל עמוד מצולם כתמונה (הדפדפן עצמו מצייר את העברית, אז היא יוצאת מושלמת)
 * ונכנס לעמוד A4 ב-PDF.
 */
import { domToJpeg } from 'modern-screenshot';
import { jsPDF } from 'jspdf';

/** רכיבים שהגובה שלהם קבוע בעיצוב — כל השאר מקבלים גובה לפי התוכן */
const FIXED = /(^|\s)(hc-page|hc-head|hc-foot|n|num|bn|blob)(\s|$)/;

/**
 * בצילום, הטקסט יוצא לפעמים צר בפיקסל מהתצוגה, ושורה שגלשה לשתיים נכנסת לאחת.
 * כדי שלא יישאר "חור", משחררים את הגובה הקבוע של רכיבי הטקסט בעותק המצולם.
 */
function releaseHeights(node: Node) {
  if (!(node instanceof HTMLElement)) return;
  const all = [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img' || tag === 'svg' || tag === 'path') continue;
    if (FIXED.test(el.getAttribute('class') ?? '')) continue;
    el.style.height = 'auto';
    el.style.blockSize = 'auto';
  }
}

async function build(pages: HTMLElement[], scale: number, quality: number): Promise<string> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const opts = { scale, quality, backgroundColor: '#ffffff', onCloneNode: releaseHeights };
  // ספארי לפעמים מפספס פונטים בצילום הראשון — צילום "חימום" אחד
  await domToJpeg(pages[0], opts).catch(() => null);
  for (let i = 0; i < pages.length; i++) {
    const img = await domToJpeg(pages[i], opts);
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }
  return pdf.output('datauristring').split(',')[1];
}

/** מחזיר את ה-PDF כ-base64 (בלי הקידומת), קטן מספיק לשליחה לשרת */
export async function pagesToPdfBase64(pages: HTMLElement[]): Promise<string> {
  let b64 = await build(pages, 1.7, 0.86);
  if (b64.length > 3_900_000) b64 = await build(pages, 1.25, 0.78);
  return b64;
}

export function base64ToBlob(b64: string, type = 'application/pdf'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
