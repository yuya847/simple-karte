import { describe, expect, it } from "vitest";
import { INITIAL_DIAGNOSES } from "../diagnoses";
import { PATIENTS } from "../patients";
import type { HistoryEntry, OrderEntry } from "../types";
import { classifyCode, dpcMonth, DpcRequest, dpcView } from "./dpc-claim";
import { FICTIONAL_COEFFICIENT } from "./dpc";
import { calculateClaim } from "./engine";
import { DEFAULT_OPTIONS, type ClaimInput } from "./model";
import { patientMonthPayload } from "./payload";

// Today is Wednesday 2026-11-04. 佐倉 (入院 -3) came in on 11/1, 北村 (入院 -5) on 10/30.
const TODAY = "2026-11-04";
const input = (id: string, entries?: HistoryEntry[]): Omit<ClaimInput, "month"> => {
  const p = PATIENTS.find((x) => x.id === id)!;
  const payload = patientMonthPayload(p, entries ?? p.history, INITIAL_DIAGNOSES[id], DEFAULT_OPTIONS);
  return { ...(payload as unknown as Omit<ClaimInput, "month" | "today" | "nowTime">), today: TODAY, nowTime: "12:00" };
};
const opts = { coefficient: FICTIONAL_COEFFICIENT, transfer: null };

describe("包括に含まれるもの・出来高に残るもの（告示第96号 別表 2 イ・ロ）", () => {
  it.each([
    ["190199910", true, "A100 急性期一般入院料４"],
    ["190145710", true, "A207-3 急性期看護補助体制加算（注4 でない）"],
    ["190832370", false, "A207-3 注4 看護補助体制充実加算"],
    ["190120510", true, "A234 医療安全対策加算１"],
    ["190147510", false, "A234-3 患者サポート体制充実加算"],
    ["190207010", true, "A245 データ提出加算"],
    ["190192110", true, "A244 病棟薬剤業務実施加算２"],
    ["190192210", false, "A244 病棟薬剤業務実施加算３"],
    ["190171910", false, "A205 救急医療管理加算１"],
    ["190192310", false, "A246 入退院支援加算１"],
    ["190193310", false, "A247 認知症ケア加算"],
    ["190834610", false, "A253 協力対象施設入所者入院加算"],
    ["113017610", false, "B001 10 入院栄養食事指導料１"],
    ["113010810", false, "B008 薬剤管理指導料"],
    ["180016110", false, "B009 診療情報提供料（Ⅰ）"],
    ["160000310", true, "D000 尿一般"],
    ["140005610", true, "J024 酸素吸入"],
    ["140009310", true, "J045 人工呼吸（30分まで）"],
    ["140023510", false, "J045 人工呼吸 5時間超 14日目まで（3のイ）"],
    ["140063810", true, "J045 人工呼吸 5時間超 15日目以降（3のロ）"],
    ["140007710", false, "J038 人工腎臓"],
    ["170027110", false, "E003 3イ 選択的血管造影"],
    ["170012210", true, "E003 3ロ"],
    ["150224910", false, "K920 輸血（第10部 手術）"],
    ["180737910", false, "O 入院ベースアップ評価料（第14部）"],
    ["180712910", false, "O 看護職員処遇改善評価料（第14部）"],
    ["180820810", false, "O100 物価対応料２（第14部）"],
  ])("%s %s（%s）", (code, inPackage) => {
    expect(classifyCode(code).inPackage).toBe(inPackage);
  });
});

