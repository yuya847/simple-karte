import type { LineTemplate } from './standing-lines';
export const standingRowKey = (id: string, index: number) => `${id}:${index}`;
export function selectedStandingText(templates: LineTemplate[], keep: string[]): string {
  return templates.flatMap(t => { const [title, ...body] = t.text.split('\n'); const rows = body.filter((_, i) => keep.includes(standingRowKey(t.id, i))); return rows.length ? [[title, ...rows].join('\n')] : []; }).join('\n\n');
}
