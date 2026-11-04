import { describe, expect, it } from "vitest";
import { checkDraft, isReady, toOrder, type CheckContext, type Draft, type InjectionDraft } from "./drafts";
import {
  INTERACTIONS,
  INTERACTION_SOURCES,
  IODINE_CONTRAST,
  draftInteractions,
  findInteractions,
  interactionIssues,
  orderInteractions,
  reasonsToKeep,
  type InteractionPair,
} from "./interactions";
import { DRUGS, ORAL_DRUGS } from "./master";
import { PATIENTS } from "./patients";
import type { PrescriptionDraft } from "./rx";
import type { InjectionOrder, OrderEntry } from "./types";

const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const mori = PATIENTS.find((p) => p.id === "90010260")!;
const ordersOf = (p: (typeof PATIENTS)[number]) => p.history.filter((e): e is OrderEntry => e.kind === "order");

const ctx = (p: (typeof PATIENTS)[number], drafts: Draft[] = [], extra: Partial<CheckContext> = {}): CheckContext => ({
  activeOrders: ordersOf(p).filter((o) => o.status === "有効"),
  labOrders: [],
  drafts,
  nowTime: "10:00",
  fmtDay: (d) => `D${d}`,
  describe: (o) => o.id,
  allergies: [],
  ...extra,
});

const rx = (codes: string[], over: Partial<PrescriptionDraft> = {}): PrescriptionDraft => ({
  id: "rx1",
  origin: "manual",
  sourceText: "",
  comment: null,
  kind: "prescription",
  category: "臨時",
  items: codes.map((drugCode) => ({ drugCode, said: drugCode, daily: null, perDose: 1 })),
  timings: ["朝"],
  prn: null,
  maxPerDay: null,
  days: 3,
  start: { day: null, timing: null },
  acks: [],
  ...over,
});

const inj = (codes: string[], over: Partial<InjectionDraft> = {}): InjectionDraft => ({
  id: "inj1",
  origin: "manual",
  sourceText: "",
  comment: null,
  kind: "injection",
  items: codes.map((drugCode) => ({ drugCode, said: drugCode, amount: drugCode.startsWith("INJ-VEENF") || drugCode.startsWith("INJ-NS") ? 100 : 1, unit: drugCode.startsWith("INJ-VEENF") || drugCode.startsWith("INJ-NS") ? "mL" : "g" })),
  route: "点滴静注",
  schedule: { kind: "per_day", count: 1 },
  infusionMinutes: 60,
  infusionScope: "per_dose",
  rateMlPerH: null,
  prefer: null,
  start: { day: 1, time: "10:00" },
  days: null,
  duplicate: null,
  ...over,
});

const MASTER = new Set([...DRUGS.map((d) => d.code), ...ORAL_DRUGS.map((d) => d.code), IODINE_CONTRAST]);

describe("相互作用の表（電子添文から）", () => {
  it("every drug of a pair is in the master, and every pair has an id once", () => {
    const ids = INTERACTIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of INTERACTIONS) {
      for (const c of [...p.a, ...p.b]) expect(MASTER.has(c), `${p.id}: ${c}`).toBe(true);
      expect(p.text.length).toBeGreaterThan(5);
      expect(p.text).not.toMatch(/効きます/);
    }
  });

  it("every combination of a pair is backed by the 電子添文 of one of its two drugs", () => {
    for (const p of INTERACTIONS) {
      for (const x of p.a)
        for (const y of p.b) {
          const backed = p.refs.some((r) => INTERACTION_SOURCES[r.doc].codes.some((c) => c === x || c === y));
          expect(backed, `${p.id}: ${x} × ${y}`).toBe(true);
        }
    }
  });

  it("each source is a PMDA 電子添文 with its revision and 添付文書番号", () => {
    for (const s of Object.values(INTERACTION_SOURCES)) {
      expect(s.revision).toMatch(/^\d{4}年\d{1,2}月(改訂|作成)/);
      expect(s.docId).toMatch(/^\d{6}_[0-9A-Z]{12}_\d_\d{2}$/);
      for (const c of s.codes) expect(MASTER.has(c), c).toBe(true);
    }
  });

  it("配合 pairs are injections only; no pair of the master is 併用禁忌 (none was found in the 電子添文)", () => {
    for (const p of INTERACTIONS.filter((x) => x.level === "配合")) for (const c of [...p.a, ...p.b]) expect(c.startsWith("INJ-"), `${p.id}: ${c}`).toBe(true);
    expect(INTERACTIONS.filter((p) => p.level === "併用禁忌")).toEqual([]);
  });
});

