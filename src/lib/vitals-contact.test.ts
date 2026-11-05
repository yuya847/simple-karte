import { describe, expect, it } from "vitest";
import { contactDraft, contactVitalLine, vitalsContact, vitalsContactTodos } from "./vitals-contact";
import { vitalsFlash } from "./flash";
import { formFrame, parseNote } from "./notes";
import { emptyStanding } from "./standing";

const vital = { day: 0, time: "11:20", bt: 38.5, hr: 124, sbp: 86, dbp: 50, rr: 28, spo2: 88, avpu: "V" as const };
const patient = { id: "m", name: "宮本 タケ", attending: "山本" };
const line = "11:20 BT 38.5℃ HR 124 BP 86/50 RR 28 SpO2 88%（室内気） 意識 V";
const draftLine = `${line}。NEWS2 15点。主治医 山本に連絡（模擬）。`;

describe("測定を渡した模擬連絡", () => {
  it("連絡時刻と測定時刻を区別し、値・NEWS2・指示簿を残す", () => {
    const standing = { ...emptyStanding("山本", { day: 0, time: "09:00" }), calls: [{ key: "sbpLow" as const, value: 90 }] };
    const n = vitalsContact(vitalsFlash(vital, undefined, standing), patient, "看護師 佐藤", "11:25", "c", vital)!;
    expect(n.at).toBe("11:25");
    expect(n.text).toBe(`看護師から連絡：宮本 タケ ${line}　NEWS2 15点（7点以上）、指示簿：収縮期血圧 90mmHg以下で Dr.call（模擬）`);
    expect(vitalsContactTodos([n])[0]).toMatchObject({ patientId: "m", label: "看護師から連絡：宮本 タケ NEWS2 15点" });
    expect(vitalsContact(null, patient, "看護師", "11:25", "c", vital)).toBeNull();
  });
  it("酸素投与と未測定をそのまま伝える", () => {
    expect(contactVitalLine({ day: 0, time: "11:20", spo2: 92, o2: "鼻カニュラ 2L" })).toBe("11:20 SpO2 92%（鼻カニュラ 2L）");
  });
  it("空のDARにはD・Actを入れ、Rを空にする", () => {
    const text = contactDraft(formFrame("フォーカス（DAR）", "11:25"), vital, 15, "山本");
    expect(text).toBe(`# バイタル・主治医への連絡\nD) ${draftLine}\nAct) 主治医に連絡\nR)\n`);
    expect(parseNote(text).focus?.[0]).toMatchObject({ d: draftLine, act: "主治医に連絡" });
  });
  it("経時記録は一行、既存の文章を保持する", () => {
    const blank = contactDraft(formFrame("経時記録", "11:25"), vital, 15, "山本");
    expect(blank).toBe(`【経時記録】\n${draftLine}\n`);
    const existing = "【経時記録】\n10:00 訪室\n";
    expect(contactDraft(existing, vital, 15, "山本")).toBe(`${existing}${draftLine}\n`);
    const dar = "# 観察\nD) 悪寒あり\nAct) 保温\nR) 続けて観察\n";
    expect(contactDraft(dar, vital, 15, "山本")).toContain(dar);
  });
});
