/**
 * DesignEditor — עורך עיצוב ויזואלי חי
 * משנה CSS Custom Properties מ-brand.css בזמן אמת.
 * שמור ב-localStorage. לא נוגע בקוד React אחר.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Color utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** הכהה את הצבע ב-amount (0–1) */
function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb[0] * (1 - amount), rgb[1] * (1 - amount), rgb[2] * (1 - amount));
}

/** הבהר — ערבב עם לבן לפי opacity */
function lighten(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb[0] * opacity + 255 * (1 - opacity),
    rgb[1] * opacity + 255 * (1 - opacity),
    rgb[2] * opacity + 255 * (1 - opacity),
  );
}

/** קרא CSS variable מ-:root */
function readVar(key: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim() || '#000000';
}

/** כתוב CSS variable ל-:root inline style (גובר על stylesheet) */
function writeVar(key: string, value: string) {
  document.documentElement.style.setProperty(key, value);
}

/** הסר override מ-inline style (חוזר לברירת מחדל של brand.css) */
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
  // Brand
  { key: '--c-primary',     label: 'צבע ראשי',         group: 'brand', hint: 'כפתורים, header, קישורים' },
  { key: '--c-gold',        label: 'צבע מבטא',          group: 'brand', hint: 'focus, hover, זהב' },
  // Layout
  { key: '--c-bg',          label: 'רקע עמוד',           group: 'layout', hint: 'הרקע הכללי' },
  { key: '--c-surface',     label: 'כרטיסים / טפסים',    group: 'layout', hint: 'רקע לוחות ומודלים' },
  { key: '--c-border',      label: 'גבולות',              group: 'layout', hint: 'קווי הפרדה' },
  // Text
  { key: '--c-text',        label: 'טקסט ראשי',           group: 'text', hint: 'כותרות ותוכן' },
  { key: '--c-text-muted',  label: 'טקסט משני',           group: 'text', hint: 'תוויות ותיאורים' },
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
  dot: string; // preview color
  vars: Record<string, string>;
}

const PRESETS: Preset[] = [
  {
    id: 'brand',
    label: 'מותג מקורי',
    dot: '#C7263A',
    vars: {
      '--c-primary':    '#C7263A',
      '--c-gold':       '#D2AB62',
      '--c-bg':         '#F7F5F1',
      '--c-surface':    '#FFFFFF',
      '--c-border':     '#E5DDD4',
      '--c-text':       '#1C1815',
      '--c-text-muted': '#6B6057',
    },
  },
  {
    id: 'blue',
    label: 'כחול מקצועי',
    dot: '#2563EB',
    vars: {
      '--c-primary':    '#2563EB',
      '--c-gold':       '#7C3AED',
      '--c-bg':         '#EEF2FF',
      '--c-surface':    '#FFFFFF',
      '--c-border':     '#DBEAFE',
      '--c-text':       '#0F172A',
      '--c-text-muted': '#475569',
    },
  },
  {
    id: 'green',
    label: 'ירוק טבע',
    dot: '#16A34A',
    vars: {
      '--c-primary':    '#16A34A',
      '--c-gold':       '#CA8A04',
      '--c-bg':         '#F0FDF4',
      '--c-surface':    '#FFFFFF',
      '--c-border':     '#BBFFD8',
      '--c-text':       '#14532D',
      '--c-text-muted': '#4B7C5E',
    },
  },
  {
    id: 'dark',
    label: 'לילה כהה',
    dot: '#E95C71',
    vars: {
      '--c-primary':    '#E95C71',
      '--c-gold':       '#F0C060',
      '--c-bg':         '#18191B',
      '--c-surface':    '#23252B',
      '--c-border':     '#343640',
      '--c-text':       '#F0EDE8',
      '--c-text-muted': '#9B9698',
    },
  },
  {
    id: 'purple',
    label: 'סגול יוקרה',
    dot: '#7E22CE',
    vars: {
      '--c-primary':    '#7E22CE',
      '--c-gold':       '#D97706',
      '--c-bg':         '#FAF5FF',
      '--c-surface':    '#FFFFFF',
      '--c-border':     '#E9D5FF',
      '--c-text':       '#1E0B38',
      '--c-text-muted': '#6B21A8',
    },
  },
];

// ─── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'crm_design_overrides_v1';

/** טוען overrides שמורים ומחיל אותם */
export function loadSavedDesign() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, string>;
    Object.entries(saved).forEach(([k, v]) => writeVar(k, v));
  } catch { /* ignore */ }
}

// ─── Auto-derive related vars from a key color ────────────────────────────────

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

/** מחיל preset מלא */
function applyPreset(preset: Preset) {
  Object.entries(preset.vars).forEach(([k, v]) => applyWithDerived(k, v));
}

// ─── ColorRow component ───────────────────────────────────────────────────────

