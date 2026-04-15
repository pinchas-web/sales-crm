/**
 * LessonBoard — לוח התוכן של שיעור אחד.
 * מציג עמודות לפי סוג תוכן (PPTX / PDF / DOCX / Video / Image).
 * כולל FileUploadZone להוספת תוכן חדש.
 */
import { useState, useCallback } from 'react';
import { uid } from '../../utils';
import type { ContentItem, ContentType, Lesson } from '../../types';
import { apiUploadCourseFile } from '../../api';
import ContentCard from './ContentCard';
import FileUploadZone from './FileUploadZone';
import { useContentProcessor } from './useContentProcessor';

const COLUMN_ORDER: ContentType[] = ['pptx', 'pdf', 'docx', 'video', 'image'];

const COLUMN_LABELS: Record<ContentType, string> = {
  pptx:  '📊 מצגות',
  pdf:   '📄 PDFs',
  docx:  '📝 מסמכים',
  video: '🎬 סרטונים',
  image: '🖼️ תמונות',
};

interface LessonBoardProps {
  lesson: Lesson;
  items: ContentItem[];
  onAddItem:    (item: ContentItem) => void;
  onUpdateItem: (id: string, updates: Partial<ContentItem>) => void;
  onDeleteItem: (id: string) => void;
}

export default function LessonBoard({ lesson, items, onAddItem, onUpdateItem, onDeleteItem }: LessonBoardProps) {
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const { processFile, processVimeoUrl }  = useContentProcessor();

  // קבצים לפי סוג
  const byType: Record<ContentType, ContentItem[]> = {
    pptx:  items.filter(i => i.type === 'pptx'),
    pdf:   items.filter(i => i.type === 'pdf'),
    docx:  items.filter(i => i.type === 'docx'),
    video: items.filter(i => i.type === 'video'),
    image: items.filter(i => i.type === 'image'),
  };

  const activeCols = COLUMN_ORDER.filter(t => byType[t].length > 0);

  const handleFilesAccepted = useCallback(async (files: { file: File; type: ContentType }[]) => {
    setProcessing(true);
    for (const { file, type } of files) {
      try {
        setProcessingMsg(`מעלה ${file.name}...`);
        const { fileKey, fileUrl } = await apiUploadCourseFile(file, `lessons/${lesson.id}`);

        setProcessingMsg(`מייצר תצוגה מקדימה ל${file.name}...`);
        const thumbnails = await processFile(file, type);

        const newItem: ContentItem = {
          id:        uid(),
          lessonId:  lesson.id,
          type,
          title:     file.name.replace(/\.[^.]+$/, ''), // שם ללא סיומת
          fileKey,
          fileUrl,
          thumbnails,
          order:     items.length,
        };
        onAddItem(newItem);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('handleFilesAccepted error:', msg);
        alert(`שגיאה בהעלאת ${file.name}:\n${msg}`);
      }
    }
    setProcessing(false);
    setProcessingMsg('');
  }, [lesson.id, items.length, processFile, onAddItem]);

  const handleVideoUrl = useCallback(async (url: string) => {
    setProcessing(true);
    setProcessingMsg('טוען פרטי סרטון...');
    try {
      const { embedUrl, thumbnailUrl } = await processVimeoUrl(url);
      const newItem: ContentItem = {
        id:             uid(),
        lessonId:       lesson.id,
        type:           'video',
        title:          'סרטון',
        thumbnails:     [],
        videoUrl:       embedUrl,
        videoThumbnail: thumbnailUrl,
        order:          items.length,
      };
      onAddItem(newItem);
    } catch (err) {
      console.error('handleVideoUrl error:', err);
    }
    setProcessing(false);
    setProcessingMsg('');
  }, [lesson.id, items.length, processVimeoUrl, onAddItem]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Upload zone */}
      <FileUploadZone
        onFilesAccepted={handleFilesAccepted}
        onVideoUrl={handleVideoUrl}
        processing={processing}
      />
      {processing && processingMsg && (
        <div className="flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
          <span className="animate-spin">⏳</span>
          <span>{processingMsg}</span>
        </div>
      )}

      {/* Columns */}
      {activeCols.length === 0 && !processing ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📂</div>
          <p className="text-sm">עדיין אין תוכן לשיעור זה</p>
          <p className="text-xs mt-1">גרור קבצים למעלה כדי להתחיל</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMN_ORDER.map(type => {
            const colItems = byType[type];
            if (colItems.length === 0) return null;
            return (
              <div key={type} className="flex flex-col gap-3 shrink-0" style={{ width: 220 }}>
                {/* Column header */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {COLUMN_LABELS[type]}
                  </span>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                    {colItems.length}
                  </span>
                </div>

                {/* Cards */}
                {colItems
                  .sort((a, b) => a.order - b.order)
                  .map(item => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      onDelete={() => onDeleteItem(item.id)}
                      onRename={title => onUpdateItem(item.id, { title })}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
