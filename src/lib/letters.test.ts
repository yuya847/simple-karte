import { describe, expect, it } from "vitest";
import { calculateClaim } from "./billing/engine";
import { DEFAULT_OPTIONS } from "./billing/model";
import { shinryoItem } from "./billing/master-items";
import { PATIENTS } from "./patients";
import { createDischargeDraft } from "./discharge";
import {
  LETTER_FEES, LETTER_HOSPITAL, claimLetters, confirmLetter, judgeLetters, legacyId, legacyLetter, letterRights, letterVerdict, lettersFor, newLetter, saveDraft, verdictLine,
  type Letter, type LetterClaim, type LetterFlags, type LetterType,
} from "./letters";

// 2026-11-03 (火): day 0. Day -2 = 11/1, day 28 = 12/1, day 59 = 2027-01-01.
const today = { y: 2026, m: 11, d: 3 };
let n = 0;
const claim = (type: LetterType, to: string, day: number, flags: LetterFlags = {}, extra: Partial<LetterClaim> = {}): LetterClaim => ({ id: `L${++n}`, day, time: "10:00", to, type, flags, ...extra });
const judge = (ls: LetterClaim[], opts: Parameters<typeof judgeLetters>[2] = {}) => {
  const v = judgeLetters(ls, today, opts);
  return ls.map((l) => v.get(l.id!)!);
};
const ok = { consent: true };

describe("点数はマスターと同じ", () => {
  it("B009・注8・B010・B010-2・B011", () => {
    for (const f of Object.values(LETTER_FEES)) expect(shinryoItem(f.code)?.points).toBe(f.points);
  });
});

describe("紹介（B009 注1）", () => {
  it("紹介先ごとに月1回：同じ宛先の2通目は算定なし、別の宛先は算定", () => {
    const [a, b, c] = judge([claim("紹介", "架空みどり病院", 0, ok), claim("紹介", "架空みどり病院 ", 1, ok), claim("紹介", "さくら坂病院", 1, ok)]);
    expect(a.codes).toEqual([LETTER_FEES.B009.code]);
    expect(b.codes).toEqual([]);
    expect(b.reason).toContain("紹介先ごとに月1回");
    expect(c.points).toBe(250);
    expect(verdictLine(a, false)).toBe("B009 250点・紹介先ごとに月1回（今月この宛先は未算定）");
  });
  it("翌月なら同じ宛先でも算定", () => {
    expect(judge([claim("紹介", "架空みどり病院", 0, ok), claim("紹介", "架空みどり病院", 28, ok)]).map((v) => v.points)).toEqual([250, 250]);
  });
  it("患者の同意がなければ算定なし", () => {
    expect(verdictLine(judge([claim("紹介", "架空みどり病院", 0)])[0], false)).toBe("算定なし：患者の同意の記録がない");
  });
  it("当院と特別の関係にある機関（台帳のマスタ）は算定なし", () => {
    expect(judge([claim("紹介", "架空総合病院 附属診療所", 0, ok)])[0].reason).toContain("特別の関係");
  });
  it("注8：退院の月かその翌月に添付すれば＋200点、2か月後は付かない", () => {
    const attach = { consent: true, attach: true };
    expect(judge([claim("紹介", "A病院", 0, attach, { dischargeDay: 0 })])[0].points).toBe(450);
    expect(judge([claim("紹介", "A病院", 28, attach, { dischargeDay: 0 })])[0].points).toBe(450);
    const late = judge([claim("紹介", "A病院", 59, attach, { dischargeDay: 0 })])[0];
    expect(late.points).toBe(250);
    expect(late.note8).toBe("注8 なし：退院の月かその翌月ではない");
    expect(judge([claim("紹介", "A病院", 0, attach)])[0].note8).toBe("注8 なし：退院日が決まっていない");
  });
  it("注8：実際の退院日（dischargedOn）を優先する", () => {
    expect(judge([claim("紹介", "A病院", 0, { consent: true, attach: true }, { dischargeDay: -40 })], { dischargedOn: 0 })[0].points).toBe(450);
  });
});

