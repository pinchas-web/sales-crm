/**
 * דף החתימה שהלקוח מקבל בקישור: /sign/<token>
 * קורא את ההסכם, ממלא שם ות"ז, חותם, ובלחיצה אחת:
 * נוצר PDF חתום → נשמר ב-CRM → נשלח במייל ללקוח ולפנחס.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ContractDocument, { PAGE_WIDTH_PX, type SignedInfo } from './ContractDocument';
import SignaturePad from './SignaturePad';
import { pagesToPdfBase64, base64ToBlob } from './pdf';
import type { ContractData, ContractStatus } from '../../api/_lib/contractTypes';
import './sign.css';

interface PublicContract {
  status: ContractStatus;
  data: ContractData;
  createdAt: string;
  signer?: { name: string; signedAt: string };
}

type Phase = 'loading' | 'notfound' | 'cancelled' | 'ready' | 'working' | 'done' | 'already';

const ERRORS: Record<string, string> = {
  missing_name: 'נא למלא שם מלא.',
  invalid_id: 'מספר תעודת הזהות לא תקין.',
  invalid_email: 'כתובת המייל לא תקינה.',
  not_agreed: 'צריך לסמן שקראת ואישרת את ההסכם.',
  invalid_signature: 'נא לחתום במשטח החתימה.',
  already_signed: 'ההסכם כבר נחתם.',
  cancelled: 'ההסכם בוטל. כדאי ליצור קשר עם פנחס.',
};

function CheckIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C7263A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function SignPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [contract, setContract] = useState<PublicContract | null>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= 860);
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [signedInfo, setSignedInfo] = useState<SignedInfo | null>(null);
  const [pdfB64, setPdfB64] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const started = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'הסכם ליווי פרימיום – פנחס הורביץ';
    const onResize = () => setWide(window.innerWidth >= 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fetch(`/api/contracts/public?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 410) return setPhase('cancelled');
        if (!r.ok) return setPhase('notfound');
        const c = await r.json() as PublicContract;
        setContract(c);
        setName(c.data.clientName ?? '');
        setEmail(c.data.clientEmail ?? '');
        setPhase(c.status === 'signed' ? 'already' : 'ready');
      })
      .catch(() => setPhase('notfound'));
  }, [token]);

  function submit() {
    setError('');
    if (name.trim().length < 2) return setError(ERRORS.missing_name);
    const id = idNumber.replace(/\D/g, '');
    if (id.length < 5 || id.length > 9) return setError(ERRORS.invalid_id);
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(ERRORS.invalid_email);
    if (!signature) return setError(ERRORS.invalid_signature);
    if (!agree) return setError(ERRORS.not_agreed);
    started.current = false;
    setPhase('working');
    setSignedInfo({ name: name.trim(), idNumber: id, signedAt: new Date().toISOString(), signatureDataUrl: signature });
  }

  // כשהעותק החתום (הנסתר) מוכן — מפיקים PDF ושולחים
  const onSignedReady = useCallback(async (pages: HTMLElement[]) => {
    if (started.current || !signedInfo) return;
    started.current = true;
    try {
      const b64 = await pagesToPdfBase64(pages);
      const res = await fetch('/api/contracts/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, name: signedInfo.name, idNumber: signedInfo.idNumber, email: email.trim(),
          agree: true, signatureDataUrl: signedInfo.signatureDataUrl, pdfBase64: b64,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[body.error] ?? 'משהו השתבש בשמירה. נסו שוב בעוד רגע.');
        setPhase(body.error === 'already_signed' ? 'already' : 'ready');
        setSignedInfo(null);
        return;
      }
      setPdfB64(b64);
      setEmailSent(body.emailStatus === 'sent');
      setPhase('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('משהו השתבש בהפקת הקובץ. נסו שוב, ואם זה חוזר — מדפדפן אחר.');
      setPhase('ready');
      setSignedInfo(null);
    }
  }, [signedInfo, token, email]);

  function downloadMine() {
    if (!pdfB64) return;
    const url = URL.createObjectURL(base64ToBlob(pdfB64));
    const a = document.createElement('a');
    a.href = url;
    a.download = `הסכם ליווי פרימיום - ${name.trim()}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function downloadSigned() {
    const r = await fetch(`/api/contracts/public?token=${encodeURIComponent(token)}&pdf=1`);
    if (!r.ok) return;
    const { url } = await r.json();
    window.location.href = url;
  }

  const top = (
    <div className="sp-top">
      <img src="/contract/logo-crop.jpg" alt="פנחס הורביץ - הבית למטפלים ומאמנים" />
      <span className="t">הסכם ליווי פרימיום 2026</span>
    </div>
  );

  if (phase === 'loading') {
    return <div className="sp hc-doc">{top}<div className="sp-center"><p>טוען את ההסכם…</p></div></div>;
  }
  if (phase === 'notfound' || phase === 'cancelled') {
    return (
      <div className="sp hc-doc">{top}
        <div className="sp-center">
          <h1>{phase === 'cancelled' ? 'ההסכם הזה כבר לא פעיל' : 'לא מצאנו את ההסכם'}</h1>
          <p>כדאי לבדוק שהקישור הועתק במלואו, או לפנות לפנחס: 052-7117224</p>
        </div>
      </div>
    );
  }
  if (phase === 'done' || phase === 'already') {
    return (
      <div className="sp hc-doc">{top}
        <div className="sp-wrap">
          <div className="sp-card sp-center" style={{ marginTop: 10 }}>
            <span className="ic"><CheckIcon /></span>
            <h1>{phase === 'done' ? `תודה ${name.trim().split(' ')[0]}, ההסכם נחתם!` : 'ההסכם כבר נחתם'}</h1>
            <p style={{ color: '#6b6466', margin: '0 0 22px' }}>
              {phase === 'done'
                ? (emailSent ? 'עותק חתום נשלח אליך למייל. אפשר גם להוריד אותו עכשיו.' : 'אפשר להוריד עכשיו עותק חתום לשמירה.')
                : `נחתם על ידי ${contract?.signer?.name ?? ''}. אפשר להוריד עותק חתום.`}
            </p>
            <button className="sp-btn" style={{ maxWidth: 360 }} onClick={phase === 'done' ? downloadMine : downloadSigned}>
              הורדת ההסכם החתום
            </button>
            <p className="sp-small" style={{ marginTop: 26 }}>מחכים להתחיל לעבוד יחד · להרוויח מעולם שכולו שליחות</p>
          </div>
        </div>
      </div>
    );
  }

  const data = contract!.data;
  const docScale = Math.min(1, (Math.min(window.innerWidth, 860) - 32) / PAGE_WIDTH_PX);

  return (
    <div className="sp hc-doc">
      {top}
      <div className="sp-wrap">
        <div className="sp-intro">
          <h1>שלום {data.clientName.split(' ')[0]}, <span>ההסכם שלך מוכן</span></h1>
          <p>קוראים בנחת, ובסוף ממלאים פרטים וחותמים. כל התהליך לוקח דקה.</p>
          <button className="sp-btn ghost" style={{ maxWidth: 260, marginTop: 14, fontSize: 16, padding: 10 }}
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            מעבר ישר לחתימה
          </button>
        </div>

        <div className="sp-doc">
          {wide
            ? <ContractDocument data={data} preparedAt={contract!.createdAt} scale={docScale} />
            : <ContractDocument data={data} preparedAt={contract!.createdAt} mode="flow" />}
        </div>

        <div className="sp-card" ref={formRef}>
          <h2>חתימה על ההסכם</h2>
          <p className="lead">הפרטים והחתימה ייכנסו להסכם, ותקבלו עותק חתום.</p>
          {error && <div className="sp-err">{error}</div>}
          <div className="sp-row">
            <div className="sp-field">
              <label htmlFor="sp-name">שם מלא</label>
              <input id="sp-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="sp-field">
              <label htmlFor="sp-id">תעודת זהות</label>
              <input id="sp-id" value={idNumber} onChange={e => setIdNumber(e.target.value)} inputMode="numeric" maxLength={12} />
            </div>
          </div>
          <div className="sp-field">
            <label htmlFor="sp-email">מייל (לשם יישלח העותק החתום)</label>
            <input id="sp-email" type="email" dir="ltr" style={{ textAlign: 'right' }} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="sp-field">
            <label>חתימה</label>
            <SignaturePad onChange={setSignature} />
          </div>
          <label className="sp-check">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span>קראתי את ההסכם, אני מבין/ה את תנאיו ומאשר/ת אותם.</span>
          </label>
          <button className="sp-btn" disabled={phase === 'working'} onClick={submit}>
            {phase === 'working' ? 'מכין את ההסכם החתום…' : 'חתימה ושליחה'}
          </button>
          <p className="sp-small">החתימה נשמרת בצורה מאובטחת, יחד עם התאריך והשעה.</p>
        </div>
      </div>

      {/* העותק החתום להפקת ה-PDF — מחוץ למסך */}
      {phase === 'working' && signedInfo && (
        <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, width: PAGE_WIDTH_PX }}>
          <ContractDocument data={data} preparedAt={contract!.createdAt} signed={signedInfo} onReady={onSignedReady} />
        </div>
      )}
    </div>
  );
}
