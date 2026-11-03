import { describe, expect, it } from "vitest";
import { initialErPatients } from "./er";
import { EMPTY_DESK, confirmReport, drawRows, entryPlan, receive, rejectSpecimen, scanSpecimen, whenText } from "./lab-desk";
import { visitLabOrders, visitPatientId, visitPeople } from "./lab-visits";
import { OPD_PATIENTS } from "./opd";
import { PANIC_LIMITS, callScript, placeOf, resultsOf, uncalled } from "./results";

const NOW = 10 * 60;
const er = initialErPatients(NOW);
const orders = visitLabOrders(NOW);

describe("救急外来・外来の検体", () => {
  it("today's visits with lab orders get a small chart under the visit's id", () => {
    const visits = visitPeople(er, OPD_PATIENTS, orders, EMPTY_DESK);
    expect(visits.map((v) => `${v.patient.id} ${v.patient.name} ${v.room}`)).toEqual(["er:er-1 宮本 タケ 救急", "er:er-3 永井 茂 救急", "opd:opd-1 石田 正男 外来"]);
    expect(visitPatientId("er", "er-1")).toBe("er:er-1");
    expect(visits[1].patient).toMatchObject({ ward: "救急外来", sex: "男", age: 76, allergies: ["ペニシリン系（皮疹）"], attending: "山本（専攻医）" });
    expect(visits[2].patient).toMatchObject({ ward: "外来", department: "総合診療科" });
    expect(visitPeople(er, OPD_PATIENTS, {}, EMPTY_DESK)).toEqual([]);
    expect([placeOf("er:er-1"), placeOf("opd:opd-1"), placeOf("90010231")]).toEqual(["救急", "外来", "病棟"]);
  });

  it("their samples are listed with the 救急 / 外来 mark, drawn before this session, and taken in like the ward's", () => {
    const visits = visitPeople(er, OPD_PATIENTS, orders, EMPTY_DESK);
    const rows = drawRows(visits, {}, EMPTY_DESK, NOW, NOW);
    expect(rows.map((r) => `${r.place} ${r.name} ${whenText(r.at)} ${r.status}`)).toEqual([
      "救急 宮本 タケ 08:40 採取済み",
      "救急 宮本 タケ 08:40 採取済み",
      "救急 宮本 タケ 08:45 採取済み",
      "救急 永井 茂 09:30 採取済み",
      "外来 石田 正男 09:45 採取済み",
    ]);
    expect(rows.every((r) => r.urgent)).toBe(true);
    const nagai = rows.find((r) => r.name === "永井 茂")!;
    expect(scanSpecimen(nagai.code, rows, visits, NOW)).toMatchObject({ ok: true, tone: "ok" });
    expect(entryPlan(nagai.codes).analytes.map((a) => a.code)).toContain("BNP");
  });

  it("a visit's sample not drawn yet says to ask the ED, not the ward", () => {
    const later = { "er:er-3": [{ ...orders["er:er-3"][0], order: { ...orders["er:er-3"][0].order, collect: { day: 0, time: "10:20" } } }] } as typeof orders;
    const visits = visitPeople(er, OPD_PATIENTS, later, EMPTY_DESK);
    const rows = drawRows(visits, {}, EMPTY_DESK, NOW - 60, NOW);
    const s = scanSpecimen(rows[0].code, rows, visits, NOW)!;
    expect(s).toMatchObject({ ok: true, tone: "warn" });
    expect(s.message).toContain("救急外来の採取の記録はこの試作にありません");
  });

  it("their results and panic values go to the laboratory's list, phoned as 救急外来", () => {
    let visits = visitPeople(er, OPD_PATIENTS, orders, EMPTY_DESK);
    const row = drawRows(visits, {}, EMPTY_DESK, NOW, NOW).find((r) => r.name === "石田 正男")!;
    const desk = confirmReport(receive(EMPTY_DESK, row, "検査技師 中村", NOW + 5), row, { Na: 138, K: 7.3, Cl: 101, BUN: 30, Cre: 1.2, BNP: 880 }, "検査技師 中村", NOW + 30);
    visits = visitPeople(er, OPD_PATIENTS, orders, desk);
    const ishida = visits.find((v) => v.patient.id === "opd:opd-1")!;
    const items = resultsOf(ishida.patient, PANIC_LIMITS);
    expect(items[0].key).toBe(`lab|opd:opd-1|0|09:45|${row.code}`);
    const waiting = uncalled(items, {});
    expect(waiting[0].panic.map((h) => h.code)).toEqual(["K"]);
    expect(callScript(waiting[0], ishida.patient, ishida.room)[1]).toBe("① 外来");
    const nagai = visits.find((v) => v.patient.id === "er:er-3")!;
    expect(callScript({ ...waiting[0], patientId: nagai.patient.id }, nagai.patient, nagai.room)[1]).toBe("① 救急外来");
  });

  it("a visit's sample sent back comes back to the list as a new draw", () => {
    const visits = visitPeople(er, OPD_PATIENTS, orders, EMPTY_DESK);
    const row = drawRows(visits, {}, EMPTY_DESK, NOW, NOW).find((r) => r.name === "永井 茂")!;
    const got = receive(EMPTY_DESK, row, "検査技師 中村", NOW + 5);
    const received = drawRows(visits, {}, got, NOW, NOW + 5).find((r) => r.code === row.code)!;
    const sent = rejectSpecimen(got, received, "凝固", "", "検査技師 中村", NOW + 10);
    const rows = drawRows(visitPeople(er, OPD_PATIENTS, orders, sent), {}, sent, NOW, NOW + 10).filter((r) => r.name === "永井 茂");
    expect(rows.map((r) => `${r.status}${r.redrawOf ? " 再採血" : ""}`)).toEqual(["再採血", "未採取 再採血"]);
  });
});
