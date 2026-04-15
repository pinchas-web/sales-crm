/**
 * ContentCard — קארד לפריט תוכן יחיד (PDF / PPTX / DOCX / Video / Image).
 * מציג: כותרת, מספר עמודים/שקופיות, רצועת תמונות ממוזערות אנכית.
 * Hover → גדל מעט. לחיצה → פותח LightboxViewer.
 */
import { useState } from 'react';
import type { ContentItem } from '../../types';
import LightboxViewer from './LightboxViewer';

const TYPE_ICONS: Record<string, string> = {
  pdf:   '📄',
  pptx:  '📊',
  docx:  '📝',
  video: '🎬',
  image: '🖼️',
};

const TYPE_LABELS: Record<string, string> = {
  pdf:   'PDF',
  pptx:  'מצגת',
  docx:  'מסמך',
  video: 'סרטון',
  image: 'תמונה',
};

interface ContentCardProps {
  item: ContentItem;
  onDelete: () => void;
  onRename: (title: string) => void;
}

export default function ContentCard({ item, onDelete, onRename }: ContentCardProps) {
  const [lightboxPage, setLightboxPage] = useState<number | null>(null);
  const [hovered, setHovered]           = useState(false);
  const [renaming, setRenaming]         = useState(false);
  const [newTitle, setNewTitle]         = useState(item.title);

  function handleThumbClick(idx: number) {
    setLightboxPage(idx);
  }

  function handleRenameSubmit() {
    if (newTitle.trim()) onRename(newTitle.trim());
    setRenaming(false);
  }

  const thumbs        = item.type === 'video' ? (item.videoThumbnail ? [item.videoThumbnail] : []) : item.thumbnails;
  const displayThumbs = thumbs.slice(0, 12); // מציג מקסימום 12 תמונות ממוזערות

  return (
    <>
      <div
        className={`
          bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden
          transition-all duration-200 group
          ${hovered ? 'shadow-lg -translate-y-0.5 border-indigo-200' : ''}
        `}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ minWidth: 180, maxWidth: 240 }}
      >
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-start gap-2" dir="rtl">
          <span className="text-lg shrink-0">{TYPE_ICONS[item.type] ?? '📎'}</span>
          <div className="flex-1 min-w-0">
            {renaming ? (
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenaming(false); }}
                className="w-full text-sm font-medium border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-right"
              />
            ) : (
              <p
                className="text-sm font-semibold text-gray-800 truncate cursor-pointer hover:text-indigo-600"
                title={item.title}
                onDoubleClick={() => setRenaming(true)}
              >
                {item.title}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {TYPE_LABELS[item.type] ?? item.type}
              {item.type !== 'video' && thumbs.length > 0 && ` · ${thumbs.length} ${item.type === 'pptx' ? 'שקופיות' : item.type === 'pdf' ? 'עמודים' : 'תמונות'}`}
            </p>
          </div>

          {/* Actions menu */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
            <button
              onClick={() => setRenaming(true)}
              title="שנה שם"
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✏️
            </button>
            <button
              onClick={onDelete}
              title="מחק"
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* Thumbnail strip */}
        <div className="flex flex-col gap-1 p-2" dir="rtl">
          {item.type === 'video' ? (
            /* Video — תמונה ממוזערת עם כפתור play */
            <button
              className="relative w-full rounded-lg overflow-hidden group/thumb"
              onClick={() => setLightboxPage(0)}
            >
              {item.videoThumbnail ? (
                <img src={item.videoThumbnail} alt="video thumbnail" className="w-full object-cover" />
              ) : (
                <div className="w-full aspect-video bg-gray-800 flex items-center justify-center text-white text-3xl">
                  🎬
                </div>
              )}
              <div className="absolute inset-0 bg-black/30 group-hover/thumb:bg-black/10 transition-colors flex items-center justify-center">
                <span className="text-white text-3xl drop-shadow-lg">▶</span>
              </div>
            </button>
          ) : displayThumbs.length > 0 ? (
            displayThumbs.map((thumb, idx) => (
              <button
                key={idx}
                className="relative w-full rounded-lg overflow-hidden transition-transform duration-150 hover:scale-[1.03] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
                onClick={() => handleThumbClick(idx)}
              >
                <img
                  src={thumb}
                  alt={`${item.title} — ${idx + 1}`}
                  className="w-full object-cover"
                  loading="lazy"
                />
                {thumbs.length > 1 && (
                  <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded">
                    {idx + 1}
                  </span>
                )}
              </button>
            ))
          ) : (
            /* Placeholder */
            <button
              className="w-full aspect-video bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:bg-gray-200 transition-colors"
              onClick={() => setLightboxPage(0)}
            >
              <span className="text-3xl">{TYPE_ICONS[item.type] ?? '📎'}</span>
              <span className="text-xs">לחץ לפתיחה</span>
            </button>
          )}

          {/* אם יש יותר מ-12 — מציג כמה נוספות */}
          {thumbs.length > 12 && (
            <button
              className="w-full py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs text-gray-500 transition-colors"
              onClick={() => setLightboxPage(12)}
            >
              + {thumbs.length - 12} נוספות
            </button>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxPage !== null && (
        <LightboxViewer
          item={item}
          initialIndex={lightboxPage}
          onClose={() => setLightboxPage(null)}
        />
      )}
    </>
  );
}
