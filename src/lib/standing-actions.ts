import type { Dispatch, SetStateAction } from "react";
import { auditLog } from "./audit";
import type { Role } from "./roles";
import type { NoteEntry } from "./types";
import { lineChangeText } from "./standing-history";
import { changeLine, lineLabel, stopLine, type StandingLine } from "./standing-lines";
import { standingStopDraft, type StandingStopDraft } from "./standing-calendar";

/** The UI supplies storage and chart callbacks; all standing line actions share this path. */
export function standingLineActions({ lines, setLines, me, nowTime, fmtDay, patientName, chartNote, draftNote, blocked }: {
  lines: Record<string, StandingLine[]>;
  setLines: Dispatch<SetStateAction<Record<string, StandingLine[]>>>;
  me: { name: string; role: Role }; nowTime: string; fmtDay: (day: number) => string;
  patientName: (pid: string) => string | undefined;
  chartNote: (pid: string, text: string, category?: NoteEntry["category"]) => void;
  draftNote: (pid: string, text: string) => void;
  blocked: boolean;
}) {
  const record = (pid: string, action: string, detail: string) => {
    chartNote(pid, `【指示簿】${detail}　${me.name} ${fmtDay(0)} ${nowTime}`, "指示簿");
    auditLog({ role: me.role, actor: me.name, action: `${action}（指示簿の行）`, patient: patientName(pid), detail });
  };
  const addStandingLine = (pid: string, draft: StandingLine) => {
    if (blocked) return;
    const l = { ...draft, by: me.name };
    if (l.changedFrom) {
      const result = changeLine(lines[pid] ?? [], l.changedFrom, l, me.name, l.at, l.changeReason);
      if (!result.newId) return;
      setLines((all) => ({ ...all, [pid]: changeLine(all[pid] ?? [], l.changedFrom!, l, me.name, l.at, l.changeReason).lines }));
      record(pid, "変更", lineChangeText(lines[pid] ?? [], l));
      return;
    }
    setLines((all) => ({ ...all, [pid]: [...(all[pid] ?? []), l] }));
    auditLog({ role: me.role, actor: me.name, action: "確定（指示簿の行）", patient: patientName(pid), detail: lineLabel(l) });
    draftNote(pid, `指示簿に行を足した：${lineLabel(l)}`);
  };
  const stopStandingLine = (pid: string, id: string, reason: string, day = 0, kind?: "終了") => {
    const l = lines[pid]?.find((x) => x.id === id);
    if (blocked || !l || !standingStopDraft([l], [id], day, reason).ids.length) return;
    setLines((all) => ({ ...all, [pid]: stopLine(all[pid] ?? [], id, { day, time: nowTime, by: me.name, reason, kind }) }));
    const detail = `${kind ?? "中止"}：${lineLabel(l)} ${fmtDay(day)} ${nowTime}${reason.trim() ? `（理由：${reason.trim()}）` : ""}`;
    record(pid, kind ?? "中止", detail);
  };
  const bulkStopStandingLines = (pid: string, draft: StandingStopDraft) => {
    if (blocked) return;
    const eligible = standingStopDraft(lines[pid] ?? [], draft.ids, draft.day, draft.reason);
    if (!eligible.ids.length) return;
    const time = draft.day === 0 ? nowTime : "00:00";
    setLines((all) => ({ ...all, [pid]: eligible.ids.reduce((ls, id) => stopLine(ls, id, { day: draft.day, time, by: me.name, reason: eligible.reason, kind: draft.kind }), all[pid] ?? []) }));
    record(pid, draft.kind ?? "中止", `${draft.kind ?? "中止"}：${eligible.ids.map((id) => lines[pid]?.find((l) => l.id === id)?.text).join("／")} ${fmtDay(draft.day)} ${time}${eligible.reason ? `（理由：${eligible.reason}）` : ""}`);
  };
  return { addStandingLine, stopStandingLine, bulkStopStandingLines };
}
