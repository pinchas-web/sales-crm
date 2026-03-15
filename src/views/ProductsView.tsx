/**
 * ניהול קטלוג מוצרים — גלריית כרטיסים, עריכה מלאה, נהלי קליטה והמלצות.
 * נהלי הקליטה שמוגדרים כאן מופיעים אוטומטית בכרטיס הלקוח אחרי סגירה.
 */
import { useState } from 'react';
import type { AppState, Product, ProductTestimonial, OnboardingStep } from '../types';
import { uid } from '../utils';
import { Btn, Input, Modal, Textarea, EmptyState, Toggle, ConfirmDialog } from '../ui';

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl border shadow-sm cursor-pointer hover:shadow-md transition-all overflow-hidden group ${!product.active ? 'opacity-60' : ''}`}>
      {/* Image */}
      <div className="h-36 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center overflow-hidden">
        {product.imageDataUrl ? (
          <img src={product.imageDataUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <span className="text-4xl opacity-40">📦</span>
        )}
      </div>
      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-gray-900">{product.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${product.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {product.active ? '● פעיל' : '○ לא פעיל'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{product.shortDescription}</p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-blue-700">₪{product.price.toLocaleString('he-IL')}</span>
          <span className="text-xs text-gray-400">{product.category}</span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
          <span>📋 {product.onboardingSteps.length} שלבי קליטה</span>
          <span>⭐ {product.testimonials.length} ממליצים</span>
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding Steps Editor ──────────────────────────────────────────────────

function StepsEditor({ steps, onChange }: {
  steps: OnboardingStep[];
  onChange: (steps: OnboardingStep[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc]   = useState('');
  const sorted = [...steps].sort((a, b) => a.order - b.order);

  function addStep() {
    if (!title.trim()) return;
    onChange([...steps, { id: uid(), title: title.trim(), description: desc.trim() || undefined, order: steps.length }]);
    setTitle(''); setDesc('');
  }
  function removeStep(id: string) { onChange(steps.filter(s => s.id !== id)); }
  function moveStep(id: string, dir: 'up' | 'down') {
    const idx = sorted.findIndex(s => s.id === id);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === sorted.length - 1) return;
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    const newSteps = steps.map(s =>
      s.id === id ? { ...s, order: sorted[swap].order }
        : s.id === sorted[swap].id ? { ...s, order: sorted[idx].order }
        : s
    );
    onChange(newSteps);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {sorted.length === 0 && <p className="text-sm text-gray-400 text-center py-3">הוסף שלב קליטה למטה</p>}
        {sorted.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 border">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{s.title}</p>
              {s.description && <p className="text-xs text-gray-500 truncate">{s.description}</p>}
            </div>
            <Btn size="xs" variant="ghost" onClick={() => moveStep(s.id, 'up')} disabled={i === 0}>↑</Btn>
            <Btn size="xs" variant="ghost" onClick={() => moveStep(s.id, 'down')} disabled={i === sorted.length - 1}>↓</Btn>
            <Btn size="xs" variant="danger" onClick={() => removeStep(s.id)}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2 bg-white">
        <p className="text-xs font-medium text-gray-600">➕ שלב חדש</p>
        <Input value={title} onChange={setTitle} placeholder="שם השלב *" />
        <Input value={desc} onChange={setDesc} placeholder="תיאור (אופציונלי)" />
        <Btn size="sm" onClick={addStep} disabled={!title.trim()}>+ הוסף שלב</Btn>
      </div>
    </div>
  );
}

// ─── Testimonials Editor ──────────────────────────────────────────────────────

function TestimonialsEditor({ items, onChange }: {
  items: ProductTestimonial[];
  onChange: (items: ProductTestimonial[]) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote]   = useState('');

  function addItem() {
    if (!name.trim() || !phone.trim()) return;
    onChange([...items, { id: uid(), name: name.trim(), phone: phone.trim(), note: note.trim() || undefined }]);
    setName(''); setPhone(''); setNote('');
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {items.map(t => (
          <div key={t.id} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5 border">
            <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{t.name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{t.name}</p>
              <p className="text-xs text-gray-500">{t.phone}</p>
              {t.note && <p className="text-xs text-gray-600 italic mt-0.5">"{t.note}"</p>}
            </div>
            <Btn size="xs" variant="danger" onClick={() => onChange(items.filter(x => x.id !== t.id))}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2 bg-white">
        <div className="grid grid-cols-2 gap-2">
          <Input value={name} onChange={setName} placeholder="שם *" />
          <Input value={phone} onChange={setPhone} placeholder="טלפון *" />
        </div>
        <Input value={note} onChange={setNote} placeholder="ציטוט (אופציונלי)" />
        <Btn size="sm" onClick={addItem} disabled={!name.trim() || !phone.trim()}>+ הוסף ממליץ</Btn>
      </div>
    </div>
  );
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────

function ProductDetailModal({ product, onClose, onSave, onDelete }: {
  product: Product | null; onClose: () => void;
  onSave: (p: Product) => void; onDelete: (id: string) => void;
}) {
  const isNew = !product;
  const blank = (): Product => ({
    id: uid(), name: '', shortDescription: '', description: '', price: 0, category: '',
    testimonials: [], onboardingSteps: [], active: true,
    createdAt: new Date().toISOString(),
  });
  const [form, setForm]           = useState<Product>(product ?? blank());
  const [tab, setTab]             = useState<'details' | 'syllabus' | 'steps' | 'testimonials'>('details');
  const [confirmDelete, setDel]   = useState(false);

  const TABS = [
    { id: 'details',      label: 'פרטים'       },
    { id: 'syllabus',     label: 'סילבוס'      },
    { id: 'steps',        label: 'קליטה'       },
    { id: 'testimonials', label: 'ממליצים'     },
  ] as const;

  const open = !!product || isNew;

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, imageDataUrl: ev.target?.result as string }));
    reader.readAsDataURL(file);
  }

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'מוצר חדש' : form.name} wide>
      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b pb-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="space-y-4">
          <div className="flex gap-4 items-start">
            <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0 relative">
              {form.imageDataUrl ? <img src={form.imageDataUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl opacity-40">📦</span>}
              <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 bg-black/30 flex items-center justify-center text-white text-xs rounded-xl transition-opacity">
                📷 שנה
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            </div>
            <div className="flex-1 space-y-2">
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="שם המוצר *" />
              <Input value={form.shortDescription} onChange={v => setForm(f => ({ ...f, shortDescription: v }))} placeholder="תיאור קצר" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={String(form.price)} onChange={v => setForm(f => ({ ...f, price: Number(v) || 0 }))} type="number" placeholder="מחיר (₪)" />
                <Input value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="קטגוריה" />
              </div>
            </div>
          </div>
          <div>
            <label className="field-label">תיאור מלא</label>
            <Textarea value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="תיאור מפורט של המוצר..." rows={4} />
          </div>
          <Toggle checked={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} label="מוצר פעיל (יופיע בבחירת לידים)" />
        </div>
      )}

      {tab === 'syllabus' && (
        <div className="space-y-3">
          <label className="field-label">סילבוס הקורס</label>
          <Textarea value={form.syllabusText ?? ''} onChange={v => setForm(f => ({ ...f, syllabusText: v }))} placeholder="פרט את נושאי הקורס/התהליך..." rows={10} />
          <div>
            <label className="field-label">חוזה / הסכם שירות</label>
            <Textarea value={form.contractText ?? ''} onChange={v => setForm(f => ({ ...f, contractText: v }))} placeholder="טקסט החוזה לחתימה..." rows={6} />
          </div>
        </div>
      )}

      {tab === 'steps' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">שלבי קליטת הלקוח — יופיעו בטבלת "קליטת לקוח"</p>
          <StepsEditor steps={form.onboardingSteps} onChange={steps => setForm(f => ({ ...f, onboardingSteps: steps }))} />
        </div>
      )}

      {tab === 'testimonials' && (
        <TestimonialsEditor items={form.testimonials} onChange={items => setForm(f => ({ ...f, testimonials: items }))} />
      )}

      <div className="flex justify-between items-center mt-6 pt-4 border-t">
        <div>
          {!isNew && <Btn variant="danger" size="sm" onClick={() => setDel(true)}>🗑 מחק מוצר</Btn>}
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={onClose}>ביטול</Btn>
          <Btn onClick={() => { onSave(form); onClose(); }} disabled={!form.name.trim()}>שמור מוצר</Btn>
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} message={`למחוק את המוצר "${form.name}"?`}
        onConfirm={() => { onDelete(form.id); onClose(); }} onCancel={() => setDel(false)} />
    </Modal>
  );
}

// ─── Products View ────────────────────────────────────────────────────────────

export default function ProductsView({
  state, onSaveProduct, onDeleteProduct,
}: {
  state: AppState;
  onSaveProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Product | 'new' | null>(null);
  const currentUser = state.users.find(u => u.id === state.currentUserId)!;
  const canEdit     = currentUser.role === 'admin';

  const modalProduct: Product | null = selected === 'new' ? null : selected;
  const showModal = selected !== null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">📦 מוצרים</h1>
        {canEdit && <Btn onClick={() => setSelected('new')}>+ מוצר חדש</Btn>}
      </div>

      {state.products.length === 0 ? (
        <EmptyState icon="📦" title="אין מוצרים עדיין" subtitle="הוסף את המוצר הראשון שלך"
          action={canEdit ? { label: '+ מוצר חדש', onClick: () => setSelected('new') } : undefined} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {state.products.map(p => (
            <ProductCard key={p.id} product={p} onClick={() => setSelected(p)} />
          ))}
          {canEdit && (
            <button onClick={() => setSelected('new')}
              className="rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 flex flex-col items-center justify-center min-h-48 transition-colors text-gray-400 hover:text-blue-500">
              <span className="text-3xl mb-2">+</span>
              <span className="text-sm font-medium">הוסף מוצר</span>
            </button>
          )}
        </div>
      )}

      {showModal && (
        <ProductDetailModal
          product={modalProduct}
          onClose={() => setSelected(null)}
          onSave={onSaveProduct}
          onDelete={onDeleteProduct}
        />
      )}
    </div>
  );
}
