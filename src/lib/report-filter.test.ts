import { afterEach, describe, expect, it, vi } from "vitest";
import { PATIENTS } from "./patients";
import { initialPhysioDesk } from "./physio-desk";
import { filterReports, inPeriod, isFiltered, kindCounts, loadReportFilter, matchesWords, NO_REPORT_FILTER, normalizeReportFilter, saveReportFilter, type ReportFilter } from "./report-filter";
import { reportsOf, type Report } from "./reports";
import { demoRisOrders, initialRisDesk } from "./ris";

const NOW = 10 * 60;
const src = { ris: initialRisDesk(NOW), physio: initialPhysioDesk(NOW) };
const find = (id: string) => PATIENTS.find((p) => p.id === id)!;
const reportsFor = (id: string) => reportsOf(find(id), [...find(id).history, ...(demoRisOrders(NOW)[id] ?? [])], src);
const sakura = find("90010231");
const ack = { by: "山本（専攻医）", at: { day: 0, time: "10:05" } };
const f = (x: Partial<ReportFilter>): ReportFilter => ({ ...NO_REPORT_FILTER, ...x });

afterEach(() => vi.unstubAllGlobals());

describe("レポートの絞り込み", () => {
  const rs = reportsFor(sakura.id);
  const ctx = { acks: {}, admittedOn: sakura.admittedOn };

  it("keeps every report when nothing is chosen, in the order given", () => {
    expect(isFiltered(NO_REPORT_FILTER)).toBe(false);
    expect(filterReports(rs, NO_REPORT_FILTER, ctx)).toEqual(rs);
  });

  it("narrows by the kind, and 未読だけ by the same rule as the count of unread", () => {
    expect(filterReports(rs, f({ kind: "細菌" }), ctx).map((r) => r.title)).toEqual(["血液培養 2セット"]);
    expect(filterReports(rs, f({ kind: "病理" }), ctx)).toEqual([]);
    const unread = filterReports(rs, f({ unread: true }), ctx);
    expect(unread.map((r) => r.kind).sort()).toEqual(["画像", "細菌"]);
    const culture = unread.find((r) => r.kind === "細菌")!;
    expect(filterReports(rs, f({ unread: true }), { ...ctx, acks: { [culture.key]: ack } }).map((r) => r.kind)).toEqual(["画像"]);
  });

  it("narrows by the day reported: 入院中 from the admission day, 7日 today and the six days before", () => {
    const at = (day: number) => ({ at: { day, time: "" } });
    expect(inPeriod(at(-3), "入院中", -3)).toBe(true);
    expect(inPeriod(at(-4), "入院中", -3)).toBe(false);
    expect(inPeriod(at(-40), "入院中")).toBe(true);
    expect(inPeriod(at(-6), "7日")).toBe(true);
    expect(inPeriod(at(-7), "7日")).toBe(false);
    expect(inPeriod(at(-400), "すべて")).toBe(true);
    // 北村さんの 5日前の X線 is left out when the stay began 2 days ago.
    const kita = reportsFor("90010198");
    expect(kita.some((r) => r.key === "img|img-kita-1")).toBe(true);
    expect(filterReports(kita, f({ period: "入院中" }), { acks: {}, admittedOn: -2 }).map((r) => r.key)).toEqual(kita.filter((r) => r.key !== "img|img-kita-1").map((r) => r.key));
  });

  it("finds the words in the title, the body and the reporter, however they were typed (かな・カナ・全角・半角・大小)", () => {
    const culture = rs.find((r) => r.kind === "細菌")!;
    expect(matchesWords(culture, "ｍｒｓａ")).toBe(true);
    expect(matchesWords(culture, "めちしりん")).toBe(true);
    expect(matchesWords(culture, "ＶＣＭ")).toBe(true);
    expect(matchesWords(culture, "微生物検査室")).toBe(true);
    expect(matchesWords(culture, "血液培養　ぐらむ")).toBe(true);
    expect(matchesWords(culture, "血液培養 大腸菌")).toBe(false);
    expect(matchesWords(culture, "  ")).toBe(true);
    expect(filterReports(rs, f({ q: "ちょうおんぱ" }), ctx)).toEqual([]);
    expect(filterReports(rs, f({ q: "石田" }), ctx).map((r) => r.by)).toEqual(["放射線科 石田"]);
  });

  it("the kind chips: すべて and each kind the patient has, the numbers following 未読だけ・期間・検索", () => {
    expect(kindCounts(rs, NO_REPORT_FILTER, ctx).map((c) => `${c.label} ${c.count}`)).toEqual([`すべて ${rs.length}`, `画像 ${rs.length - 1}`, "細菌培養 1"]);
    expect(kindCounts(rs, f({ unread: true }), ctx).map((c) => `${c.label} ${c.count}`)).toEqual(["すべて 2", "画像 1", "細菌培養 1"]);
    // A kind chosen stays as a chip even with none (it can be pressed off).
    expect(kindCounts(rs, f({ kind: "病理" }), ctx).map((c) => `${c.label} ${c.count}`)).toEqual([`すべて ${rs.length}`, `画像 ${rs.length - 1}`, "細菌培養 1", "病理 0"]);
    expect(kindCounts([] as Report[], NO_REPORT_FILTER, ctx).map((c) => c.label)).toEqual(["すべて"]);
  });
});

describe("絞り込みはこのブラウザに（人ごと）", () => {
  function fakeStorage(seed: Record<string, string> = {}) {
    const store = new Map(Object.entries(seed));
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
    return store;
  }

  it("keeps the kind, 未読だけ and the period per person, not the words typed", () => {
    const store = fakeStorage();
    saveReportFilter("山本", f({ kind: "細菌", unread: true, period: "7日", q: "MRSA" }));
    expect(loadReportFilter("山本")).toEqual(f({ kind: "細菌", unread: true, period: "7日" }));
    expect(loadReportFilter("佐藤")).toEqual(NO_REPORT_FILTER);
    expect([...store.keys()]).toEqual(["simple-karte:report-filter:山本"]);
  });

  it("falls back to no filter on broken data or blocked storage", () => {
    fakeStorage({ "simple-karte:report-filter:山本": "{not json", "simple-karte:report-filter:佐藤": JSON.stringify({ kind: "心カテ", unread: "yes", period: "30日", q: "x" }) });
    expect(loadReportFilter("山本")).toEqual(NO_REPORT_FILTER);
    expect(loadReportFilter("佐藤")).toEqual(NO_REPORT_FILTER);
    expect(normalizeReportFilter(null)).toEqual(NO_REPORT_FILTER);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(loadReportFilter("山本")).toEqual(NO_REPORT_FILTER);
    expect(() => saveReportFilter("山本", f({ kind: "画像" }))).not.toThrow();
  });
});
