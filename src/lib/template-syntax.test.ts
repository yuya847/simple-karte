import { describe, expect, it } from "vitest";
import { fieldKey, fillTemplate, parseTemplate, reservedText, startValues, tokenOf, unanswered, type TemplateFacts } from "./note-templates";
import { preparePhrase } from "./template-expansion";
import { expandAt } from "./phrases";
import { insertAt } from "./note-insert";
import { labPasteText, vitalsPasteText } from "./lab-paste";
import { mergeWorkspace } from "./merge-workspace";
import { RESERVED_WORDS } from "./template-syntax";

export const templateTestFacts: TemplateFacts = { today: { y: 2026, m: 11, d: 6 }, now: "09:30", author: "架空 記載者", role: "医師", medications: "内服A 1錠 朝", patient: { id: "p001", name: "架空 太郎", kana: "カクウ タロウ", age: 50, sex: "男", ward: "東病棟", room: "101", attending: "架空 医師", admissionDiagnosis: "肺炎", admittedOn: -2, heightCm: 170, weightKg: 65, allergies: ["薬剤A"], infections: [], labs: [{ day: 0, time: "06:00", values: { CRP: 2.5 } }], vitals: [{ day: 0, time: "07:00", bt: 36.5 }] } };
const facts = templateTestFacts;

describe("利用者の部品と予約語", () => {
  it("reads every component alongside the legacy syntax and applies defaults", () => {
    const body = '<combo label="疼痛" default="なし">なし|あり</combo> <list label="部位">頭|胸</list> <list multiple label="症状" default="咳|痰">咳|痰</list> <radio label="意識">清明|傾眠</radio> <check label="説明した" default="true"> <number label="尿量" unit="mL" default="100"/> <time label="発見"/> <date label="発症日"/> <text label="訴え"/> {{選択:経過:改善|不変}}';
    const parsed = parseTemplate(body);
    expect(parsed.errors).toEqual([]);
    expect(parsed.fields).toHaveLength(10);
    expect(fillTemplate(parsed, startValues(parsed, facts), facts)).toContain('なし  咳、痰  説明した 100mL');
    expect(parsed.fields.every(f => parseTemplate(tokenOf(f)).errors.length === 0)).toBe(true);
  });
  it("preserves unknown words, reports line numbers and rejects nested and unclosed markup", () => {
    for (const body of ['<combo label="疼痛">なし|あり', '<combo label="疼痛">なし|<text label="文"/></combo>', '<list label="部位">頭</list>', '<number label="量">', '<time label="時刻" broken/>', '{{文:閉じ忘れ', '<text label="閉じ忘れ"']) {
      expect(parseTemplate(`前文\n${body}`).errors.some(e => e.startsWith("2行目：")), body).toBe(true);
    }
    const unknown = parseTemplate("{未登録}");
    expect(unknown.errors).toHaveLength(1);
    expect(fillTemplate(unknown, {}, facts)).toBe("{未登録}");
    expect(parseTemplate('{検査:XYZ}').errors).toHaveLength(1);
    expect(fillTemplate(parseTemplate('{検査:XYZ}'), {}, facts)).toBe('{検査:XYZ}');
  });
  it("substitutes all supported patient words and shares LD and vital formatting", () => {
    for (const name of RESERVED_WORDS) expect(reservedText(name, facts)).not.toContain(`{${name}}`);
    expect(reservedText("直近の血液検査", facts)).toBe(labPasteText(facts.patient, facts.today));
    expect(reservedText("直近のバイタル", facts)).toBe(vitalsPasteText(facts.patient, facts.today));
    expect(fillTemplate(parseTemplate('{患者ID} {氏名} {今日} {今} {記載者} {職種} {内服} {検査:CRP}'), {}, facts)).toContain('p001 架空 太郎');
    expect(reservedText("入院日数", facts)).toBe("3");
    expect(reservedText("生年月日", facts)).toMatch(/^197[56]-\d{2}-\d{2}$/);
    expect(reservedText("入院日", facts)).toBe("2026-11-04");
  });
  it("validates required fields and renders only chosen values, including line-start checks", () => {
    const parsed = parseTemplate('<combo label="疼痛" required>なし|あり</combo>\n[]説明した\n<text label="訴え"/>');
    const values = startValues(parsed, facts);
    expect(unanswered(parsed, values)).toEqual(["疼痛"]);
    values[fieldKey(parsed.fields[0])] = "独自の入力";
    values[fieldKey(parsed.fields[1])] = "true";
    expect(unanswered(parsed, values)).toEqual([]);
    expect(fillTemplate(parsed, values, facts)).toBe("独自の入力\n説明した\n");
    values[fieldKey(parsed.fields[1])] = "false";
    expect(fillTemplate(parsed, values, facts)).not.toContain("説明した");
  });
  it("runs dictionary reading through the form, then inserts its text at the original reading", () => {
    const body = '疼痛 <combo label="疼痛">なし|あり</combo> {患者ID}';
    const note = "S) ;いたみ 後文";
    const expanded = expandAt(note, 7, [{ id: "phrase1", key: "いたみ", text: body }])!;
    const prepared = preparePhrase(expanded.phrase.text, facts);
    expect(prepared.needsForm).toBe(true);
    prepared.values[fieldKey(prepared.parsed.fields[0])] = "なし";
    const text = fillTemplate(prepared.parsed, prepared.values, facts);
    expect(insertAt(note, 3, 7, text).text).toBe("S) 疼痛 なし p001 後文");
    expect(preparePhrase("{患者ID} 確認済み", facts)).toMatchObject({ needsForm: false, text: "p001 確認済み" });
    expect(preparePhrase("ただの文字", facts).needsForm).toBe(false);
    expect(preparePhrase("{{文:訴え}}", facts).needsForm).toBe(true);
  });
  it("rejects invalid defaults and duplicate attributes", () => {
    for (const body of ['<date label="日付" default="2026-02-30"/>', '<time label="時刻" default="25:00"/>', '<number label="量" default="NaN"/>', '<check label="確認" default="yes">', '<radio label="意識" default="清明|傾眠">清明|傾眠</radio>', '<text label="文" label="重複"/>']) expect(parseTemplate(body).errors.length, body).toBeGreaterThan(0);
  });
  it("uses new number fields with legacy calculations", () => {
    const parsed = parseTemplate('<number label="身長"/> <number label="体重"/> {{計算:BMI}}');
    const values = startValues(parsed, facts);
    values[fieldKey(parsed.fields[1])] = "70";
    expect(fillTemplate(parsed, values, facts)).toContain("24.2kg/m²");
  });
  it("keeps shared deletion markers through workspace merges", () => {
    const t = { id: "shared1", name: "共有", body: "{患者ID}", scope: "ward" };
    const merged = mergeWorkspace({ sharedNoteTemplates: [{ ...t, deleted: true }] }, { sharedNoteTemplates: [t] }, { sharedNoteTemplates: [t] });
    expect(merged.data.sharedNoteTemplates).toEqual([{ ...t, deleted: true }]);
  });
});
