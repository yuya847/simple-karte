import { describe, expect, it } from "vitest";
import type { DietOrder } from "./diet";
import {
  BASE_MENU,
  DISHES,
  EMPTY_KITCHEN,
  INITIAL_STOCK,
  conflictsOf,
  dayTotal,
  initialKitchen,
  kenshokuMissing,
  lineOf,
  matchesOf,
  mealMenu,
  needsOf,
  nutritionCheck,
  proteinRda,
  saltGoal,
  specialOf,
  stapleGrams,
  lineRule,
  ticketType,
} from "./kitchen";

const base = { id: "x", patientId: "p", from: { day: 0, meal: "朝" as const }, by: "医師", at: { day: 0, time: "08:00" } };
const order = (o: Partial<DietOrder>): DietOrder => ({ ...base, kind: "常食", staple: "米飯", side: "常菜", ...o }) as DietOrder;

describe("献立", () => {
  it("every weekday has 朝・昼・夕 made of dishes that exist", () => {
    const ids = new Set(DISHES.map((d) => d.id));
    for (let dow = 0; dow < 7; dow++) for (const m of ["朝", "昼", "夕"] as const) for (const id of BASE_MENU[dow][m]) expect(ids.has(id)).toBe(true);
  });
  it("picks the line of the 約束食事箋 from the diet order", () => {
    expect(lineOf(order({}))).toBe("常食");
    expect(lineOf(order({ kind: "治療食", therapeutic: "TD-SALT-HEART", saltG: 6 }))).toBe("減塩食");
    expect(lineOf(order({ kind: "治療食", therapeutic: "TD-KIDNEY" }))).toBe("腎臓食");
    expect(lineOf(order({ kind: "嚥下調整食", dysphagia: "2-1" }))).toBe("嚥下調整食");
    expect(lineOf(order({ kind: "絶食" }))).toBeNull();
    expect(lineOf(order({ kind: "経管栄養" }))).toBeNull();
  });
  it("減塩食 drops the soup and cuts the salt; 嚥下調整食 serves ゼリー粥 for code 2-1 and 全粥 for code 4", () => {
    const salt = mealMenu(order({ kind: "治療食", therapeutic: "TD-SALT-HEART", saltG: 6 }), 0, "朝")!;
    expect(salt.dishes.some((d) => d.role === "汁物")).toBe(false);
    expect(salt.dishes.find((d) => d.id === "tamagoyaki")!.salt).toBeCloseTo(0.6);
    expect(mealMenu(order({ kind: "嚥下調整食", dysphagia: "2-1" }), 0, "昼")!.staple.kind).toBe("ゼリー粥");
    expect(mealMenu(order({ kind: "嚥下調整食", dysphagia: "4" }), 0, "昼")!.staple.kind).toBe("全粥");
  });
  it("fits the staple to the ordered energy (10 g steps, 50〜250 g) for the lines with an energy order", () => {
    const o = order({ kind: "治療食", therapeutic: "TD-ENERGY", energyKcal: 1600 });
    const g = stapleGrams(lineRule("エネルギー調整食"), o, 2);
    expect(g % 10).toBe(0);
    expect(g).toBeGreaterThanOrEqual(50);
    expect(g).toBeLessThanOrEqual(250);
    expect(Math.abs(dayTotal(o, 2)!.kcal - 1600) / 1600).toBeLessThanOrEqual(0.1);
    // 常食 keeps the usual portion.
    expect(stapleGrams(lineRule("常食"), order({}), 2)).toBe(180);
  });
});

describe("栄養量の確かめ", () => {
  it("compares energy and protein with the order (±10%) and salt with 「◯g未満」", () => {
    const o = order({ kind: "治療食", therapeutic: "TD-KIDNEY", energyKcal: 1800, proteinG: 40, saltG: 6 });
    const { total, rows } = nutritionCheck(o, { age: 70, sex: "男" }, 3);
    expect(total).not.toBeNull();
    const salt = rows.find((r) => r.label === "食塩相当量")!;
    expect(salt.state).toBe(total!.salt < 6 ? "ok" : "over");
    expect(rows.find((r) => r.label === "たんぱく質")!.ref).toBe("指示 40g");
  });
  it("flags a protein order the menu cannot meet", () => {
    const o = order({ kind: "治療食", therapeutic: "TD-LIVER", energyKcal: 1800, proteinG: 100 });
    expect(nutritionCheck(o, { age: 60, sex: "女" }, 1).rows.find((r) => r.label === "たんぱく質")!.state).toBe("under");
  });
  it("for 減塩食 (心臓疾患), shows the 特別食 condition of the notice: 1日6g未満", () => {
    const o = order({ kind: "治療食", therapeutic: "TD-SALT-HEART", saltG: 6 });
    const row = nutritionCheck(o, { age: 79, sex: "男" }, 0).rows.find((r) => r.from === "special")!;
    expect(row.ref).toBe("食塩相当量 総量6g未満");
    expect(row.state).toBe("ok");
  });
  it("for 常食, compares with the 食事摂取基準（2025年版）: たんぱく質の推奨量 and 食塩相当量の目標量", () => {
    expect(proteinRda(70, "男")).toBe(60);
    expect(proteinRda(40, "男")).toBe(65);
    expect(proteinRda(86, "女")).toBe(50);
    expect(saltGoal(70, "男")).toBe(7.5);
    expect(saltGoal(70, "女")).toBe(6.5);
    expect(proteinRda(10, "男")).toBeNull();
    const rows = nutritionCheck(order({}), { age: 72, sex: "男" }, 0).rows;
    expect(rows.map((r) => r.from)).toEqual(["dri", "dri"]);
    expect(rows[1].ref).toBe("目標量 7.5g未満（男性）");
  });
  it("has no menu for 絶食 and 経管栄養", () => {
    expect(nutritionCheck(order({ kind: "絶食" }), { age: 80, sex: "女" }, 0).total).toBeNull();
  });
});