describe("findInteractions", () => {
  it("エナラプリル × スピロノラクトン（持参薬）: 併用注意 with both 電子添文", () => {
    const f = findInteractions(["ORAL-ENA5"], [{ code: "ORAL-SPL25", where: "持参薬" }]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: "併用注意", needsReason: false, other: { where: "持参薬" } });
    expect(f[0].text).toMatch(/血清カリウム値/);
    expect(f[0].sources.map((s) => s.label)).toEqual([expect.stringMatching(/^レニベース錠 電子添文 10\.2/), expect.stringMatching(/^アルダクトンA細粒・錠 電子添文 10\.2/)]);
    expect(f[0].sources[0].url).toBe("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/181615_2144002F1024_3_04");
  });

  it("only the 電子添文 of the drugs involved are shown (ラシックス錠 for the tablet, ラシックス注 for the injection)", () => {
    const tab = findInteractions(["INJ-CEZ1"], [{ code: "ORAL-FRS20", where: "内服" }])[0];
    const inj = findInteractions(["INJ-CEZ1"], [{ code: "INJ-FRS20", where: "注射" }])[0];
    expect(tab.sources.map((s) => s.label.split(" ")[0])).toEqual(["セファメジンα注射用", "ラシックス錠"]);
    expect(inj.sources.map((s) => s.label.split(" ")[0])).toEqual(["セファメジンα注射用", "ラシックス注20mg"]);
  });

  it("配合 is looked for only between drugs of the same Rp", () => {
    expect(findInteractions(["INJ-CTRX1"], [{ code: "INJ-VEENF500", where: "注射" }])).toEqual([]);
    const same = findInteractions(["INJ-CTRX1", "INJ-VEENF500"], []);
    expect(same).toHaveLength(1);
    expect(same[0]).toMatchObject({ level: "配合", needsReason: true, other: { where: "同じ Rp" } });
    expect(same[0].sources.map((s) => s.label.split(" ")[0])).toEqual(["ロセフィン静注用・点滴静注用バッグ", "ヴィーンF輸液"]);
  });

  it("パクリタキセルは生理食塩液・5%ブドウ糖とは配合の所見なし、ほかの薬とは「混注しない」", () => {
    expect(findInteractions(["INJ-PTX", "INJ-NS500"], [])).toEqual([]);
    expect(findInteractions(["INJ-PTX", "INJ-GLU5-500"], [])).toEqual([]);
    expect(findInteractions(["INJ-PTX", "INJ-DEX66"], [])).toMatchObject([{ pairId: "ptx-mix", needsReason: true }]);
  });

  it("the milder 配合 notes are information (セファゾリン × ファモチジン, カルボプラチン × 生理食塩液)", () => {
    expect(findInteractions(["INJ-CEZ1", "INJ-FAMO20"], [])).toMatchObject([{ pairId: "cez-famo", needsReason: false }]);
    expect(findInteractions(["INJ-CBDCA", "INJ-NS500"], [])).toMatchObject([{ pairId: "cbdca-salt", needsReason: false }]);
  });

  it("a drug met in several orders is listed once, with both places", () => {
    const f = findInteractions(["ORAL-AMLO5"], [
      { code: "ORAL-ENA5", where: "持参薬" },
      { code: "ORAL-ENA5", where: "下書き（内服（臨時））" },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].other.where).toBe("持参薬・下書き（内服（臨時））");
  });

  it("アセリオ（静注）には抗菌薬との併用注意の記載がない（カロナール錠にはある）", () => {
    expect(findInteractions(["INJ-APAP1000"], [{ code: "INJ-CEZ1", where: "注射" }])).toEqual([]);
    expect(findInteractions(["ORAL-APAP500"], [{ code: "INJ-CEZ1", where: "注射" }])).toMatchObject([{ pairId: "apap-abx" }]);
  });

  it("a 併用禁忌 needs a reason (checked with a test table: no master pair is 併用禁忌)", () => {
    const table: InteractionPair[] = [{ id: "t", level: "併用禁忌", a: ["ORAL-SPL25"], b: ["INJ-KCL20"], text: "テスト", refs: [{ doc: "aldactoneA", section: "10.1", as: "テスト" }] }];
    expect(findInteractions(["INJ-KCL20"], [{ code: "ORAL-SPL25", where: "持参薬" }], table)).toMatchObject([{ level: "併用禁忌", needsReason: true }]);
  });
});

