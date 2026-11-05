// テンプレート（型のある記録）: the wording is put together by code from the form, what is still missing is
// named, the chart's facts start the form, and a person's own templates are shared with the note box's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTemplate } from "./note-templates";
import { parseNote } from "./notes";
import { PATIENTS } from "./patients";
import { BUILTIN_RECORD_TEMPLATES, buildRecord, findRecordTemplate, loadMyRecordTemplates, recordHeading, recordProblems, recordTemplatesFor, saveMyRecordTemplates, shortNameOf, startRecordValues, type RecordFacts } from "./record-templates";
import { INITIAL_RESTRAINTS } from "./restraint";
import { ROLES } from "./roles";

const patient = PATIENTS[0];
const facts: RecordFacts = { patient, today: { y: 2026, m: 11, d: 4 }, me: { name: "山本（専攻医）", role: "医師" }, nowTime: "10:30" };
const byId = (id: string) => BUILTIN_RECORD_TEMPLATES.find((t) => t.id === id)!;

function fakeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
  return store;
}
afterEach(() => vi.unstubAllGlobals());

describe("この病院のテンプレート", () => {
  it("has about a dozen, each readable, with a short name, and every one offered to some role", () => {
    expect(BUILTIN_RECORD_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    for (const t of BUILTIN_RECORD_TEMPLATES) {
      expect(parseTemplate(t.body).errors, t.name).toEqual([]);
      expect(t.short.length).toBeGreaterThan(0);
      expect(t.short.length).toBeLessThanOrEqual(7);
      expect(t.roles.length).toBeGreaterThan(0);
      for (const label of t.required ?? []) expect(parseTemplate(t.body).fields.some((f) => f.kind === "文" && f.label === label), `${t.name}: ${label}`).toBe(true);
    }
    expect(new Set(BUILTIN_RECORD_TEMPLATES.map((t) => t.id)).size).toBe(BUILTIN_RECORD_TEMPLATES.length);
  });

  it("covers the records asked for", () => {
    const names = BUILTIN_RECORD_TEMPLATES.map((t) => t.name);
    for (const n of ["身体的拘束の記録", "救急医療管理加算の根拠", "入院診療計画の説明", "退院時の説明", "ICの記録", "転倒・転落時の記録", "せん妄の評価", "急変時の記録", "死亡時の記録", "褥瘡の記録", "輸血の同意と実施の記録", "口頭指示の記録"]) expect(names).toContain(n);
  });

  it("offers doctors and nurses their own sets; the billing clerk none (own templates still)", () => {
    expect(recordTemplatesFor("医師", []).builtIn.map((t) => t.id)).toContain("rec-kyukyu");
    expect(recordTemplatesFor("看護師", []).builtIn.map((t) => t.id)).not.toContain("rec-kyukyu");
    expect(recordTemplatesFor("看護師", []).builtIn.map((t) => t.id)).toContain("rec-fall");
    expect(recordTemplatesFor("医事課", []).builtIn).toEqual([]);
    for (const r of ROLES) expect(Array.isArray(recordTemplatesFor(r, []).builtIn)).toBe(true);
  });

  it("the restraint and the pressure ulcer templates point at the existing records (no second record)", () => {
    expect(byId("rec-restraint").link?.panel).toBe("restraint");
    expect(byId("rec-ulcer").link?.panel).toBe("pressure");
  });
});

describe("文の組み立て", () => {
  it("heads the note with 【テンプレート名】 and fills the chosen state and the doctor's words; the note stays one body of text", () => {
    const t = byId("rec-kyukyu");
    const text = buildRecord(t, { ...startRecordValues(t, facts), "選択:区分": "オ ショック", "文:根拠となる所見": "来院時 血圧 78/40、冷汗、乳酸 4.2", "文:根拠となる数値": "収縮期血圧 78mmHg、乳酸 4.2mmol/L", "選択:加算": "１（重篤な状態）" }, facts);
    expect(text.startsWith(recordHeading(t))).toBe(true);
    expect(text).toContain("【救急医療管理加算の根拠】");
    expect(text).toContain("入院時の状態（区分）：オ ショック");
    expect(text).toContain("根拠となる所見：来院時 血圧 78/40、冷汗、乳酸 4.2");
    expect(text).toContain("加算：１（重篤な状態）");
    expect(text).toContain("判断した医師：山本（専攻医）");
    // No S)/O)/D) marks: the confirmed note is free text, not SOAP or a focus.
    const parsed = parseNote(text);
    expect(parsed.text).toBe(text);
    expect(parsed.soap).toBeUndefined();
  });

  it("writes 未選択・未入力 for what is left empty and never a word the writer did not choose", () => {
    const t = byId("rec-fall");
    const text = buildRecord(t, {}, facts);
    expect(text).toContain("発見：（未入力）");
    expect(text).toContain("場所：（未選択）");
    expect(text).not.toContain("{{");
  });

  it("every built-in template builds without a token left over", () => {
    for (const t of BUILTIN_RECORD_TEMPLATES) {
      const text = buildRecord(t, startRecordValues(t, facts), facts);
      expect(text, t.name).not.toContain("{{");
      expect(text.split("\n")[0]).toBe(`【${t.name}】`);
    }
  });
});

describe("必須の判定", () => {
  it("names the choices, times and required free text still missing, and is empty when all are in", () => {
    const t = byId("rec-verbal");
    const start = startRecordValues(t, facts);
    const left = recordProblems(t, start);
    expect(left).toContain("「状況」がまだです");
    expect(left).toContain("「指示の内容」を書いてください");
    expect(left).not.toContain("「時刻」がまだです"); // prefilled with the clock
    const full = { ...start, "選択:状況": "緊急", "文:指示の内容": "生理食塩液 500mL 全開で点滴", "複数:確認": ["指示を復唱した"], "選択:医師の記載": "後でオーダに残す" };
    expect(recordProblems(t, full)).toEqual([]);
  });

  it("a blank time counts as missing", () => {
    const t = byId("rec-emergency");
    expect(recordProblems(t, { "時刻:発見時刻": " " })).toContain("「発見時刻」がまだです");
  });
});

describe("カルテからの開始の値", () => {
  it("the restraint template starts from the restraint in force: devices, start time, doctor, reason", () => {
    const r = INITIAL_RESTRAINTS[0];
    const t = byId("rec-restraint");
    const v = startRecordValues(t, { ...facts, restraint: r });
    expect(v["複数:用具"]).toEqual(r.devices);
    expect(v["時刻:開始時刻"]).toBe(r.start.time);
    expect(v["文:指示医"]).toBe(r.doctor);
    expect(v["文:緊急やむを得ない理由"]).toBe(r.why);
    expect(v["文:確認者"]).toBe("山本（専攻医）");
    expect(startRecordValues(t, facts)["複数:用具"]).toBeUndefined();
  });

  it("the doctor's name is the writer when a doctor writes, else the attending; the clock starts 口頭指示", () => {
    expect(startRecordValues(byId("rec-death"), facts)["文:確認した医師"]).toBe("山本（専攻医）");
    expect(startRecordValues(byId("rec-kyukyu"), { ...facts, me: { name: "看護師 佐藤", role: "看護師" } })["文:判断した医師"]).toBe(patient.attending);
    const v = startRecordValues(byId("rec-verbal"), { ...facts, me: { name: "看護師 佐藤", role: "看護師" } });
    expect(v["時刻:時刻"]).toBe("10:30");
    expect(v["文:受けた者"]).toBe("看護師 佐藤");
  });

  it("せん妄: 70歳以上 is ticked from the age", () => {
    expect(startRecordValues(byId("rec-delirium"), { ...facts, patient: { ...patient, age: 82 } })["複数:リスク因子"]).toEqual(["70歳以上"]);
    expect(startRecordValues(byId("rec-delirium"), { ...facts, patient: { ...patient, age: 55 } })["複数:リスク因子"]).toBeUndefined();
  });

  it("褥瘡: the site and the latest DESIGN-R®2020 come from the open ulcer", () => {
    const u = { id: "u1", patientId: patient.id, site: "仙骨部" as const, foundOn: -3, origin: "院内発生" as const, by: "看護師 佐藤", assessments: [{ id: "a1", at: { day: -3, time: "09:00" }, by: "看護師 佐藤", score: { depth: "d2", e: "e1", s: "s6", i: "i0", g: "g1", n: "n0", p: "p0" } as never, note: "" }] };
    const v = startRecordValues(byId("rec-ulcer"), { ...facts, ulcers: [u] });
    expect(v["選択:部位"]).toBe("仙骨部");
    expect(String(v["文:DESIGN-R"])).toMatch(/^d2-e1s6i0g1n0p0（合計 \d+点、09:00 の評価）$/);
  });
});

describe("自分のテンプレート", () => {
  it("are kept per person in this browser and are the same list as the note box's テンプレート", () => {
    fakeStorage();
    const mine = [{ id: "own-1", name: "術後の観察", roles: ["看護師" as const], body: "創 {{選択:創:異常なし|発赤}}\n{{時刻:観察時刻}}", by: "看護師 佐藤" }];
    expect(saveMyRecordTemplates("看護師 佐藤", mine)).toBe(true);
    expect(loadMyRecordTemplates("看護師 佐藤")).toEqual(mine);
    expect(loadMyRecordTemplates("看護師 田中")).toEqual([]);
    // The same storage key as note-templates: what one panel saves, the other offers.
    expect(window.localStorage.getItem("simple-karte:note-templates:看護師 佐藤")).toContain("術後の観察");
    expect(findRecordTemplate("own-1", mine)?.name).toBe("術後の観察");
    expect(shortNameOf(mine[0])).toBe("術後の観察");
    expect(shortNameOf({ ...mine[0], name: "とても長い名前のテンプレート" })).toBe("とても長い名…");
    expect(recordTemplatesFor("看護師", mine).mine).toBe(mine);
  });

  it("an own template builds and checks like a built-in one (no required free text of its own)", () => {
    const t = { id: "own-2", name: "術後の観察", roles: ["看護師" as const], body: "創 {{選択:創:異常なし|発赤}}　{{時刻:観察時刻}}", by: "看護師 佐藤" };
    expect(recordProblems(t, {})).toEqual(["「創」がまだです", "「観察時刻」がまだです"]);
    expect(buildRecord(t, { "選択:創": "発赤", "時刻:観察時刻": "14:00" }, facts)).toBe("【術後の観察】\n創 発赤　14:00");
  });
});
