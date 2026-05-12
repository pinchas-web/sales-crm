import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import type { AppState, MarketingMessage, MarketingCtaType, MarketingPlatform } from '../../types';
import { uid } from '../../utils';
import { supabase } from '../../api';

// ─── Constants ────────────────────────────────────────────────────────────────

const CTA_OPTIONS: { id: MarketingCtaType; label: string }[] = [
  { id: 'webinar',       label: 'הרשמה לוובינר' },
  { id: 'strategy_call', label: 'שיחת מיפוי חינמית' },
  { id: 'course',        label: 'הרשמה לקורס' },
  { id: 'nurture',       label: 'ערך בלבד' },
];

const PLATFORM_META: Record<MarketingPlatform, { label: string; icon: string; hint: string }> = {
  whatsapp_status: { label: 'ווצאפ סטטוס', icon: '📱', hint: 'קצר ואמוציונלי' },
  whatsapp_group:  { label: 'ווצאפ קבוצה', icon: '💬', hint: 'אישי ושיחתי'  },
  email:           { label: 'אימייל',       icon: '📧', hint: 'כותרת + גוף'   },
  blog:            { label: 'בלוג',         icon: '📝', hint: 'פוסט מלא'       },
  youtube:         { label: 'יוטיוב',       icon: '▶️',  hint: 'תיאור סרטון'   },
};

