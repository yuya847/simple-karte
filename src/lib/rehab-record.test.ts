import { describe, expect, it } from "vitest";
import { cautionHits, sessionNote, upsertSessionNote } from "./rehab-record";
import { demoRehabOrders, initialRehabDesk, rehabPrescriptions } from "./rehab";
import { currentEntries, matchesRecordFacets } from "./record";
import { noteText } from "./notes";
import { PATIENTS } from "./patients";

const rx = rehabPrescriptions(PATIENTS.map((patient) => ({ patient, room: patient.room, entries: demoRehabOrders()[patient.id] ?? [] }))).find((r) => r.patientId === "90010198")!;
const session = initialRehabDesk().sessions[0];
describe("実施をカルテへ残す", () => {
  it("開始時刻・療法士・内容と単位を残し、同じIDを置き換える", () => {
    const note = sessionNote(session, rx, session.recordedAt!.by);
    expect(note).toMatchObject({ id: session.id, category: "リハビリ実施", time: "11:00", role: "療法士", writtenAt: { time: "11:50" } });
    expect(note.text).toContain("理学療法（PT）11:00〜11:40 2単位");
    const corrected = sessionNote({ ...session, content: "訂正した訓練" }, rx, "療法士 木村");
    expect(upsertSessionNote([note], corrected)).toEqual([corrected]);
    expect(upsertSessionNote([corrected], corrected)).toHaveLength(1);
    const patient = PATIENTS.find((p) => p.id === rx.patientId)!;
    const history = currentEntries(patient, { added: [], stopped: [], notes: [corrected] });
    expect(history).toContainEqual(corrected);
    expect(matchesRecordFacets(corrected, patient.department, [], ["療法士"])).toBe(true);
    expect(noteText(corrected)).toContain("訂正した訓練");
  });
  it("実施しなかった理由を残す", () => {
    expect(sessionNote({ ...session, recordedAt: undefined, notDone: { day: 0, time: "11:10", by: "木村", reason: "発熱で中止" } }, rx, "木村")).toMatchObject({ category: "リハビリ", text: "実施せず 11:00 発熱で中止" });
  });
});
describe("注意文の数値だけを読む", () => {
  const caution = "HR 120/分以上・SBP 90mmHg未満・SpO2 90%未満で中止";
  it("境界値と未測定を扱う", () => {
    expect(cautionHits(caution, { day: 0, time: "10:00", hr: 120, sbp: 89, spo2: 89 })).toEqual(["hr", "sbp", "spo2"]);
    expect(cautionHits(caution, { day: 0, time: "10:00", hr: 119, sbp: 90, spo2: 90 })).toEqual([]);
    expect(cautionHits(caution, { day: 0, time: "10:00" })).toEqual([]);
  });
  it("全角と空白、以下を読み、曖昧な文は強調しない", () => {
    expect(cautionHits("ＢＴ ３８℃以上、SBP 90 mmHg 以下", { day: 0, time: "10:00", bt: 38, sbp: 90 })).toEqual(["bt", "sbp"]);
    expect(cautionHits("頻脈・息切れ・体重増加に注意", { day: 0, time: "10:00", hr: 130 })).toEqual([]);
  });
});