describe("介護老人保健施設・介護医療院（B009 注5）", () => {
  it("患者1人につき月1回（宛先が違っても）", () => {
    const [a, b] = judge([claim("介護施設", "介護老人保健施設 ひだまり", 0, ok), claim("介護施設", "別の老健", 1, ok)]);
    expect(a.points).toBe(250);
    expect(b.reason).toContain("患者1人につき月1回");
  });
  it("注8 は算定した後6か月は付かない（介護老人保健施設・介護医療院、留意事項 (21)）", () => {
    const attach = { consent: true, attach: true };
    const [a, b] = judge([claim("介護施設", "ひだまり", 0, attach, { dischargeDay: 0 }), claim("介護施設", "ひだまり", 28, attach, { dischargeDay: 27 })]);
    expect(a.points).toBe(450);
    expect(b.points).toBe(250);
    expect(b.note8).toContain("6か月");
  });
});

describe("市町村・居宅介護支援事業者等（B009 注2、留意事項 (12)）", () => {
  const f = { consent: true, home: true };
  it("自宅に帰る入院患者は退院日の前後2週間だけ", () => {
    expect(judge([claim("保健福祉", "架空市 地域包括支援センター", 0, f, { dischargeDay: 10 })])[0].points).toBe(250);
    expect(judge([claim("保健福祉", "架空市", 0, f, { dischargeDay: 20 })])[0].reason).toBe("退院日の前後2週間の外");
    expect(judge([claim("保健福祉", "架空市", 0, f)])[0].reason).toContain("退院日が決まっていない");
    expect(judge([claim("保健福祉", "架空市", 0, { consent: true, home: false }, { dischargeDay: 0 })])[0].reason).toBe("自宅に帰る患者だけが対象");
  });
  it("退院前で介護支援等連携指導料を算定したら算定なし", () => {
    expect(judge([claim("保健福祉", "架空市", 0, { ...f, kaigoShien: true }, { dischargeDay: 3 })])[0].codes).toEqual([]);
    expect(judge([claim("保健福祉", "架空市", 3, { ...f, kaigoShien: true }, { dischargeDay: 3 })])[0].points).toBe(250);
  });
});

describe("返書（B011）", () => {
  it("B009 は紹介なので算定しない。B011 は既定の設定（自院が施設基準を満たさない）で算定なし", () => {
    const v = judge([claim("返書", "架空大学病院", 0, { consent: true, request: true, partner: "大病院" })])[0];
    expect(v.codes).toEqual([]);
    expect(verdictLine(v, true)).toBe("算定なし：返書は紹介ではない（B009 なし）。B011 は自院が施設基準を満たさない");
  });
  it("求めがない・区分が当たらない", () => {
    expect(judge([claim("返書", "X", 0, { consent: true })])[0].reason).toContain("求め");
    expect(judge([claim("返書", "X", 0, { consent: true, request: true, partner: "中小" })])[0].reason).toContain("ア〜ウ");
  });
  it("自院が施設基準を満たす設定なら 注1 で150点、提供先ごとに3月に1回", () => {
    const h = { ...LETTER_HOSPITAL, b011Standard: true };
    const f: LetterFlags = { consent: true, request: true, partner: "大病院" };
    const [a, b, c] = judge([claim("返書", "架空大学病院", 0, f), claim("返書", "架空大学病院", 28, f), claim("返書", "架空大学病院", 90, f)], { hospital: h });
    expect(a.basis).toContain("注1");
    expect(a.points).toBe(150);
    expect(b.reason).toContain("3月に1回");
    expect(c.points).toBe(150);
  });
  it("難病・てんかんの専門の医療機関と：相手が施設基準を満たせば 注3", () => {
    const f: LetterFlags = { consent: true, request: true, partner: "難病", patientKind: "難病・てんかん" };
    expect(judge([claim("返書", "Y病院", 0, f)])[0].reason).toContain("施設基準");
    expect(judge([claim("返書", "Y病院", 0, { ...f, partnerStandard: true })])[0].basis).toContain("注3");
    expect(judge([claim("返書", "Y病院", 0, { ...f, patientKind: "どちらでもない", partnerStandard: true })])[0].reason).toContain("指定難病");
  });
  it("同じ月に同じ相手へ B009（紹介）を算定していたら、順番によらず算定なし（注6）", () => {
    const f: LetterFlags = { consent: true, request: true, partner: "難病", patientKind: "難病・てんかん", partnerStandard: true };
    const [reply, refer] = judge([claim("返書", "Y病院", 0, f), claim("紹介", "Y病院", 1, ok)]);
    expect(refer.points).toBe(250);
    expect(reply.reason).toContain("B009（紹介）");
  });
});

