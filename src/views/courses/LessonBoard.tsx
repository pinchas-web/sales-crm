/**
 * LessonBoard — לוח התוכן של שיעור אחד.
 * עמודות לפי סוג תוכן. תומך ב:
 * - גרירת עמודות לסידור מחדש
 * - גרירת פריטים למעלה/למטה בתוך עמודה
 * - לחיצה כפולה על כותרת עמודה לשינוי שם
 * - YouTube ו-Vimeo
 */
import { useState, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { uid } from '../../utils';
import type { ContentItem, ContentType, Lesson } from '../../types';
import { apiUploadCourseFile, apiUploadThumbnailDataUrl } from '../../api';
import ContentCard from './ContentCard';
import FileUploadZone from './FileUploadZone';
import { useContentProcessor } from './useContentProcessor';

const DEFAULT_COLUMN_ORDER: ContentType[] = ['pptx', 'pdf', 'docx', 'video', 'image'];

const DEFAULT_COLUMN_LABELS: Record<ContentType, string> = {
  pptx:  '📊 מצגות',
  pdf:   '📄 PDFs',
  docx:  '📝 מסמכים',
  video: '🎬 סרטונים',
  image: '🖼️ תמונות',
};

interface LessonBoardProps {
  lesson: Lesson;
  items: ContentItem[];
  onAddItem:      (item: ContentItem) => void;
  onUpdateItem:   (id: string, updates: Partial<ContentItem>) => void;
  onDeleteItem:   (id: string) => void;
  onUpdateLesson: (id: string, updates: Partial<Lesson>) => void;
}

export default function LessonBoard({
  lesson, items, onAddItem, onUpdateItem, onDeleteItem, onUpdateLesson,
}: LessonBoardProps) {
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const { processFile, processVideoUrl } = useContentProcessor();

  // Column order — from lesson or default
  const [columnOrder, setColumnOrder] = useState<ContentType[]>(
    lesson.columnOrder ?? DEFAULT_COLUMN_ORDER,
  );
  // Column labels — merged with defaults
  const [columnLabels, setColumnLabels] = useState<Record<ContentType, string>>(
    { ...DEFAULT_COLUMN_LABELS, ...(lesson.columnLabels ?? {}) },
  );

  // Inline rename state
  const [editingCol, setEditingCol] = useState<ContentType | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Items by type
  const byType: Record<ContentType, ContentItem[]> = {
    pptx:  items.filter(i => i.type === 'pptx'),
    pdf:   items.filter(i => i.type === 'pdf'),
    docx:  items.filter(i => i.type === 'docx'),
    video: items.filter(i => i.type === 'video'),
    image: items.filter(i => i.type === 'image'),
  };

  // Only columns that have items, in user-defined order
  const activeCols = columnOrder.filter(t => byType[t].length > 0);

  // ── Drag & Drop ──────────────────────────────────────────────────────────────

  function handleDragEnd(result: DropResult) {
    const { destination, source, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'COLUMN') {
      const newActive = [...activeCols];
      const [removed] = newActive.splice(source.index, 1);
      newActive.splice(destination.index, 0, removed);
      // Rebuild: active cols in new order, inactive cols appended
      const inactive = columnOrder.filter(t => !activeCols.includes(t));
      const newOrder = [...newActive, ...inactive];
      setColumnOrder(newOrder);
      onUpdateLesson(lesson.id, { columnOrder: newOrder });
      return;
    }

    if (type === 'ITEM') {
      const colType = source.droppableId as ContentType;
      const colItems = [...byType[colType]].sort((a, b) => a.order - b.order);
      const [removed] = colItems.splice(source.index, 1);
      colItems.splice(destination.index, 0, removed);
      colItems.forEach((item, idx) => {
        if (item.order !== idx) onUpdateItem(item.id, { order: idx });
      });
    }
  }

  // ── Column rename ─────────────────────────────────────────────────────────────

  function startRename(type: ContentType) {
    setEditingCol(type);
    setEditingLabel(columnLabels[type]);
    setTimeout(() => inputRef.current?.select(), 30);
  }

  function commitRename() {
    if (!editingCol) return;
    const label = editingLabel.trim() || DEFAULT_COLUMN_LABELS[editingCol];
    const newLabels = { ...columnLabels, [editingCol]: label };
    setColumnLabels(newLabels);
    onUpdateLesson(lesson.id, { columnLabels: newLabels });
    setEditingCol(null);
  }

  // ── File upload ───────────────────────────────────────────────────────────────

  const handleFilesAccepted = useCallback(async (files: { file: File; type: ContentType }[]) => {
    setProcessing(true);
    for (const { file, type } of files) {
      try {
        setProcessingMsg(`מעלה ${file.name}...`);
        const { fileKey, fileUrl } = await apiUploadCourseFile(file, `lessons/${lesson.id}`);

        setProcessingMsg(`מייצר תצוגה מקדימה ל${file.name}...`);
        const rawThumbs = await processFile(file, type);

        // Upload thumbnails to Supabase Storage → URLs instead of large base64
        // (base64 is stripped from POST body, so without this thumbnails won't persist)
        setProcessingMsg(`שומר תמונות מקדימה (${rawThumbs.length})...`);
        const thumbnails = await Promise.all(
          rawThumbs.map(dataUrl =>
            apiUploadThumbnailDataUrl(dataUrl, `thumbnails/${lesson.id}`)
              .catch(() => dataUrl), // keep data URL in memory if upload fails
          ),
        );

        onAddItem({
          id:       uid(),
          lessonId: lesson.id,
          type,
          title:    file.name.replace(/\.[^.]+$/, ''),
          fileKey,
          fileUrl,
          thumbnails,
          order:    items.length,
        });
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
      const { embedUrl, thumbnailUrl, title } = await processVideoUrl(url);
      onAddItem({
        id:             uid(),
        lessonId:       lesson.id,
        type:           'video',
        title:          title || 'סרטון',
        thumbnails:     [],
        videoUrl:       embedUrl,
        videoThumbnail: thumbnailUrl,
        order:          items.length,
      });
    } catch (err) {
      console.error('handleVideoUrl error:', err);
    }
    setProcessing(false);
    setProcessingMsg('');
  }, [lesson.id, items.length, processVideoUrl, onAddItem]);

  // ─────────────────────────────────────────────────────────────────────────────

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
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board" direction="horizontal" type="COLUMN">
            {(boardProvided) => (
              <div
                ref={boardProvided.innerRef}
                {...boardProvided.droppableProps}
                className="flex gap-4 overflow-x-auto pb-4"
              >
                {activeCols.map((type, colIndex) => {
                  const colItems = [...byType[type]].sort((a, b) => a.order - b.order);
                  const label    = columnLabels[type];
                  const isEditing = editingCol === type;

                  return (
                    <Draggable key={type} draggableId={`col-${type}`} index={colIndex}>
                      {(colProvided, colSnapshot) => (
                        <div
                          ref={colProvided.innerRef}
                          {...colProvided.draggableProps}
                          className={`flex flex-col gap-3 shrink-0 rounded-xl transition-shadow ${
                            colSnapshot.isDragging ? 'shadow-xl ring-2 ring-indigo-300 bg-white' : ''
                          }`}
                          style={{ width: 220, ...colProvided.draggableProps.style }}
                        >
                          {/* Column header — drag handle */}
                          <div
                            {...colProvided.dragHandleProps}
                            className="flex items-center justify-between px-1 py-0.5 rounded-lg cursor-grab active:cursor-grabbing select-none group"
                            title="גרור להזזת עמודה"
                          >
                            {isEditing ? (
                              <input
                                ref={inputRef}
                                value={editingLabel}
                                onChange={e => setEditingLabel(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={e => {
                                  if (e.key === 'Enter')  commitRename();
                                  if (e.key === 'Escape') setEditingCol(null);
                                }}
                                className="text-xs font-semibold text-gray-700 border-b-2 border-indigo-400 bg-transparent outline-none w-full"
                                dir="rtl"
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="text-xs font-semibold text-gray-500 uppercase tracking-wide group-hover:text-gray-700 transition-colors"
                                onDoubleClick={(e) => { e.stopPropagation(); startRename(type); }}
                                title="לחץ פעמיים לשינוי שם"
                              >
                                {label}
                              </span>
                            )}
                            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 shrink-0 ml-1">
                              {colItems.length}
                            </span>
                          </div>

                          {/* Items droppable */}
                          <Droppable droppableId={type} type="ITEM">
                            {(itemsProvided, itemsSnapshot) => (
                              <div
                                ref={itemsProvided.innerRef}
                                {...itemsProvided.droppableProps}
                                className={`flex flex-col gap-3 min-h-[60px] rounded-lg p-1 transition-colors ${
                                  itemsSnapshot.isDraggingOver ? 'bg-indigo-50/70' : ''
                                }`}
                              >
                                {colItems.map((item, itemIndex) => (
                                  <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
                                    {(itemProvided, itemSnapshot) => (
                                      <div
                                        ref={itemProvided.innerRef}
                                        {...itemProvided.draggableProps}
                                        {...itemProvided.dragHandleProps}
                                        className={`transition-shadow ${
                                          itemSnapshot.isDragging ? 'shadow-lg opacity-90 rotate-1' : ''
                                        }`}
                                        style={itemProvided.draggableProps.style}
                                      >
                                        <ContentCard
                                          item={item}
                                          onDelete={() => onDeleteItem(item.id)}
                                          onRename={title => onUpdateItem(item.id, { title })}
                                        />
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {itemsProvided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {boardProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}