function ColorRow({
  label, hint, value, onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [hexInput, setHexInput] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // sync external value changes (e.g. preset applied)
  useEffect(() => { setHexInput(value); }, [value]);

  const handleColorPicker = (raw: string) => {
    setHexInput(raw);
    onChange(raw);
  };

  const handleHexInput = (raw: string) => {
    setHexInput(raw);
    if (/^#[0-9A-Fa-f]{6}$/.test(raw)) onChange(raw);
  };

  return (
    <div className="flex items-center gap-2.5 py-1.5 group">
      {/* Color swatch — clicking opens native color picker */}
      <label
        className="relative flex-shrink-0 cursor-pointer"
        title={`בחר צבע: ${label}`}
      >
        <div
          className="w-9 h-9 rounded-lg border-2 shadow-md transition-transform duration-150 group-hover:scale-110"
          style={{
            background: /^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : value,
            borderColor: 'var(--c-border)',
            boxShadow: `0 2px 8px ${hexInput}55`,
          }}
        />
        {/* Native color picker (invisible, overlays swatch) */}
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : '#000000'}
          onChange={e => handleColorPicker(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-lg"
          title={label}
        />
      </label>

      {/* Label + hint */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--c-text)' }}>
          {label}
        </p>
        {hint && (
          <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
            {hint}
          </p>
        )}
      </div>

      {/* Hex text input */}
      <input
        ref={inputRef}
        type="text"
        value={hexInput}
        onChange={e => handleHexInput(e.target.value)}
        maxLength={7}
        placeholder="#RRGGBB"
        className="w-[76px] text-xs px-2 py-1.5 rounded-md border font-mono text-center transition-colors"
        style={{
          borderColor: /^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput + '88' : 'var(--c-border)',
          color: 'var(--c-text)',
          background: 'var(--c-surface)',
          outline: 'none',
        }}
        onFocus={e => e.target.select()}
      />
    </div>
  );
}

// ─── Main DesignEditor component ──────────────────────────────────────────────

export default function DesignEditor() {
  const [open, setOpen]         = useState(false);
  const [colors, setColors]     = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Read current computed CSS variable values
  const readAllVars = useCallback((): Record<string, string> => {
    const result: Record<string, string> = {};
    DESIGN_VARS.forEach(v => { result[v.key] = readVar(v.key); });
    return result;
  }, []);

  // On mount: apply saved overrides and read current values
  useEffect(() => {
    loadSavedDesign();
    // small delay so CSS has time to apply
    setTimeout(() => setColors(readAllVars()), 50);
  }, [readAllVars]);

  // When panel opens: re-sync current values
  useEffect(() => {
    if (open) setTimeout(() => setColors(readAllVars()), 20);
  }, [open, readAllVars]);

  // Handle single color change
  const handleChange = useCallback((key: string, value: string) => {
    applyWithDerived(key, value);
    setColors(prev => ({ ...prev, [key]: value }));
    setSaveState('idle');
    setActivePreset(null);
  }, []);

  // Apply preset
  const handlePreset = useCallback((preset: Preset) => {
    applyPreset(preset);
    const next: Record<string, string> = {};
    DESIGN_VARS.forEach(v => { next[v.key] = preset.vars[v.key] ?? readVar(v.key); });
    setColors(next);
    setSaveState('idle');
    setActivePreset(preset.id);
  }, []);

  // Save to localStorage
  const handleSave = useCallback(() => {
    const allVars: Record<string, string> = {};
    DESIGN_VARS.forEach(v => { allVars[v.key] = colors[v.key] ?? readVar(v.key); });
    // Also persist derived vars so they survive reload
    PRESETS.forEach(() => {}); // no-op
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allVars));
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2200);
  }, [colors]);

  // Reset to brand.css defaults
  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    DESIGN_VARS.forEach(v => clearVar(v.key));
    // also clear derived
    ['--c-primary-dark','--c-primary-deeper','--c-primary-light','--c-primary-xs',
     '--c-gold-dark','--c-gold-light','--c-gold-xs'].forEach(clearVar);
    setTimeout(() => { setColors(readAllVars()); setActivePreset(null); setSaveState('idle'); }, 30);
  }, [readAllVars]);

  const primaryColor = colors['--c-primary'] || '#C7263A';

  return (
    <>
      {/* ── Floating toggle button ────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="עורך עיצוב"
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          zIndex: 90,
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${primaryColor}, ${darken(primaryColor, 0.18)})`,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          boxShadow: `0 4px 18px ${primaryColor}55, 0 2px 6px rgba(0,0,0,.2)`,
          transition: 'all 0.22s cubic-bezier(.34,1.56,.64,1)',
          transform: open ? 'rotate(30deg) scale(1.08)' : 'scale(1)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = open ? 'rotate(30deg) scale(1.15)' : 'scale(1.12)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = open ? 'rotate(30deg) scale(1.08)' : 'scale(1)'; }}
      >
        🎨
      </button>

      {/* ── Side drawer ───────────────────────────────────────── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,.28)',
              zIndex: 95,
              backdropFilter: 'blur(3px)',
              animation: 'brand-fadeIn .18s ease-out',
            }}
          />

          {/* Panel */}
          <div
            dir="rtl"
            style={{
              position: 'fixed',
              top: 0, bottom: 0, left: 0,
              width: '300px',
              zIndex: 100,
              background: 'var(--c-surface)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '4px 0 32px rgba(0,0,0,.18)',
              animation: 'designPanelIn .25s cubic-bezier(.34,1.2,.64,1)',
              borderLeft: '1px solid var(--c-border)',
            }}
          >
            {/* ── Panel Header ── */}
            <div
              style={{
                background: `linear-gradient(to left, ${darken(primaryColor, 0.28)}, ${primaryColor})`,
                padding: '14px 16px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: '14px', margin: 0, lineHeight: 1.3 }}>
                  🎨 עורך עיצוב
                </p>
                <p style={{ color: 'rgba(255,255,255,.65)', fontSize: '11px', margin: 0 }}>
                  שינויים חיים בזמן אמת
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255,255,255,.18)',
                  border: 'none', cursor: 'pointer',
                  color: '#fff', borderRadius: '8px',
                  width: '28px', height: '28px',
                  fontSize: '16px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  transition: 'background .14s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.30)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.18)'; }}
              >
                ×
              </button>
            </div>

            {/* ── Preset themes ── */}
            <div
              style={{
                padding: '12px 14px 10px',
                borderBottom: '1px solid var(--c-border)',
                background: 'var(--c-bg)',
                flexShrink: 0,
              }}
            >
              <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-text-muted)', marginBottom: '8px', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                ערכות נושא מוכנות
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handlePreset(p)}
                    title={p.label}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '4px 9px',
                      borderRadius: '20px',
                      border: `1.5px solid ${activePreset === p.id ? p.dot : 'var(--c-border)'}`,
                      background: activePreset === p.id ? p.dot + '18' : 'var(--c-surface)',
                      color: activePreset === p.id ? p.dot : 'var(--c-text-muted)',
                      fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all .15s ease',
                    }}
                    onMouseEnter={e => {
                      if (activePreset !== p.id) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = p.dot;
                        (e.currentTarget as HTMLButtonElement).style.color = p.dot;
                      }
                    }}
                    onMouseLeave={e => {
                      if (activePreset !== p.id) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border)';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-text-muted)';
                      }
                    }}
                  >
                    <span
                      style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: p.dot, flexShrink: 0,
                        boxShadow: `0 0 4px ${p.dot}88`,
                      }}
                    />
                    {p.label}
                    {activePreset === p.id && <span style={{ fontSize: '9px' }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Color variables ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 4px' }}>
              {GROUPS.map(group => {
                const vars = DESIGN_VARS.filter(v => v.group === group.id);
                return (
                  <div key={group.id} style={{ marginBottom: '12px' }}>
                    {/* Group label */}
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 0 4px',
                        borderBottom: '1px solid var(--c-border)',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontSize: '13px' }}>{group.icon}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-text-muted)', letterSpacing: '.03em', textTransform: 'uppercase' }}>
                        {group.label}
                      </span>
                    </div>

                    {/* Color rows */}
                    {vars.map(v => (
                      <ColorRow
                        key={v.key}
                        label={v.label}
                        hint={v.hint}
                        value={colors[v.key] || '#000000'}
                        onChange={val => handleChange(v.key, val)}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Live preview swatch strip */}
              <div style={{ marginTop: '8px', marginBottom: '4px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-text-muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  תצוגה מקדימה
                </p>
                <div style={{ display: 'flex', gap: '4px', height: '24px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
                  {['--c-primary','--c-gold','--c-bg','--c-surface','--c-border','--c-text'].map(k => (
                    <div key={k} style={{ flex: 1, background: colors[k] || readVar(k) }} title={k} />
                  ))}
                </div>
              </div>
            </div>

            {/* ── Footer: Save / Reset ── */}
            <div
              style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--c-border)',
                display: 'flex',
                gap: '8px',
                background: 'var(--c-bg)',
                flexShrink: 0,
              }}
            >
              {/* Save */}
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: '9px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#fff',
                  background: saveState === 'saved'
                    ? 'var(--c-success, #217A4E)'
                    : `linear-gradient(to left, ${darken(primaryColor, 0.18)}, ${primaryColor})`,
                  boxShadow: saveState === 'saved'
                    ? '0 2px 10px rgba(33,122,78,.35)'
                    : `0 2px 10px ${primaryColor}55`,
                  transition: 'all .22s ease',
                }}
              >
                {saveState === 'saved' ? '✓ נשמר!' : '💾 שמור עיצוב'}
              </button>

              {/* Reset */}
              <button
                onClick={handleReset}
                title="חזור לברירת מחדל של ספר המותג"
                style={{
                  padding: '9px 12px',
                  borderRadius: '9px',
                  border: '1.5px solid var(--c-border)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--c-text-muted)',
                  background: 'var(--c-surface)',
                  transition: 'all .15s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-primary)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-primary)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-text-muted)';
                }}
              >
                ↺ איפוס
              </button>
            </div>
          </div>
        </>
      )}

      {/* Panel slide-in animation (injected once) */}
      <style>{`
        @keyframes designPanelIn {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </>
  );
}
