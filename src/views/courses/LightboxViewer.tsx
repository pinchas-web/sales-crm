/**
 * LightboxViewer — מסך מלא לצפייה ועריכה בתוכן.
 * PDF / תמונות: גלילה חלקה בין עמודים.
 * PPTX / DOCX:  SlideEditor עם תצוגת thumbnail strip.
 * Video:         Vimeo embed player.
 */
import { useState, useEffect, useCallback } from 'react';
import type { ContentItem } from '../../types';
import SlideEditor from './SlideEditor';

interface LightboxViewerProps {
  item: ContentItem;
  initialIndex?: number;   // עמוד/שקופית פתיחה
  onClose: () => void;
}

export default function LightboxViewer({ item, initialIndex = 0, onClose }: LightboxViewerProps) {
  const [currentPage, setCurrentPage] = useState(initialIndex);
  const total = item.thumbnails.length;

  // ניווט מקלדת
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  setCurrentPage(p => Math.min(total - 1, p + 1)); // RTL
      if (e.key === 'ArrowRight') setCurrentPage(p => Math.max(0, p - 1));         // RTL
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, total]);

  const handleDownload = useCallback(() => {
    if (!item.fileUrl) return;
    const a    = document.createElement('a');
    a.href     = item.fileUrl;
    a.download = item.title;
    a.click();
  }, [item]);

  // ── Video ──────────────────────────────────────────────────────────────────
  if (item.type === 'video') {
    return (
      <div
        className="fixed inset-0 z-50 bg-black flex flex-col"
        dir="rtl"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-lg leading-none">✕</button>
            <h3 className="text-sm font-semibold">{item.title}</h3>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <iframe
            src={item.videoUrl}
            className="w-full max-w-4xl aspect-video rounded-xl shadow-2xl"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={item.title}
          />
        </div>
      </div>
    );
  }

  // ── PPTX / DOCX → SlideEditor ─────────────────────────────────────────────
  if (item.type === 'pptx' || item.type === 'docx') {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <SlideEditor item={item} onClose={onClose} onDownload={handleDownload} />
      </div>
    );
  }

  // ── PDF / Image → Page viewer ─────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      dir="rtl"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-lg leading-none">✕</button>
          <h3 className="text-sm font-semibold truncate max-w-xs">{item.title}</h3>
        </div>
        <div className="flex items-center gap-3">
          {total > 1 && (
            <span className="text-xs text-gray-400">{currentPage + 1} / {total}</span>
          )}
          {item.fileUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              ⬇️ הורד
            </button>
          )}
        </div>
      </div>

      {/* Main image */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        {item.thumbnails[currentPage] ? (
          <img
            src={item.thumbnails[currentPage]}
            alt={`עמוד ${currentPage + 1}`}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <div className="text-gray-400">אין תצוגה מקדימה</div>
        )}
      </div>

      {/* Navigation */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-4 py-3 bg-gray-900 shrink-0">
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm transition-colors"
          >
            → הקודם
          </button>

          {/* Thumbnail dots */}
          <div className="flex gap-1 overflow-x-auto max-w-sm">
            {item.thumbnails.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPage(idx)}
                className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                  idx === currentPage ? 'bg-white scale-125' : 'bg-gray-500 hover:bg-gray-300'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(p => Math.min(total - 1, p + 1))}
            disabled={currentPage === total - 1}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm transition-colors"
          >
            ← הבא
          </button>
        </div>
      )}
    </div>
  );
}
