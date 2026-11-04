import { describe, expect, it } from "vitest";
import { insertAt, placeBlock } from "./note-insert";
import { BUILTIN_TEMPLATES, calcFormula, fieldKey, fillTemplate, parseTemplate, startValues, templateProblems, templatesFor, tokenOf, unanswered, type TemplateFacts } from "./note-templates";
import { parseNote } from "./notes";

const today = { y: 2026, m: 11, d: 4 };
const facts: TemplateFacts = {
  today,
  patient: {
    age: 72,
    sex: "男",
    heightCm: 165,
    weightKg: 58,
    allergies: ["NSAIDs（喘息発作）"],
    infections: [],
    admittedOn: -3,
    labs: [
      { day: -2, time: "06:00", values: { CRP: 8.1, Cre: 1.1 } },
      { day: 0, time: "06:00", values: { CRP: 3.2, WBC: 9800 } },
    ],
    vitals: [
      { day: -1, time: "20:00", bt: 37.8 },
      { day: 0, time: "07:00", bt: 37.1, hr: 82, sbp: 128, dbp: 70, rr: 16, spo2: 97, o2: "室内気" },
    ],
  },
};

describe("parseTemplate", () => {
  it("reads choices, numbers, text, quotes and calculations; the same field twice is one field", () => {
    const t = parseTemplate("疼痛 {{選択:疼痛:なし|軽度|高度}} 尿量 {{数値:尿量:mL}} {{文:訴え}} {{検査:CRP}} {{計算:BMI}} {{バイタル}} 再掲 {{選択:疼痛:なし|軽度|高度}}");
    expect(t.errors).toEqual([]);
    expect(t.fields.map(fieldKey)).toEqual(["選択:疼痛", "数値:尿量", "文:訴え", "検査:CRP", "計算:BMI", "バイタル"]);
  });

  it("reports tokens it cannot read and keeps them as text", () => {
    const t = parseTemplate("{{選択:疼痛:なし}} {{検査:XYZ}} {{計算:GFR}} {{なにか}}");
    expect(t.errors).toHaveLength(4);
    expect(t.fields).toEqual([]);
    expect(t.parts.join("")).toContain("{{検査:XYZ}}");
  });

  it("accepts full-width separators", () => {
    const t = parseTemplate("{{選択：経過：改善｜悪化}}");
    expect(t.fields).toEqual([{ kind: "選択", label: "経過", options: ["改善", "悪化"] }]);
  });

  it("writes a field back as the same token", () => {
    for (const body of ["{{選択:経過:改善|悪化}}", "{{数値:尿量:mL}}", "{{文:主訴}}", "{{検査:CRP}}", "{{計算:CCr}}", "{{バイタル}}"]) {
      expect(tokenOf(parseTemplate(body).fields[0])).toBe(body);
    }
  });
});

describe("calcFormula", () => {
  it("BMI from the chart's height and weight, with the numbers shown", () => {
    const r = calcFormula("BMI", {}, facts, []);
    expect(r.value).toBe(21.3);
    expect(r.text).toBe("21.3kg/m²（58kg÷1.65m²）");
    expect(r.used.every((u) => u.from === "カルテ")).toBe(true);
  });

  it("a number typed in the template is used instead of the chart", () => {
    const t = parseTemplate("{{数値:体重:kg}} {{計算:BMI}}");
    const r = calcFormula("BMI", { "数値:体重": "60" }, facts, t.fields);
    expect(r.value).toBe(22);
    expect(r.used.find((u) => u.label === "体重")?.from).toBe("入力");
  });

  it("CCr by Cockcroft-Gault with the latest Cre", () => {
    // (140-72)*58/(72*1.1) = 49.8
    expect(calcFormula("CCr", {}, facts, []).value).toBe(50);
    expect(calcFormula("CCr", {}, { ...facts, patient: { ...facts.patient, sex: "女" } }, []).value).toBe(42);
  });

  it("P/F ratio, urine per kg per hour and IN−OUT need their numbers", () => {
    const t = parseTemplate("{{数値:PaO2:mmHg}} {{数値:FiO2:%}} {{数値:尿量:mL}} {{数値:時間:時間}} {{数値:IN:mL}} {{数値:OUT:mL}}");
    expect(calcFormula("PF比", {}, facts, t.fields).missing).toEqual(["PaO2", "FiO2"]);
    expect(calcFormula("PF比", { "数値:PaO2": "80", "数値:FiO2": "40" }, facts, t.fields).value).toBe(200);
    expect(calcFormula("尿量", { "数値:尿量": "174", "数値:時間": "6" }, facts, t.fields).value).toBe(0.5);
    expect(calcFormula("IN-OUT", { "数値:IN": "1800", "数値:OUT": "2300" }, facts, t.fields).value).toBe(-500);
  });

  it("says why it cannot calculate", () => {
    const noCre = { ...facts, patient: { ...facts.patient, labs: [] } };
    expect(calcFormula("CCr", {}, noCre, []).text).toContain("Creがありません");
  });
});

