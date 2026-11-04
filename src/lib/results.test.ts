import { describe, expect, it } from "vitest";
import { PANIC_LIMITS, PANIC_REACH_RULE, labKey, partialReportLabel, bloodCulturePanic, callLine, callScript, canReport, cultureArrivals, hitLine, labBoard, mergeCultures, panicOf, reachList, reachState, reportCall, resultsOf, uncalled, unseen, type ContactAttempt } from "./results";
import { PATIENTS } from "./patients";

describe("results", () => {
  it("finds values beyond the panic limits by code", () => {
    const hits = panicOf({ K: 7.2, Na: 140, Glu: 45, Plt: 2.1 }, PANIC_LIMITS);
    expect(hits.map((h) => `${h.code}${h.side}`)).toEqual(["Glu低", "K高", "Plt低"]);
    expect(hitLine(hits[1])).toBe("K 7.2 mmol/L（7以上）");
    expect(panicOf({ K: 6.4, Na: 120 }, PANIC_LIMITS)).toEqual([]);
  });

  it("a blood culture that turned positive is phoned in like a panic value", () => {
    const [c] = cultureArrivals(11 * 60)["90010244"];
    expect(c.reportedTime).toBe("10:48");
    expect(bloodCulturePanic(c)).toHaveLength(1);
    expect(bloodCulturePanic({ ...c, specimen: "尿" })).toHaveLength(0);
    const merged = mergeCultures([{ collectedOn: -1, specimen: "血液", status: "培養中" }], [c]);
    expect(merged).toEqual([c]);
  });

  it("only today's results wait for the doctor; seen ones drop out", () => {
    const p = PATIENTS[0];
    const items = resultsOf(p, PANIC_LIMITS);
    const waiting = unseen(items, {});
    expect(waiting.every((i) => i.day >= 0)).toBe(true);
    expect(waiting.length).toBeGreaterThan(0);
    const acks = Object.fromEntries(waiting.map((i) => [i.key, { by: "山本（専攻医）", at: { day: 0, time: "09:00" } }]));
    expect(unseen(items, acks)).toEqual([]);
  });

  it("lists panic values not yet phoned in", () => {
    const p = { ...PATIENTS[1], cultures: cultureArrivals(600)["90010244"] };
    const items = resultsOf(p, PANIC_LIMITS);
    expect(uncalled(items, {})).toHaveLength(1);
    const key = uncalled(items, {})[0].key;
    expect(uncalled(items, { [key]: { key, patientId: p.id, hits: [], by: "検査技師 中村", to: "主治医", means: "電話", readBack: true, at: { day: 0, time: "10:00" } } })).toHaveLength(0);
  });

  it("puts the call in the order of 提言第20号", () => {
    const p = { ...PATIENTS[1], cultures: cultureArrivals(600)["90010244"] };
    const item = uncalled(resultsOf(p, PANIC_LIMITS), {})[0];
    const lines = callScript(item, p, "515B");
    expect(lines[0]).toBe("「パニック値の報告です」");
    expect(lines[2]).toBe(`② ${p.name}さん（ID ${p.id}）`);
    expect(lines.at(-1)).toBe("「復唱をお願いします」");
  });
});

