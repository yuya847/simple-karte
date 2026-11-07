"use client";
import { createContext, useContext, useEffect } from "react";
import { noteTemplate } from "@/lib/notes";
import type { HistoryEntry, NoteEntry } from "@/lib/types";
import { carryNote, completedNote, noteOverview, refreshCarriedTodos, type TodoCompletions } from "@/lib/note-overview";
import { NoteText } from "./NoteText";

export const NoteOverviewContext = createContext<{ patientId?: string; entriesOf: (id: string) => HistoryEntry[]; role: string; done: TodoCompletions; complete: (key: string) => void }>({ entriesOf: () => [], role: "医師", done: {}, complete: () => {} });
export const patientTodoDone = (done: TodoCompletions, id: string) => Object.fromEntries(Object.entries(done).filter(([key]) => key.startsWith(`${id}:`)).map(([key, value]) => [key.slice(id.length + 1), value]));
export function useNoteOverview(id: string) {
  const c = useContext(NoteOverviewContext);
  return { ...noteOverview(c.entriesOf(id), c.role === "看護師" ? "看護師" : "医師", patientTodoDone(c.done, id)), complete: (key: string) => c.complete(`${id}:${key}`) };
}
export function SummaryCell({ id, onOpen }: { id: string; onOpen: () => void }) {
  const { summary } = useNoteOverview(id);
  return <button type="button" title={summary || undefined} onClick={e => { e.stopPropagation(); onOpen(); }} className="line-clamp-2 w-48 whitespace-pre-line text-left text-xs text-ai">{summary || "—"}</button>;
}
export function TodoCell({ id }: { id: string }) {
  const { todos, complete } = useNoteOverview(id);
  // Every open ToDo, small and one line each, so the list shows them without opening anything.
  return <div onClick={e => e.stopPropagation()} aria-label={`ToDo ${todos.length}`} className="w-52 text-[10px] leading-[1.3]">{todos.length ? todos.map(t => <label key={t.key} title={t.text} className="flex items-start gap-1"><input type="checkbox" aria-label={t.text} onChange={() => complete(t.key)} className="mt-px h-2.5 w-2.5 shrink-0" /><span className="line-clamp-1">{t.text}</span></label>) : <span className="text-ink-faint">—</span>}</div>;
}
export function CompletedNote({ note }: { note: NoteEntry }) {
  const c = useContext(NoteOverviewContext);
  const done = patientTodoDone(c.done, c.patientId ?? "");
  const audit = Object.entries(done).filter(([key]) => key.startsWith(JSON.stringify([note.id ?? `${note.day}|${note.time}|${note.author}`]).slice(0, -1))).map(([, d]) => `${d.by} ${d.at}`).join("\n");
  return <div className="whitespace-pre-wrap" title={audit || undefined}><NoteText text={completedNote(note, done)} /></div>;
}
export function CarryNote({ id, value, initial, onChange }: { id: string; value: string; initial?: string; onChange: (s: string) => void }) {
  const c = useContext(NoteOverviewContext);
  useEffect(() => {
    const entries = c.entriesOf(id);
    const done = patientTodoDone(c.done, id);
    const restoredInitial = initial === undefined && value.trim() === carryNote(noteTemplate(c.role), entries, c.role).trim();
    const raw = value === initial || restoredInitial ? refreshCarriedTodos(value, entries, c.role, done) : value;
    const next = carryNote(raw, entries, c.role, done);
    if (next !== value || restoredInitial) onChange(next);
  }, [id, value, initial, onChange, c]);
  return null;
}
