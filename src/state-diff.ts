export type RecordRow = Record<string, unknown> & { id: string };
export type Change = { table: string; before: RecordRow | null; after: RecordRow | null };

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

// Only explicitly changed rows are sent. Rows created by another session are never deleted.
export function diffRows(table: string, before: RecordRow[], after: RecordRow[]): Change[] {
  const previous = new Map(before.map(row => [row.id, row]));
  const next = new Map(after.map(row => [row.id, row]));
  if (previous.size !== before.length || next.size !== after.length) throw new Error('Duplicate row IDs');
  const changes: Change[] = [];
  for (const [id, row] of next) {
    if (!id) throw new Error('Missing row ID');
    const old = previous.get(id) ?? null;
    if (canonical(old) !== canonical(row)) changes.push({table, before: old, after: row});
  }
  for (const [id, row] of previous) if (!next.has(id)) changes.push({table, before: row, after: null});
  return changes;
}
