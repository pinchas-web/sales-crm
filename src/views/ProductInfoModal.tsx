/**
 * כרטיס מוצר לצפייה בלבד — כל הידע שאיש מכירות צריך באמצע שיחה:
 * תיאור, מחיר, סילבוס, תנאים, וממליצים שאפשר להתקשר אליהם.
 * נפתח מלשונית המוצרים (למי שלא עורך מוצרים) ומכרטיס הליד.
 */
import { useState } from 'react';
import type { Product } from '../types';
import { Modal } from '../ui';
import { openWhatsApp } from '../utils';

export default function ProductInfoModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [tab, setTab] = useState<'details' | 'syllabus' | 'testimonials' | 'steps'>('details');
  if (!product) return null;

  const testimonials = product.testimonials ?? [];
  const steps = [...(product.onboardingSteps ?? [])].sort((a, b) => a.order - b.order);
  const TABS = [
    { id: 'details',      label: 'פרטים' },
    { id: 'syllabus',     label: 'סילבוס ותנאים' },
    { id: 'testimonials', label: `ממליצים (${testimonials.length})` },
    { id: 'steps',        label: 'מה קורה אחרי הסגירה' },
  ] as const;

  const empty = (text: string) => <p className="text-sm text-gray-400 text-center py-6">{text}</p>;

  return (
    <Modal open onClose={onClose} title={product.name} wide>
      <div className="flex gap-4 items-start mb-4">
        <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
          {product.imageDataUrl
            ? <img src={product.imageDataUrl} alt="" className="w-full h-full object-cover" />
            : <span className="text-3xl opacity-40">📦</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold text-blue-700">₪{product.price.toLocaleString('he-IL')}</p>
          {product.category && <p className="text-xs text-gray-400">{product.category}</p>}
          {product.shortDescription && <p className="text-sm text-gray-700 mt-1">{product.shortDescription}</p>}
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b pb-3 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-[55vh] overflow-y-auto">
        {tab === 'details' && (product.description
          ? <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{product.description}</p>
          : empty('אין עדיין תיאור מלא למוצר הזה'))}

        {tab === 'syllabus' && (
          <div className="space-y-5">
            <div>
              <h4 className="field-label">סילבוס</h4>
              {product.syllabusText
                ? <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{product.syllabusText}</p>
                : empty('אין עדיין סילבוס')}
            </div>
            {product.contractText && (
              <div>
                <h4 className="field-label">תנאים / הסכם</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{product.contractText}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'testimonials' && (testimonials.length === 0 ? empty('אין עדיין ממליצים') : (
          <div className="space-y-2">
            {testimonials.map(t => (
              <div key={t.id} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3 border">
                <div className="w-9 h-9 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center shrink-0">{t.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                  {t.note && <p className="text-sm text-gray-600 italic mt-0.5">"{t.note}"</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openWhatsApp(t.phone)} title="וואטסאפ לממליץ" className="text-green-600 hover:bg-green-50 rounded-lg p-1.5">💬</button>
                  <a href={`tel:${t.phone}`} title={t.phone} className="text-blue-600 hover:bg-blue-50 rounded-lg p-1.5">☎️</a>
                </div>
              </div>
            ))}
          </div>
        ))}

        {tab === 'steps' && (steps.length === 0 ? empty('לא הוגדרו שלבי קליטה') : (
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.title}</p>
                  {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        ))}
      </div>
    </Modal>
  );
}
