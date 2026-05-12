import { useState } from 'react';
import type { ContentItem } from '../../types';

interface SlideEditorProps {
  item: ContentItem;
  initialIndex?: number;
  onClose: () => void;
  onDownload: () => void;
}

function canUseRenderedDeckPreview(thumbnailsCount: number, slideCount: number): boolean {
  if (thumbnailsCount === 0) return false;
  if (slideCount <= 1) return thumbnailsCount === 1;
  return thumbnailsCount > 1;
}

function officeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

function gdocsViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

function pickDefaultViewer(item: ContentItem): 'office' | 'gdocs' {
  const ext = (item.fileKey ?? item.title).split('.').pop()?.toLowerCase() ?? '';
  if (['ppt', 'doc', 'xls'].includes(ext)) return 'gdocs';
  return 'office';
}

export default function SlideEditor({ item, initialIndex = 0, onClose, onDownload }: SlideEditorProps) {
  const [viewer, setViewer] = useState<'office' | 'gdocs'>(() => pickDefaultViewer(item));
  const [iframeKey, setIframeKey] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(initialIndex);

  const hasUrl = !!item.fileUrl;
  const src = hasUrl
    ? (viewer === 'office' ? officeViewerUrl(item.fileUrl!) : gdocsViewerUrl(item.fileUrl!))
    : '';
  const totalSlides = item.slideCount && item.slideCount > 0 ? item.slideCount : item.thumbnails.length;

  const hasRenderedSlides = (
    item.type === 'pptx' &&
    canUseRenderedDeckPreview(item.thumbnails.length, totalSlides)
  );

  if (hasRenderedSlides) {
    return (
      <div className="flex h-full bg-gray-950 text-white" dir="rtl">
        <aside className="w-40 shrink-0 border-l border-gray-800 bg-gray-900/95 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-300">שקופיות</span>
            <span className="text-[11px] text-gray-500">{item.thumbnails.length}</span>
          </div>

          <div className="space-y-2">
            {item.thumbnails.map((thumb, index) => (
              <button
                key={`${item.id}-slide-${index}`}
                onClick={() => setCurrentSlide(index)}
                className={`group relative w-full overflow-hidden rounded-lg border transition ${
                  index === currentSlide
                    ? 'border-indigo-400 ring-2 ring-indigo-500/50'
                    : 'border-gray-800 hover:border-gray-600'
                }`}
              >
                <img
                  src={thumb}
                  alt={`שקופית ${index + 1}`}
                  className="w-full aspect-video object-cover bg-white"
                />
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-lg leading-none transition hover:bg-white/10 shrink-0"
                title="סגור"
                aria-label="סגור"
              >
                ×
              </button>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                <p className="text-[11px] text-gray-400">
                  שקופית {currentSlide + 1} מתוך {item.thumbnails.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setCurrentSlide(index => Math.max(0, index - 1))}
                disabled={currentSlide === 0}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-35 hover:bg-white/10"
              >
                הקודם
              </button>
              <button
                onClick={() => setCurrentSlide(index => Math.min(item.thumbnails.length - 1, index + 1))}
                disabled={currentSlide === item.thumbnails.length - 1}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-35 hover:bg-white/10"
              >
                הבא
              </button>
              <button
                onClick={onDownload}
                disabled={!hasUrl}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                הורד מקור
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-[#1f2937] p-6">
            <div className="mx-auto flex min-h-full items-center justify-center">
              <img
                src={item.thumbnails[currentSlide]}
                alt={`שקופית ${currentSlide + 1}`}
                className="max-h-full max-w-full rounded-xl bg-white shadow-2xl"
              />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900" dir="rtl">
      <header className="flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-lg leading-none shrink-0"
            title="סגור"
            aria-label="סגור"
          >
            ×
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{item.title}</h3>
            {item.slideCount && item.slideCount > 0 && (
              <p className="text-[11px] text-gray-400">
                {item.slideCount} {item.type === 'pptx' ? 'שקופיות' : 'עמודים'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasUrl && (
            <>
              <div className="flex items-center bg-gray-800 rounded-lg p-0.5 text-[11px]">
                <button
                  onClick={() => { setViewer('office'); setIframeKey(key => key + 1); }}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    viewer === 'office' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Microsoft Office Online"
                >
                  Office
                </button>
                <button
                  onClick={() => { setViewer('gdocs'); setIframeKey(key => key + 1); }}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    viewer === 'gdocs' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Google Docs Viewer"
                >
                  Google
                </button>
              </div>

              <button
                onClick={() => setIframeKey(key => key + 1)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-sm"
                title="רענן"
                aria-label="רענן"
              >
                ↻
              </button>

              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-sm"
                title="פתח בלשונית חדשה"
              >
                ↗
              </a>
            </>
          )}

          <button
            onClick={onDownload}
            disabled={!hasUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span>⬇</span>
            <span>הורד</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden bg-gray-200">
        {hasUrl ? (
          <iframe
            key={`${viewer}-${iframeKey}`}
            src={src}
            title={item.title}
            className="w-full h-full border-0 bg-white"
            allow="fullscreen"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8">
            {item.thumbnails[0] ? (
              <img
                src={item.thumbnails[0]}
                alt={item.title}
                className="max-w-3xl max-h-[70vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <div className="text-6xl">DOC</div>
            )}
            <p className="text-gray-300 text-sm">
              הקובץ לא זמין לתצוגה מקוונת. לחץ "הורד" לצפייה מקומית.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
