import { useState } from 'react';
import type { AppState, MarketingMessage, MarketingCtaType, MarketingPlatform } from '../../types';
import { uid } from '../../utils';
import { supabase } from '../../api';

const CTA_OPTIONS: { id: MarketingCtaType; label: string }[] = [
  { id: 'webinar',       label: 'הרשמה לוובינר' },
  { id: 'strategy_call', label: 'שיחת מיפוי חינמית' },
  { id: 'course',        label: 'הרשמה לקורס' },
  { id: 'nurture',       label: 'ערך בלבד' },
];

const PLATFORM_META: Record<MarketingPlatform, { label: string; icon: string; hint: string }> = {
  whatsapp_status: { label: 'ווצאפ סטטוס',  icon: '📱', hint: 'קצר ואמוציונלי' },
  whatsapp_group:  { label: 'ווצאפ קבוצה',  icon: '💬', hint: 'אישי ושיחתי' },
  email:           { label: 'אימייל',         icon: '📧', hint: 'כותרת + גוף' },
  blog:            { label: 'בלוג',           icon: '📝', hint: 'פוסט מלא' },
  youtube:         { label: 'יוטיוב',         icon: '▶️', hint: 'תיאור סרטון' },
};

function getMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface Props {
  state: AppState;
  onUpdate: (s: AppState) => void;
}

