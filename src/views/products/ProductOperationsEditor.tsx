import { useMemo, useState } from 'react';
import type {
  Product,
  ProductInclusion,
  ProductInclusionCategory,
  ProductLifecyclePhase,
  ProductLifecycleStep,
  ProductMetricCadence,
  ProductMetricDirection,
  ProductOperationsPlan,
  ProductRiskRule,
  ProductRiskSignal,
  ProductSuccessMetric,
  ProductTouchpoint,
  ProductTouchpointTiming,
  ProductTouchpointType,
  UserRole,
} from '../../types';
import { uid } from '../../utils';
import { Btn, Input, Textarea, Toggle } from '../../ui';

export function createEmptyProductOperationsPlan(): ProductOperationsPlan {
  return {
    durationWeeks: undefined,
    internalOwnerRole: 'admin',
    internalNotes: '',
    inclusions: [],
    lifecycleSteps: [],
    touchpoints: [],
    successMetrics: [],
    riskRules: [],
    retention: {
      checkInFrequencyDays: 14,
      renewalLeadDays: 30,
      askTestimonialOnSuccess: true,
      askReferralOnSuccess: false,
      completionReviewRequired: true,
      notes: '',
    },
  };
}

function normalizePlan(plan?: ProductOperationsPlan): ProductOperationsPlan {
  const empty = createEmptyProductOperationsPlan();
  return {
    ...empty,
    ...plan,
    inclusions: plan?.inclusions ?? [],
    lifecycleSteps: plan?.lifecycleSteps ?? [],
    touchpoints: plan?.touchpoints ?? [],
    successMetrics: plan?.successMetrics ?? [],
    riskRules: plan?.riskRules ?? [],
    retention: { ...empty.retention, ...(plan?.retention ?? {}) },
  };
}

const inclusionCategories: { value: ProductInclusionCategory; label: string }[] = [
  { value: 'session', label: 'מפגש / פגישה' },
  { value: 'content', label: 'תוכן / חומר' },
  { value: 'support', label: 'ליווי / תמיכה' },
  { value: 'community', label: 'קהילה / קבוצה' },
  { value: 'review', label: 'בדיקה / בקרה' },
  { value: 'other', label: 'אחר' },
];

const phaseMeta: Record<ProductLifecyclePhase, { label: string; color: string }> = {
  onboarding: { label: 'קליטה', color: 'bg-blue-100 text-blue-700' },
  delivery: { label: 'אספקה / תהליך', color: 'bg-indigo-100 text-indigo-700' },
  retention: { label: 'שימור וקשר', color: 'bg-amber-100 text-amber-700' },
  completion: { label: 'סיום והמשך', color: 'bg-green-100 text-green-700' },
};

const touchpointTypes: { value: ProductTouchpointType; label: string }[] = [
  { value: 'call', label: '☎️ שיחה' },
  { value: 'whatsapp', label: '💬 וואצאפ' },
  { value: 'email', label: '📧 מייל' },
  { value: 'meeting', label: '📅 פגישה' },
  { value: 'survey', label: '📝 שאלון' },
  { value: 'task', label: '✅ משימה' },
];

const touchpointTiming: { value: ProductTouchpointTiming; label: string }[] = [
  { value: 'days_after_start', label: 'ימים מתחילת התהליך' },
  { value: 'days_before_end', label: 'ימים לפני סיום' },
  { value: 'recurring', label: 'פעולה מחזורית' },
];

const riskSignals: { value: ProductRiskSignal; label: string; thresholdLabel: string }[] = [
  { value: 'no_contact', label: 'אין קשר עם הלקוח', thresholdLabel: 'מספר ימים' },
  { value: 'missed_tasks', label: 'משימות שלא בוצעו', thresholdLabel: 'מספר משימות' },
  { value: 'missed_meetings', label: 'מפגשים שהוחמצו', thresholdLabel: 'מספר מפגשים' },
  { value: 'payment_overdue', label: 'תשלום באיחור', thresholdLabel: 'מספר ימים' },
  { value: 'health_score', label: 'Health Score נמוך', thresholdLabel: 'מתחת לציון' },
  { value: 'manual', label: 'סימון ידני', thresholdLabel: 'ללא סף' },
];

