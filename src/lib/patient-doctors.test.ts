import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { addDoctor, consultDoctors, doctorLabel, doctorNames, doctorsLine, doctorsOf, INITIAL_DOCTOR_BOOK, involved, relationMark, relationOf, removeDoctor, type OtherDoctor } from "./patient-doctors";
import type { OrderEntry } from "./types";
import { WARD_CHART_PATIENTS } from "./ward-charts";

const tanaka: OtherDoctor = { name: "研修医 田中", role: "担当医", since: { day: -3, time: "09:00" }, by: "山本（専攻医）" };
const nakagawa: OtherDoctor = { name: "中川（循環器内科）", role: "コンサルト医", department: "循環器内科", since: { day: -1, time: "15:00" }, by: "中川（循環器内科）" };

const consult = (id: string, dept: string, status: OrderEntry["status"] = "有効"): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: "10:00",
  author: "山本（専攻医）",
  status,
  order: { type: "procedure", code: "PROC-CONSULT", consult: { dept, question: "心房細動の管理について", urgency: "通常" }, schedule: { kind: "once" }, start: { day: 0 } },
});

describe("患者の医師（主治医・担当医・コンサルト医）", () => {
  it("adds and removes; the same person in the same role is kept once", () => {
    let list = addDoctor([], tanaka);
    list = addDoctor(list, nakagawa);
    list = addDoctor(list, { ...tanaka, note: "改めて" });
    expect(list.map((d) => d.name)).toEqual(["中川（循環器内科）", "研修医 田中"]);
    expect(list[1].note).toBe("改めて");
    expect(removeDoctor(list, "研修医 田中", "担当医").map((d) => d.name)).toEqual(["中川（循環器内科）"]);
    // The same person may be 担当医 and コンサルト医 at once; only the named role goes.
    expect(removeDoctor(list, "研修医 田中", "コンサルト医")).toHaveLength(2);
  });

  it("says how a doctor relates to the patient: the attending's team, then as registered", () => {
    const pd = doctorsOf("山本（専攻医）", [tanaka, nakagawa]);
    expect(relationOf("山本（専攻医）", pd)).toBe("主治医");
    // 田中 is on 山本's team, so the team rule comes first.
    expect(relationOf("研修医 田中", pd)).toBe("主治医");
    expect(relationOf("指導医 高橋", pd)).toBe("主治医");
    expect(relationOf("中川（循環器内科）", pd)).toBe("コンサルト医");
    expect(relationOf("木下（総合診療科 B）", pd)).toBeNull();
    const other = doctorsOf("田村（消化器内科）", [tanaka]);
    expect(relationOf("研修医 田中", other)).toBe("担当医");
    expect(involved("研修医 田中", other)).toBe(true);
    expect(involved("山本（専攻医）", other)).toBe(false);
  });

  it("writes the marks and the line of the patient bar", () => {
    expect(relationMark("主治医")).toBe("主治医");
    expect(relationMark("担当医")).toBe("担当");
    expect(relationMark("コンサルト医")).toBe("コンサルト");
    expect(doctorLabel(tanaka)).toBe("担当医 研修医 田中");
    expect(doctorLabel(nakagawa)).toBe("コンサルト 中川（循環器内科）");
    expect(doctorLabel({ ...nakagawa, name: "田中", pending: true })).toBe("コンサルト 循環器内科 田中（依頼中）");
    expect(doctorsLine(doctorsOf("山本（専攻医）", [tanaka, nakagawa]))).toBe("主治医 山本（専攻医）／担当医 研修医 田中／コンサルト 中川（循環器内科）");
    expect(doctorNames(doctorsOf("山本（専攻医）", [tanaka, nakagawa]))).toEqual(["山本（専攻医）", "研修医 田中", "中川（循環器内科）"]);
  });

  it("puts the asked department's doctor on the list as 依頼中 until the reply names who answered", () => {
    const entries = [consult("c1", "循環器内科"), consult("c2", "腎臓内科", "中止")];
    const pending = consultDoctors(entries, {});
    expect(pending).toEqual([expect.objectContaining({ name: "中川（循環器内科）", role: "コンサルト医", department: "循環器内科", pending: true, by: "山本（専攻医）" })]);
    const answered = consultDoctors(entries, { c1: { by: "循環器内科 田中", at: "14:20" } });
    expect(answered).toEqual([expect.objectContaining({ name: "循環器内科 田中", role: "コンサルト医", department: "循環器内科", since: { day: 0, time: "14:20" } })]);
    expect(answered[0].pending).toBeUndefined();
    // A registered doctor wins over the provisional one of the same name; a different one is added.
    const pd = doctorsOf("山本（専攻医）", [nakagawa], pending);
    expect(pd.others).toEqual([nakagawa]);
    expect(doctorsOf("山本（専攻医）", [tanaka], pending).others).toHaveLength(2);
    expect(doctorsLine(doctorsOf("山本（専攻医）", [], pending))).toBe("主治医 山本（専攻医）／コンサルト 中川（循環器内科）（依頼中）");
  });

  it("the fictional starting point names patients that exist", () => {
    const ids = new Set([...PATIENTS, ...WARD_CHART_PATIENTS].map((p) => p.id));
    for (const id of Object.keys(INITIAL_DOCTOR_BOOK)) expect(ids.has(id)).toBe(true);
    // Two of 山本's patients have the resident; 山本 is a consultant on two other teams' patients.
    expect(PATIENTS.filter((p) => (INITIAL_DOCTOR_BOOK[p.id] ?? []).some((d) => d.name === "研修医 田中"))).toHaveLength(2);
    const asConsultant = WARD_CHART_PATIENTS.filter((p) => involved("山本（専攻医）", doctorsOf(p.attending, INITIAL_DOCTOR_BOOK[p.id])));
    expect(asConsultant.map((p) => p.name).sort()).toEqual(["小池 隆", "村井 和子"]);
    for (const p of asConsultant) expect(relationOf("山本（専攻医）", doctorsOf(p.attending, INITIAL_DOCTOR_BOOK[p.id]))).toBe("コンサルト医");
  });
});
