import { useState } from 'react';
import type { AppState } from '../types';
import KnowledgeBasePanel from './marketing/KnowledgeBasePanel';
import WeeklyMessagesPanel from './marketing/WeeklyMessagesPanel';

type Tab = 'messages' | 'knowledge';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'messages',  label: 'מסרים שבועיים', icon: '✨' },
  { id: 'knowledge', label: 'מאגר ידע',       icon: '🧠' },
];

interface Props {
  state: AppState;
  onUpdate: (s: AppState) => void;
}

export default function MarketingView({ state, onUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('messages');

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0">
        <h2 className="text-lg font-bold text-gray-800">📣 שיווק</h2>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* תוכן */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'messages' && (
          <WeeklyMessagesPanel state={state} onUpdate={onUpdate} />
        )}
        {activeTab === 'knowledge' && (
          <KnowledgeBasePanel state={state} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}
