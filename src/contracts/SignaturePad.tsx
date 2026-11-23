/** משטח חתימה — אצבע, עט או עכבר */
import { useEffect, useRef, useState } from 'react';

export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const length = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current!;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = c.offsetWidth, h = c.offsetHeight;
      c.width = w * ratio; c.height = h * ratio;
      const ctx = c.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a1a40'; ctx.lineWidth = 2.6;
      length.current = 0; setEmpty(true); onChange(null);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [onChange]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#1a1a40'; ctx.fill();
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    length.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    // חתימה אמיתית — לא נקודה או קו קטנטן
    if (length.current > 40) {
      setEmpty(false);
      onChange(trimmed(canvasRef.current!));
    }
  }
  function clear() {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    length.current = 0; setEmpty(true); onChange(null);
  }

  return (
    <div>
      <div style={{ position: 'relative', border: '2px dashed #D2AB62', borderRadius: 14, background: '#fffdf7' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
          style={{ width: '100%', height: 170, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        />
        {empty && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b5a98a', pointerEvents: 'none', fontSize: 17 }}>
            חתמו כאן עם האצבע או העכבר
          </div>
        )}
      </div>
      <button type="button" onClick={clear} style={{ marginTop: 8, background: 'none', border: 'none', color: '#A8234A', fontSize: 15, cursor: 'pointer', textDecoration: 'underline' }}>
        ניקוי וחתימה מחדש
      </button>
    </div>
  );
}

/** חותך את השוליים הריקים סביב החתימה, ומחזיר PNG שקוף */
function trimmed(c: HTMLCanvasElement): string {
  const ctx = c.getContext('2d')!;
  const { width, height } = c;
  const px = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return c.toDataURL('image/png');
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad); maxY = Math.min(height, maxY + pad);
  const out = document.createElement('canvas');
  // מקטינים לגודל סביר — חתימה לא צריכה יותר מ-600 פיקסלים רוחב
  const s = Math.min(1, 600 / (maxX - minX));
  out.width = Math.round((maxX - minX) * s); out.height = Math.round((maxY - minY) * s);
  out.getContext('2d')!.drawImage(c, minX, minY, maxX - minX, maxY - minY, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
