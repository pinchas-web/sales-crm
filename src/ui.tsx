/**
 * קומפוננטות UI גנריות משותפות לכל האפליקציה.
 * ייבא מכאן במקום לבנות מחדש — Btn, Input, Modal, Badge, Toggle וכו'.
 * אין לוגיקה עסקית כאן — רק ויזואל ו-UX.
 */
import React, { useState, useEffect } from 'react';

// ─── Badge ─────────────────────────────────────────────────────────────────────

export function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>{label}</span>;
}

// ─── Btn ──────────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type BtnSize    = 'xs' | 'sm' | 'md';

export function Btn({
  children, onClick, variant = 'primary', size = 'md', disabled, className = '', type = 'button', title,
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: BtnVariant; size?: BtnSize; disabled?: boolean; className?: string;
  type?: 'button' | 'submit'; title?: string;
}) {
  const base = 'inline-flex items-center gap-1 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 flex-shrink-0 whitespace-nowrap';
  const sz: Record<BtnSize, string> = {
    xs: 'px-1.5 py-0.5 text-xs',
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  };
  const v: Record<BtnVariant, string> = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400',
    secondary: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-300',
    danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400',
    ghost:     'text-gray-600 hover:bg-gray-100 focus:ring-gray-300',
    success:   'bg-green-600 text-white hover:bg-green-700 focus:ring-green-400',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`${base} ${sz[size]} ${v[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function Input({ value, onChange, placeholder, type = 'text', className = '', autoFocus, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; className?: string; autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input type={type} value={value} autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)} placeholder={placeholder}
      onKeyDown={onKeyDown}
      className={`border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white ${className}`} />
  );
}

// ─── SelectInput ──────────────────────────────────────────────────────────────

export function SelectInput({ value, onChange, options, placeholder, className = '', disabled }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string; className?: string; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      className={`border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white ${disabled ? 'opacity-50' : ''} ${className}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl flex flex-col max-h-[92vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Score Badge ──────────────────────────────────────────────────────────────

export function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 75 ? 'bg-green-100 text-green-700' : score >= 45 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600';
  return <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cls}`}>⭐ {score}</span>;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, max, colorClass = 'bg-blue-500' }: {
  value: number; max: number; colorClass?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
      <div className={`${colorClass} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Confirmation Dialog ──────────────────────────────────────────────────────

export function ConfirmDialog({ open, message, onConfirm, onCancel, danger = true }: {
  open: boolean; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-xl p-6 shadow-2xl max-w-xs w-full text-center">
        <p className="text-gray-800 font-semibold mb-4">{message}</p>
        <div className="flex gap-2 justify-center">
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>אישור</Btn>
          <Btn variant="secondary" onClick={onCancel}>ביטול</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, subtitle, action }: {
  icon: string; title: string; subtitle?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-3">{icon}</span>
      <p className="text-gray-700 font-semibold text-lg">{title}</p>
      {subtitle && <p className="text-gray-400 text-sm mt-1">{subtitle}</p>}
      {action && <Btn className="mt-4" onClick={action.onClick}>{action.label}</Btn>}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

export function Textarea({ value, onChange, placeholder, rows = 3, className = '' }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; className?: string;
}) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className={`border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-none ${className}`} />
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-blue-500' : 'bg-gray-300'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'right-0.5' : 'right-5'}`} />
      </div>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute bottom-full mb-1.5 right-0 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">
          {text}
        </div>
      )}
    </div>
  );
}