describe("照会・セカンドオピニオン・歯科", () => {
  it("照会は算定なし", () => {
    expect(verdictLine(judge([claim("照会", "Z病院", 0, ok)])[0], false)).toContain("算定なし：照会");
  });
  it("セカンドオピニオン（B010）：希望の記録と添付で500点、患者1人につき月1回", () => {
    const f = { wish: true, attach: true };
    const [a, b] = judge([claim("セカンドオピニオン", "架空大学病院", 0, f), claim("セカンドオピニオン", "別の病院", 1, f)]);
    expect(a.points).toBe(500);
    expect(b.reason).toContain("月1回");
    expect(judge([claim("セカンドオピニオン", "X", 0, { attach: true })])[0].reason).toContain("希望");
  });
  it("歯科（B010-2）：求めと同意で120点、提供先ごとに3月に1回、同じ月の B009 紹介と重ならない", () => {
    const f = { consent: true, request: true };
    const [a, b] = judge([claim("歯科", "架空歯科", 0, f), claim("歯科", "架空歯科", 40, f)]);
    expect(a.points).toBe(120);
    expect(b.reason).toContain("3月に1回");
    expect(judge([claim("紹介", "架空歯科", 0, ok), claim("歯科", "架空歯科", 1, f)])[1].codes).toEqual([]);
  });
});

describe("記録と版", () => {
  const patient = PATIENTS[0];
  const chart = { patient, entries: patient.history, diagnoses: [], today };
  it("新しい紹介状には病名・処方・アレルギーをコードが入れる", () => {
    const l = newLetter("x", chart, "紹介", "山本（専攻医）", { day: 0, time: "10:00" });
    expect(l.status).toBe("下書き");
    expect(l.body.diagnosis).toContain(patient.admissionDiagnosis);
    expect(l.body.remarks).toContain("アレルギー・薬剤禁忌");
  });
  it("下書きは算定に入らない。確定した日に入る", () => {
    const l = { ...newLetter("x", chart, "紹介", "医師", { day: -1, time: "10:00" }), to: "A病院", flags: ok };
    expect(claimLetters([saveDraft(l)])).toEqual([]);
    const c = confirmLetter(l, undefined, "医師", { day: 0, time: "11:00" });
    expect(claimLetters([c])).toMatchObject([{ day: 0, time: "11:00", to: "A病院", type: "紹介" }]);
  });
  it("確定後の修正は理由を付けて版を重ね、前の版と発行日を残す", () => {
    const first = confirmLetter({ ...newLetter("x", chart, "紹介", "医師", { day: 0, time: "10:00" }), to: "A病院", flags: ok }, undefined, "医師", { day: 0, time: "10:05" });
    const second = confirmLetter({ ...first, to: "A病院 本院" }, first, "医師", { day: 1, time: "09:00" }, "宛先の誤り");
    expect(second.confirmedAt).toEqual({ day: 0, time: "10:05" });
    expect(second.versions).toHaveLength(1);
    expect(second.versions![0]).toMatchObject({ to: "A病院", at: { day: 0, time: "10:05" } });
    expect(second.revised).toMatchObject({ reason: "宛先の誤り" });
  });
  it("確定は医師だけ。MSW・看護師は介護・福祉宛ての下書きまで", () => {
    const as = (who: string[]) => (a: string) => who.includes(a);
    expect(letterRights(as(["discharge"]), "紹介")).toEqual({ draft: true, confirm: true });
    expect(letterRights(as(["assess.discharge"]), "保健福祉")).toEqual({ draft: true, confirm: false });
    expect(letterRights(as(["assess.discharge"]), "紹介")).toEqual({ draft: false, confirm: false });
  });
  it("下書きの見込みは、確定済みの紹介状の中で今確定した場合", () => {
    const done = confirmLetter({ ...newLetter("a", chart, "紹介", "医師", { day: 0, time: "09:00" }), to: "A病院", flags: ok }, undefined, "医師", { day: 0, time: "09:00" });
    const draft: Letter = { ...newLetter("b", chart, "紹介", "医師", { day: 0, time: "10:00" }), to: "A病院", flags: ok };
    expect(verdictLine(letterVerdict(draft, [done, draft], today, { day: 0, time: "10:00" }), false)).toBe("算定なし：今月この宛先へもう算定した（紹介先ごとに月1回）");
    expect(verdictLine(letterVerdict(done, [done, draft], today, { day: 0, time: "10:00" }), true)).toBe("B009 250点・紹介先ごとに月1回");
  });
});

