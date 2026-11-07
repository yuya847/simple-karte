import { describe, expect, it } from "vitest";
import { broughtCards, broughtLines, broughtSearchText, confirmBrought, decideBrought, draftBrought, matchKind, versionsOf } from "./brought-history";
import { matchOral, type BroughtReport, type BroughtRow } from "./pharmacy";

const row = (said: string, strength: string, extra: Partial<BroughtRow> = {}): BroughtRow => ({ said, strength, amount: 1, unit: "錠", timings: ["朝"], daysLeft: 28, prn: null, match: matchOral(said, strength), checked: true, decision: null, ...extra });

describe("持参薬の照合の札", () => {
  it("院内の品名そのもの・同じ成分の別の製品・院内にない", () => {
    expect(matchKind(row("酸化マグネシウム錠", "330mg"))).toBe("同じ");
    expect(matchKind(row("ノルバスク錠", "5mg"))).toBe("同じ成分の別の製品");
    expect(matchKind(row("タケプロンOD錠", "15"))).toBe("同じ成分の別の製品");
    expect(matchKind(row("アムロジピン錠5mg「見本」", ""))).toBe("同じ成分の別の製品");
    expect(matchKind(row("バイアスピリン錠", "100mg"))).toBe("同じ");
    expect(matchKind(row("ザイザル錠", "5mg"))).toBe("院内にない");
  });
});

describe("経過の【持参薬】の行", () => {
  const at = (time: string, day = 0) => ({ day, time });
  const rows = [row("ノルバスク錠", "5mg", { counted: 20 }), row("ザイザル錠", "5mg", { timings: ["朝", "夕"], daysLeft: null }), row("カロナール錠", "500", { timings: [], prn: "疼痛時", daysLeft: null })];

  it("薬ごとに名前・規格・1回量・用法・残り・照合・判断（まだ）を並べる", () => {
    const lines = broughtLines(rows);
    expect(lines[0]).toMatchObject({ name: "ノルバスク錠", strength: "5mg", dose: "1錠", usage: "1日1回 朝　28日分", left: "20日分", match: "同じ成分の別の製品", decision: "まだ" });
    expect(lines[1]).toMatchObject({ usage: "1日2回 朝・夕", left: "—", match: "院内にない" });
    expect(lines[2].usage).toBe("頓用 疼痛時");
    expect(broughtLines([row("見本錠", "", { amount: null })])[0].dose).toBe("？");
  });

  it("看護師の取り込みは下書き（経過に出ない）。薬剤師が確定すると同じ報告が医師へ報告になり、経過のその日時に出る", () => {
    const drafted = draftBrought([], { patientId: "p1", rows, scanIds: ["s1"] }, { id: "r1", name: "看護師 佐藤", role: "看護師", at: at("09:10") });
    expect(drafted[0]).toMatchObject({ id: "r1", status: "鑑別中", takenBy: { name: "看護師 佐藤", role: "看護師" } });
    expect(drafted[0].rows.every((r) => !r.checked)).toBe(true);
    expect(broughtCards(drafted, "p1")).toEqual([]);
    // The same draft is updated while it is a draft.
    const again = draftBrought(drafted, { patientId: "p1", rows: rows.slice(0, 2), scanIds: ["s2"], draftId: "r1" }, { id: "r9", name: "看護師 佐藤", role: "看護師", at: at("09:20") });
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ rows: expect.any(Array), scanIds: ["s1", "s2"] });

    const confirmed = confirmBrought(again, { patientId: "p1", rows, draftId: "r1", comment: "自己管理" }, { id: "r2", name: "薬剤師 小林", role: "薬剤師", at: at("10:30") });
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ id: "r1", status: "医師へ報告", by: "薬剤師 小林", at: "10:30", scanIds: ["s1", "s2"], takenBy: { name: "看護師 佐藤" } });
    const [card] = broughtCards(confirmed, "p1", new Set(["s2"]));
    expect(card).toMatchObject({ id: "r1", day: 0, time: "10:30", scanIds: ["s2"], comment: "自己管理" });
    expect(card.versions.map((v) => v.kind)).toEqual(["鑑別"]);
    expect(broughtSearchText(card)).toContain("ザイザル錠");
  });

  it("医師の判断は同じ行の新しい版になり、前の版は残る", () => {
    const [r] = confirmBrought([], { patientId: "p1", rows }, { id: "r1", name: "薬剤師 小林", role: "薬剤師", at: at("10:30") });
    const chosen = rows.map((x, i) => ({ ...x, decision: (["持参薬で継続", "中止", "院内の薬に切替"] as const)[i] }));
    const decided = decideBrought(r, chosen, "指示の下書き", { name: "山本（専攻医）", role: "医師", at: at("11:05") });
    expect(decided.status).toBe("指示の下書き");
    const [card] = broughtCards([decided], "p1");
    expect(card.time).toBe("10:30");
    expect(card.versions.map((v) => `${v.kind} ${v.at.time} ${v.by}`)).toEqual(["鑑別 10:30 薬剤師 小林", "医師の判断 11:05 山本（専攻医）"]);
    expect(card.lines.map((l) => l.decision)).toEqual(["継続", "中止", "切替"]);
    expect(broughtLines(card.versions[0].rows).map((l) => l.decision)).toEqual(["まだ", "まだ", "まだ"]);
  });

  it("版の記録がない前の報告も、鑑別の版1つとして出る", () => {
    const old: BroughtReport = { id: "old", patientId: "p1", rows, by: "薬剤師 小林", at: "08:00", status: "医師へ報告" };
    expect(versionsOf(old)).toEqual([{ at: { day: 0, time: "08:00" }, by: "薬剤師 小林", role: "薬剤師", kind: "鑑別", rows }]);
    expect(broughtCards([old, { ...old, id: "x", patientId: "p2" }], "p1").map((c) => c.id)).toEqual(["old"]);
  });
});