describe("下書きの照らし合わせ（draftInteractions・interactionIssues）", () => {
  it("中止するオーダとは照らさない", () => {
    const d = rx(["ORAL-LOX60"]);
    expect(draftInteractions(d, ctx(kitamura, [d]), []).some((f) => f.other.code === "ORAL-SPL25")).toBe(true);
    expect(draftInteractions(d, ctx(kitamura, [d]), ["kita-spl"]).some((f) => f.other.code === "ORAL-SPL25")).toBe(false);
  });

  it("配合しない組み合わせは理由を聞き、入れた理由は下書きに残る", () => {
    const d = inj(["INJ-VEENF500", "INJ-CTRX1"]);
    const [mix] = interactionIssues(d, ctx(mori, [d]), []).filter((i) => i.key.startsWith("ix-ctrx-calcium"));
    expect(mix).toMatchObject({ level: "ask", title: "配合（電子添文：混ぜない）" });
    expect(mix.message).toMatch(/ほかの Rp で同じルートから入る薬は調べていません/);
    const next = mix.input!.apply(d, "  テストの理由  ") as InjectionDraft;
    expect(next.interactionReasons).toEqual({ "ctrx-calcium": "テストの理由" });
    expect(interactionIssues(next, ctx(mori, [next]), []).find((i) => i.key.startsWith("ix-ctrx-calcium"))).toMatchObject({ level: "info", title: "配合（電子添文：混ぜない）（理由あり）" });
  });

  it("退院時処方は退院時処方とだけ照らす", () => {
    const home = rx(["ORAL-AMLO5"], { category: "退院時", days: 14 });
    const ward = rx(["ORAL-AMLO5"], { id: "rx2" });
    const homeWith = draftInteractions(home, ctx(kitamura, [home]), []).map((f) => f.other.where);
    const wardWith = draftInteractions(ward, ctx(kitamura, [ward]), []).map((f) => f.other.where);
    expect(homeWith.length).toBeGreaterThan(0);
    expect(homeWith.every((w) => w === "退院時処方")).toBe(true);
    expect(wardWith.some((w) => w.includes("退院時"))).toBe(false);
    expect(wardWith).toContain("持参薬");
  });

  it("メトホルミン × CT（造影）のオーダ", () => {
    const ct: OrderEntry = {
      kind: "order",
      id: "ct1",
      day: 0,
      time: "09:00",
      author: "",
      status: "有効",
      order: { type: "imaging", modality: "CT", region: "R-CHEST", contrast: "造影", purpose: "", when: { day: 1, priority: "予約", time: "10:00" }, transport: "車椅子" },
    };
    const d = rx(["ORAL-MET250"]);
    const f = draftInteractions(d, { activeOrders: [ct], drafts: [d] }, []);
    expect(f).toMatchObject([{ pairId: "met-contrast", other: { where: "CT（造影）のオーダ" } }]);
    expect(draftInteractions(d, { activeOrders: [{ ...ct, order: { ...ct.order, contrast: "単純" } } as OrderEntry], drafts: [d] }, [])).toEqual([]);
  });

  it("issues carry links; 併用注意 never asks", () => {
    const d = rx(["ORAL-LOX60"]);
    const is = interactionIssues(d, ctx(kitamura, [d]), []);
    expect(is.length).toBeGreaterThan(0);
    expect(is.every((i) => i.level === "info" && i.sources!.every((s) => s.url.startsWith("https://www.pmda.go.jp/")))).toBe(true);
  });
});

describe("処方監査（薬剤部）: 確定したオーダの所見", () => {
  it("森さんの今のセフトリアキソン（生食100mL）：配合の所見なし、頓用のアセトアミノフェン錠と併用注意", () => {
    const e = ordersOf(mori).find((o) => o.order.type === "injection" && o.order.items[0].drugCode === "INJ-CTRX1")!;
    expect(orderInteractions(e, ordersOf(mori))).toMatchObject([{ pairId: "apap-abx", level: "併用注意", other: { where: "内服（臨時）" } }]);
  });

  it("北村さんのエナラプリル（持参薬）には、スピロノラクトン・ビソプロロール・フロセミド注との所見", () => {
    const entries = ordersOf(kitamura);
    const ena = entries.find((o) => o.id === "kita-ena")!;
    const f = orderInteractions(ena, entries);
    expect(f.map((x) => x.pairId).sort()).toEqual(["biso-ena", "ena-frs", "ena-spl"]);
    // 退院時処方 (also エナラプリル・スピロノラクトン) is not counted against a ward order.
    expect(f.every((x) => !x.other.where.includes("退院時"))).toBe(true);
  });

  it("a stopped order shows nothing", () => {
    const entries = ordersOf(kitamura);
    const ena = { ...entries.find((o) => o.id === "kita-ena")!, status: "中止" as const };
    expect(orderInteractions(ena, entries)).toEqual([]);
  });
});