describe("デモの患者の月：包括 + 出来高に残る部分 と 出来高の算定", () => {
  it("佐倉さん（右下腿蜂巣炎）11月：080010xxxx0xxx、入院1〜4日目は入院期間Ⅰ 3,133点 × 1.3", () => {
    const r = dpcMonth(input("90010231"), "2026-11", opts);
    expect(r.chosen).toMatchObject({ icd10: "L031", by: "default" });
    expect(r.outcome?.ok && r.outcome.d.code).toBe("080010xxxx0xxx");
    expect(r.now).toEqual({ hospitalDay: 4, period: "Ⅰ", points: 3133 });
    expect(r.pkg?.lines).toEqual([{ period: "Ⅰ", from: 1, to: 4, days: 4, points: 3133, perDay: 4072.9, subtotal: 16291.6 }]);
    expect(r.pkg?.total).toBe(16292);
    // Every 出来高 point of the month is either replaced by the 包括 or stays 出来高.
    expect(r.replaced + r.outsideTotal).toBe(r.ffsTotal);
    const ffs = calculateClaim({ ...input("90010231"), month: "2026-11" });
    expect(r.ffsTotal).toBe(ffs.totalPoints);
    expect(r.dpcTotal).toBe(16292 + r.outsideTotal);
    const codes = r.outside.map((l) => l.code);
    expect(codes).toContain("180737910"); // 入院ベースアップ評価料
    expect(codes).toContain("190147510"); // 患者サポート体制充実加算
    expect(codes).not.toContain("190199910"); // 入院料は包括
  });

  it("佐倉さんで MRSA 菌血症を選ぶと 180010x0xxx0xx（3,428点）", () => {
    const r = dpcMonth(input("90010231"), "2026-11", { ...opts, mainDiagnosisId: "d-sakura-2" });
    expect(r.chosen).toMatchObject({ icd10: "A410", by: "doctor" });
    expect(r.outcome?.ok && r.outcome.d.code).toBe("180010x0xxx0xx");
    expect(r.pkg?.total).toBe(Math.round(3428 * 1.3 * 4));
  });

  it("大浦さん（誤嚥性肺炎）：酸素・吸引は 処置等２ の定義でない → 040081xx99x0xx", () => {
    const r = dpcMonth(input("90010244"), "2026-11", opts);
    expect(r.outcome?.ok && r.outcome.d.code).toBe("040081xx99x0xx");
    expect(r.now.hospitalDay).toBe(2);
    expect(r.replaced + r.outsideTotal).toBe(r.ffsTotal);
  });

  it("北村さん（心不全）：10月と11月にまたがる。11月は入院3〜6日目、入院経路が記録にないので転院の候補も出す", () => {
    const r = dpcMonth(input("90010198"), "2026-11", opts);
    expect(r.outcome?.ok && r.outcome.d.code).toBe("050130xx9900x0");
    expect(r.pkg?.lines.map((l) => [l.period, l.from, l.to])).toEqual([["Ⅰ", 3, 6]]);
    expect(r.pkg?.total).toBe(Math.round(3150 * 1.3 * 4));
    expect(r.outcome?.ok && r.outcome.d.alternatives.map((a) => a.code)).toContain("050130xx9900x1");
    const oct = dpcMonth(input("90010198"), "2026-10", opts);
    expect(oct.pkg?.lines.map((l) => [l.period, l.from, l.to])).toEqual([["Ⅰ", 1, 2]]);
  });

  it("森さん（急性腎盂腎炎）→ 110310xx99xxxx、入院3日目", () => {
    const r = dpcMonth(input("90010260"), "2026-11", opts);
    expect(r.outcome?.ok && r.outcome.d.code).toBe("110310xx99xxxx");
    expect(r.now).toEqual({ hospitalDay: 3, period: "Ⅰ", points: 3232 });
  });

  it("画面が送る形（POST /api/dpc）を受け付け、表の中身は返さずにコードと行を返す", () => {
    const p = PATIENTS.find((x) => x.id === "90010198")!;
    const body = JSON.parse(
      JSON.stringify({
        today: TODAY,
        nowTime: "12:00",
        month: "2026-11",
        ...patientMonthPayload(p, p.history, INITIAL_DIAGNOSES[p.id], DEFAULT_OPTIONS, { diets: [], letters: [], notGiven: [] }),
        dpc: { coefficient: 1.3, transfer: true },
      }),
    );
    const parsed = DpcRequest.safeParse(body);
    expect(parsed.success).toBe(true);
    const { month, dpc, ...rest } = parsed.data!;
    const view = JSON.parse(JSON.stringify(dpcView(dpcMonth(rest as unknown as Omit<ClaimInput, "month">, month, dpc))));
    expect(view.outcome.d.code).toBe("050130xx9900x1");
    expect(view.outcome.d.cls).toEqual({ code: "050130", name: "心不全", mdcName: "循環器系疾患", usesTransfer: true });
    expect(view.outcome.d.row.points).toEqual([2937, 2091, 1778]);
    expect(DpcRequest.safeParse({ ...body, dpc: { coefficient: 9, transfer: null } }).success).toBe(false);
  });

  it("輸血のオーダ（実施済）は手術あり：森さんなら 110310xx97xxxx", () => {
    const p = PATIENTS.find((x) => x.id === "90010260")!;
    const tx: OrderEntry = {
      kind: "order",
      id: "t-tx",
      day: -1,
      time: "10:00",
      author: "試験",
      status: "実施済",
      order: { type: "procedure", code: "PROC-TX", tx: { product: "RBC", units: 2, abo: "B", rh: "+", reason: "試験" }, schedule: { kind: "once" }, start: { day: -1, time: "10:00" } } as never,
    };
    const r = dpcMonth(input("90010260", [...p.history, tx]), "2026-11", opts);
    expect(r.outcome?.ok && r.outcome.d.code).toBe("110310xx97xxxx");
  });
});
