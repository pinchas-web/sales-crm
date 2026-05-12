/**
 * ContentCard — קארד לפריט תוכן יחיד בלוח השיעור.
 *
 * שתי תצורות:
 *   • PPTX → גלריית שקופיות בתוך הכרטיס + פתיחה למסך מלא.
 *   • DOCX / Video → כיסוי יחיד גדול עם "לצפייה".
 *   • PDF / Image → רצועת thumbnails אנכית, כל thumbnail פותח ב-Lightbox.
 *
 * למה ההבדל? מצגות זקוקות לניווט מהיר בין הרבה שקופיות, ולכן הן מוצגות
 * ישירות כבר בכרטיס. מסמכים אחרים נשארים במבנה מצומצם יותר.
 */
import { useEffect, useRef, useState } from 'react';
import type { ContentItem } from '../../types';
import { apiDownloadCourseFile, apiUploadThumbnailDataUrl } from '../../api';
import LightboxViewer from './LightboxViewer';
import { useContentProcessor } from './useContentProcessor';

const TYPE_ICONS: Record<string, string> = {
  pdf: '📄', pptx: '📊', docx: '📝', video: '🎬', image: '🖼️',
};
const TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF', pptx: 'מצגת', docx: 'מסמך', video: 'סרטון', image: 'תמונה',
};

interface ContentCardProps {
  item: ContentItem;
  onDelete: () => void;
  onRename: (title: string) => void;
  onUpdateItem: (updates: Partial<ContentItem>) => void;
}

function canUseRenderedDeckPreview(thumbnailsCount: number, slideCount: number): boolean {
  if (thumbnailsCount === 0) return false;
  if (slideCount <= 1) return thumbnailsCount === 1;
  return thumbnailsCount > 1;
}

function fileNameFromItem(item: ContentItem): string {
  const fromKey = item.fileKey?.split('/').pop();
  if (fromKey) return fromKey;
  return item.title;
}

