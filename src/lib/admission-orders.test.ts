import { describe, expect, it } from "vitest";
import { INITIAL_REQUESTS } from "./admission";
import { admissionMissingNow, admissionOrdersMissing, standingFromRequest, standingTakeLines } from "./admission-orders";
import { lineChanges } from "./standing-lines";
import { ADMISSION_TEMPLATE } from "./standing-form";
import type { DietOrder } from "./diet";
import type { Patient } from "./types";
import { admissionOrderFlags } from "./patient-flags";

const at = { day: 0, time: "10:00" };
const request = INITIAL_REQUESTS[0];
const base = standingFromRequest(request, request.by, at);
const diet = { patientId: "p", kind: "絶食" } as DietOrder;
describe("入院申込と入院時指示", () => {
  it.each([["ベッド上", "ベッド上"], ["車いす", "車いす"], ["歩行可", "病棟内歩行"]] as const)("%sを指示簿の%sに引き継ぐ", (rest, expected) => {
    const s = standingFromRequest({ ...request, rest }, request.by, at);
    expect(s).toMatchObject({ rest: expected, by: request.by, at, vitals: null });
    expect(s.taken).toBeUndefined();
    expect(s.at).not.toBe(at);
  });
  it("食事（絶食も含む）とバイタルがそろうまで不足を返す", () => {
    expect(admissionOrdersMissing(undefined, [])).toEqual(["食事", "バイタル"]);
    expect(admissionOrdersMissing(base, [diet])).toEqual(["バイタル"]);
    expect(admissionOrdersMissing({ ...base, vitals: "1日3回" }, [])).toEqual(["食事"]);
    expect(admissionOrdersMissing({ ...base, vitals: "1日3回" }, [diet])).toEqual([]);
    expect(admissionOrderFlags([])).toEqual([]);
    expect(admissionOrderFlags(["食事", "バイタル"])[0]).toMatchObject({ label: "入院時指示がまだ（食事・バイタル）", action: "standing" });
  });
  it("自由文の食事・バイタルも数え、体重だけでは完了にしない", () => {
    const line = { id: "v", cat: "バイタル" as const, text: "勤務ごとに測定", start: at, at, by: request.by };
    const food = { ...line, id: "d", cat: "食事" as const, text: "常食" };
    expect(admissionMissingNow([], [line, food], [], "10:01")).toEqual([]);
    expect(admissionMissingNow([], [{ ...line, text: "体重測定：毎朝" }], [diet], "10:01")).toEqual(["バイタル"]);
    expect(admissionMissingNow([], [{ ...line, stop: { ...at, by: request.by } }], [diet], "10:01")).toEqual(["バイタル"]);
  });
  it("患者ごとに既存の指示受けの行の経路に載る", () => {
    const fields = standingTakeLines({ p: [base], q: [base] }, {});
    expect(fields.p[0].id).not.toBe(fields.q[0].id);
    const rows = lineChanges([{ patient: { id: "p", name: "架空" } as Patient, room: "505C", entries: [] }], fields, new Set(), 0, 601, String);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "指示簿", text: expect.objectContaining({ main: "安静度：車いす", author: request.by }) });
  });
  it("テンプレートは申込の安静度を保ち、確認前の下書きになる", () => {
    const s = ADMISSION_TEMPLATE.draft({ ...base, rest: "ベッド上" });
    expect(s).toMatchObject({ rest: "ベッド上", bath: "清拭", vitals: "1日3回", weight: "毎朝", callConscious: true });
    expect(s.prn.map((r) => r.drug.code)).toEqual(["ORAL-APAP500", "ORAL-APAP500"]);
    expect(s.other).toContain("不眠時：医師に連絡");
    expect(base.vitals).toBeNull();
    expect(admissionMissingNow([s], [], [diet], "10:01")).toEqual([]);
    expect(admissionMissingNow([{ ...s, until: -1 }], [], [diet], "10:01")).toEqual(["バイタル"]);
  });
});
