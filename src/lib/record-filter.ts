import { noteText } from "./notes";
import type { HistoryEntry, NoteEntry } from "./types";

type TemplateIdentity = { id: string; name: string };

/** 保存した印を優先。古い記事は先頭の見出しだけを照合する。 */
export function templateOfNote(note: NoteEntry, templates: readonly TemplateIdentity[]): TemplateIdentity | null {
  if (note.templateId) {
    const known = templates.find((t) => t.id === note.templateId);
    const name = note.templateName || known?.name;
    return name ? { id: note.templateId, name } : null;
  }
  const heading = noteText(note).trimStart().split("\n")[0].trimEnd();
  const found = templates.find((t) => heading === `【${t.name}】`);
  return found ? { id: found.id, name: found.name } : null;
}

export function templateOptions(entries: readonly HistoryEntry[], templates: readonly TemplateIdentity[]) {
  const counts = new Map<string, TemplateIdentity & { count: number }>();
  for (const e of entries) {
    const t = e.kind === "note" ? templateOfNote(e, templates) : null;
    if (t) counts.set(t.id, { ...t, count: (counts.get(t.id)?.count ?? 0) + 1 });
  }
  return [...counts.values()];
}

export function matchesTemplate(e: HistoryEntry, templates: readonly TemplateIdentity[], ids: readonly string[], onlyTemplates: boolean) {
  if (!onlyTemplates && ids.length === 0) return true;
  const t = e.kind === "note" ? templateOfNote(e, templates) : null;
  return !!t && (ids.length === 0 || ids.includes(t.id));
}

export function templateStamp(note: NoteEntry, templates: readonly TemplateIdentity[], inserted?: { templateId: string; templateName: string } | null) {
  if (inserted && noteText(note).split("\n").some((line) => line.trim() === `【${inserted.templateName}】`)) return inserted;
  const t = templateOfNote(note, templates);
  return t ? { templateId: t.id, templateName: t.name } : {};
}
