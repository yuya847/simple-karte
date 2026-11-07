import type { HistoryEntry, NoteEntry } from "./types";
import { isBlankNote, noteKey, noteText } from "./notes";

export type TodoCompletions = Record<string, { by: string; at: string }>;
export interface NoteTodo { key: string; text: string; done: boolean; note: NoteEntry; line: number }
export const todoKey = (n: NoteEntry, line: number, text: string) => JSON.stringify([noteKey(n), line, text]);
export function noteTodos(n: NoteEntry, done: TodoCompletions = {}): NoteTodo[] {
  return noteText(n).split("\n").flatMap((line, i) => {
    const m = line.match(/^\s*[☐☑] (.+)$/);
    if (!m) return [];
    const key = todoKey(n, i, m[1]);
    return [{ key, text: m[1], done: line.trimStart().startsWith("☑") || !!done[key], note: n, line: i }];
  });
}
export function summaryText(n: NoteEntry): string {
  const lines = noteText(n).split("\n");
  // Older SOAP notes may have the prefix folded into S by the original parser.
  if (lines[0]?.startsWith("S) 📋 ")) lines[0] = lines[0].slice(3);
  const out: string[] = [];
  for (const line of lines) { if (!line.startsWith("📋 ") || out.length === 3) break; out.push(line.slice(3)); }
  return out.join("\n");
}
export function noteOverview(entries: HistoryEntry[], role = "医師", done: TodoCompletions = {}) {
  const notes = entries.filter((e): e is NoteEntry => e.kind === "note" && e.role === role && e.day <= 0).sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));
  const summary = notes.map(summaryText).find(Boolean) ?? "";
  // Carried text is counted once; the newest occurrence determines its state.
  const seen = new Set<string>();
  const todos: NoteTodo[] = [];
  for (const n of notes) {
    const items = noteTodos(n, done);
    todos.push(...items.filter(t => !seen.has(t.text) && !t.done));
    items.forEach(t => seen.add(t.text));
  }
  return { summary, todos };
}
export function carryNote(raw: string, entries: HistoryEntry[], role: string, done: TodoCompletions = {}): string {
  if (!isBlankNote(raw)) return raw;
  const o = noteOverview(entries, role, done);
  if (!o.summary && !o.todos.length) return raw;
  const summary = o.summary.split("\n").filter(Boolean).map(s => `📋 ${s}`).join("\n");
  const todos = o.todos.map(t => `☐ ${t.text}`).join("\n");
  const body = todos ? (/^P\)/m.test(raw) ? raw.replace(/^P\)[^\n]*/m, s => `${s}\n${todos}`) : `${raw.trimEnd()}\nP)\n${todos}`) : raw;
  return [summary, body.trim()].filter(Boolean).join("\n") + "\n";
}
export function completedNote(n: NoteEntry, done: TodoCompletions): string {
  const lines = noteText(n).split("\n");
  for (const t of noteTodos(n, done)) if (t.done) lines[t.line] = lines[t.line].replace("☐", "☑");
  return lines.join("\n");
}

/** A carried summary and template alone are not a new clinical record. */
export const noteChanged = (value: string, initial?: string) => !isBlankNote(value) && value.trim() !== initial?.trim();

/** Refresh only inherited checkboxes; the newest occurrence determines whether a task remains open. */
export function refreshCarriedTodos(value: string, entries: HistoryEntry[], role: string, done: TodoCompletions): string {
  const pending = new Set(noteOverview(entries, role, done).todos.map(t => t.text));
  return value.split("\n").filter(line => !line.startsWith("☐ ") || pending.has(line.slice(2))).join("\n");
}