describe("パニック値の連絡：かけ直しと復唱", () => {
  const p = { ...PATIENTS[1], cultures: cultureArrivals(600)["90010244"] };
  const item = uncalled(resultsOf(p, PANIC_LIMITS), {})[0];
  const by = "検査技師 中村";
  const miss = (time: string): ContactAttempt => ({ at: { day: 0, time }, by, to: "主治医 山本（専攻医）（オーダーした医師）", means: "電話", result: "つながらない（不在・話し中）" });

  it("報告した needs the person and a read-back, or a written reason why there was none", () => {
    expect(canReport("主治医 山本", true, "")).toBe(true);
    expect(canReport("主治医 山本", false, "")).toBe(false);
    expect(canReport("主治医 山本", false, "  ")).toBe(false);
    expect(canReport("主治医 山本", false, "処置中で、聞いてすぐ電話が切れた")).toBe(true);
    expect(canReport(" ", true, "")).toBe(false);
  });

  it("after 2 tries that did not reach anyone, the rule says to go on to another doctor; a message is not a report", () => {
    expect(reachState([])).toEqual({ failed: 0, goOthers: false });
    expect(reachState([miss("10:00")])).toEqual({ failed: 1, goOthers: false });
    const msg: ContactAttempt = { ...miss("10:05"), result: "伝言・折り返しを頼んだ" };
    expect(reachState([miss("10:00"), msg])).toEqual({ failed: 2, goOthers: true });
    expect(PANIC_REACH_RULE.text).toContain("架空の病院の取り決め");
    expect(reachList("山本（専攻医）")).toEqual(["主治医 山本（専攻医）（オーダーした医師）", "同じ科の医師", "管理当直"]);
  });

  it("the report keeps every try, oldest first, and the reason when there was no read-back", () => {
    const c = reportCall(item, [miss("10:00"), miss("10:05")], { by, to: " 同じ科の医師（田中） ", means: "電話", readBack: false, noReadBack: "処置中で、聞いてすぐ電話が切れた", at: { day: 0, time: "10:12" } });
    expect(c).toMatchObject({ key: item.key, to: "同じ科の医師（田中）", readBack: false, noReadBack: "処置中で、聞いてすぐ電話が切れた" });
    expect(c.attempts!.map((a) => `${a.at.time} ${a.result}`)).toEqual(["10:00 つながらない（不在・話し中）", "10:05 つながらない（不在・話し中）", "10:12 伝えた"]);
    expect(callLine(c)).toBe("10:12 検査技師 中村 → 同じ科の医師（田中）（電話・復唱なし：処置中で、聞いてすぐ電話が切れた・3回目の連絡で報告）");
    const ok = reportCall(item, [], { by, to: "主治医", means: "対面", readBack: true, noReadBack: "使わない", at: { day: 0, time: "10:01" } });
    expect(ok.noReadBack).toBeUndefined();
    expect(callLine(ok)).toBe("10:01 検査技師 中村 → 主治医（対面・復唱あり）");
    expect(uncalled([item], { [item.key]: c })).toEqual([]);
  });

  it("a panic value not reported stays listed whatever its day; old results without one drop out", () => {
    const old = { ...item, key: "old", day: -1 };
    const plain = { ...item, key: "plain", day: -1, panic: [] };
    const tomorrow = { ...item, key: "tmr", day: 1, panic: [] };
    expect(labBoard([old, plain, tomorrow], {}).map((i) => i.key)).toEqual(["old", "tmr"]);
    expect(uncalled([old], {})).toHaveLength(1);
    expect(labBoard([old], { old: reportCall(old, [], { by, to: "主治医", means: "電話", readBack: true, at: { day: 0, time: "10:00" } }) })).toEqual([]);
  });

  it("says tomorrow's draw in words on the phone", () => {
    expect(callScript({ ...item, kind: "検査", day: 1, time: "06:00" }, p, "515B")[3]).toBe("③ 採取 明日 06:00");
  });
});


describe("部分報告の結果", () => {
  it("shows progress until complete and renews the unread key for each addition", () => {
    const first = { day: 0, time: "10:00", id: "partial", values: { K: 7.4 }, progress: { expected: ["K", "Na"], sequence: 1 } };
    const next = { ...first, values: { K: 7.4, Na: 140 }, progress: { ...first.progress, sequence: 2 } };
    expect(partialReportLabel(first)).toBe("一部報告（1/2）");
    expect(partialReportLabel(next)).toBe("");
    const patient = { ...PATIENTS[0], labs: [first], imaging: [], cultures: [] };
    expect(resultsOf(patient, PANIC_LIMITS)[0].title).toContain("一部報告（1/2）");
    const key = labKey(patient.id, first);
    const acks = { [key]: { by: "医師", at: { day: 0, time: "10:01" } } };
    expect(unseen(resultsOf(patient, PANIC_LIMITS), acks)).toHaveLength(0);
    const completed = resultsOf({ ...patient, labs: [next] }, PANIC_LIMITS);
    expect(unseen(completed, acks)).toHaveLength(1);
    expect(completed[0].title).not.toContain("一部報告");
  });
});
