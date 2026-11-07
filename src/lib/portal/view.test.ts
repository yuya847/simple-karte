import { describe, expect, it } from "vitest";
import { INITIAL_DESK } from "../billing/worklist";
import { insuranceRecords } from "../billing/registration";
import { isoDate, type CalendarDate } from "../dates";
import { OPD_PATIENTS } from "../opd";
import { OTHER_DEPT_TODAY, call, callToPay } from "../opd-desk";
import { birthDateOf } from "../patient-contacts";
import { PATIENTS } from "../patients";
import { labKey } from "../results";
import { findPerson, labShown, personBirth, portalCall, portalView } from "./view";
import type { PortalInboxEntry } from "./inbox";

const today: CalendarDate = { y: 2026, m: 11, d: 7 };
const OURA = "90010244";
const agree = (patientId: string, agree = true): PortalInboxEntry => ({ id: `l-${patientId}-${agree}`, patientId, kind: "labs", at: { day: 0, time: "10:00" }, iso: "2026-11-07T01:00:00Z", via: "スマートフォン", agree });

describe("患者さんのページに出すもの", () => {
  it("その患者の分だけ：ほかの患者の氏名・記録は入らない", () => {
    const others = PATIENTS.filter((p) => p.id !== OURA);
    const data = {
      documents: [
        { id: "d1", patientId: OURA, kind: "退院療養計画書", values: { name: "大浦 トメ", care: "塩分を控える", next: "11/20 外来" }, by: "山本（専攻医）", at: { day: 0, time: "10:00" } },
        { id: "d2", patientId: OURA, kind: "診断書", values: { use: "保険会社" }, by: "山本（専攻医）", at: { day: 0, time: "10:00" } },
        { id: "d3", patientId: others[0].id, kind: "退院療養計画書", values: { care: "ほかの患者の注意" }, by: "山本（専攻医）", at: { day: 0, time: "10:00" } },
      ],
      portalInbox: [agree(OURA), agree(others[0].id)],
    };
    const v = portalView(OURA, data, today)!;
    const json = JSON.stringify(v);
    expect(v.name).toBe("大浦 トメ");
    for (const o of others) expect(json).not.toContain(o.name);
    expect(json).not.toContain("ほかの患者の注意");
    expect(v.papers.map((p) => p.title)).toEqual(["退院療養計画書"]);
    expect(v.papers[0].sections[0].lines).toContain("療養上の注意（食事・入浴・運動など）：塩分を控える");
    expect(v.consents.map((c) => c.title)).toEqual([expect.stringContaining("入院")]);
    expect(v.consents[0].status).toBe("同意");
    // 病理・画像の所見の文は出さない
    expect(json).not.toContain("浸潤影");
    expect(v.intake).toEqual({ sent: [] });
  });

  it("検査の結果は同意したときだけ、数値と基準範囲と H/L", () => {
    expect(portalView(OURA, {}, today)!.labs).toEqual({ agreed: false, sets: [] });
    const v = portalView(OURA, { portalInbox: [agree(OURA)] }, today)!;
    expect(v.labs.agreed).toBe(true);
    const crp = v.labs.sets[0].rows.find((r) => r.name === "CRP")!;
    expect(crp).toMatchObject({ value: "9.6", flag: "H" });
    expect(crp.range).not.toBe("");
    expect(portalView(OURA, { portalInbox: [agree(OURA), { ...agree(OURA, false), iso: "2026-11-07T02:00:00Z" }] }, today)!.labs.sets).toEqual([]);
  });

  it("今日の結果は医師が確認したものだけ、パニック値は連絡が済んでから", () => {
    const today0 = { day: 0, time: "09:00", values: { Na: 140 } };
    const panic = { day: 0, time: "10:00", values: { K: 7.0 } };
    expect(labShown(OURA, today0, {}, {})).toBe(false);
    expect(labShown(OURA, today0, { [labKey(OURA, today0)]: { by: "山本", at: { day: 0, time: "09:30" } } }, {})).toBe(true);
    const ack = { [labKey(OURA, panic)]: { by: "山本", at: { day: 0, time: "10:30" } } };
    expect(labShown(OURA, panic, ack, {})).toBe(false);
    expect(labShown(OURA, panic, ack, { [labKey(OURA, panic)]: { key: labKey(OURA, panic), patientId: OURA, hits: [], by: "中村", to: "山本", means: "電話", readBack: true, at: { day: 0, time: "10:10" } } })).toBe(true);
    // 前日までの結果はカルテの決まりどおり主治医が見たもの
    expect(labShown(OURA, { day: -1, time: "11:50", values: { Na: 141 } }, {}, {})).toBe(true);
  });

  it("外来：診察券の患者の受付番号と呼出（診察室・会計）", () => {
    const list = [...OPD_PATIENTS, ...OTHER_DEPT_TODAY];
    const harada = list.find((p) => p.id === "opd-2")!;
    expect(portalCall("card:1000102", { opd: list })!.call).toBeNull();
    const called = call(list, "opd-2", "10:05", "山本");
    const c = portalCall("card:1000102", { opd: called })!;
    expect(c.call).toMatchObject({ to: "診察室", room: "診察室1" });
    expect(c.call!.ticket).toMatch(/^\d{3}$/);
    expect(c.visits[0].dept).toBe(harada.department);
    const paying = callToPay(list.map((p) => (p.id === "opd-2" ? { ...p, status: "会計待ち" as const } : p)), "opd-2", "10:40", "医事課");
    expect(portalCall("card:1000102", { opd: paying })!.call).toMatchObject({ to: "会計", room: null });
    // ほかの外来患者の呼出は出ない
    expect(portalCall("card:1000105", { opd: called })!.call).toBeNull();
    const v = portalView("card:1000102", { opd: called }, today)!;
    expect(v.place).toBe("外来");
    expect(JSON.stringify(v)).not.toContain("石田 正男");
    expect(v.intake).toBeNull();
  });

  it("患者が見つからないときは何も返さない", () => {
    expect(findPerson("card:9999999", {})).toBeNull();
    expect(findPerson("00000000", {})).toBeNull();
    expect(portalView("00000000", {}, today)).toBeNull();
  });

  it("生年月日は患者基本情報と同じ（保険で登録した日、なければ年齢から）", () => {
    const p = findPerson(OURA, {})!;
    const registered = insuranceRecords(INITIAL_DESK.insurance, OURA).at(-1)?.insurance.birthDate;
    expect(personBirth(p, {}, today)).toBe(registered || isoDate(birthDateOf({ id: OURA, age: 86 }, today)));
    // 保険の登録がない患者は年齢から作った架空の日
    const kita = findPerson(PATIENTS[2].id, { iji: { insurance: {}, settled: {} } })!;
    expect(personBirth(kita, { iji: { insurance: { [kita.id]: [] }, settled: {} } }, today)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const iji = { insurance: { [OURA]: [{ form: {}, insurance: { birthDate: "1940-02-03" }, action: "登録", by: "医事課", at: { day: 0, time: "09:00" } }] }, settled: {} };
    expect(personBirth(p, { iji }, today)).toBe("1940-02-03");
    const card = findPerson("card:1000102", {})!;
    expect(card.id).toBe("opd:opd-2");
  });

  it("答えを送ったことと確認されたかが見える", () => {
    const sent: PortalInboxEntry = { id: "i1", patientId: OURA, kind: "intake", at: { day: 0, time: "10:12" }, iso: "2026-11-07T01:12:00Z", via: "スマートフォン", answers: { living: "独居" }, done: { by: "看護師 佐藤", at: { day: 0, time: "11:00" }, edited: false } };
    expect(portalView(OURA, { portalInbox: [sent] }, today)!.intake!.sent).toEqual([{ at: "11/7（土） 10:12", done: true }]);
  });
});
