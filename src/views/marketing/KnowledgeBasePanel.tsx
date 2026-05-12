import { useState } from 'react';
import type { AppState, MarketingKnowledge, MarketingKnowledgeCategory } from '../../types';
import { uid } from '../../utils';

const CATEGORIES: { id: MarketingKnowledgeCategory; label: string; icon: string; placeholder: string }[] = [
  {
    id: 'products',
    label: 'מוצרים ומשפכים',
    icon: '📦',
    placeholder: 'תאר כל מוצר/שירות: שם, מחיר, למי מתאים, מה היתרון המרכזי, ולאיזה משפך הוא מחובר.',
  },
  {
    id: 'audience',
    label: 'קהל יעד',
    icon: '👥',
    placeholder: 'תאר את קהל היעד: מי הם, מה הכאבים שלהם, מה הם רוצים להשיג, מה מניע אותם להחלטה.',
  },
  {
    id: 'style',
    label: 'סגנון כתיבה',
    icon: '✍️',
    placeholder: 'תאר את הסגנון: רשמי/אישי? קצר/מפורט? מילים שאתה אוהב/שונא? דוגמה למשפט שמייצג אותך.',
  },
  {
    id: 'ctas',
    label: "CTA-ים קבועים",
    icon: '🔗',
    placeholder: 'רשום את הלינקים הקבועים: הרשמה לוובינר, קביעת שיחת מיפוי, דף מכירה לקורס וכו\'.',
  },
];

interface Props {
  state: AppState;
  onUpdate: (s: AppState) => void;
}

export default function KnowledgeBasePanel({ state, onUpdate }: Props) {
  const [activeCategory, setActiveCategory] = useState<MarketingKnowledgeCategory>('products');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const catItems = state.marketingKnowledge.filter(k => k.category === activeCategory);
  const activeCat = CATEGORIES.find(c => c.id === activeCategory)!;

  function startAdd() {
    const id = uid();
    const now = new Date().toISOString();
    const newItem: MarketingKnowledge = {
      id, category: activeCategory, title: '', content: '', updatedAt: now,
    };
    onUpdate({ ...state, marketingKnowledge: [...state.marketingKnowledge, newItem] });
    setEditingId(id);
    setEditTitle('');
    setEditContent('');
  }

  function startEdit(item: MarketingKnowledge) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
  }

  function saveEdit() {
    if (!editingId) return;
    const now = new Date().toISOString();
    onUpdate({
      ...state,
      marketingKnowledge: state.marketingKnowledge.map(k =>
        k.id === editingId
          ? { ...k, title: editTitle, content: editContent, updatedAt: now }
          : k
      ),
    });
    setEditingId(null);
  }

  function cancelEdit() {
    // אם הפריט ריק לחלוטין — מחק אותו
    const item = state.marketingKnowledge.find(k => k.id === editingId);
    if (item && !item.title && !item.content) {
      onUpdate({ ...state, marketingKnowledge: state.marketingKnowledge.filter(k => k.id !== editingId) });
    }
    setEditingId(null);
  }

  function deleteItem(id: string) {
    onUpdate({ ...state, marketingKnowledge: state.marketingKnowledge.filter(k => k.id !== id) });
  }

  return (
    <div className="flex gap-4 h-full" dir="rtl">
      {/* סרגל קטגוריות */}
      <div className="w-44 flex-shrink-0 space-y-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-right transition-colors ${
              activeCategory === cat.id
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>{cat.icon}</span>
            <span className="leading-tight">{cat.label}</span>
            {state.marketingKnowledge.filter(k => k.category === cat.id).length > 0 && (
              <span className="mr-auto text-xs bg-purple-200 text-purple-700 rounded-full px-1.5">
                {state.marketingKnowledge.filter(k => k.category === cat.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* תוכן הקטגוריה */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">
            {activeCat.icon} {activeCat.label}
          </h3>
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <span>+</span> הוסף
          </button>
        </div>

        {catItems.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-2xl mb-2">{activeCat.icon}</p>
            <p>לא הוגדרו פריטים עדיין.</p>
            <p className="text-xs mt-1 max-w-xs mx-auto text-gray-400">{activeCat.placeholder}</p>
          </div>
        )}

        <div className="space-y-3">
          {catItems.map(item => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="כותרת (לדוגמה: ביזנס תרפי)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    placeholder={activeCat.placeholder}
                    rows={5}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={cancelEdit}
                      className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={saveEdit}
                      className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700"
                    >
                      שמור
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-medium text-gray-800 text-sm">{item.title || <span className="text-gray-400 italic">ללא כותרת</span>}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(item)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                        title="ערוך"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50"
                        title="מחק"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{item.content}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