export default function WeeklyMessagesPanel({ state, onUpdate }: Props) {
  const todayMonday = getMonday(new Date().toISOString().split('T')[0]);

  const [selectedWeek, setSelectedWeek]       = useState(todayMonday);
  const [ctaType, setCtaType]                 = useState<MarketingCtaType>('webinar');
  const [rawContent, setRawContent]           = useState('');
  const [isGenerating, setIsGenerating]       = useState(false);
  const [generateError, setGenerateError]     = useState('');
  const [copiedId, setCopiedId]               = useState<string | null>(null);

  const weekMessages = state.marketingMessages
    .filter(m => m.weekDate === selectedWeek)
    .sort((a, b) => {
      const order: MarketingPlatform[] = ['whatsapp_status', 'whatsapp_group', 'email', 'blog', 'youtube'];
      return order.indexOf(a.platform) - order.indexOf(b.platform);
    });

  const approvedCount = weekMessages.filter(m => m.status === 'approved').length;

  async function handleGenerate() {
    if (!rawContent.trim()) {
      setGenerateError('הדבק חומר גולמי לפני ההפקה.');
      return;
    }
    setGenerateError('');
    setIsGenerating(true);

    // מחיקת מסרים קיימים לאותו שבוע
    const kept = state.marketingMessages.filter(m => m.weekDate !== selectedWeek);

    try {
      const token = supabase.auth.getSession().then(r => r.data.session?.access_token ?? '');
      const res = await fetch('/api/marketing-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await token}`,
        },
        body: JSON.stringify({
          rawContent,
          ctaType,
          weekDate: selectedWeek,
          knowledgeBase: state.marketingKnowledge,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const { messages } = await res.json();
      const now = new Date().toISOString();

      const newMessages: MarketingMessage[] = (messages as { platform: MarketingPlatform; content: string }[]).map(m => ({
        id: uid(),
        weekDate: selectedWeek,
        platform: m.platform,
        content: m.content,
        ctaType,
        status: 'draft',
        sourceContent: rawContent,
        createdAt: now,
        updatedAt: now,
      }));

      onUpdate({ ...state, marketingMessages: [...kept, ...newMessages] });
    } catch (err) {
      setGenerateError(`שגיאה בהפקת מסרים: ${String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  }

  function updateContent(id: string, content: string) {
    const now = new Date().toISOString();
    onUpdate({
      ...state,
      marketingMessages: state.marketingMessages.map(m =>
        m.id === id ? { ...m, content, updatedAt: now } : m
      ),
    });
  }

  function toggleApprove(id: string) {
    const now = new Date().toISOString();
    onUpdate({
      ...state,
      marketingMessages: state.marketingMessages.map(m =>
        m.id === id
          ? { ...m, status: m.status === 'approved' ? 'draft' : 'approved', updatedAt: now }
          : m
      ),
    });
  }

  function copyToClipboard(id: string, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function exportAll() {
    const approved = weekMessages.filter(m => m.status === 'approved');
    const text = approved.map(m => {
      const meta = PLATFORM_META[m.platform];
      return `═══ ${meta.icon} ${meta.label} ═══\n${m.content}`;
    }).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  }

  function deleteWeekMessages() {
    onUpdate({ ...state, marketingMessages: state.marketingMessages.filter(m => m.weekDate !== selectedWeek) });
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* כותרת + בחירת שבוע */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">שבוע</label>
          <input
            type="date"
            value={selectedWeek}
            onChange={e => setSelectedWeek(getMonday(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <p className="text-xs text-gray-400 mt-0.5">שבוע מ-{formatWeekLabel(selectedWeek)}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">סוג CTA</label>
          <select
            value={ctaType}
            onChange={e => setCtaType(e.target.value as MarketingCtaType)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
          >
            {CTA_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        {weekMessages.length > 0 && (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">{approvedCount}/{weekMessages.length} מאושרים</span>
            {approvedCount > 0 && (
              <button
                onClick={exportAll}
                className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
              >
                {copiedId === 'all' ? '✓ הועתק!' : '📋 ייצוא מאושרים'}
              </button>
            )}
            <button
              onClick={deleteWeekMessages}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              title="מחק מסרים לשבוע זה"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* אזור חומר גולמי */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          חומר גולמי לשבוע
          <span className="text-xs text-gray-400 font-normal mr-2">(תמלול, נקודות, כל טקסט)</span>
        </label>
        <textarea
          value={rawContent}
          onChange={e => setRawContent(e.target.value)}
          placeholder="הדבק כאן תמלול וידאו, נקודות מפתח, או כל חומר שממנו הסוכן יפיק את המסרים..."
          rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
        />
        {generateError && (
          <p className="text-xs text-red-500 mt-1">{generateError}</p>
        )}
        <div className="flex justify-end mt-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin">⟳</span>
                מפיק מסרים...
              </>
            ) : (
              <>
                ✨ הפק מסרים
              </>
            )}
          </button>
        </div>
      </div>

      {/* כרטיסי מסרים */}
      {weekMessages.length > 0 && (
        <div className="space-y-3">
          {weekMessages.map(msg => {
            const meta = PLATFORM_META[msg.platform];
            const isApproved = msg.status === 'approved';
            return (
              <div
                key={msg.id}
                className={`bg-white border rounded-xl p-4 shadow-sm transition-colors ${
                  isApproved ? 'border-green-300 bg-green-50/30' : 'border-gray-200'
                }`}
              >
                {/* כותרת הכרטיס */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{meta.icon}</span>
                  <span className="font-medium text-gray-800 text-sm">{meta.label}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{meta.hint}</span>
                  <div className="mr-auto flex items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(msg.id, msg.content)}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                      title="העתק"
                    >
                      {copiedId === msg.id ? '✓ הועתק' : '📋 העתק'}
                    </button>
                    <button
                      onClick={() => toggleApprove(msg.id)}
                      className={`flex items-center gap-1 text-sm px-3 py-1 rounded-lg font-medium transition-colors ${
                        isApproved
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isApproved ? '✓ מאושר' : '✓ אשר'}
                    </button>
                  </div>
                </div>

                {/* textarea לעריכה */}
                <textarea
                  value={msg.content}
                  onChange={e => updateContent(msg.id, e.target.value)}
                  rows={msg.platform === 'blog' ? 10 : msg.platform === 'email' ? 8 : 4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-y bg-white leading-relaxed"
                />
              </div>
            );
          })}
        </div>
      )}

      {weekMessages.length === 0 && !isGenerating && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <p className="text-3xl mb-3">✨</p>
          <p>הדבק חומר גולמי ולחץ "הפק מסרים" ליצירת 5 מסרים מותאמים לפלטפורמות.</p>
        </div>
      )}
    </div>
  );
}
