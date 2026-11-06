import { describe, expect, it } from "vitest";
import { PATIENTS } from "../patients";
import { UNCODED } from "../diagnoses";
import { classify, inspectCounts, inspectItems } from "./inspect";
import { receiptInspection } from "./inspect-run";
import { ASSUMED_INSURANCE_ISSUE } from "./insurance";
import { DEFAULT_OPTIONS } from "./model";
import type { PatientMonthInput } from "./month";
import { patientMonthPayload } from "./payload";

describe("点検の分け方", () => {
  it("sorts the claim's own checks", () => {
    expect(classify({ level: "review", text: "造影剤（薬剤料）はこの試作では入っていません。使った造影剤を足してください。" })).toBe("算定漏れの候補");
    expect(classify({ level: "info", text: "入退院支援加算１は退院した日に算定します（まだ退院していません）。" })).toBe("算定漏れの候補");
    expect(classify({ level: "choose", text: "A と B は同じ加算識別で、どちらか一方しか算定できません。" })).toBe("人が選ぶ");
    expect(classify({ level: "excluded", text: "X は施設基準の届出がないため算定しません。" })).toBe("算定から外したもの");
    expect(classify({ level: "info", text: "持参薬（2件）は患者が持ってきた薬なので、薬剤料・調剤料を算定しません。" })).toBeNull();
    expect(classify({ level: "review", text: ASSUMED_INSURANCE_ISSUE })).toBe("確かめる");
  });
  it("adds the receipt's checks and 未コード化の病名 once", () => {
    const d = { id: "d", name: "かぜ", code: UNCODED } as never;
    const items = inspectItems([], ["山田：主傷病がありません", "山田：未コード化傷病名が 1 件あります（かぜ）。傷病名マスターの名前に直してください"], [d]);
    expect(items.map((i) => i.kind)).toEqual(["病名と算定の不一致", "病名と算定の不一致"]);
    expect(items[0].text).toBe("主傷病がありません");
    expect(inspectItems([], [], [d])[0].from).toBe("病名の登録");
    expect(inspectCounts([{ items }])["病名と算定の不一致"]).toBe(2);
  });
});

describe("the server's 点検 of the demo patients", () => {
  it("runs the same claim and receipt checks, keeping every level", () => {
    const inputs = PATIENTS.map((p) => patientMonthPayload(p, p.history, [], DEFAULT_OPTIONS) as unknown as PatientMonthInput);
    const r = receiptInspection(inputs, "2026-11-04", "10:00", "2026-11");
    expect(r).toHaveLength(PATIENTS.length);
    const first = r[0];
    expect(first.days).toBeGreaterThan(0);
    // No 病名 registered in this input: the receipt check says so.
    expect(first.receiptProblems.some((t) => t.includes("傷病名が1つもありません"))).toBe(true);
    expect(first.issues.some((i) => i.level === "info")).toBe(true);
  });
  it("answers on POST /api/receipt-check, and refuses a body without patients", async () => {
    const { POST } = await import("@/app/api/receipt-check/route");
    const body = { today: "2026-11-04", nowTime: "10:00", month: "2026-11", patients: [patientMonthPayload(PATIENTS[0], PATIENTS[0].history, [], DEFAULT_OPTIONS)] };
    const res = await POST(new Request("http://x/api/receipt-check", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.patients[0].id).toBe(PATIENTS[0].id);
    expect((await POST(new Request("http://x", { method: "POST", body: "{}" }))).status).toBe(400);
  });
});

describe("形式と請求内容の点検を分ける", () => {
  it("一括作成と点検一覧の未解決件数が一致する", async () => {
    const { POST } = await import("@/app/api/receipt/route");
    const patients = [patientMonthPayload({...PATIENTS[0], id: "unregistered-trial"}, PATIENTS[0].history, [], DEFAULT_OPTIONS)];
    const inspections = receiptInspection(patients as unknown as PatientMonthInput[], "2026-11-04", "10:00", "2026-11");
    expect(inspections[0].issues.some(i => i.text === ASSUMED_INSURANCE_ISSUE)).toBe(true);
    expect(inspections[0].unresolved).toBeGreaterThan(0);
    const response = await POST(new Request("http://x", {method: "POST", body: JSON.stringify({today: "2026-11-04", nowTime: "10:00", month: "2026-11", patients})}));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.unresolved).toBe(inspections[0].unresolved);
    expect(result.target).toMatchObject({total: 1, included: 1, excluded: 0});
  });
});