describe("fillTemplate", () => {
  it("fills answers and quotes the latest results and vitals", () => {
    const t = parseTemplate("S) {{選択:経過:改善|悪化}} {{複数:症状:疼痛|咳嗽|発熱}}\nO) {{バイタル}}\n{{検査:CRP}}、{{検査:Alb}}\nアレルギー：{{アレルギー}}　{{入院日数}}");
    const text = fillTemplate(t, { "選択:経過": "改善", "複数:症状": ["発熱", "疼痛"] }, facts);
    expect(text).toBe("S) 改善 疼痛、発熱\nO) 11/4 07:00 BT 37.1℃ HR 82 BP 128/70 RR 16 SpO2 97%（室内気）\nCRP 3.2mg/dL（11/4（水） 06:00）、Alb 測定なし\nアレルギー：NSAIDs（喘息発作）　入院4日目");
  });

  it("marks what was left out, and a SOAP template becomes a SOAP note", () => {
    const t = parseTemplate(BUILTIN_TEMPLATES.find((x) => x.id === "builtin-rounds")!.body);
    expect(t.errors).toEqual([]);
    const text = fillTemplate(t, {}, facts);
    expect(text).toContain("（未選択）");
    expect(Object.keys(parseNote(text).soap ?? {})).toEqual(["s", "o", "a", "p"]);
    expect(unanswered(t, {})).toEqual(["自覚症状", "食事摂取", "経過", "方針"]);
  });

  it("starts 身長・体重 from the chart", () => {
    const t = parseTemplate("{{数値:身長:cm}} {{数値:体重:kg}} {{数値:尿量:mL}}");
    expect(startValues(t, facts)).toEqual({ "数値:身長": "165", "数値:体重": "58" });
  });

  it("every built-in template reads without errors", () => {
    for (const b of BUILTIN_TEMPLATES) expect(parseTemplate(b.body).errors).toEqual([]);
  });
});

describe("templates offered and saved", () => {
  it("built-ins by role", () => {
    expect(templatesFor("医師", []).builtIn.map((t) => t.name)).toEqual(["入院時記録", "回診", "退院前カンファレンス"]);
    expect(templatesFor("看護師", []).builtIn.map((t) => t.name)).toEqual(["退院前カンファレンス"]);
    expect(templatesFor("医事課", []).builtIn).toEqual([]);
  });

  it("a name, a body and readable tokens are needed", () => {
    expect(templateProblems("", "", [])).toEqual(["名前を付けてください。", "本文がありません。"]);
    expect(templateProblems("術後", "{{計算:X}}", [])).toHaveLength(1);
    expect(templateProblems("術後", "疼痛 {{選択:疼痛:なし|あり}}", [{ id: "a", name: "術後", roles: ["医師"], body: "" }])).toEqual(["同じ名前の自分のテンプレートがあります。"]);
    expect(templateProblems("術後", "疼痛 {{選択:疼痛:なし|あり}}", [{ id: "a", name: "術後", roles: ["医師"], body: "" }], "a")).toEqual([]);
  });
});

describe("placing text in the note", () => {
  it("inserts at the cursor", () => {
    expect(insertAt("O) 腹部", 5, 5, "平坦・軟")).toEqual({ text: "O) 腹部平坦・軟", caret: 9 });
    expect(insertAt("abcdef", 2, 4, "X")).toEqual({ text: "abXef", caret: 3 });
  });

  it("a block replaces an empty frame, or goes in on its own lines", () => {
    expect(placeBlock("S)\nO)\nA)\nP)\n", 0, 0, "【退院前カンファレンス】\n参加者：主治医\n").text).toBe("【退院前カンファレンス】\n参加者：主治医\n");
    expect(placeBlock("S) 痛みなし", 7, 7, "O) BT 36.8").text).toBe("S) 痛みなし\nO) BT 36.8\n");
    expect(placeBlock("S) 痛みなし\nP) 継続", 8, 8, "O) BT 36.8").text).toBe("S) 痛みなし\nO) BT 36.8\nP) 継続");
  });
});