export default function ContentCard({ item, onDelete, onRename, onUpdateItem }: ContentCardProps) {
  const [lightboxPage, setLightboxPage] = useState<number | null>(null);
  const [hovered, setHovered]           = useState(false);
  const [renaming, setRenaming]         = useState(false);
  const [newTitle, setNewTitle]         = useState(item.title);
  const [displayThumbnails, setDisplayThumbnails] = useState(item.thumbnails);
  const [displaySlideCount, setDisplaySlideCount] = useState(item.slideCount ?? item.thumbnails.length);
  const [rehydratingPreview, setRehydratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const hydratedRef = useRef<string | null>(null);
  const { processFile } = useContentProcessor();

  function handleRenameSubmit() {
    if (newTitle.trim()) onRename(newTitle.trim());
    setRenaming(false);
  }

  // ── Compute counts & cover ─────────────────────────────────────────────
  const totalCount  = displaySlideCount && displaySlideCount > 0
    ? displaySlideCount
    : displayThumbnails.length;
  const isDeckPreview = item.type === 'pptx' && canUseRenderedDeckPreview(displayThumbnails.length, totalCount);
  const isCoverOnly = item.type === 'docx' || item.type === 'video' || (item.type === 'pptx' && !isDeckPreview);
  const hasKnownSlideCount = !!displaySlideCount && displaySlideCount > 0;
  const needsDeckHydration =
    item.type === 'pptx' &&
    (!!item.fileKey || !!item.fileUrl) &&
    (
      !hasKnownSlideCount ||
      totalCount > displayThumbnails.length ||
      (displayThumbnails.length === 1 && totalCount > 1)
    );
  const unit =
    item.type === 'pptx'  ? 'שקופיות' :
    item.type === 'pdf'   ? 'עמודים'  :
    item.type === 'docx'  ? 'עמודים'  :
    item.type === 'image' ? 'תמונות'  : '';
  const displayItem = {
    ...item,
    thumbnails: displayThumbnails,
    slideCount: displaySlideCount,
  };

  useEffect(() => {
    setDisplayThumbnails(item.thumbnails);
    setDisplaySlideCount(item.slideCount ?? item.thumbnails.length);
  }, [item.id, item.thumbnails, item.slideCount]);

  async function hydrateDeckPreview(force = false) {
    if (!force && !needsDeckHydration) return;
    if (!force && hydratedRef.current === item.id) return;

    hydratedRef.current = item.id;

    try {
      setRehydratingPreview(true);
      setPreviewError(null);

      let blob: Blob;
      if (item.fileKey) {
        blob = await apiDownloadCourseFile(item.fileKey);
      } else if (item.fileUrl) {
        const response = await fetch(item.fileUrl);
        if (!response.ok) throw new Error(`Failed to fetch source file: ${response.status}`);
        blob = await response.blob();
      } else {
        throw new Error('Missing fileKey/fileUrl');
      }

      const file = new File([blob], fileNameFromItem(item), {
        type: blob.type || 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
      });

      const { thumbnails: rawThumbs, slideCount } = await processFile(file, 'pptx');
      if (rawThumbs.length === 0) throw new Error('No thumbnails produced');

      const thumbnails = await Promise.all(
        rawThumbs.map(dataUrl =>
          apiUploadThumbnailDataUrl(dataUrl, `thumbnails/${item.lessonId}`)
            .catch(() => dataUrl),
        ),
      );

      const resolvedSlideCount = slideCount ?? thumbnails.length;

      setDisplayThumbnails(thumbnails);
      setDisplaySlideCount(resolvedSlideCount);
      onUpdateItem({
        thumbnails,
        slideCount: resolvedSlideCount,
      });
    } catch (error) {
      console.warn('Failed to regenerate presentation preview:', error);
      setPreviewError('לא הצלחתי לרענן את כל השקופיות עדיין');
    } finally {
      setRehydratingPreview(false);
    }
  }

  useEffect(() => {
    if (!needsDeckHydration) return;
    void hydrateDeckPreview();
  }, [needsDeckHydration, item.id]);

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
        style={{ minWidth: item.type === 'pptx' ? 260 : 180, maxWidth: item.type === 'pptx' ? 320 : 240 }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
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
              >{item.title}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {TYPE_LABELS[item.type] ?? item.type}
              {item.type !== 'video' && totalCount > 0 && unit && ` · ${totalCount} ${unit}`}
            </p>
          </div>

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
            <button
              onClick={() => setRenaming(true)}
              title="שנה שם"
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xs"
            >✏️</button>
            <button
              onClick={onDelete}
              title="מחק"
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs"
            >🗑️</button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="p-2" dir="rtl">
          {rehydratingPreview && (
            <div className="mb-2 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-600">
              מרענן תצוגה של כל השקופיות...
            </div>
          )}
          {item.type === 'pptx' && (
            <div className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-indigo-700">
                  מוצגות {displayThumbnails.length} מתוך {Math.max(displaySlideCount || 0, displayThumbnails.length)} שקופיות
                </span>
                <button
                  className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-medium text-indigo-700 transition hover:bg-indigo-100"
                  onClick={() => void hydrateDeckPreview(true)}
                  disabled={rehydratingPreview}
                >
                  רענן
                </button>
              </div>
              {previewError && (
                <div className="mt-1 text-[11px] text-amber-700">
                  {previewError}
                </div>
              )}
            </div>
          )}
          {isDeckPreview ? (
            <PresentationPreview
              item={displayItem}
              onSlideClick={setLightboxPage}
              onOpenFull={() => setLightboxPage(0)}
            />
          ) : isCoverOnly ? (
            /* PPTX / DOCX / Video — כיסוי יחיד בולט */
            <CoverButton
              item={item}
              totalCount={totalCount}
              onClick={() => setLightboxPage(0)}
            />
          ) : item.thumbnails.length > 0 ? (
            /* PDF / Image — רצועת thumbnails */
            <ThumbnailStrip
              item={item}
              onPageClick={setLightboxPage}
            />
          ) : (
            /* Placeholder — אין thumbnails */
            <button
              className="w-full aspect-video bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:bg-gray-200 transition-colors"
              onClick={() => setLightboxPage(0)}
            >
              <span className="text-3xl">{TYPE_ICONS[item.type] ?? '📎'}</span>
              <span className="text-xs">לחץ לפתיחה</span>
            </button>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxPage !== null && (
        <LightboxViewer
          item={displayItem}
          initialIndex={lightboxPage}
          onClose={() => setLightboxPage(null)}
        />
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

/** כיסוי גדול עם hover overlay — ל-PPTX/DOCX/Video */
function CoverButton({
  item, totalCount, onClick,
}: {
  item: ContentItem;
  totalCount: number;
  onClick: () => void;
}) {
  const cover = item.type === 'video' ? item.videoThumbnail : item.thumbnails[0];
  const icon  = item.type === 'video' ? '▶' : TYPE_ICONS[item.type] ?? '📎';

  return (
    <button
      className="relative w-full rounded-lg overflow-hidden group/cover focus:outline-none focus:ring-2 focus:ring-indigo-400"
      onClick={onClick}
      title={item.type === 'video' ? 'נגן סרטון' : 'פתח לצפייה'}
    >
      {cover ? (
        <img
          src={cover}
          alt={item.title}
          className="w-full object-cover transition-transform duration-200 group-hover/cover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-5xl">
          {TYPE_ICONS[item.type] ?? '📎'}
        </div>
      )}

      {/* Overlay — מופיע ב-hover או תמיד לוידאו */}
      <div className={`
        absolute inset-0 flex items-center justify-center transition-all duration-200
        ${item.type === 'video'
          ? 'bg-black/30 group-hover/cover:bg-black/10'
          : 'bg-black/0 group-hover/cover:bg-black/30 opacity-0 group-hover/cover:opacity-100'}
      `}>
        <div className="flex flex-col items-center gap-1">
          <span className={`text-white drop-shadow-lg ${item.type === 'video' ? 'text-4xl' : 'text-3xl'}`}>
            {icon}
          </span>
          {item.type !== 'video' && (
            <span className="text-white text-xs font-medium drop-shadow-md bg-black/40 px-2 py-0.5 rounded">
              לצפייה מלאה
            </span>
          )}
        </div>
      </div>

      {/* Count badge (למצגות/מסמכים) */}
      {item.type !== 'video' && totalCount > 0 && (
        <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[11px] font-medium px-2 py-0.5 rounded backdrop-blur-sm">
          {totalCount}
        </span>
      )}
    </button>
  );
}

function PresentationPreview({
  item,
  onSlideClick,
  onOpenFull,
}: {
  item: ContentItem;
  onSlideClick: (idx: number) => void;
  onOpenFull: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="max-h-[360px] overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-2 space-y-2">
        {item.thumbnails.map((thumb, idx) => (
          <button
            key={idx}
            className="group relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-right transition hover:border-indigo-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            onClick={() => onSlideClick(idx)}
          >
            <img
              src={thumb}
              alt={`${item.title} - שקופית ${idx + 1}`}
              className="w-full object-cover bg-white"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-white">
              <span className="text-[11px] font-medium">שקופית {idx + 1}</span>
              <span className="text-[10px] rounded bg-white/20 px-1.5 py-0.5 opacity-0 transition group-hover:opacity-100">
                פתח
              </span>
            </div>
          </button>
        ))}
      </div>

      <button
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-500"
        onClick={onOpenFull}
      >
        הצגה מלאה עם ניווט
      </button>
    </div>
  );
}

/** רצועת thumbnails — ל-PDF/Image (מקסימום 12, "עוד" אם יש יותר) */
function ThumbnailStrip({
  item, onPageClick,
}: {
  item: ContentItem;
  onPageClick: (idx: number) => void;
}) {
  const MAX = 12;
  const display = item.thumbnails.slice(0, MAX);
  const more    = item.thumbnails.length - MAX;

  return (
    <div className="flex flex-col gap-1">
      {display.map((thumb, idx) => (
        <button
          key={idx}
          className="relative w-full rounded-lg overflow-hidden transition-transform duration-150 hover:scale-[1.03] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
          onClick={() => onPageClick(idx)}
        >
          <img src={thumb} alt={`${item.title} — ${idx + 1}`} className="w-full object-cover" loading="lazy" />
          {item.thumbnails.length > 1 && (
            <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded">
              {idx + 1}
            </span>
          )}
        </button>
      ))}
      {more > 0 && (
        <button
          className="w-full py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs text-gray-500 transition-colors"
          onClick={() => onPageClick(MAX)}
        >+ {more} נוספות</button>
      )}
    </div>
  );
}
