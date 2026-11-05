import { describe, expect, it } from "vitest";
import { EXAMPLE_LIMIT, INITIAL_LIMITS, careTeam, currentLimit, glassProblem, glassText, grantOf, inCareTeam, limitDeny, limitProblem, openEvent, type AccessLimit, type GlassEntry } from "./access-limit";
import { PATIENTS } from "./patients";

const mori = PATIENTS.find((p) => p.id === "90010260")!;

describe("閲覧制限（架空の職員の患者）", () => {
  it("森 久美子 is limited as 職員 from the start; the others are not", () => {
    expect(INITIAL_LIMITS).toEqual([]);
    expect(currentLimit([EXAMPLE_LIMIT], mori.id)).toMatchObject({ kind: "職員", by: "山本（専攻医）" });
    for (const p of PATIENTS.filter((x) => x.id !== mori.id)) expect(currentLimit(INITIAL_LIMITS, p.id)).toBeNull();
  });

  it("the last setting is in force; a removal ends it, and every one is kept", () => {
    const off: AccessLimit = { id: "x", patientId: mori.id, on: false, reason: "本人が退職した", by: "山本（専攻医）", at: { day: 0, time: "10:00" } };
    expect(currentLimit([EXAMPLE_LIMIT, off], mori.id)).toBeNull();
    const again: AccessLimit = { ...off, id: "y", on: true, kind: "その他", reason: "家族の希望" };
    expect(currentLimit([EXAMPLE_LIMIT, off, again], mori.id)?.id).toBe("y");
  });

  it("setting needs a kind and a reason; removing needs a reason; only a doctor does it", () => {
    expect(limitProblem(true, "", "x")).toBe("区分を選んでください。");
    expect(limitProblem(true, "職員", " ")).toContain("理由");
    expect(limitProblem(false, "", "")).toContain("外す理由");
    expect(limitProblem(true, "職員", "当院の職員")).toBeNull();
    expect(limitDeny("医師")).toBeNull();
    expect(limitDeny("看護師")).toContain("医師が行います");
  });
});

describe("担当チーム", () => {
  it("doctors of 山本チーム are on it; the B team doctor is not", () => {
    for (const name of ["山本（専攻医）", "研修医 田中", "指導医 高橋"]) expect(inCareTeam({ role: "医師", name }, mori, "")).toBe(true);
    expect(inCareTeam({ role: "医師", name: "木下（総合診療科 B）" }, mori, "")).toBe(false);
  });

  it("nurses: the room's nurse, or the shift's team that has the room (511 is B)", () => {
    expect(careTeam(mori)).toEqual({ attending: "山本（専攻医）", nurse: "看護師 伊藤", nurseTeam: "5階東 B チーム" });
    expect(inCareTeam({ role: "看護師", name: "看護師 伊藤" }, mori, "")).toBe(true);
    expect(inCareTeam({ role: "看護師", name: "看護師 佐藤" }, mori, "")).toBe(false);
    expect(inCareTeam({ role: "看護師", name: "看護師 佐藤" }, mori, "A")).toBe(false);
    expect(inCareTeam({ role: "看護師", name: "看護師 佐藤" }, mori, "B")).toBe(true);
    // A team of 5階東 does not cover a room on another floor.
    expect(inCareTeam({ role: "看護師", name: "看護師 佐藤" }, { ...mori, room: "611" }, "B")).toBe(false);
  });

  it("other jobs give a reason", () => {
    for (const role of ["薬剤師", "臨床検査技師", "管理栄養士", "MSW", "医事課"] as const) expect(inCareTeam({ role, name: "x" }, mori, "B")).toBe(false);
  });
});

describe("理由を残して開く", () => {
  const g: GlassEntry = { id: "g1", patientId: mori.id, by: "薬剤師 小林", role: "薬剤師", at: { day: 0, time: "09:12" }, reason: "薬剤・検査・栄養・退院支援などの業務", note: "持参薬の鑑別" };

  it("a reason must be chosen; その他 needs words", () => {
    expect(glassProblem("", "")).toBe("理由を選んでください。");
    expect(glassProblem("その他", " ")).toContain("書いてください");
    expect(glassProblem("その他", "家族からの問い合わせ")).toBeNull();
    expect(glassProblem("当直・休日の診療", "")).toBeNull();
    expect(glassText(g)).toBe("薬剤・検査・栄養・退院支援などの業務：持参薬の鑑別");
  });

  it("the latest reason of this person for this patient", () => {
    const later = { ...g, id: "g2", at: { day: 0, time: "13:00" }, note: "退院時の説明" };
    expect(grantOf([g, later], mori.id, "薬剤師 小林")?.id).toBe("g2");
    expect(grantOf([g, later], mori.id, "薬剤師 別人")).toBeUndefined();
  });

  it("what goes to the audit log when the chart is opened", () => {
    const limit = currentLimit([EXAMPLE_LIMIT], mori.id);
    expect(openEvent(null, false, undefined)).toEqual({ action: "カルテを開いた" });
    expect(openEvent(limit, true, undefined)).toEqual({ action: "カルテを開いた", detail: "閲覧制限の患者（担当チームとして）", restricted: true });
    expect(openEvent(limit, false, undefined)).toEqual({ action: "閲覧制限の患者を選んだ（理由の入力へ）", restricted: true });
    expect(openEvent(limit, false, g)).toEqual({ action: "閲覧制限の患者を開いた（薬剤・検査・栄養・退院支援などの業務）", detail: "09:12 に残した理由：薬剤・検査・栄養・退院支援などの業務：持参薬の鑑別", restricted: true });
  });
});
