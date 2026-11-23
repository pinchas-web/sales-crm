/**
 * לשונית "הסכם" בכרטיס הלקוח:
 * מתאימים את ההסכם ללקוח → יוצרים קישור חתימה → שולחים בוואטסאפ/מייל →
 * רואים מתי נפתח ומתי נחתם → מורידים את הקובץ החתום.
 */
import { useEffect, useState } from 'react';
import type { Client, Lead } from '../types';
import { Btn, Input, Textarea } from '../ui';
import {
  apiListClientContracts, apiCreateContract, apiUpdateContract, apiCancelContract, apiContractPdfUrl,
} from '../api';
import {
  BONUSES, TRACKS, defaultContractData, type ContractData, type ContractRecord, type ContractTrack,
} from '../../api/_lib/contractTypes';
import ContractDocument, { heDate } from './ContractDocument';

const signLink = (token: string) => `${window.location.origin}/sign/${token}`;

function waLink(phone: string | undefined, text: string) {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function StatusChip({ c }: { c: ContractRecord }) {
  const map = {
    signed:    { t: `נחתם · ${heDate(c.signer?.signedAt)}`, cls: 'bg-green-100 text-green-700' },
    cancelled: { t: 'בוטל', cls: 'bg-gray-100 text-gray-500' },
    sent:      c.viewedAt
      ? { t: `נפתח ע"י הלקוח · ${heDate(c.viewedAt)}`, cls: 'bg-amber-100 text-amber-800' }
      : { t: 'ממתין לחתימה', cls: 'bg-blue-100 text-blue-700' },
  }[c.status];
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${map.cls}`}>{map.t}</span>;
}

function ContractForm({ initial, saving, onCancel, onSubmit, submitLabel }: {
  initial: ContractData; saving: boolean; submitLabel: string;
  onCancel: () => void; onSubmit: (d: ContractData) => void;
}) {
  const [d, setD] = useState<ContractData>(initial);
  const [preview, setPreview] = useState(false);
  const set = <K extends keyof ContractData>(k: K, v: ContractData[K]) => setD(x => ({ ...x, [k]: v }));

  function setTrack(t: ContractTrack) {
    setD(x => ({ ...x, track: t, price: TRACKS[t].price }));
  }
  function toggleBonus(id: string) {
    setD(x => ({ ...x, bonuses: x.bonuses.includes(id) ? x.bonuses.filter(b => b !== id) : [...x.bonuses, id] }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(TRACKS) as ContractTrack[]).map(t => (
          <button key={t} type="button" onClick={() => setTrack(t)}
            className={`text-right rounded-xl border-2 p-3 transition-colors ${d.track === t ? 'border-red-600 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <p className="text-xs font-semibold text-red-700">{TRACKS[t].label}</p>
            <p className="font-bold text-gray-900">{TRACKS[t].title}</p>
            <p className="text-sm text-gray-500">₪{TRACKS[t].price.toLocaleString('he-IL')} + מע"מ</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="field-label">שם הלקוח בהסכם</label><Input value={d.clientName} onChange={v => set('clientName', v)} /></div>
        <div><label className="field-label">מחיר לפני מע"מ (₪)</label><Input type="number" value={String(d.price)} onChange={v => set('price', Number(v) || 0)} /></div>
        <div><label className="field-label">מייל הלקוח</label><Input value={d.clientEmail ?? ''} onChange={v => set('clientEmail', v)} /></div>
        <div><label className="field-label">טלפון</label><Input value={d.clientPhone ?? ''} onChange={v => set('clientPhone', v)} /></div>
        <div><label className="field-label">תאריך תחילת הליווי (לא חובה)</label><Input type="date" value={d.startDate ?? ''} onChange={v => set('startDate', v || undefined)} /></div>
      </div>

      <div>
        <label className="field-label">פסקה אישית ללקוח (לא חובה — מופיעה בעמוד הראשון)</label>
        <Textarea value={d.personalNote ?? ''} onChange={v => set('personalNote', v.slice(0, 600))} rows={3}
          placeholder="לדוגמה: המטרה שלנו יחד — קליניקה מלאה עד הפסח, עם מוצר דיגיטלי ראשון שמביא הכנסה גם בלי פגישות." />
      </div>

      <div>
        <label className="field-label">בונוסים שנכללים</label>
        <div className="space-y-1.5">
          {BONUSES.map(b => (
            <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={d.bonuses.includes(b.id)} onChange={() => toggleBonus(b.id)} className="w-4 h-4 accent-red-600" />
              {b.title}
            </label>
          ))}
        </div>
        <div className="mt-2"><Input value={d.extraBonus ?? ''} onChange={v => set('extraBonus', v)} placeholder="בונוס נוסף רק ללקוח הזה (לא חובה)" /></div>
      </div>

      <div className="flex flex-wrap gap-2 justify-between pt-2 border-t">
        <Btn variant="secondary" size="sm" onClick={() => setPreview(p => !p)}>{preview ? 'הסתר תצוגה מקדימה' : 'תצוגה מקדימה של ההסכם'}</Btn>
        <div className="flex gap-2">
          <Btn variant="secondary" size="sm" onClick={onCancel}>ביטול</Btn>
          <Btn size="sm" disabled={saving || !d.clientName.trim()} onClick={() => onSubmit(d)}>{saving ? 'שומר…' : submitLabel}</Btn>
        </div>
      </div>

      {preview && (
        <div className="bg-gray-100 rounded-xl p-3 max-h-[70vh] overflow-auto">
          <ContractDocument data={d} preparedAt={new Date().toISOString()} scale={0.72} />
        </div>
      )}
    </div>
  );
}

export default function ContractPanel({ client, lead }: { client: Client; lead: Lead }) {
  const [list, setList] = useState<ContractRecord[] | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'edit'; c: ContractRecord } | { kind: 'view'; c: ContractRecord }>({ kind: 'list' });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  function load() {
    apiListClientContracts(client.id).then(setList).catch(e => setError(String(e.message ?? e)));
  }
  useEffect(load, [client.id]);

  async function create(data: ContractData) {
    setSaving(true); setError('');
    try {
      const c = await apiCreateContract({ clientId: client.id, leadId: lead.id, productId: client.productId, data });
      setList(l => [c, ...(l ?? [])]);
      setMode({ kind: 'list' });
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  }
  async function update(token: string, data: ContractData) {
    setSaving(true); setError('');
    try {
      const c = await apiUpdateContract(token, data);
      setList(l => (l ?? []).map(x => x.token === token ? c : x));
      setMode({ kind: 'list' });
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  }
  async function cancel(token: string) {
    if (!confirm('לבטל את ההסכם? הקישור שנשלח ללקוח יפסיק לעבוד.')) return;
    try {
      const c = await apiCancelContract(token);
      setList(l => (l ?? []).map(x => x.token === token ? c : x));
    } catch (e) { setError((e as Error).message); }
  }
  async function download(token: string) {
    try { window.open(await apiContractPdfUrl(token), '_blank'); }
    catch (e) { setError((e as Error).message); }
  }
  function copy(token: string) {
    navigator.clipboard.writeText(signLink(token)).then(() => { setCopied(token); setTimeout(() => setCopied(''), 2000); });
  }

  if (mode.kind === 'new') {
    return <ContractForm initial={defaultContractData(lead.name, lead.email ?? '', lead.phone ?? '')} saving={saving}
      submitLabel="יצירת קישור לחתימה" onCancel={() => setMode({ kind: 'list' })} onSubmit={create} />;
  }
  if (mode.kind === 'edit') {
    return <ContractForm initial={mode.c.data} saving={saving} submitLabel="שמירת השינויים"
      onCancel={() => setMode({ kind: 'list' })} onSubmit={d => update(mode.c.token, d)} />;
  }
  if (mode.kind === 'view') {
    const c = mode.c;
    return (
      <div className="space-y-3">
        <Btn variant="secondary" size="sm" onClick={() => setMode({ kind: 'list' })}>→ חזרה</Btn>
        <div className="bg-gray-100 rounded-xl p-3 max-h-[70vh] overflow-auto">
          <ContractDocument data={c.data} preparedAt={c.createdAt} scale={0.72}
            signed={c.signer && c.signatureDataUrl ? { ...c.signer, signatureDataUrl: c.signatureDataUrl } : undefined} />
        </div>
      </div>
    );
  }

  const active = (list ?? []).filter(c => c.status !== 'cancelled');
  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-2.5">{error}</div>}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">הסכם ליווי פרימיום, מותאם אישית, עם חתימה דיגיטלית מרחוק.</p>
        <Btn size="sm" onClick={() => setMode({ kind: 'new' })}>+ הסכם חדש</Btn>
      </div>

      {list === null && !error && <p className="text-center text-gray-400 py-6">טוען…</p>}
      {list && list.length === 0 && (
        <div className="text-center py-8 border border-dashed rounded-xl">
          <p className="font-semibold text-gray-700">עוד לא נשלח הסכם ללקוח הזה</p>
          <p className="text-sm text-gray-400 mt-1">לוחצים "הסכם חדש", מתאימים, ומקבלים קישור לשליחה.</p>
        </div>
      )}

      {(list ?? []).map(c => {
        const t = TRACKS[c.data.track];
        const msg = `שלום ${c.data.clientName.split(' ')[0]}, מצורף הסכם הליווי שלנו. אפשר לקרוא ולחתום כאן: ${signLink(c.token)}`;
        return (
          <div key={c.token} className={`rounded-xl border p-3.5 ${c.status === 'cancelled' ? 'opacity-50' : 'bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-800">{t.label} · ₪{c.data.price.toLocaleString('he-IL')} + מע"מ</p>
                <p className="text-xs text-gray-400">נוצר {heDate(c.createdAt)}</p>
              </div>
              <StatusChip c={c} />
            </div>

            {c.status === 'signed' && c.signer && (
              <div className="mt-3 text-sm bg-green-50 rounded-lg p-2.5 text-green-900">
                נחתם על ידי <b>{c.signer.name}</b> (ת.ז. {c.signer.idNumber}) ב־{new Date(c.signer.signedAt).toLocaleString('he-IL')}
                <span className="block text-xs mt-1 text-green-700">
                  {c.emailStatus === 'sent' ? 'עותק נשלח במייל' : c.emailStatus === 'failed' ? 'שליחת המייל נכשלה' : 'שליחת מיילים עוד לא הוגדרה'}
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              {c.status === 'signed' && <Btn size="sm" onClick={() => download(c.token)}>הורדת ה-PDF החתום</Btn>}
              {c.status === 'sent' && <>
                <Btn size="sm" onClick={() => copy(c.token)}>{copied === c.token ? 'הקישור הועתק ✓' : 'העתקת קישור לחתימה'}</Btn>
                <a href={waLink(c.data.clientPhone ?? lead.phone, msg)} target="_blank" rel="noreferrer"
                  className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700">שליחה בוואטסאפ</a>
                {(c.data.clientEmail || lead.email) && (
                  <a href={`mailto:${c.data.clientEmail || lead.email}?subject=${encodeURIComponent('הסכם הליווי שלנו')}&body=${encodeURIComponent(msg)}`}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">שליחה במייל</a>
                )}
                <Btn size="sm" variant="secondary" onClick={() => setMode({ kind: 'edit', c })}>עריכה</Btn>
              </>}
              <Btn size="sm" variant="ghost" onClick={() => setMode({ kind: 'view', c })}>צפייה</Btn>
              {c.status === 'sent' && <Btn size="sm" variant="danger" onClick={() => cancel(c.token)}>ביטול</Btn>}
            </div>
          </div>
        );
      })}
      {active.length === 0 && list && list.length > 0 && <p className="text-xs text-gray-400 text-center">כל ההסכמים של הלקוח בוטלו.</p>}
    </div>
  );
}
