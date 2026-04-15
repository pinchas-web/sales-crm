/**
 * CoursesView — ניהול קורסים ותוכן שיעורים.
 * פריסה: sidebar (קורסים + שיעורים) | main (LessonBoard).
 */
import { useState } from 'react';
import type { AppState, Course, Lesson, ContentItem } from '../types';
import CoursesSidebar from './courses/CoursesSidebar';
import LessonBoard from './courses/LessonBoard';

interface CoursesViewProps {
  state: AppState;
  onAddCourse:         (course: Course) => void;
  onUpdateCourse:      (id: string, updates: Partial<Course>) => void;
  onDeleteCourse:      (id: string) => void;
  onAddLesson:         (lesson: Lesson) => void;
  onUpdateLesson:      (id: string, updates: Partial<Lesson>) => void;
  onDeleteLesson:      (id: string) => void;
  onAddContentItem:    (item: ContentItem) => void;
  onUpdateContentItem: (id: string, updates: Partial<ContentItem>) => void;
  onDeleteContentItem: (id: string) => void;
}

export default function CoursesView({
  state,
  onAddCourse, onUpdateCourse, onDeleteCourse,
  onAddLesson, onUpdateLesson, onDeleteLesson,
  onAddContentItem, onUpdateContentItem, onDeleteContentItem,
}: CoursesViewProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    state.courses[0]?.id ?? null,
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  // כשבוחרים קורס — בחר גם את השיעור הראשון שלו
  function handleSelectCourse(id: string) {
    setSelectedCourseId(id);
    const firstLesson = state.lessons.find(l => l.courseId === id);
    setSelectedLessonId(firstLesson?.id ?? null);
  }

  const selectedCourse = state.courses.find(c => c.id === selectedCourseId);
  const selectedLesson = state.lessons.find(l => l.id === selectedLessonId);
  const lessonItems    = selectedLesson
    ? state.contentItems.filter(ci => ci.lessonId === selectedLessonId)
    : [];

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-gray-200 shadow-sm bg-white" dir="rtl">
      {/* Sidebar */}
      <CoursesSidebar
        courses={state.courses}
        lessons={state.lessons}
        selectedCourseId={selectedCourseId}
        selectedLessonId={selectedLessonId}
        onSelectCourse={handleSelectCourse}
        onSelectLesson={setSelectedLessonId}
        onAddCourse={onAddCourse}
        onUpdateCourse={onUpdateCourse}
        onDeleteCourse={onDeleteCourse}
        onAddLesson={onAddLesson}
        onUpdateLesson={onUpdateLesson}
        onDeleteLesson={onDeleteLesson}
      />

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedLesson ? (
          <>
            {/* Lesson header */}
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                {selectedCourse && (
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: selectedCourse.color }}
                  />
                )}
                <div>
                  <h1 className="text-xl font-bold text-gray-800">{selectedLesson.title}</h1>
                  {selectedCourse && (
                    <p className="text-sm text-gray-400 mt-0.5">{selectedCourse.title}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Lesson board */}
            <div className="flex-1 overflow-auto p-6">
              <LessonBoard
                lesson={selectedLesson}
                items={lessonItems}
                onAddItem={onAddContentItem}
                onUpdateItem={onUpdateContentItem}
                onDeleteItem={onDeleteContentItem}
                onUpdateLesson={onUpdateLesson}
              />
            </div>
          </>
        ) : selectedCourse ? (
          /* יש קורס אבל אין שיעור נבחר */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400" dir="rtl">
            <div className="text-5xl mb-4">📖</div>
            <h2 className="text-lg font-semibold text-gray-600 mb-1">{selectedCourse.title}</h2>
            <p className="text-sm">בחר שיעור מהרשימה בצד, או צור שיעור חדש</p>
          </div>
        ) : (
          /* אין קורס נבחר */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400" dir="rtl">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-lg font-semibold text-gray-600 mb-1">ניהול קורסים</h2>
            <p className="text-sm">בחר קורס מהרשימה, או צור קורס חדש</p>
          </div>
        )}
      </div>
    </div>
  );
}
