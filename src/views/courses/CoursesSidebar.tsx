/**
 * CoursesSidebar — סרגל צד עם רשימת קורסים ושיעורים.
 * קורס נבחר מציג את שיעוריו. לחיצה על שיעור בוחרת אותו.
 */
import { useState } from 'react';
import { uid } from '../../utils';
import type { Course, Lesson } from '../../types';

const COURSE_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e',
];

interface CoursesSidebarProps {
  courses:         Course[];
  lessons:         Lesson[];
  selectedCourseId: string | null;
  selectedLessonId: string | null;
  onSelectCourse:  (id: string) => void;
  onSelectLesson:  (id: string) => void;
  onAddCourse:     (course: Course) => void;
  onUpdateCourse:  (id: string, updates: Partial<Course>) => void;
  onDeleteCourse:  (id: string) => void;
  onAddLesson:     (lesson: Lesson) => void;
  onUpdateLesson:  (id: string, updates: Partial<Lesson>) => void;
  onDeleteLesson:  (id: string) => void;
}

export default function CoursesSidebar({
  courses, lessons,
  selectedCourseId, selectedLessonId,
  onSelectCourse, onSelectLesson,
  onAddCourse, onUpdateCourse, onDeleteCourse,
  onAddLesson, onUpdateLesson, onDeleteLesson,
}: CoursesSidebarProps) {
  const [addingCourse, setAddingCourse]   = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [addingLessonFor, setAddingLessonFor] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle]   = useState('');
  const [renamingCourseId, setRenamingCourseId] = useState<string | null>(null);
  const [renamingLessonId, setRenamingLessonId] = useState<string | null>(null);
  const [renameVal, setRenameVal]               = useState('');

  function handleAddCourse() {
    if (!newCourseName.trim()) return;
    const colorIdx = courses.length % COURSE_COLORS.length;
    onAddCourse({
      id:          uid(),
      title:       newCourseName.trim(),
      description: '',
      color:       COURSE_COLORS[colorIdx],
      order:       courses.length,
      createdAt:   new Date().toISOString(),
    });
    setNewCourseName('');
    setAddingCourse(false);
  }

  function handleAddLesson(courseId: string) {
    if (!newLessonTitle.trim()) return;
    const courseLessons = lessons.filter(l => l.courseId === courseId);
    onAddLesson({
      id:       uid(),
      courseId,
      title:    newLessonTitle.trim(),
      order:    courseLessons.length,
    });
    setNewLessonTitle('');
    setAddingLessonFor(null);
  }

  function startRename(type: 'course' | 'lesson', id: string, current: string) {
    setRenameVal(current);
    if (type === 'course') { setRenamingCourseId(id); setRenamingLessonId(null); }
    else                   { setRenamingLessonId(id); setRenamingCourseId(null); }
  }

  function submitRename(type: 'course' | 'lesson', id: string) {
    if (!renameVal.trim()) return;
    if (type === 'course') { onUpdateCourse(id, { title: renameVal.trim() }); setRenamingCourseId(null); }
    else                   { onUpdateLesson(id, { title: renameVal.trim() }); setRenamingLessonId(null); }
  }

  const sortedCourses = [...courses].sort((a, b) => a.order - b.order);

  return (
    <div className="w-64 shrink-0 bg-white border-l border-gray-200 h-full overflow-y-auto flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="text-sm font-bold text-gray-700">קורסים</h2>
        <button
          onClick={() => setAddingCourse(true)}
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 transition-colors text-sm font-bold"
          title="קורס חדש"
        >
          +
        </button>
      </div>

      {/* New course form */}
      {addingCourse && (
        <div className="px-3 py-2 border-b border-gray-100 bg-indigo-50">
          <input
            autoFocus
            value={newCourseName}
            onChange={e => setNewCourseName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCourse(); if (e.key === 'Escape') setAddingCourse(false); }}
            placeholder="שם הקורס..."
            className="w-full text-sm border border-indigo-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-right"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={handleAddCourse} className="flex-1 py-1 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              צור קורס
            </button>
            <button onClick={() => setAddingCourse(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Course list */}
      <div className="flex-1 py-2">
        {sortedCourses.length === 0 && !addingCourse && (
          <div className="text-center py-8 text-gray-400 text-xs px-4">
            <div className="text-3xl mb-2">📚</div>
            <p>אין קורסים עדיין</p>
            <p className="mt-1">לחץ + כדי ליצור קורס חדש</p>
          </div>
        )}

        {sortedCourses.map(course => {
          const isSelected      = course.id === selectedCourseId;
          const courseLessons   = lessons.filter(l => l.courseId === course.id).sort((a, b) => a.order - b.order);

          return (
            <div key={course.id} className="group/course">
              {/* Course row */}
              <div
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => onSelectCourse(course.id)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: course.color }}
                />

                {renamingCourseId === course.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => submitRename('course', course.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitRename('course', course.id); if (e.key === 'Escape') setRenamingCourseId(null); }}
                    className="flex-1 text-sm border border-indigo-300 rounded px-1 focus:outline-none text-right"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className={`flex-1 text-sm font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
                    {course.title}
                  </span>
                )}

                {/* Course actions */}
                <div className="opacity-0 group-hover/course:opacity-100 flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => startRename('course', course.id, course.title)}
                    className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 text-xs"
                    title="שנה שם"
                  >✏️</button>
                  <button
                    onClick={() => { if (confirm(`למחוק את "${course.title}"?`)) onDeleteCourse(course.id); }}
                    className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs"
                    title="מחק קורס"
                  >🗑️</button>
                </div>
              </div>

              {/* Lessons list (shown when course is selected) */}
              {isSelected && (
                <div className="mr-4 border-r-2 border-indigo-100 pr-1 ml-2">
                  {courseLessons.map(lesson => {
                    const isLessonSelected = lesson.id === selectedLessonId;
                    return (
                      <div
                        key={lesson.id}
                        className={`group/lesson flex items-center gap-2 px-2 py-1.5 rounded-lg mx-1 my-0.5 cursor-pointer transition-colors ${
                          isLessonSelected ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-600'
                        }`}
                        onClick={() => onSelectLesson(lesson.id)}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 shrink-0" />

                        {renamingLessonId === lesson.id ? (
                          <input
                            autoFocus
                            value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onBlur={() => submitRename('lesson', lesson.id)}
                            onKeyDown={e => { if (e.key === 'Enter') submitRename('lesson', lesson.id); if (e.key === 'Escape') setRenamingLessonId(null); }}
                            className="flex-1 text-xs border border-indigo-300 rounded px-1 focus:outline-none text-right"
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className={`flex-1 text-xs truncate font-medium`}>{lesson.title}</span>
                        )}

                        <div className="opacity-0 group-hover/lesson:opacity-100 flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => startRename('lesson', lesson.id, lesson.title)}
                            className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-500 text-[10px]"
                          >✏️</button>
                          <button
                            onClick={() => { if (confirm(`למחוק את "${lesson.title}"?`)) onDeleteLesson(lesson.id); }}
                            className="p-0.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 text-[10px]"
                          >🗑️</button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add lesson */}
                  {addingLessonFor === course.id ? (
                    <div className="px-2 py-1.5 mx-1">
                      <input
                        autoFocus
                        value={newLessonTitle}
                        onChange={e => setNewLessonTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddLesson(course.id); if (e.key === 'Escape') setAddingLessonFor(null); }}
                        onBlur={() => { if (newLessonTitle.trim()) handleAddLesson(course.id); else setAddingLessonFor(null); }}
                        placeholder="שם השיעור..."
                        className="w-full text-xs border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300 text-right"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingLessonFor(course.id); setNewLessonTitle(''); }}
                      className="flex items-center gap-1 px-3 py-1 mx-1 my-0.5 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors w-full"
                    >
                      <span className="font-bold">+</span>
                      <span>שיעור חדש</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