describe("特別食加算", () => {
  it("reads the diet order (diet.ts) and needs a 献立表", () => {
    expect(specialOf(order({ kind: "治療食", therapeutic: "TD-KIDNEY" })).special).toBe(true);
    expect(specialOf(order({})).special).toBe(false);
    expect(specialOf(order({ kind: "治療食", therapeutic: "TD-SALT-HEART", saltG: 8 })).special).toBe(false);
  });
  it("writes the 食種 with the order's values on the 食札", () => {
    expect(ticketType(order({ kind: "治療食", therapeutic: "TD-ENERGY", energyKcal: 1600 }))).toBe("エネルギー調整食（糖尿病）（1600kcal）");
  });
});

describe("アレルギーと禁止食品", () => {
  it("matches what a dish contains with the words of an allergy or a 禁止食品", () => {
    expect(matchesOf(["卵", "小麦"], "卵（じんましん）")).toEqual(["卵"]);
    expect(matchesOf(["さば", "大豆"], "青魚")).toEqual(["さば"]);
    expect(matchesOf(["たら"], "青魚")).toEqual([]);
    expect(matchesOf(["たら"], "魚")).toEqual(["たら"]);
    expect(matchesOf(["牛肉"], "牛乳")).toEqual([]);
    expect(matchesOf(["乳"], "牛乳")).toEqual(["乳"]);
    expect(matchesOf(["豚肉"], "牛肉")).toEqual([]);
    expect(matchesOf(["ごま"], "ヨード造影剤（蕁麻疹）")).toEqual([]);
  });
  it("lists the dishes of the meal the patient must not eat", () => {
    const menu = mealMenu(order({}), 6, "朝")!; // ほうれん草のごま和え・ヨーグルト
    const c = conflictsOf(menu, [], [{ food: "ごま", why: "本人", by: "管理栄養士", at: { day: 0, time: "08:00" } }]);
    expect(c.map((x) => x.dish)).toEqual(["ほうれん草のごま和え"]);
    expect(c[0].kind).toBe("禁止食品");
    expect(conflictsOf(menu, ["乳製品（下痢）"], []).map((x) => x.dishId)).toContain("yogurt");
  });
  it("starts with fictional 禁止食品 told by patients", () => {
    expect(Object.keys(initialKitchen().bans).length).toBeGreaterThan(0);
  });
});

describe("発注・在庫と検食簿", () => {
  it("adds up the ingredients and orders the shortage in whole packs", () => {
    const menus = Array.from({ length: 40 }, () => mealMenu(order({}), 1, "夕")!); // ハンバーグ 70g の合いびき肉 × 40
    const needs = needsOf(menus, INITIAL_STOCK);
    const mince = needs.find((n) => n.item === "合いびき肉")!;
    expect(mince.need).toBe(2800);
    expect(mince.short).toBe(2800);
    expect(mince.order).toBe(3000);
    expect(needs[0].short).toBeGreaterThan(0);
    expect(needs.find((n) => n.item === "米")!.order).toBe(0);
  });
  it("lists today's meals already served without a 検食 record", () => {
    const times = { 朝: "07:30", 昼: "12:00", 夕: "18:00" } as const;
    expect(kenshokuMissing(EMPTY_KITCHEN, times, 13 * 60)).toEqual(["朝", "昼"]);
    expect(kenshokuMissing({ ...EMPTY_KITCHEN, kenshoku: { "0|朝": { by: "a", role: "管理栄養士", time: "07:00", text: "良" } } }, times, 13 * 60)).toEqual(["昼"]);
  });
});
