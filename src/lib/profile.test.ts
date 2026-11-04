import { describe, expect, it } from "vitest";
import { checkPrescription } from "./rx";
import type { CheckContext } from "./drafts";
import { PATIENTS } from "./patients";
import { allergyText, applyProfile, bloodChanged, bodyProblems, careNow, checkList, checkedBy, itemProblems, listItems, profileHistory, type ProfileChange, type ProfileInput } from "./profile";
import { can, denyReason } from "./roles";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const who = (time: string) => ({ by: "看護師 佐藤", role: "看護師" as const, at: { day: 0, time } });
let n = 0;
const ch = (c: ProfileInput, time = "10:00"): ProfileChange => ({ id: `c${++n}`, patientId: sakura.id, ...who(time), ...c }) as ProfileChange;

describe("applyProfile", () => {
  it("adds and takes away items, and the last height/weight and blood type are the ones shown", () => {
    const log = [
      ch({ kind: "allergy", op: "追加", text: "NSAIDs（喘息発作）" }),
      ch({ kind: "infection", op: "削除", text: "MRSA（血液）", reason: "誤登録" }),
      ch({ kind: "contra", op: "追加", text: "MRI（ペースメーカー）" }),
      ch({ kind: "body", heightCm: 165, weightKg: 55 }),
      ch({ kind: "care", key: "移動", value: "車椅子" }),
      ch({ kind: "care", key: "食事", value: "自立" }),
      ch({ kind: "blood", blood: { abo: "A", rh: "+", checks: 2, antibody: "陰性" } }),
    ];
    const p = applyProfile(sakura, log);
    expect(p.allergies).toEqual(["ヨード造影剤（蕁麻疹）", "NSAIDs（喘息発作）"]);
    expect(p.infections).toEqual([]);
    expect(p.contraindications).toEqual(["MRI（ペースメーカー）"]);
    expect(p.weightKg).toBe(55);
    // Help other than 自立 is shown with the cautions on the band.
    expect(p.cautions).toEqual(["転倒注意", "移動：車椅子"]);
    expect(applyProfile(sakura, [])).toBe(sakura);
  });

  it("lists items with who registered them; what the chart had before has no one", () => {
    const log = [ch({ kind: "allergy", op: "追加", text: "食物：卵（蕁麻疹）" }, "09:00")];
    expect(listItems(sakura, log, "allergy")).toEqual([
      { text: "ヨード造影剤（蕁麻疹）", since: null },
      { text: "食物：卵（蕁麻疹）", since: { by: "看護師 佐藤", at: { day: 0, time: "09:00" } } },
    ]);
    expect(careNow([ch({ kind: "care", key: "排泄", value: "おむつ" })], sakura.id).排泄?.value).toBe("おむつ");
  });

  it("keeps every change, newest first, with what it was before and why", () => {
    const log = [ch({ kind: "body", heightCm: 165, weightKg: 55 }, "09:00"), ch({ kind: "allergy", op: "削除", text: "ヨード造影剤（蕁麻疹）", reason: "本人に再確認、別の薬剤だった" }, "10:00")];
    expect(profileHistory(sakura, log).map((h) => h.text)).toEqual(["アレルギーを削除：ヨード造影剤（蕁麻疹）（理由：本人に再確認、別の薬剤だった）", "身長・体重：165cm・58kg → 165cm・55kg"]);
  });
});

describe("the order checks read the profile", () => {
  const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "", describe: () => "" };
  const loxo = { id: "d1", type: "prescription", sourceText: "", items: [{ said: "ロキソニン", drugCode: "ORAL-LOX60", daily: 3, perDose: null }], category: "臨時", timings: ["朝", "昼", "夕"], days: 3, acks: [] } as unknown as Parameters<typeof checkPrescription>[0];

  it("an allergy or contraindication registered with the drug class is found by the prescription check", () => {
    const p = applyProfile(sakura, [ch({ kind: "allergy", op: "追加", text: allergyText("薬", "NSAIDs", "喘息発作") })]);
    expect(checkPrescription(loxo, ctx, checkList(p)).some((i) => i.title === "アレルギー")).toBe(true);
    const q = applyProfile(sakura, [ch({ kind: "contra", op: "追加", text: "NSAIDs（腎機能低下）" })]);
    const hit = checkPrescription(loxo, ctx, checkList(q)).find((i) => i.title === "アレルギー");
    expect(hit?.message).toContain("禁忌：NSAIDs（腎機能低下）");
    expect(checkPrescription(loxo, ctx, checkList(sakura)).some((i) => i.title === "アレルギー")).toBe(false);
  });

  it("says which checks an item will be found by", () => {
    expect(checkedBy("NSAIDs（喘息発作）")).toEqual(["内服のオーダ（「NSAIDs」）", "造影の画像検査（「喘息」）"]);
    expect(checkedBy("ヨード造影剤（蕁麻疹）")).toEqual(["造影の画像検査（「造影剤」）"]);
    expect(checkedBy("食物：卵（蕁麻疹）")).toEqual([]);
  });
});

describe("checks of what is typed", () => {
  it("allergy text and duplicates", () => {
    expect(allergyText("食物", "卵", "蕁麻疹")).toBe("食物：卵（蕁麻疹）");
    expect(allergyText("薬", "セフェム系", "")).toBe("セフェム系");
    expect(itemProblems("allergy", "", [])).toEqual(["アレルギーの内容を入れてください。"]);
    expect(itemProblems("allergy", "食物：", [])).toHaveLength(1);
    expect(itemProblems("infection", "MRSA（血液）", ["MRSA（血液）"])).toEqual(["すでに登録されています。"]);
  });

  it("height and weight out of range stop; a big change asks to confirm", () => {
    expect(bodyProblems(1650, 58, { heightCm: 165, weightKg: 58 }).stop).toHaveLength(1);
    expect(bodyProblems(165, 0, { heightCm: 165, weightKg: 58 }).stop).toHaveLength(1);
    expect(bodyProblems(165, 50, { heightCm: 165, weightKg: 58 }).confirm).toEqual(["体重が前回（58kg）から 14% 違います。"]);
    expect(bodyProblems(165, 56, { heightCm: 165, weightKg: 58 })).toEqual({ stop: [], confirm: [] });
  });

  it("changing a registered blood type to another type is marked", () => {
    expect(bloodChanged(sakura.blood, { abo: "A", rh: "+", checks: 2 })).toBe(false);
    expect(bloodChanged(sakura.blood, { abo: "O", rh: "+", checks: 1 })).toBe(true);
    expect(bloodChanged(undefined, { abo: "O", rh: "+", checks: 1 })).toBe(false);
  });

  it("who may change what (架空の病院の取り決め)", () => {
    expect(can("看護師", "profile.allergy")).toBe(true);
    expect(can("看護師", "profile.blood")).toBe(false);
    expect(can("臨床検査技師", "profile.blood")).toBe(true);
    expect(can("医事課", "profile.body")).toBe(false);
    expect(denyReason("MSW", "profile.contra")).toBe("禁忌の登録・変更は医師・薬剤師が行います（いまはMSWで入っています）。");
  });
});
