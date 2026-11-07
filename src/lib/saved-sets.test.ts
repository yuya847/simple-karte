import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_SAVED_SETS, loadSavedSets, roleOfName, scopeOf, setVisible, staffPlace, SET_SCOPES, type SavedSet } from "./saved-sets";
import { STAFF } from "./roles";
import { DOCTORS } from "./doctors";
import { NURSES } from "./nurses";

const set = (scope: SavedSet["scope"], owner: string, place?: { dept: string; unit: string }): SavedSet => ({ id: `${scope}-${owner}`, name: "セット", owner, scope, ...place, rows: INITIAL_SAVED_SETS[0].rows });
const doctor = (name: string) => ({ role: "医師" as const, name });
const yamamoto = doctor(STAFF.医師.name);
const takahashi = doctor("指導医 高橋");
const inoue = doctor("井上（循環器内科）");
const wardNurse = { role: "看護師" as const, name: STAFF.看護師.name };
const icuNurse = { role: "看護師" as const, name: NURSES.find((n) => n.rooms[0]?.startsWith("ICU"))!.name };
const pharmacist = { role: "薬剤師" as const, name: STAFF.薬剤師.name };

describe("セットの範囲（院内共通・科・部署・個人）", () => {
  it("4つから選び、最初は個人", () => {
    expect(SET_SCOPES).toEqual(["院内共通", "科", "部署", "個人"]);
  });
  it("前の保存（自分だけ・科・病棟）は読み込むときに個人・科・部署と読む。知らない範囲は読まない", () => {
    expect(scopeOf("自分だけ")).toBe("個人");
    expect(scopeOf("科")).toBe("科");
    expect(scopeOf("病棟")).toBe("部署");
    expect(scopeOf("院内共通")).toBe("院内共通");
    expect(scopeOf("全国")).toBeNull();
  });
  it("部署は職種と受け持ちの病棟から：医師は医局（科は診療科）、病棟の看護師は病棟、ICU の看護師は ICU、薬剤師は薬剤部", () => {
    expect(staffPlace(yamamoto)).toEqual({ dept: "総合診療科", unit: "医局" });
    expect(staffPlace(inoue)).toEqual({ dept: "循環器内科", unit: "医局" });
    expect(staffPlace(wardNurse)).toEqual({ dept: "5階東病棟", unit: "5階東病棟" });
    expect(staffPlace(icuNurse).unit).toBe("ICU");
    expect(staffPlace(pharmacist)).toEqual({ dept: "薬剤部", unit: "薬剤部" });
    expect(roleOfName(DOCTORS[1].name)).toBe("医師");
    expect(roleOfName(STAFF.薬剤師.name)).toBe("薬剤師");
    expect(roleOfName("だれか")).toBeNull();
  });
  it("見える人：院内共通は全員、科は同じ診療科、部署は同じ部署、個人は本人だけ", () => {
    expect(setVisible(set("院内共通", yamamoto.name), pharmacist)).toBe(true);
    expect(setVisible(set("個人", yamamoto.name), yamamoto)).toBe(true);
    expect(setVisible(set("個人", yamamoto.name), takahashi)).toBe(false);
    expect(setVisible(set("科", yamamoto.name, staffPlace(yamamoto)), takahashi)).toBe(true);
    expect(setVisible(set("科", yamamoto.name, staffPlace(yamamoto)), inoue)).toBe(false);
    expect(setVisible(set("部署", yamamoto.name, staffPlace(yamamoto)), inoue)).toBe(true);
    expect(setVisible(set("部署", wardNurse.name, staffPlace(wardNurse)), icuNurse)).toBe(false);
    expect(setVisible(set("部署", wardNurse.name, staffPlace(wardNurse)), wardNurse)).toBe(true);
    expect(setVisible(set("部署", pharmacist.name, staffPlace(pharmacist)), wardNurse)).toBe(false);
  });
  it("前の保存で科・部署が残っていないセットは、登録した人の名前から科・部署を決める", () => {
    expect(setVisible(set("科", yamamoto.name), takahashi)).toBe(true);
    expect(setVisible(set("科", yamamoto.name), inoue)).toBe(false);
    expect(setVisible(set("部署", "だれか"), wardNurse)).toBe(false);
  });
  it("初期セットは院内共通", () => {
    expect(INITIAL_SAVED_SETS.every((s) => s.scope === "院内共通")).toBe(true);
  });
});

describe("この端末に保存したセットの読み込み", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("前の範囲を読み替え、知らない範囲のセットは外す", () => {
    const rows = INITIAL_SAVED_SETS[0].rows;
    const stored = [
      { id: "a", name: "A", owner: "x", scope: "自分だけ", rows },
      { id: "b", name: "B", owner: "x", scope: "病棟", rows },
      { id: "c", name: "C", owner: "x", scope: "全国", rows },
    ];
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(stored), setItem: () => {} });
    expect(loadSavedSets().map((s) => [s.id, s.scope])).toEqual([["a", "個人"], ["b", "部署"]]);
  });
});
