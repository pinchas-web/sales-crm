/**
 * DesignEditor — עורך עיצוב ויזואלי חי (מוטמע בלשונית הגדרות > עיצוב)
 * משנה CSS Custom Properties מ-brand.css בזמן אמת.
 * שמור ב-localStorage. לא נוגע בקוד React אחר.
 */
import { useState, useEffect, useCallback } from 'react';

// ─── Color utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb[0] * (1 - amount), rgb[1] * (1 - amount), rgb[2] * (1 - amount));
}

function lighten(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb[0] * opacity + 255 * (1 - opacity),
    rgb[1] * opacity + 255 * (1 - opacity),
    rgb[2] * opacity + 255 * (1 - opacity),
  );
}

function readVar(key: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim() || '#000000';
}

function writeVar(key: string, value: string) {
  document.documentElement.style.setProperty(key, value);
}

function clearVar(key: string) {
  document.documentElement.style.removeProperty(key);
}

// ─── Design variables definition ──────────────────────────────────────────────

interface DesignVar {
  key: string;
  label: string;
  group: 'brand' | 'layout' | 'text';
  hint?: string;
}

const DESIGN_VARS: DesignVar[] = [
  { key: '--c-primary',     label: 'צבע ראשי',         group: 'brand',  hint: 'כפתורים, header, קישורים' },
  { key: '--c-gold',        label: 'צבע מבטא',          group: 'brand',  hint: 'focus, hover, זהב' },
  { key: '--c-bg',          label: 'רקע עמוד',           group: 'layout', hint: 'הרקע הכללי' },
  { key: '--c-surface',     label: 'כרטיסים / טפסים',    group: 'layout', hint: 'רקע לוחות ומודלים' },
  { key: '--c-border',      label: 'גבולות',              group: 'layout', hint: 'קווי הפרדה' },
  { key: '--c-text',        label: 'טקסט ראשי',           group: 'text',   hint: 'כותרות ותוכן' },
  { key: '--c-text-muted',  label: 'טקסט משני',           group: 'text',   hint: 'תוויות ותיאורים' },
];

const GROUPS: { id: DesignVar['group']; label: string; icon: string }[] = [
  { id: 'brand',  label: 'צבעי מותג',  icon: '🎨' },
  { id: 'layout', label: 'מבנה ורקע',  icon: '🗂️' },
  { id: 'text',   label: 'טקסט',       icon: '✏️' },
];

// ─── Preset themes ────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  dot: string;
  vars: Record<string, string>;
}

const PRESETS: Preset[] = [
  {
    id: 'brand', label: 'מותג מקורי', dot: '#C7263A',
    vars: { '--c-primary': '#C7263A', '--c-gold': '#D2AB62', '--c-bg': '#F7F5F1', '--c-surface': '#FFFFFF', '--c-border': '#E5DDD4', '--c-text': '#1C1815', '--c-text-muted': '#6B6057' },
  },
  {
    id: 'blue', label: 'כחול מקצועי', dot: '#2563EB',
    vars: { '--c-primary': '#2563EB', '--c-gold': '#7C3AED', '--c-bg': '#EEF2FF', '--c-surface': '#FFFFFF', '--c-border': '#DBEAFE', '--c-text': '#0F172A', '--c-text-muted': '#475569' },
  },
  {
    id: 'green', label: 'ירוק טבע', dot: '#16A34A',
    vars: { '--c-primary': '#16A34A', '--c-gold': '#CA8A04', '--c-bg': '#F0FDF4', '--c-surface': '#FFFFFF', '--c-border': '#BBFFD8', '--c-text': '#14532D', '--c-text-muted': '#4B7C5E' },
  },
  {
    id: 'dark', label: 'לילה כהה', dot: '#E95C71',
    vars: { '--c-primary': '#E95C71', '--c-gold': '#F0C060', '--c-bg': '#18191B', '--c-surface': '#23252B', '--c-border': '#343640', '--c-text': '#F0EDE8', '--c-text-muted': '#9B9698' },
  },
  {
    id: 'purple', label: 'סגול יוקרה', dot: '#7E22CE',
    vars: { '--c-primary': '#7E22CE', '--c-gold': '#D97706', '--c-bg': '#FAF5FF', '--c-surface': '#FFFFFF', '--c-border': '#E9D5FF', '--c-text': '#1E0B38', '--c-text-muted': '#6B21A8' },
  },
];

// ─── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'crm_design_overrides_v1';

export function loadSavedDesign() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, string>;
    Object.entries(saved).forEach(([k, v]) => writeVar(k, v));
  } catch { /* ignore */ }
}

// ─── Auto-derive related vars ─────────────────────────────────────────────────

function applyWithDerived(key: string, value: string) {
  writeVar(key, value);
  if (key === '--c-primary') {
    writeVar('--c-primary-dark',   darken(value, 0.18));
    writeVar('--c-primary-deeper', darken(value, 0.34));
    writeVar('--c-primary-light',  lighten(value, 0.40));
    writeVar('--c-primary-xs',     lighten(value, 0.08));
  }
  if (key === '--c-gold') {
    writeVar('--c-gold-dark',  darken(value, 0.20));
    writeVar('--c-gold-light', lighten(value, 0.55));
    writeVar('--c-gold-xs',    lighten(value, 0.10));
  }
}