describe("退院サマリで発行した紹介状（以前の保存データ）", () => {
  const patient = PATIENTS[0];
  const issued = { ...createDischargeDraft(patient, patient.history, [], today), letter: { to: "架空みどり病院", dept: "循環器内科", doctor: "", purpose: "経過観察", issuedAt: { day: 0, time: "09:00" }, attach: true } };
  const run = (letters: LetterClaim[]) => calculateClaim({ today: "2026-11-03", nowTime: "20:00", month: "2026-11", patient: { id: patient.id, name: "x", sex: "男", age: 70, admittedOn: -2 }, entries: [], daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS, letters });
  const b009 = (r: ReturnType<typeof run>) => r.acts.filter((a) => a.parts.some((p) => p.lines.some((l) => l.code === LETTER_FEES.B009.code)));
  it("一覧に1通として見え、算定にも1回だけ入る", () => {
    const all = lettersFor(patient.id, [], issued);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: legacyId(patient.id), status: "確定", type: "紹介", legacy: true });
    expect(b009(run(claimLetters(all)))).toHaveLength(1);
  });
  it("新しい道具で直して保存しても（同じ id）二重にならない", () => {
    const copy = confirmLetter({ ...legacyLetter(issued)!, purpose: "経過観察と採血" }, legacyLetter(issued)!, "医師", { day: 0, time: "10:00" }, "目的を足した");
    const all = lettersFor(patient.id, [copy], issued);
    expect(all).toHaveLength(1);
    expect(b009(run(claimLetters(all)))).toHaveLength(1);
  });
  it("同じ宛先へ同じ月に新しい紹介状を確定しても B009 は1回", () => {
    const again = confirmLetter({ ...newLetter("new", { patient, entries: [], diagnoses: [], today }, "紹介", "医師", { day: 0, time: "11:00" }), to: "架空みどり病院", flags: ok }, undefined, "医師", { day: 0, time: "11:00" });
    const all = lettersFor(patient.id, [again], issued);
    expect(all).toHaveLength(2);
    expect(b009(run(claimLetters(all)))).toHaveLength(1);
  });
  it("算定の画面には返書の算定なしの理由が出る", () => {
    const r = run([{ id: "r", day: 0, time: "10:00", to: "架空大学病院", type: "返書", flags: { consent: true, request: true, partner: "大病院" } }]);
    expect(r.acts.filter((a) => a.shikibetsu === "13")).toEqual([]);
    expect(r.issues.map((i) => i.text).join("\n")).toContain("B011 は自院が施設基準を満たさない");
  });
});