const PLATFORM_ORDER: MarketingPlatform[] = [
  'whatsapp_status', 'whatsapp_group', 'email', 'blog', 'youtube',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function formatWeekLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function parseEmailContent(content: string): { subject: string; body: string } {
  const match = content.match(/^(נושא|Subject)\s*:?\s*(.+)/m);
  if (match) {
    const lineEnd = content.indexOf('\n', content.indexOf(match[0]));
    return {
      subject: match[2].trim(),
      body: lineEnd >= 0 ? content.slice(lineEnd + 1).trim() : '',
    };
  }
  const nl = content.indexOf('\n');
  if (nl >= 0) return { subject: content.slice(0, nl).trim(), body: content.slice(nl + 1).trim() };
  return { subject: content, body: '' };
}

function parseReels(content: string): string[] {
  // Do NOT .trim() — that strips trailing spaces while the user is typing
  return content
    .split(/\n?---+\n?/)
    .map(s => s.replace(/^\n+/, '').replace(/\n+$/, ''))
    .filter(Boolean);
}

// ─── StatusReelEditor — separate component so useRef/useLayoutEffect work ────

interface StatusReelEditorProps {
  content: string;
  onChange: (content: string) => void;
}

function StatusReelEditor({ content, onChange }: StatusReelEditorProps) {
  const rawReels     = parseReels(content);
  const reels        = rawReels.length > 0 ? rawReels : [''];
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusTarget  = useRef<{ index: number; cursor: number } | null>(null);
  const savedCursors = useRef<Record<number, number>>({});

  useLayoutEffect(() => {
    const t = focusTarget.current;
    if (t !== null) {
      const el = textareaRefs.current[t.index];
      if (el) { el.focus(); el.setSelectionRange(t.cursor, t.cursor); }
      focusTarget.current = null;
      return;
    }
    // Restore cursor for the currently-focused textarea after React re-renders it
    for (const [riStr, cursor] of Object.entries(savedCursors.current)) {
      const el = textareaRefs.current[Number(riStr)];
      if (el && document.activeElement === el) el.setSelectionRange(cursor, cursor);
    }
  });

  function addReelAfter(ri: number) {
    const updated = [...reels];
    updated.splice(ri + 1, 0, '');
    focusTarget.current = { index: ri + 1, cursor: 0 };
    onChange(updated.join('\n---\n'));
  }

  function deleteReel(ri: number) {
    if (reels.length <= 1) return;
    const updated = reels.filter((_, i) => i !== ri);
    focusTarget.current = { index: Math.min(ri, updated.length - 1), cursor: 0 };
    onChange(updated.join('\n---\n'));
  }

  function moveReel(ri: number, dir: 'up' | 'down') {
    if (dir === 'up' && ri === 0) return;
    if (dir === 'down' && ri === reels.length - 1) return;
    const updated = [...reels];
    const other   = dir === 'up' ? ri - 1 : ri + 1;
    [updated[ri], updated[other]] = [updated[other], updated[ri]];
    focusTarget.current = { index: other, cursor: savedCursors.current[ri] ?? 0 };
    onChange(updated.join('\n---\n'));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, ri: number) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      addReelAfter(ri);
    }
  }

  const btnCls = 'w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-xs transition-colors';

  return (
    <div className="space-y-2">
      {reels.map((reel, ri) => {
        const over = reel.length > 145;
        return (
          <div
            key={ri}
            className={`rounded-lg border p-3 ${over ? 'border-red-300 bg-red-50/20' : 'border-gray-100 bg-gray-50'}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500">רילס {ri + 1}</span>
              <div className="flex items-center gap-0.5">
                <button onClick={() => moveReel(ri, 'up')} disabled={ri === 0}
                  title="הזז למעלה" className={`${btnCls} text-gray-400 hover:text-gray-700 disabled:opacity-20`}>↑</button>
                <button onClick={() => moveReel(ri, 'down')} disabled={ri === reels.length - 1}
                  title="הזז למטה" className={`${btnCls} text-gray-400 hover:text-gray-700 disabled:opacity-20`}>↓</button>
                <button onClick={() => addReelAfter(ri)}
                  title="הוסף רילס מתחת" className={`${btnCls} text-gray-400 hover:text-green-600 font-bold`}>+</button>
                <button onClick={() => deleteReel(ri)} disabled={reels.length <= 1}
                  title="מחק רילס" className={`${btnCls} text-gray-400 hover:text-red-500 disabled:opacity-20`}>🗑️</button>
                <span className={`text-xs font-mono mr-1 ${over ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                  {reel.length}/145
                </span>
              </div>
            </div>
            <textarea
              ref={el => { textareaRefs.current[ri] = el; }}
              value={reel}
              onChange={e => {
                savedCursors.current[ri] = e.target.selectionStart;
                const updated = [...reels];
                updated[ri] = e.target.value;
                onChange(updated.join('\n---\n'));
              }}
              onKeyDown={e => handleKeyDown(e, ri)}
              rows={3}
              className="w-full border-0 bg-transparent text-sm focus:outline-none resize-none leading-relaxed"
            />
          </div>
        );
      })}
      <p className="text-xs text-gray-400 mt-1">
        <kbd className="bg-gray-100 px-1 rounded text-xs">Enter</kbd> שורה חדשה &nbsp;·&nbsp;
        <kbd className="bg-gray-100 px-1 rounded text-xs">Shift+Enter</kbd> רילס חדש
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  state: AppState;
  onUpdate: (s: AppState) => void;
}

export default function WeeklyMessagesPanel({ state, onUpdate }: Props) {
  const todayMonday = getMonday(new Date().toISOString().split('T')[0]);

  const [selectedWeek,      setSelectedWeek]      = useState(todayMonday);
  const [ctaType,           setCtaType]           = useState<MarketingCtaType>('webinar');
  const [rawContent,        setRawContent]        = useState('');
  const [showGenerate,      setShowGenerate]      = useState(false);
  const [isGenerating,      setIsGenerating]      = useState(false);
  const [generateError,     setGenerateError]     = useState('');
  const [copiedId,          setCopiedId]          = useState<string | null>(null);
  const [selectedPlatform,  setSelectedPlatform]  = useState<MarketingPlatform | null>(null);
  const [isFullscreen,      setIsFullscreen]      = useState(false);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const weekMessages = state.marketingMessages.filter(m => m.weekDate === selectedWeek);

  const byPlatform = useMemo(() => {
    const map: Partial<Record<MarketingPlatform, MarketingMessage[]>> = {};
    for (const m of weekMessages) (map[m.platform] ??= []).push(m);
    for (const msgs of Object.values(map)) {
      msgs?.sort((a, b) => (a.sequenceOrder ?? 1) - (b.sequenceOrder ?? 1));
    }
    return map;
  }, [weekMessages]);

  const totalApproved = weekMessages.filter(m => m.status === 'approved').length;
  const hasMessages   = weekMessages.length > 0;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!rawContent.trim()) { setGenerateError('הדבק חומר גולמי לפני ההפקה.'); return; }
    setGenerateError('');
    setIsGenerating(true);
    const kept = state.marketingMessages.filter(m => m.weekDate !== selectedWeek);
    try {
      const token = await supabase.auth.getSession().then(r => r.data.session?.access_token ?? '');
      const res = await fetch('/api/marketing-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ rawContent, ctaType, weekDate: selectedWeek, knowledgeBase: state.marketingKnowledge }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const { messages } = await res.json();
      const now = new Date().toISOString();
      const newMessages: MarketingMessage[] = (messages as { platform: MarketingPlatform; content: string }[])
        .map(m => ({ id: uid(), weekDate: selectedWeek, platform: m.platform, content: m.content, ctaType, status: 'draft' as const, sequenceOrder: 1, sourceContent: rawContent, createdAt: now, updatedAt: now }));
      onUpdate({ ...state, marketingMessages: [...kept, ...newMessages] });
      setShowGenerate(false);
    } catch (err) {
      setGenerateError(`שגיאה: ${String(err)}`);
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
        m.id === id ? { ...m, status: m.status === 'approved' ? 'draft' : 'approved', updatedAt: now } : m
      ),
    });
  }

  function copyToClipboard(id: string, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function exportPlatform(platform: MarketingPlatform) {
    const msgs = (byPlatform[platform] ?? []).filter(m => m.status === 'approved');
    if (!msgs.length) return;
    const meta = PLATFORM_META[platform];
    const text = msgs.map((m, i) =>
      msgs.length > 1 ? `── מסר ${i + 1} ──\n${m.content}` : m.content
    ).join('\n\n');
    navigator.clipboard.writeText(`${meta.icon} ${meta.label}\n\n${text}`);
    const key = `export-${platform}`;
    setCopiedId(key); setTimeout(() => setCopiedId(null), 2000);
  }

  function exportAll() {
    const text = PLATFORM_ORDER.flatMap(p => {
      const approved = (byPlatform[p] ?? []).filter(m => m.status === 'approved');
      if (!approved.length) return [];
      const meta = PLATFORM_META[p];
      return [`═══ ${meta.icon} ${meta.label} ═══\n${approved.map(m => m.content).join('\n\n---\n\n')}`];
    }).join('\n\n');
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId('all'); setTimeout(() => setCopiedId(null), 2000);
  }

  function deleteWeekMessages() {
    if (!confirm('למחוק את כל המסרים לשבוע זה?')) return;
    onUpdate({
      ...state,
      marketingMessages: state.marketingMessages.filter(m => m.weekDate !== selectedWeek),
      marketingDeletedWeeks: [selectedWeek],
    });
    setSelectedPlatform(null);
  }

  // ─── Message card (renders one message in the detail view) ─────────────────

  function renderMessageCard(msg: MarketingMessage, index: number) {
    const isApproved = msg.status === 'approved';
    const approved   = msg.status === 'approved';
    const total      = (byPlatform[msg.platform] ?? []).length;

    const cardCls = `rounded-xl border p-4 transition-colors ${
      isApproved ? 'border-green-300 bg-green-50/20' : 'border-gray-200 bg-white'
    }`;

    const actionBar = (
      <div className="flex items-center gap-2 mb-4">
        {total > 1 && (
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            מסר {index + 1}
          </span>
        )}
        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={() => copyToClipboard(msg.id, msg.content)}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {copiedId === msg.id ? '✓ הועתק' : '📋 העתק'}
          </button>
          <button
            onClick={() => toggleApprove(msg.id)}
            className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              approved ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {approved ? '✓ מאושר' : '✓ אשר'}
          </button>
        </div>
      </div>
    );

    // ── Email ──
    if (msg.platform === 'email') {
      const { subject, body } = parseEmailContent(msg.content);
      return (
        <div key={msg.id} className={cardCls}>
          {actionBar}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">נושא המייל (כותרת)</label>
              <input
                value={subject}
                onChange={e => updateContent(msg.id, `נושא: ${e.target.value}\n\n${body}`)}
                placeholder="שורת נושא..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">גוף המייל</label>
              <textarea
                value={body}
                onChange={e => updateContent(msg.id, `נושא: ${subject}\n\n${e.target.value}`)}
                rows={isFullscreen ? 18 : 11}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-y bg-white leading-relaxed"
              />
            </div>
          </div>
        </div>
      );
    }

    // ── WhatsApp status → reel editor ──
    if (msg.platform === 'whatsapp_status') {
      return (
        <div key={msg.id} className={cardCls}>
          {actionBar}
          <p className="text-xs text-gray-400 mb-3">{parseReels(msg.content).length} רילסים סטטוס</p>
          <StatusReelEditor
            content={msg.content}
            onChange={c => updateContent(msg.id, c)}
          />
        </div>
      );
    }

    // ── Default (whatsapp_group, blog, youtube) ──
    const rows = isFullscreen
      ? (msg.platform === 'blog' ? 22 : msg.platform === 'youtube' ? 10 : 14)
      : (msg.platform === 'blog' ? 12 : msg.platform === 'youtube' ? 5  : 8);

    return (
      <div key={msg.id} className={cardCls}>
        {actionBar}
        <textarea
          value={msg.content}
          onChange={e => updateContent(msg.id, e.target.value)}
          rows={rows}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-y bg-white leading-relaxed"
        />
      </div>
    );
  }

  // ─── Detail view content ───────────────────────────────────────────────────

  function renderDetail() {
    if (!selectedPlatform) return null;
    const meta       = PLATFORM_META[selectedPlatform];
    const msgs       = byPlatform[selectedPlatform] ?? [];
    const approvedHere = msgs.filter(m => m.status === 'approved').length;
    const exportKey  = `export-${selectedPlatform}`;

    return (
      <div className="space-y-4">
        {/* Detail header */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isFullscreen && (
            <button
              onClick={() => setSelectedPlatform(null)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              ← חזרה
            </button>
          )}
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <span className="font-bold text-gray-800">{meta.label}</span>
            <span className="text-xs text-gray-400 mr-2 bg-gray-100 px-2 py-0.5 rounded-full">{meta.hint}</span>
          </div>
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">{approvedHere}/{msgs.length} מאושרים</span>
            {approvedHere > 0 && (
              <button
                onClick={() => exportPlatform(selectedPlatform)}
                className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                {copiedId === exportKey ? '✓ הועתק!' : '📋 ייצוא מאושרים'}
              </button>
            )}
            <button
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? 'צמצם' : 'הגדל למסך מלא'}
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1.5 rounded-lg transition-colors text-base"
            >
              {isFullscreen ? '⊡' : '⛶'}
            </button>
          </div>
        </div>

        {/* Messages list */}
        {msgs.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm">אין מסרים לפלטפורמה זו בשבוע זה</p>
          </div>
        ) : (
          <div className="space-y-4">
            {msgs.map((msg, i) => renderMessageCard(msg, i))}
          </div>
        )}
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="space-y-4">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">שבוע</label>
          <input
            type="date"
            value={selectedWeek}
            onChange={e => { setSelectedWeek(getMonday(e.target.value)); setSelectedPlatform(null); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <p className="text-xs text-gray-400 mt-0.5">מ-{formatWeekLabel(selectedWeek)}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">סוג CTA</label>
          <select
            value={ctaType}
            onChange={e => setCtaType(e.target.value as MarketingCtaType)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
          >
            {CTA_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        <div className="mr-auto flex items-center gap-2 flex-wrap">
          {hasMessages && (
            <>
              <span className="text-xs text-gray-500">{totalApproved}/{weekMessages.length} מאושרים</span>
              {totalApproved > 0 && (
                <button
                  onClick={exportAll}
                  className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  {copiedId === 'all' ? '✓ הועתק!' : '📋 ייצוא הכל'}
                </button>
              )}
              <button
                onClick={deleteWeekMessages}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                title="מחק מסרים לשבוע זה"
              >
                🗑️
              </button>
            </>
          )}
          <button
            onClick={() => setShowGenerate(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
              showGenerate ? 'bg-purple-100 text-purple-700' : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            ✨ הפק מסרים
          </button>
        </div>
      </div>

      {/* ── Generate drawer ─────────────────────────────────────────────────── */}
      {showGenerate && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            חומר גולמי
            <span className="text-xs text-gray-400 font-normal mr-2">(תמלול, נקודות, כל טקסט)</span>
          </label>
          <textarea
            value={rawContent}
            onChange={e => setRawContent(e.target.value)}
            placeholder="הדבק כאן תמלול וידאו, נקודות מפתח, או כל חומר שממנו הסוכן יפיק את המסרים..."
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
          />
          {generateError && <p className="text-xs text-red-500 mt-1">{generateError}</p>}
          <div className="flex justify-end mt-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {isGenerating ? <><span className="animate-spin inline-block">⟳</span> מפיק...</> : <>✨ הפק</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      {!hasMessages ? (

        /* Empty state */
        <div className="text-center py-16 text-gray-400 text-sm bg-white border border-dashed border-gray-200 rounded-xl">
          <p className="text-4xl mb-3">✨</p>
          <p>לחץ "הפק מסרים" להפקת 5 מסרים מותאמים לפלטפורמות.</p>
          <p className="text-xs text-gray-300 mt-1.5">
            או הרץ <code className="bg-gray-100 px-1 rounded text-gray-400">crm_sync.py</code> להפקה אוטומטית.
          </p>
        </div>

      ) : !selectedPlatform ? (

        /* ── Platform grid ──────────────────────────────────────────────── */
        <div className="grid grid-cols-3 gap-3">
          {PLATFORM_ORDER.map(platform => {
            const meta     = PLATFORM_META[platform];
            const msgs     = byPlatform[platform] ?? [];
            const approved = msgs.filter(m => m.status === 'approved').length;
            const hasData  = msgs.length > 0;
            const preview  = hasData ? msgs[0].content.replace(/===.*?===/g, '').slice(0, 90) : '';

            return (
              <button
                key={platform}
                onClick={() => hasData && setSelectedPlatform(platform)}
                disabled={!hasData}
                className={`flex flex-col p-4 rounded-xl border text-right transition-all min-h-[120px] ${
                  !hasData
                    ? 'border-dashed border-gray-200 bg-gray-50 opacity-40 cursor-not-allowed'
                    : approved === msgs.length
                    ? 'border-green-300 bg-green-50/30 hover:shadow-md cursor-pointer'
                    : 'border-gray-200 bg-white hover:border-purple-300 hover:shadow-md cursor-pointer'
                }`}
              >
                {/* Icon + name */}
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-2xl leading-none mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm leading-tight">{meta.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{meta.hint}</p>
                  </div>
                </div>

                {/* Status badge */}
                <div className="mb-2">
                  {hasData ? (
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                      approved > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {approved > 0 ? `✓ ${approved}/${msgs.length} מאושר` : `${msgs.length} טיוטה`}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">ריק</span>
                  )}
                </div>

                {/* Preview */}
                {preview && (
                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed border-t border-gray-100 pt-2 mt-auto">
                    {preview}...
                  </p>
                )}
              </button>
            );
          })}
        </div>

      ) : !isFullscreen ? (

        /* ── Inline detail view ─────────────────────────────────────────── */
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          {renderDetail()}
        </div>

      ) : null}

      {/* ── Fullscreen overlay ──────────────────────────────────────────────── */}
      {isFullscreen && selectedPlatform && (
        <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => { setSelectedPlatform(null); setIsFullscreen(false); }}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all font-medium"
              >
                ← לכל הפלטפורמות
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all font-medium"
              >
                ✕ סגור מסך מלא
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              {renderDetail()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