function applyPreset(preset: Preset) {
  Object.entries(preset.vars).forEach(([k, v]) => applyWithDerived(k, v));
}

// ─── ColorRow ─────────────────────────────────────────────────────────────────

function ColorRow({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
}) {
  const [hexInput, setHexInput] = useState(value);
  useEffect(() => { setHexInput(value); }, [value]);

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <label className="relative flex-shrink-0 cursor-pointer">
        <div className="w-9 h-9 rounded-lg border-2 shadow-sm"
          style={{ background: /^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : value, borderColor: 'var(--c-border)' }} />
        <input type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : '#000000'}
          onChange={e => { setHexInput(e.target.value); onChange(e.target.value); }}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-lg" />
      </label>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight text-gray-800">{label}</p>
        {hint && <p className="text-[10px] leading-tight mt-0.5 text-gray-400">{hint}</p>}
      </div>
      <input type="text" value={hexInput}
        onChange={e => { setHexInput(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) onChange(e.target.value); }}
        maxLength={7} placeholder="#RRGGBB"
        className="w-20 text-xs px-2 py-1.5 rounded-md border font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
        style={{ borderColor: /^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput + '88' : undefined }}
        onFocus={e => e.target.select()} />
    </div>
  );
}

// ─── DesignEditor (inline, embedded in Settings) ──────────────────────────────

export default function DesignEditor() {
  const [colors, setColors]       = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const readAllVars = useCallback((): Record<string, string> => {
    const result: Record<string, string> = {};
    DESIGN_VARS.forEach(v => { result[v.key] = readVar(v.key); });
    return result;
  }, []);

  useEffect(() => {
    loadSavedDesign();
    setTimeout(() => setColors(readAllVars()), 50);
  }, [readAllVars]);

  const handleChange = useCallback((key: string, value: string) => {
    applyWithDerived(key, value);
    setColors(prev => ({ ...prev, [key]: value }));
    setSaveState('idle');
    setActivePreset(null);
  }, []);

  const handlePreset = useCallback((preset: Preset) => {
    applyPreset(preset);
    const next: Record<string, string> = {};
    DESIGN_VARS.forEach(v => { next[v.key] = preset.vars[v.key] ?? readVar(v.key); });
    setColors(next);
    setSaveState('idle');
    setActivePreset(preset.id);
  }, []);

  const handleSave = useCallback(() => {
    const allVars: Record<string, string> = {};
    DESIGN_VARS.forEach(v => { allVars[v.key] = colors[v.key] ?? readVar(v.key); });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allVars));
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2200);
  }, [colors]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    DESIGN_VARS.forEach(v => clearVar(v.key));
    ['--c-primary-dark','--c-primary-deeper','--c-primary-light','--c-primary-xs',
     '--c-gold-dark','--c-gold-light','--c-gold-xs'].forEach(clearVar);
    setTimeout(() => { setColors(readAllVars()); setActivePreset(null); setSaveState('idle'); }, 30);
  }, [readAllVars]);

  const primaryColor = colors['--c-primary'] || '#C7263A';

  return (
    <div className="space-y-5" dir="rtl">
      {/* Preset themes */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">ערכות נושא מוכנות</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => handlePreset(p)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
              style={{
                border: `1.5px solid ${activePreset === p.id ? p.dot : '#E5DDD4'}`,
                background: activePreset === p.id ? p.dot + '18' : '#fff',
                color: activePreset === p.id ? p.dot : '#6B6057',
              }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.dot }} />
              {p.label}
              {activePreset === p.id && <span className="text-[9px]">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Color variables by group */}
      {GROUPS.map(group => {
        const vars = DESIGN_VARS.filter(v => v.group === group.id);
        return (
          <div key={group.id}>
            <div className="flex items-center gap-1.5 pb-1 border-b border-gray-200 mb-1">
              <span className="text-sm">{group.icon}</span>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{group.label}</span>
            </div>
            {vars.map(v => (
              <ColorRow key={v.key} label={v.label} hint={v.hint}
                value={colors[v.key] || '#000000'}
                onChange={val => handleChange(v.key, val)} />
            ))}
          </div>
        );
      })}

      {/* Preview swatch */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">תצוגה מקדימה</p>
        <div className="flex h-7 rounded-xl overflow-hidden border border-gray-200">
          {['--c-primary','--c-gold','--c-bg','--c-surface','--c-border','--c-text'].map(k => (
            <div key={k} className="flex-1" style={{ background: colors[k] || readVar(k) }} title={k} />
          ))}
        </div>
      </div>

      {/* Save / Reset */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{
            background: saveState === 'saved'
              ? '#217A4E'
              : `linear-gradient(to left, ${darken(primaryColor, 0.18)}, ${primaryColor})`,
          }}>
          {saveState === 'saved' ? '✓ נשמר!' : '💾 שמור עיצוב'}
        </button>
        <button onClick={handleReset}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-500 bg-white hover:border-gray-400 transition-colors">
          ↺ איפוס
        </button>
      </div>
    </div>
  );
}