const metricCadences: { value: ProductMetricCadence; label: string }[] = [
  { value: 'start_end', label: 'תחילת וסיום התהליך' },
  { value: 'weekly', label: 'שבועי' },
  { value: 'monthly', label: 'חודשי' },
  { value: 'manual', label: 'לפי צורך' },
];

const metricDirections: { value: ProductMetricDirection; label: string }[] = [
  { value: 'increase', label: 'לעלות' },
  { value: 'decrease', label: 'לרדת' },
  { value: 'maintain', label: 'לשמר' },
];

function Select({ value, onChange, options, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${className}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Section({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b">
        <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MoveButtons({ onUp, onDown, upDisabled, downDisabled }: {
  onUp: () => void; onDown: () => void; upDisabled: boolean; downDisabled: boolean;
}) {
  return (
    <div className="flex gap-1 shrink-0">
      <Btn size="xs" variant="ghost" onClick={onUp} disabled={upDisabled}>↑</Btn>
      <Btn size="xs" variant="ghost" onClick={onDown} disabled={downDisabled}>↓</Btn>
    </div>
  );
}

function InclusionsEditor({ items, onChange }: {
  items: ProductInclusion[];
  onChange: (items: ProductInclusion[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductInclusionCategory>('session');
  const [quantity, setQuantity] = useState('');
  const sorted = [...items].sort((a, b) => a.order - b.order);

  function add() {
    if (!title.trim()) return;
    onChange([...items, {
      id: uid(), title: title.trim(), description: description.trim() || undefined,
      category, quantity: quantity ? Number(quantity) || undefined : undefined, order: items.length,
    }]);
    setTitle(''); setDescription(''); setQuantity('');
  }

  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex(x => x.id === id);
    const other = idx + dir;
    if (idx < 0 || other < 0 || other >= sorted.length) return;
    const a = sorted[idx]; const b = sorted[other];
    onChange(items.map(x => x.id === a.id ? { ...x, order: b.order } : x.id === b.id ? { ...x, order: a.order } : x));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-sm text-gray-400 text-center py-5">עדיין לא הוגדר מה המוצר כולל.</p>}
        {sorted.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3 rounded-xl border p-3">
            <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{inclusionCategories.find(x => x.value === item.category)?.label}</span>
                {item.quantity != null && <span className="text-[11px] text-gray-500">× {item.quantity}</span>}
              </div>
              {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
            </div>
            <MoveButtons onUp={() => move(item.id, -1)} onDown={() => move(item.id, 1)} upDisabled={i === 0} downDisabled={i === sorted.length - 1} />
            <Btn size="xs" variant="danger" onClick={() => onChange(items.filter(x => x.id !== item.id))}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed rounded-xl p-3 bg-gray-50 space-y-2">
        <p className="text-xs font-semibold text-gray-600">+ מה המוצר כולל?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input value={title} onChange={setTitle} placeholder="לדוגמה: 12 מפגשים אישיים" />
          <Select value={category} onChange={v => setCategory(v as ProductInclusionCategory)} options={inclusionCategories} />
          <Input value={quantity} onChange={setQuantity} type="number" placeholder="כמות (אופציונלי)" />
          <Input value={description} onChange={setDescription} placeholder="הערה / פירוט" />
        </div>
        <Btn size="sm" onClick={add} disabled={!title.trim()}>+ הוסף למוצר</Btn>
      </div>
    </div>
  );
}

function LifecycleEditor({ items, onChange }: {
  items: ProductLifecycleStep[];
  onChange: (items: ProductLifecycleStep[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<ProductLifecyclePhase>('delivery');
  const [timingLabel, setTimingLabel] = useState('');
  const [required, setRequired] = useState(true);
  const sorted = [...items].sort((a, b) => a.order - b.order);

  function add() {
    if (!title.trim()) return;
    onChange([...items, {
      id: uid(), title: title.trim(), description: description.trim() || undefined,
      phase, timingLabel: timingLabel.trim() || undefined, required, order: items.length,
    }]);
    setTitle(''); setDescription(''); setTimingLabel(''); setRequired(true);
  }

  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex(x => x.id === id);
    const other = idx + dir;
    if (idx < 0 || other < 0 || other >= sorted.length) return;
    const a = sorted[idx]; const b = sorted[other];
    onChange(items.map(x => x.id === a.id ? { ...x, order: b.order } : x.id === b.id ? { ...x, order: a.order } : x));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-sm text-gray-400 text-center py-5">אין עדיין שלבי מסע לקוח.</p>}
        {sorted.map((item, i) => (
          <div key={item.id} className="flex items-start gap-3 rounded-xl border p-3">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${phaseMeta[item.phase].color}`}>{phaseMeta[item.phase].label}</span>
                {item.required && <span className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full">חובה</span>}
                {item.timingLabel && <span className="text-[11px] text-gray-500">🕐 {item.timingLabel}</span>}
              </div>
              {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
            </div>
            <MoveButtons onUp={() => move(item.id, -1)} onDown={() => move(item.id, 1)} upDisabled={i === 0} downDisabled={i === sorted.length - 1} />
            <Btn size="xs" variant="danger" onClick={() => onChange(items.filter(x => x.id !== item.id))}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed rounded-xl p-3 bg-gray-50 space-y-2">
        <p className="text-xs font-semibold text-gray-600">+ שלב במסע הלקוח</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input value={title} onChange={setTitle} placeholder="שם השלב" />
          <Select value={phase} onChange={v => setPhase(v as ProductLifecyclePhase)} options={Object.entries(phaseMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
          <Input value={timingLabel} onChange={setTimingLabel} placeholder="מתי? לדוגמה: שבוע 4" />
          <Input value={description} onChange={setDescription} placeholder="מה צריך לקרות בשלב הזה?" />
        </div>
        <Toggle checked={required} onChange={setRequired} label="שלב חובה" />
        <Btn size="sm" onClick={add} disabled={!title.trim()}>+ הוסף שלב</Btn>
      </div>
    </div>
  );
}

function TouchpointsEditor({ items, onChange }: {
  items: ProductTouchpoint[];
  onChange: (items: ProductTouchpoint[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProductTouchpointType>('call');
  const [timing, setTiming] = useState<ProductTouchpointTiming>('recurring');
  const [amount, setAmount] = useState('14');

  function add() {
    if (!title.trim()) return;
    const n = Number(amount) || undefined;
    onChange([...items, {
      id: uid(), title: title.trim(), description: description.trim() || undefined, type, timing,
      dayOffset: timing === 'recurring' ? undefined : n,
      intervalDays: timing === 'recurring' ? n : undefined,
      active: true,
    }]);
    setTitle(''); setDescription('');
  }

  function timingText(item: ProductTouchpoint) {
    if (item.timing === 'recurring') return `כל ${item.intervalDays ?? '?'} ימים`;
    if (item.timing === 'days_before_end') return `${item.dayOffset ?? '?'} ימים לפני הסיום`;
    return `${item.dayOffset ?? '?'} ימים מתחילת התהליך`;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-gray-400 text-center py-5">לא הוגדרו נקודות קשר יזומות.</p>}
        {items.map(item => (
          <div key={item.id} className={`rounded-xl border p-3 flex items-center gap-3 ${item.active ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
            <div className="flex-1">
              <div className="flex gap-2 items-center flex-wrap">
                <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{touchpointTypes.find(x => x.value === item.type)?.label}</span>
                <span className="text-[11px] text-gray-500">{timingText(item)}</span>
              </div>
              {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
            </div>
            <Toggle checked={item.active} onChange={active => onChange(items.map(x => x.id === item.id ? { ...x, active } : x))} label="פעיל" />
            <Btn size="xs" variant="danger" onClick={() => onChange(items.filter(x => x.id !== item.id))}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed rounded-xl p-3 bg-gray-50 space-y-2">
        <p className="text-xs font-semibold text-gray-600">+ נקודת קשר / שמירה על קשר</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input value={title} onChange={setTitle} placeholder="לדוגמה: שיחת מצב אישית" />
          <Select value={type} onChange={v => setType(v as ProductTouchpointType)} options={touchpointTypes} />
          <Select value={timing} onChange={v => setTiming(v as ProductTouchpointTiming)} options={touchpointTiming} />
          <Input value={amount} onChange={setAmount} type="number" placeholder={timing === 'recurring' ? 'כל כמה ימים?' : 'מספר ימים'} />
          <div className="sm:col-span-2"><Input value={description} onChange={setDescription} placeholder="מה מטרת הקשר ומה צריך לעשות?" /></div>
        </div>
        <Btn size="sm" onClick={add} disabled={!title.trim()}>+ הוסף נקודת קשר</Btn>
      </div>
    </div>
  );
}

function MetricsEditor({ items, onChange }: {
  items: ProductSuccessMetric[];
  onChange: (items: ProductSuccessMetric[]) => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [direction, setDirection] = useState<ProductMetricDirection>('increase');
  const [cadence, setCadence] = useState<ProductMetricCadence>('start_end');

  function add() {
    if (!name.trim()) return;
    onChange([...items, {
      id: uid(), name: name.trim(), unit: unit.trim() || undefined,
      defaultTarget: target ? Number(target) || undefined : undefined,
      direction, cadence, order: items.length,
    }]);
    setName(''); setUnit(''); setTarget('');
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-gray-400 text-center py-5">לא הוגדרו עדיין מדדי הצלחה למוצר.</p>}
        {[...items].sort((a, b) => a.order - b.order).map(item => (
          <div key={item.id} className="rounded-xl border p-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">🎯 {item.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {metricDirections.find(x => x.value === item.direction)?.label} · {metricCadences.find(x => x.value === item.cadence)?.label}
                {item.defaultTarget != null ? ` · יעד ברירת מחדל: ${item.defaultTarget}${item.unit ? ` ${item.unit}` : ''}` : ''}
              </p>
            </div>
            <Btn size="xs" variant="danger" onClick={() => onChange(items.filter(x => x.id !== item.id))}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed rounded-xl p-3 bg-gray-50 space-y-2">
        <p className="text-xs font-semibold text-gray-600">+ מדד הצלחה</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input value={name} onChange={setName} placeholder="לדוגמה: הכנסה חודשית" />
          <Input value={unit} onChange={setUnit} placeholder="יחידה: ₪ / לקוחות / %" />
          <Select value={direction} onChange={v => setDirection(v as ProductMetricDirection)} options={metricDirections} />
          <Select value={cadence} onChange={v => setCadence(v as ProductMetricCadence)} options={metricCadences} />
          <Input value={target} onChange={setTarget} type="number" placeholder="יעד ברירת מחדל (אופציונלי)" />
        </div>
        <Btn size="sm" onClick={add} disabled={!name.trim()}>+ הוסף מדד</Btn>
      </div>
    </div>
  );
}

function RiskRulesEditor({ items, onChange }: {
  items: ProductRiskRule[];
  onChange: (items: ProductRiskRule[]) => void;
}) {
  const [name, setName] = useState('');
  const [signal, setSignal] = useState<ProductRiskSignal>('no_contact');
  const [threshold, setThreshold] = useState('14');
  const [actionText, setActionText] = useState('צור משימת מעקב לאחראי הלקוח');
  const selectedSignal = riskSignals.find(x => x.value === signal)!;

  function add() {
    if (!name.trim() || !actionText.trim()) return;
    onChange([...items, {
      id: uid(), name: name.trim(), signal,
      threshold: signal === 'manual' ? undefined : Number(threshold) || undefined,
      actionText: actionText.trim(), active: true,
    }]);
    setName('');
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-gray-400 text-center py-5">אין כללי סיכון. המערכת לא תדע עדיין מתי לקוח דורש תשומת לב.</p>}
        {items.map(item => (
          <div key={item.id} className={`rounded-xl border p-3 flex items-center gap-3 ${item.active ? '' : 'opacity-60 bg-gray-50'}`}>
            <div className="flex-1">
              <div className="flex gap-2 items-center flex-wrap">
                <p className="text-sm font-semibold text-gray-800">⚠️ {item.name}</p>
                <span className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{riskSignals.find(x => x.value === item.signal)?.label}</span>
                {item.threshold != null && <span className="text-[11px] text-gray-500">סף: {item.threshold}</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">פעולה: {item.actionText}</p>
            </div>
            <Toggle checked={item.active} onChange={active => onChange(items.map(x => x.id === item.id ? { ...x, active } : x))} label="פעיל" />
            <Btn size="xs" variant="danger" onClick={() => onChange(items.filter(x => x.id !== item.id))}>✕</Btn>
          </div>
        ))}
      </div>
      <div className="border border-dashed rounded-xl p-3 bg-gray-50 space-y-2">
        <p className="text-xs font-semibold text-gray-600">+ כלל זיהוי סיכון</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input value={name} onChange={setName} placeholder="לדוגמה: אין קשר שבועיים" />
          <Select value={signal} onChange={v => setSignal(v as ProductRiskSignal)} options={riskSignals.map(x => ({ value: x.value, label: x.label }))} />
          {signal !== 'manual' && <Input value={threshold} onChange={setThreshold} type="number" placeholder={selectedSignal.thresholdLabel} />}
          <Input value={actionText} onChange={setActionText} placeholder="מה עושים כשהכלל מתקיים?" />
        </div>
        <Btn size="sm" onClick={add} disabled={!name.trim() || !actionText.trim()}>+ הוסף כלל</Btn>
      </div>
    </div>
  );
}

function RetentionEditor({ plan, products, currentProductId, onChange }: {
  plan: ProductOperationsPlan;
  products: Product[];
  currentProductId: string;
  onChange: (plan: ProductOperationsPlan) => void;
}) {
  const r = plan.retention;
  const productOptions = useMemo(() => [
    { value: '', label: 'ללא מוצר המשך מוגדר' },
    ...products.filter(p => p.id !== currentProductId && p.active).map(p => ({ value: p.id, label: p.name })),
  ], [products, currentProductId]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="field-label">תדירות Check-in קבועה (ימים)</label>
          <Input value={r.checkInFrequencyDays ? String(r.checkInFrequencyDays) : ''}
            onChange={v => onChange({ ...plan, retention: { ...r, checkInFrequencyDays: Number(v) || undefined } })}
            type="number" placeholder="14" />
        </div>
        <div>
          <label className="field-label">כמה ימים לפני סיום להתחיל חידוש?</label>
          <Input value={r.renewalLeadDays ? String(r.renewalLeadDays) : ''}
            onChange={v => onChange({ ...plan, retention: { ...r, renewalLeadDays: Number(v) || undefined } })}
            type="number" placeholder="30" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">מוצר המשך / Upsell מומלץ</label>
          <Select value={r.upsellProductId ?? ''}
            onChange={v => onChange({ ...plan, retention: { ...r, upsellProductId: v || undefined } })}
            options={productOptions} className="w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-green-50 border border-green-100 p-3">
        <Toggle checked={r.completionReviewRequired}
          onChange={v => onChange({ ...plan, retention: { ...r, completionReviewRequired: v } })}
          label="חובה לקיים שיחת סיכום" />
        <Toggle checked={r.askTestimonialOnSuccess}
          onChange={v => onChange({ ...plan, retention: { ...r, askTestimonialOnSuccess: v } })}
          label="לבקש המלצה בהצלחה" />
        <Toggle checked={r.askReferralOnSuccess}
          onChange={v => onChange({ ...plan, retention: { ...r, askReferralOnSuccess: v } })}
          label="לבקש הפניה / חבר מביא חבר" />
      </div>
      <div>
        <label className="field-label">נהלי שימור, סיום וחידוש</label>
        <Textarea value={r.notes ?? ''}
          onChange={v => onChange({ ...plan, retention: { ...r, notes: v } })}
          placeholder="מה הצוות צריך לעשות כדי לשמור על קשר, למנוע נשירה, לסכם את התהליך ולהציע המשך?"
          rows={5} />
      </div>
    </div>
  );
}

export default function ProductOperationsEditor({
  productId, plan: rawPlan, products, onChange,
}: {
  productId: string;
  plan?: ProductOperationsPlan;
  products: Product[];
  onChange: (plan: ProductOperationsPlan) => void;
}) {
  const plan = normalizePlan(rawPlan);

  function update<K extends keyof ProductOperationsPlan>(key: K, value: ProductOperationsPlan[K]) {
    onChange({ ...plan, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🧭</span>
          <div>
            <h3 className="font-bold text-purple-900">ניהול פנימי של המוצר</h3>
            <p className="text-sm text-purple-700 mt-1">
              כאן מגדירים את תבנית ההפעלה של המוצר. בשלב הבא המערכת תעתיק את ההגדרות האלה למסע של כל לקוח שרוכש את המוצר ותיצור משימות, נקודות קשר והתראות בהתאם.
            </p>
          </div>
        </div>
      </div>

      <Section title="הגדרות תפעול בסיסיות" subtitle="משך התהליך ומי בעל הבית הפנימי של המוצר">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">משך התוכנית בשבועות</label>
            <Input value={plan.durationWeeks ? String(plan.durationWeeks) : ''}
              onChange={v => update('durationWeeks', Number(v) || undefined)} type="number" placeholder="לדוגמה 24" />
          </div>
          <div>
            <label className="field-label">אחריות ברירת מחדל</label>
            <Select value={plan.internalOwnerRole ?? 'admin'}
              onChange={v => update('internalOwnerRole', v as UserRole)}
              options={[{ value: 'admin', label: 'מנהל' }, { value: 'salesperson', label: 'נציג' }]}
              className="w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">הערות פנימיות על הפעלת המוצר</label>
            <Textarea value={plan.internalNotes ?? ''} onChange={v => update('internalNotes', v)}
              placeholder="עקרונות עבודה, דגשים לצוות, דברים שחייבים לדעת לפני שמפעילים לקוח במוצר..." rows={4} />
          </div>
        </div>
      </Section>

      <Section title="📦 מה המוצר כולל" subtitle="התחייבות האספקה: מפגשים, חומרים, תמיכה, קהילה וכל רכיב שהלקוח אמור לקבל">
        <InclusionsEditor items={plan.inclusions} onChange={v => update('inclusions', v)} />
      </Section>

      <Section title="🛤️ מסע הלקוח בתוך המוצר" subtitle="כל מה שצריך לקרות מהקליטה ועד הסיום — לא רק onboarding">
        <LifecycleEditor items={plan.lifecycleSteps} onChange={v => update('lifecycleSteps', v)} />
      </Section>

      <Section title="🤝 נקודות קשר ושימור" subtitle="מגעים יזומים שהצוות חייב לבצע כדי שהלקוח לא ייעלם בין המפגשים">
        <TouchpointsEditor items={plan.touchpoints} onChange={v => update('touchpoints', v)} />
      </Section>

      <Section title="🎯 מדדי הצלחה" subtitle="איך נדע שהמוצר באמת עובד עבור הלקוח ומה נרצה למדוד בתחילת הדרך ולאורך התהליך">
        <MetricsEditor items={plan.successMetrics} onChange={v => update('successMetrics', v)} />
      </Section>

      <Section title="🚨 זיהוי לקוח בסיכון" subtitle="כללים שבעתיד יפעילו Health Score, התראות ומשימות אוטומטיות">
        <RiskRulesEditor items={plan.riskRules} onChange={v => update('riskRules', v)} />
      </Section>

      <Section title="♻️ שימור, סיום והמשך" subtitle="איך מסיימים נכון, מבקשים המלצה ומייצרים חידוש או מוצר המשך">
        <RetentionEditor plan={plan} products={products} currentProductId={productId} onChange={onChange} />
      </Section>
    </div>
  );
}