describe("下書きのチェック（drafts.ts の checkDraft・toOrder）", () => {
  it("北村さんに KCl を入れると、持参薬のスピロノラクトン・エナラプリルとの併用注意が情報として出る", () => {
    const d = inj(["INJ-SOL3A500", "INJ-KCL20"], { items: [{ drugCode: "INJ-SOL3A500", said: "", amount: 500, unit: "mL" }, { drugCode: "INJ-KCL20", said: "", amount: 10, unit: "mEq" }], infusionMinutes: 240 });
    const issues = checkDraft(d, ctx(kitamura, [d]));
    const ix = issues.filter((i) => i.key.startsWith("ix-"));
    expect(ix.map((i) => i.title)).toEqual(["併用注意", "併用注意"]);
    expect(ix.every((i) => i.level === "info" && (i.sources?.length ?? 0) > 0)).toBe(true);
    expect(ix.map((i) => i.message).join("／")).toMatch(/スピロノラクトン錠 25mg（持参薬）/);
    expect(isReady(issues)).toBe(true);
  });

  it("セフトリアキソンをヴィーンFと同じ Rp にすると、理由を入れるまで確定できない。理由はオーダに残る", () => {
    const d = inj(["INJ-CTRX1", "INJ-VEENF500"], { items: [{ drugCode: "INJ-VEENF500", said: "", amount: 500, unit: "mL" }, { drugCode: "INJ-CTRX1", said: "", amount: 1, unit: "g" }] });
    const issues = checkDraft(d, ctx(mori, [d]));
    const mix = issues.find((i) => i.key.startsWith("ix-ctrx-calcium"))!;
    expect(mix.level).toBe("ask");
    expect(isReady(issues)).toBe(false);
    const next = mix.input!.apply(d, "テストの理由") as InjectionDraft;
    const after = checkDraft(next, ctx(mori, [next]));
    expect(isReady(after)).toBe(true);
    const order = toOrder(next, ctx(mori, [next])).order as InjectionOrder;
    expect(order.interactionReasons).toEqual([{ pairId: "ctrx-calcium", level: "配合", drugs: expect.stringMatching(/^酢酸リンゲル液（ヴィーンF） × セフトリアキソン/), reason: "テストの理由" }]);
  });

  it("理由の要らない所見だけなら、オーダに理由の欄は付かない", () => {
    const d = rx(["ORAL-LOX60"]);
    const r = toOrder(d, ctx(kitamura, [d]));
    expect(r.orders).toHaveLength(1);
    expect("interactionReasons" in r.orders![0]).toBe(false);
  });

  it("内服の Rp では、理由はその薬のオーダにだけ残る（テスト用の表で）", () => {
    const table: InteractionPair[] = [{ id: "t", level: "併用禁忌", a: ["ORAL-LOX60"], b: ["ORAL-SPL25"], text: "テスト", refs: [{ doc: "aldactoneA", section: "10.1", as: "テスト" }] }];
    const d = rx(["ORAL-LOX60", "ORAL-REBA100"], { interactionReasons: { t: "テストの理由" } });
    expect(reasonsToKeep(d, ctx(kitamura, [d]), [], ["ORAL-LOX60"], table)).toEqual([{ pairId: "t", level: "併用禁忌", drugs: "ロキソプロフェンNa錠 60mg × スピロノラクトン錠 25mg（持参薬）", reason: "テストの理由" }]);
    expect(reasonsToKeep(d, ctx(kitamura, [d]), [], ["ORAL-REBA100"], table)).toBeUndefined();
  });

  it("中止の下書きがあるオーダとは照らさない", () => {
    const d = rx(["ORAL-LOX60"]);
    const stop: Draft = { id: "s1", origin: "manual", sourceText: "", comment: null, kind: "stop", drugCode: "ORAL-SPL25", said: "", targetOrderId: "kita-spl" };
    const msgs = (ds: Draft[]) => checkDraft(d, ctx(kitamura, ds)).filter((i) => i.key.startsWith("ix-")).map((i) => i.message).join("／");
    expect(msgs([d])).toMatch(/スピロノラクトン/);
    expect(msgs([d, stop])).not.toMatch(/スピロノラクトン/);
  });
});
