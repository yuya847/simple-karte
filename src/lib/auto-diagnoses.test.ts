import { afterEach, describe, expect, it, vi } from "vitest";
import { autoDiagnoses, diagnosisNameParts, resolveNoteDiagnoses } from "./auto-diagnoses";
import { diagnosisClaimable, diagnosisProblems, INITIAL_DIAGNOSES, type Diagnosis } from "./diagnoses";
import type { DiseaseHit } from "./masters/byomei";
import { receiptDiagnoses } from "./billing/month";
import { PatientMonthSchema } from "./billing/request";
const hit: DiseaseHit = { code: "5070003", name: "誤嚥性肺炎", kana: "", icd10: "J690", adopt: "", noStandalone: false, notClaimable: false };
const lookup = (name: string) => name === hit.name ? hit : null;
const base: Diagnosis = { ...INITIAL_DIAGNOSES["90010244"][0], main: false };
afterEach(() => vi.unstubAllGlobals());
describe("記事から病名を登録", () => {
  it("完全一致と疑いだけを登録し、入院申込との重複を除く", () => {
    const r = autoDiagnoses(["誤嚥性肺炎の疑い", "息切れ", "肺炎"], "誤嚥性肺炎", [], lookup);
    expect(r.add).toHaveLength(1);
    expect(r.add[0]).toMatchObject({ code: hit.code, suffixes: [{code: "8002", name: "の疑い"}], main: false, auto: {from: "記事"} });
    expect(r.unmatched).toEqual(["息切れ", "肺炎"]);
  });
  it("既存病名を疑いでも重複登録しない", () => expect(autoDiagnoses(["誤嚥性肺炎疑い"], null, [base], lookup).add).toEqual([]));
  it("既知の部位修飾語を外して完全一致を確かめる", () => {
    const r = autoDiagnoses(["右誤嚥性肺炎疑い"], null, [], lookup);
    expect(r.add[0]).toMatchObject({name: hit.name,prefixes:[{code:"2056",name:"右"}],suffixes:[{code:"8002"}]});
  });
  it("入院申込に出所を残す", () => expect(autoDiagnoses([], hit.name, [], lookup).add[0].auto?.from).toBe("入院申込"));
  it("類似名や単独禁止は登録しない", () => {
    expect(autoDiagnoses(["誤嚥性肺炎"], null, [], () => ({...hit,name:"肺炎"})).add).toEqual([]);
    expect(autoDiagnoses([hit.name], null, [], () => ({...hit,noStandalone:true})).add).toEqual([]);
  });
  it("渡された公式修飾語だけを切り離す", () => expect(diagnosisNameParts("右下腿蜂巣炎の疑い", [{code:"2056",name:"右",position:"prefix"}])).toMatchObject({name:"下腿蜂巣炎",prefixes:[{code:"2056"}],suffixes:[{code:"8002"}]}));
  it("確定した記事の日・識別子・時刻を使う", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ disease: hit, prefixes: [], suffixes: [] })));
    const r = await resolveNoteDiagnoses("＃1 誤嚥性肺炎", null, [], {day:-2,noteId:"n1",at:"2026-11-06T10:00:00Z"});
    expect(r.add[0]).toMatchObject({start:-2,auto:{noteId:"n1",at:"2026-11-06T10:00:00Z"}});
  });
  it("一つでも通信が失敗したら部分登録しない", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("",{status:503})));
    await expect(resolveNoteDiagnoses("＃ 誤嚥性肺炎",null,[],{day:0,at:"now"})).rejects.toThrow("病名の自動登録ができませんでした");
  });
});
describe("詳細設定と算定", () => {
  it("従来データのままで問題なし", () => expect(diagnosisProblems(base)).toEqual([]));
  it("開始前の転帰を止める", () => expect(diagnosisProblems({...base,start:0,outcome:"治癒",outcomeDay:-1})).toContain("転帰日が開始日より前です"));
  it("有効期間の逆転を止める", () => expect(diagnosisProblems({...base,effectiveFrom:"2026-12",effectiveTo:"2026-11"})).toHaveLength(1));
  it("確認前・保険請求外・移行は共通の経路で除外", () => {
    for (const d of [{...base,auto:{from:"記事" as const,at:"now"}}, {...base,notClaimable:true}, {...base,outcome:"移行" as const}]) {
      expect(diagnosisClaimable(d)).toBe(false);
      expect(receiptDiagnoses([d],"2026-11-06","2026-11")).toEqual([]);
    }
    expect(diagnosisClaimable({...base,auto:undefined})).toBe(true);
  });
  it("有効年月を転帰日と別に制限", () => {
    const d = {...base,effectiveFrom:"2026-11",effectiveTo:"2026-11"};
    expect(diagnosisClaimable(d,"2026-11")).toBe(true);
    expect(diagnosisClaimable(d,"2026-12")).toBe(false);
  });
  it("API の検証が確認前の印を落とさない", () => {
    const schema = PatientMonthSchema.shape.diagnoses;
    expect(schema.parse([{...base,auto:{from:"記事",at:"now"},notClaimable:true}])[0]).toMatchObject({auto:{from:"記事"},notClaimable:true});
  });
});
