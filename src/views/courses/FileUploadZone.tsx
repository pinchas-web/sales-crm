/**
 * FileUploadZone — אזור גרירה להעלאת קבצים לשיעור.
 * תומך ב: PDF, PPTX, DOCX, תמונות.
 * פותר בעיות MIME-type של Windows ע"י recovery לפי סיומת קובץ.
 */
import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import type { ContentType } from '../../types';
import { detectContentType } from './useContentProcessor';

// כל הסיומות שאנו מקבלים
const ALLOWED_EXTS = new Set([
  '.pdf', '.ppt', '.pptx', '.doc', '.docx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
]);

function extOf(name: string): string {
  return '.' + (name.split('.').pop()?.toLowerCase() ?? '');
}

interface FileUploadZoneProps {
  onFilesAccepted: (files: { file: File; type: ContentType }[]) => void;
  onVideoUrl:      (url: string) => void;
  processing?:     boolean;
}

export default function FileUploadZone({
  onFilesAccepted, onVideoUrl, processing = false,
}: FileUploadZoneProps) {
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [videoUrl, setVideoUrl]             = useState('');

  /**
   * React-dropzone הופך קבצים ל"נדחים" אם סוג ה-MIME לא מוכר (נפוץ ב-Windows).
   * הפתרון: גם קבצים "נדחים" שיש להם סיומת חוקית — מתקבלים.
   */
  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      // קבצים שנדחו בגלל MIME אבל הסיומת בסדר — נחזיר אותם
      const recovered = rejected
        .filter(r => ALLOWED_EXTS.has(extOf(r.file.name)))
        .map(r => r.file);

      const all = [...accepted, ...recovered];
      if (all.length > 0) {
        onFilesAccepted(all.map(f => ({ file: f, type: detectContentType(f.name) })));
      }
    },
    [onFilesAccepted],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // accept: נשמר רק לצורך סינון תיבת הדו-שיח של מערכת ההפעלה
    accept: {
      'application/pdf':         ['.pdf'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/msword':      ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':   ['.docx'],
      'image/*':                 ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
      // Windows MIME fallbacks
      'application/zip':              ['.pptx', '.docx'],
      'application/x-zip-compressed': ['.pptx', '.docx'],
      'application/octet-stream':     ['.pdf', '.ppt', '.pptx', '.doc', '.docx'],
      'application/vnd.ms-office':    ['.pptx', '.docx', '.ppt', '.doc'],
    },
    multiple: true,
    disabled: processing,
  });

  function handleVideoSubmit() {
    if (!videoUrl.trim()) return;
    onVideoUrl(videoUrl.trim());
    setVideoUrl('');
    setShowVideoInput(false);
  }

  return (
    <div className="space-y-2" dir="rtl">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-all
          ${processing ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragActive
            ? 'border-indigo-500 bg-indigo-50 scale-[1.02]'
            : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50'}
        `}
      >
        <input {...getInputProps()} />
        <div className="text-3xl mb-2">{processing ? '⏳' : isDragActive ? '📂' : '📎'}</div>
        {processing ? (
          <p className="text-sm text-indigo-600 font-medium">מעבד קבצים...</p>
        ) : isDragActive ? (
          <p className="text-sm text-indigo-600 font-medium">שחרר כאן</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 font-medium">גרור קבצים לכאן</p>
            <p className="text-xs text-gray-400 mt-1">PDF · PPTX · DOCX · תמונות</p>
          </>
        )}
      </div>

      {/* כפתורי פעולה */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowVideoInput(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
        >
          <span>🎬</span>
          <span>הוסף סרטון YouTube / Vimeo</span>
        </button>
      </div>

      {/* שדה קישור וידאו */}
      {showVideoInput && (
        <div className="flex gap-2 items-center bg-white border border-gray-200 rounded-xl p-3">
          <input
            type="url"
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVideoSubmit()}
            placeholder="https://youtube.com/... או https://vimeo.com/..."
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-left"
            dir="ltr"
            autoFocus
          />
          <button
            onClick={handleVideoSubmit}
            disabled={!videoUrl.trim()}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            הוסף
          </button>
          <button
            onClick={() => { setShowVideoInput(false); setVideoUrl(''); }}
            className="px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
