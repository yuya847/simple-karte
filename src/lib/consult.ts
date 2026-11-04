import { DOCTORS, doctorOf } from "./doctors";
import { ANALYTES, rangeFor } from "./master";
import type { HistoryEntry, OrderEntry, Patient } from "./types";
export interface ConsultReply {
    text: string;
    by: string;
    at: string;
    closed?: boolean;
}
export type ConsultReplies = Record<string, ConsultReply>;
export const consultDepartments = ["循環器内科", "腎臓内科", "消化器内科", "呼吸器内科", "総合診療科", "放射線科", "皮膚科", "精神科"];
export const departmentOf = (name: string) => doctorOf(name)?.team.split(" ")[0] ?? "";
export const doctorsIn = (dept: string) => DOCTORS.filter(d => departmentOf(d.name) === dept);
export const consultOrders = (entries: HistoryEntry[]): OrderEntry[] => entries.filter((e): e is OrderEntry => e.kind === "order" && e.order.type === "procedure" && !!e.order.consult && e.status === "有効");
export const consultState = (r?: ConsultReply) => r?.closed ? "終了" : r?.text ? "返答あり" : "依頼中";
export function addressedTo(e: OrderEntry, name: string) {
    const c = e.order.type === "procedure" ? e.order.consult : undefined;
    return !!c && (c.doctor ? c.doctor === name : c.dept === departmentOf(name));
}
export function closeConsult(r: ConsultReply | undefined): ConsultReply { return { text: "", by: "", at: "", ...r, closed: true }; }
export function consultInbox(people: {
    patient: Patient;
    entries: HistoryEntry[];
}[], name: string, replies: ConsultReplies) {
    return people.flatMap(x => consultOrders(x.entries).filter(e => addressedTo(e, name)).map(entry => ({ patient: x.patient, entry, state: consultState(replies[entry.id]) }))).sort((a, b) => a.entry.day - b.entry.day || a.entry.time.localeCompare(b.entry.time));
}
export function quoteConsultSummary(patient: Patient, entries: HistoryEntry[]) {
    const latest = [...entries].filter(e => e.kind === "note").sort((a, b) => b.day - a.day || b.time.localeCompare(a.time))[0];
    const parts: string[] = [];
    if (latest?.kind === "note") {
        const body = latest.soap ? [latest.soap.a && `A) ${latest.soap.a}`, latest.soap.p && `P) ${latest.soap.p}`].filter(Boolean).join("\n") : latest.text?.match(/(?:^|\n)A\)[\s\S]*/)?.[0]?.trim();
        if (body)
            parts.push(`記事（${latest.day}日 ${latest.time} ${latest.author}）\n${body}`);
    }
    const lab = [...patient.labs].sort((a, b) => b.day - a.day || b.time.localeCompare(a.time))[0];
    if (lab) {
        const values = Object.entries(lab.values).flatMap(([code, v]) => { const a = ANALYTES.find(x => x.code === code); if (!a)
            return []; const r = rangeFor(a, patient.sex); return (r.low !== undefined && v < r.low) || (r.high !== undefined && v > r.high) ? [`${a.name} ${v} ${a.unit}`] : []; });
        if (values.length)
            parts.push(`検査（${lab.day}日 ${lab.time}）\n${values.join("、")}`);
    }
    const image = [...patient.imaging].filter(x => !x.pending && x.report).sort((a, b) => b.day - a.day || (b.time ?? "").localeCompare(a.time ?? ""))[0];
    if (image)
        parts.push(`画像（${image.day}日 ${image.modality} ${image.region}）\n${image.report}`);
    return parts.join("\n\n");
}
export function referralDraft(patientId: string, to: string, dept: string, purpose: string, summary: string): import("./discharge").DischargeDraft {
    return { patientId, dischargeDay: 0, destination: "", outcome: "1", route: "1", sections: { complaint: "", reason: "", present: "", course: summary, status: "", plan: "" }, status: "作成中", letter: { to, dept, doctor: "", purpose, attach: true } };
}
export function consultNotifications(people: {
    patient: Patient;
    entries: HistoryEntry[];
}[], name: string, replies: ConsultReplies) {
    const waiting = consultInbox(people, name, replies).filter(x => x.state === "依頼中");
    return [...(waiting.length ? [{ key: "consult-inbox", label: "コンサルト依頼", count: waiting.length, patientId: null }] : []), ...people.flatMap(x => {
            const answered = consultOrders(x.entries).filter(e => e.author === name && consultState(replies[e.id]) === "返答あり");
            return answered.length ? [{ key: `consult-reply-${x.patient.id}`, label: `返書あり：${x.patient.name}`, count: answered.length, patientId: x.patient.id }] : [];
        })];
}
export function replyConsult(previous: ConsultReply | undefined, text: string, by: string, at: string): ConsultReply {
    if (previous?.closed || previous?.text)
        return previous;
    if (!text.trim() || !by.trim())
        throw new Error("返書と記録者を入力してください");
    return { text: text.trim(), by, at };
}

export function consultReplyNote(id: string, text: string, author: string, time: string): import("./types").NoteEntry {
  return { kind: "note", category: "コンサルト返書", id, day: 0, time, author, role: "医師", text };
}
