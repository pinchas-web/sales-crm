/**
 * SlideEditor — עורך שקופיות PPTX בסיסי.
 * מציג את השקופיות כתמונות ומאפשר:
 *  - גלילה בין שקופיות
 *  - הוספת/עריכת הערות טקסטואליות לכל שקופית
 *  - הורדת הקובץ המקורי לעריכה חיצונית
 */
import { useState } from 'react';
import type { ContentItem } from '../../types';

interface SlideEditorProps {
  item: ContentItem;
  onClose: () => void;
  onDownload: () => void;
}

export default function SlideEditor({ item, onClose, onDownload }: SlideEditorProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [notes, setNotes]               = useState<Record<number, string>>({});

  const total = item.thumbnails.length;

  function prev() { setCurrentSlide(i => Math.max(0, i - 1)); }
  function next() { setCurrentSlide(i => Math.min(total - 1, i + 1)); }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-lg leading-none"
          >
            ✕
          </button>
          <h3 className="text-sm font-semibold truncate max-w-xs">{item.title}</h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {currentSlide + 1} / {total}
          </span>
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            <span>⬇️</span>
            <span>הורד לעריכה</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnail strip (right sidebar) */}
        <div className="w-40 shrink-0 bg-gray-800 overflow-y-auto flex flex-col gap-2 p-2">
          {item.thumbnails.map((thumb, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`relative rounded overflow-hidden border-2 transition-all ${
                idx === currentSlide ? 'border-indigo-400 scale-105' : 'border-transparent hover:border-gray-500'
              }`}
            >
              <img src={thumb} alt={`שקופית ${idx + 1}`} className="w-full object-cover" />
              <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] px-1 rounded">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>

        {/* Main slide view */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-700">
          {/* Slide image */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            {item.thumbnails[currentSlide] ? (
              <img
                src={item.thumbnails[currentSlide]}
                alt={`שקופית ${currentSlide + 1}`}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <div className="text-gray-400 text-lg">אין תצוגה מקדימה</div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 py-3 bg-gray-800 shrink-0">
            <button
              onClick={prev}
              disabled={currentSlide === 0}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm transition-colors"
            >
              ← הקודמת
            </button>
            <span className="text-gray-300 text-sm font-medium">{currentSlide + 1} / {total}</span>
            <button
              onClick={next}
              disabled={currentSlide === total - 1}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-sm transition-colors"
            >
              הבאה →
            </button>
          </div>
        </div>

        {/* Notes panel (left) */}
        <div className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col p-3 gap-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            הערות לשקופית {currentSlide + 1}
          </h4>
          <textarea
            value={notes[currentSlide] ?? ''}
            onChange={e => setNotes(n => ({ ...n, [currentSlide]: e.target.value }))}
            placeholder="הוסף הערה..."
            rows={8}
            className="flex-1 resize-none text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
          />
          <p className="text-[11px] text-gray-400 text-center">
            לעריכת תוכן השקופית, הורד את הקובץ ועדכן ב-PowerPoint
          </p>
        </div>
      </div>
    </div>
  );
}
