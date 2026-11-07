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
  return <details onClick={e => e.stopPropagation()} className="relative min-w-20 text-xs"><summary className="cursor-pointer text-ai">ToDo {todos.length}</summary><div className="absolute right-0 z-30 w-72 rounded border border-rule bg-sheet p-3 shadow-lg">{todos.length ? todos.map(t => <label key={t.key} className="flex gap-2 py-1"><input type="checkbox" aria-label={t.text} onChange={() => complete(t.key)} />{t.text}</label>) : "—"}</div></details>;
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
