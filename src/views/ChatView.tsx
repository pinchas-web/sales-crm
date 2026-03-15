/**
 * צ'אט פנימי לצוות — מעוצב כמו וואצאפ.
 * ערוץ כללי "📣 כולם" + הודעות פרטיות לכל משתמש.
 * קריאה אוטומטית בעת צפייה, badges על הודעות שלא נקראו.
 */
import { useState, useRef, useEffect } from 'react';
import type { AppState, ChatMessage } from '../types';
import { uid } from '../utils';

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, senderName, state, onMarkRead }: {
  msg: ChatMessage;
  isMine: boolean;
  senderName: string;
  state: AppState;
  onMarkRead: () => void;
}) {
  const time = new Date(msg.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const readByNames = msg.readBy
    .filter(id => id !== msg.fromUserId)
    .map(id => state.users.find(u => u.id === id)?.name ?? '')
    .filter(Boolean);

  useEffect(() => {
    if (!isMine && !msg.readBy.includes(state.currentUserId)) {
      onMarkRead();
    }
  }, []);

  return (
    <div className={`flex ${isMine ? 'justify-start' : 'justify-end'} mb-3`}>
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center ml-2 shrink-0 self-end">
          {senderName.charAt(0)}
        </div>
      )}
      <div className={`max-w-[70%] ${isMine ? 'items-start' : 'items-end'} flex flex-col`}>
        {!isMine && <p className="text-xs text-gray-500 mb-1">{senderName}</p>}
        <div className={`px-3 py-2 rounded-2xl text-sm shadow-sm ${isMine ? 'bg-gray-100 text-gray-800 rounded-tr-sm' : 'bg-blue-600 text-white rounded-tl-sm'}`}>
          {msg.content}
        </div>
        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? '' : 'flex-row-reverse'}`}>
          <span className="text-xs text-gray-400">{time}</span>
          {isMine && readByNames.length > 0 && (
            <span className="text-xs text-blue-500">✓✓ נקרא</span>
          )}
          {isMine && readByNames.length === 0 && (
            <span className="text-xs text-gray-300">✓</span>
          )}
        </div>
      </div>
      {isMine && (
        <div className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center mr-2 shrink-0 self-end">
          {senderName.charAt(0)}
        </div>
      )}
    </div>
  );
}

// ─── Date Divider ─────────────────────────────────────────────────────────────

function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-2 my-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 shrink-0">{date}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ─── Chat Channel ─────────────────────────────────────────────────────────────

function ChatChannel({ messages, state, channelUserId, onSend, onMarkRead }: {
  messages: ChatMessage[];
  state: AppState;
  channelUserId: string | null; // null = group/all
  onSend: (content: string) => void;
  onMarkRead: (msgId: string) => void;
}) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function handleSend() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }

  // Group messages by date
  let lastDate = '';
  const rendered: React.ReactNode[] = [];
  messages.forEach(msg => {
    const d = new Date(msg.timestamp).toLocaleDateString('he-IL');
    if (d !== lastDate) {
      rendered.push(<DateDivider key={`d-${msg.id}`} date={d} />);
      lastDate = d;
    }
    const sender = state.users.find(u => u.id === msg.fromUserId);
    const isMine = msg.fromUserId === state.currentUserId;
    rendered.push(
      <MessageBubble
        key={msg.id}
        msg={msg}
        isMine={isMine}
        senderName={sender?.name ?? 'לא ידוע'}
        state={state}
        onMarkRead={() => onMarkRead(msg.id)}
      />
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            אין הודעות עדיין. שלח הודעה ראשונה!
          </div>
        )}
        {rendered}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white p-3 flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={channelUserId ? 'כתוב הודעה...' : 'כתוב לכולם...'}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          שלח →
        </button>
      </div>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

export default function ChatView({
  state, onSendMessage, onMarkRead,
}: {
  state: AppState;
  onSendMessage: (msg: ChatMessage) => void;
  onMarkRead: (msgId: string, userId: string) => void;
}) {
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  // null = group (all), string = userId for DM

  const currentUser = state.users.find(u => u.id === state.currentUserId)!;
  const otherUsers = state.users.filter(u => u.id !== state.currentUserId);

  // Get messages for active channel
  function getChannelMessages(channelUserId: string | null): ChatMessage[] {
    if (channelUserId === null) {
      // Group messages
      return state.chatMessages
        .filter(m => m.toUserId === null)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }
    // DM between current user and channelUserId
    return state.chatMessages
      .filter(m =>
        (m.fromUserId === state.currentUserId && m.toUserId === channelUserId) ||
        (m.fromUserId === channelUserId && m.toUserId === state.currentUserId)
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  function getUnread(channelUserId: string | null): number {
    return getChannelMessages(channelUserId).filter(
      m => m.fromUserId !== state.currentUserId && !m.readBy.includes(state.currentUserId)
    ).length;
  }

  function handleSend(content: string) {
    const msg: ChatMessage = {
      id: uid(),
      fromUserId: state.currentUserId,
      toUserId: activeChannel,
      content,
      timestamp: new Date().toISOString(),
      readBy: [state.currentUserId],
    };
    onSendMessage(msg);
  }

  const activeMessages = getChannelMessages(activeChannel);

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[500px] bg-white rounded-2xl border shadow-sm overflow-hidden">
      {/* Sidebar — channels */}
      <div className="w-64 shrink-0 border-l bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <h2 className="font-bold text-gray-800">💬 צ'אט צוות</h2>
          <p className="text-xs text-gray-500 mt-0.5">{currentUser.name}</p>
        </div>

        {/* Channels list */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Group channel */}
          <button
            onClick={() => setActiveChannel(null)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1 text-right transition-colors ${activeChannel === null ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${activeChannel === null ? 'bg-blue-500' : 'bg-gray-200'}`}>
              📣
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">כולם</p>
              <p className={`text-xs truncate ${activeChannel === null ? 'text-blue-100' : 'text-gray-400'}`}>ערוץ קבוצתי</p>
            </div>
            {getUnread(null) > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                {getUnread(null)}
              </span>
            )}
          </button>

          {/* Divider */}
          <p className="text-xs text-gray-400 px-3 py-2">שיחות פרטיות</p>

          {/* DM channels */}
          {otherUsers.map(user => {
            const unread = getUnread(user.id);
            const active = activeChannel === user.id;
            const lastMsg = getChannelMessages(user.id).at(-1);
            return (
              <button
                key={user.id}
                onClick={() => setActiveChannel(user.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1 text-right transition-colors ${active ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${active ? 'bg-blue-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                  {user.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  {lastMsg && (
                    <p className={`text-xs truncate ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                      {lastMsg.content.length > 20 ? lastMsg.content.slice(0, 20) + '…' : lastMsg.content}
                    </p>
                  )}
                </div>
                {unread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel header */}
        <div className="p-4 border-b bg-white flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
            {activeChannel === null ? '📣' : state.users.find(u => u.id === activeChannel)?.name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-800">
              {activeChannel === null ? 'כולם' : state.users.find(u => u.id === activeChannel)?.name}
            </p>
            <p className="text-xs text-gray-400">
              {activeChannel === null ? `${state.users.length} משתמשים` : 'שיחה פרטית'}
            </p>
          </div>
        </div>

        <ChatChannel
          messages={activeMessages}
          state={state}
          channelUserId={activeChannel}
          onSend={handleSend}
          onMarkRead={msgId => onMarkRead(msgId, state.currentUserId)}
        />
      </div>
    </div>
  );
}
