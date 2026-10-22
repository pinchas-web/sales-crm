/**
 * מסד נתונים מדומה בזיכרון — מספיק כדי להריץ את קוד השרת האמיתי (api/*) בבדיקות.
 * תומך רק בחלק של ה-API של supabase-js שהשרת שלנו משתמש בו.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export class FakeDb {
  tables = new Map<string, Row[]>();
  uploads: string[] = [];

  reset(seed: Record<string, Row[]>) {
    this.tables = new Map(Object.entries(seed).map(([k, rows]) => [k, rows.map(r => structuredClone(r))]));
    this.uploads = [];
  }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  from(table: string) {
    return new Query(this, table);
  }

  storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: async (path: string) => {
        this.uploads.push(`${bucket}/${path}`);
        return { data: { signedUrl: `https://fake/${path}`, token: 'tok', path }, error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fake/public/${bucket}/${path}` } }),
    }),
  };
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private sortBy: { col: string; asc: boolean } | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select() { return this; }
  eq(col: string, v: unknown)      { this.filters.push(r => r[col] === v); return this; }
  neq(col: string, v: unknown)     { this.filters.push(r => r[col] !== v); return this; }
  in(col: string, vs: unknown[])   { this.filters.push(r => vs.includes(r[col])); return this; }
  ilike(col: string, v: string)    { this.filters.push(r => String(r[col] ?? '').toLowerCase() === v.toLowerCase()); return this; }
  /** רק הצורה שהשרת משתמש בה: "col.is.null,col.eq.value,..." */
  or(expr: string) {
    const parts = expr.split(',').map(p => {
      const [col, op, ...rest] = p.split('.');
      const val = rest.join('.');
      return (r: Row) => op === 'is' ? r[col] == null : r[col] === val;
    });
    this.filters.push(r => parts.some(f => f(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.sortBy = { col, asc: opts?.ascending !== false }; return this; }
  single()      { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[]) { this.op = 'upsert'; this.payload = rows; return this; }
  update(patch: Row)        { this.op = 'update'; this.payload = patch; return this; }
  delete()                  { this.op = 'delete'; return this; }

  private match(r: Row) { return this.filters.every(f => f(r)); }

  private run(): { data: unknown; error: unknown } {
    const rows = this.db.rows(this.table);
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      for (const r of list) {
        const i = rows.findIndex(x => x.id === r.id);
        if (i >= 0 && this.op === 'upsert') rows[i] = { ...rows[i], ...structuredClone(r) };
        else if (i >= 0) return { data: null, error: { message: 'duplicate key' } };
        else rows.push(structuredClone(r));
      }
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      rows.forEach((r, i) => { if (this.match(r)) rows[i] = { ...r, ...structuredClone(this.payload as Row) }; });
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      const keep = rows.filter(r => !this.match(r));
      rows.length = 0; rows.push(...keep);
      return { data: null, error: null };
    }
    let out = rows.filter(r => this.match(r)).map(r => structuredClone(r));
    if (this.sortBy) {
      const { col, asc } = this.sortBy;
      out = out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.mode === 'single') {
      return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not found' } };
    }
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  then<A = { data: unknown; error: unknown }, B = never>(
    ok?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, fail);
  }
}

/** תשובת HTTP מדומה בסגנון VercelResponse */
export function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  };
  return res;
}
