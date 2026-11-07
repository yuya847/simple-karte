import { describe, expect, it } from "vitest";
import type { Draft, InjectionDraft, LabDraft, StopDraft } from "./drafts";
import { drugsNamed, levelDrugCode, resolveDraftCodes } from "./resolve-codes";
import type { OrderEntry } from "./types";

const running = (code: string): OrderEntry =>
  ({ kind: "order", id: `o-${code}`, day: -2, time: "10:00", author: "山本", status: "有効", order: { type: "injection", items: [{ drugCode: code, amount: 1, unit: "g" }], schedule: { kind: "every_hours", hours: 12 }, start: { day: -2, time: "10:00" } } }) as unknown as OrderEntry;

const base = { origin: "ai" as const, sourceText: "", comment: null };
const stop = (said: string): StopDraft => ({ ...base, id: "s", kind: "stop", drugCode: null, said, targetOrderId: null });
const inj = (said: string, amount: number | null, unit: string | null): InjectionDraft => ({
  ...base,
  id: "i",
  kind: "injection",
  items: [{ drugCode: null, said, amount, unit }],
  route: null,
  schedule: { kind: "every_hours", hours: 12 },
  infusionMinutes: 60,
  infusionScope: null,
  rateMlPerH: null,
  prefer: null,
  start: { day: 0, time: "18:00" },
  days: null,
  duplicate: null,
});
const level = (): LabDraft => ({
  ...base,
  id: "l",
  kind: "lab",
  tests: [{ code: "LAB-VCM", said: "VCMの血中濃度" }],
  collect: { day: null, when: "before_dose", time: null, beforeDose: { n: 3, drugCode: null } },
  priority: null,
  cultureSets: null,
  duplicateOk: false,
});

const codeOf = (d: Draft) => (d.kind === "injection" ? d.items[0].drugCode : d.kind === "stop" ? d.drugCode : d.kind === "lab" ? d.collect.beforeDose?.drugCode : null);

describe("略語が複数の製品に当たるときのコードの決め方", () => {
  it("VCM・CEZ は院内の複数の製品に当たる（Claude は空で返す）", () => {
    expect(drugsNamed("VCM").length).toBeGreaterThan(1);
    expect(drugsNamed("ｃｅｚ").length).toBeGreaterThan(1);
  });

  it("中止：有効なオーダの中で当たる薬が1つだけなら、その薬", () => {
    const [d] = resolveDraftCodes([stop("CEZ")], [running("INJ-CEZ1")]);
    expect(codeOf(d)).toBe("INJ-CEZ1");
  });

  it("中止：有効なオーダに当たる薬がなければ空のまま（医師が選ぶ）", () => {
    const [d] = resolveDraftCodes([stop("CEZ")], [running("INJ-VCM05")]);
    expect(codeOf(d)).toBeNull();
  });

  it("注射：言われた量をちょうど1本で作れる製品が1つだけなら、その製品", () => {
    const [d] = resolveDraftCodes([inj("VCM", 1, "g")], []);
    const code = codeOf(d)!;
    expect(code).not.toBeNull();
    expect(drugsNamed("VCM").map((x) => x.code)).toContain(code);
  });

  it("注射：いま使っている製品があれば、それを続ける", () => {
    const [d] = resolveDraftCodes([inj("VCM", 1, "g")], [running("INJ-VCM05")]);
    expect(codeOf(d)).toBe("INJ-VCM05");
  });

  it("注射：どの規格でも1本に合わない量なら空のまま", () => {
    const [d] = resolveDraftCodes([inj("VCM", 1.25, "g")], []);
    expect(codeOf(d)).toBeNull();
  });

  it("注射：Claude が入れたコードは変えない", () => {
    const d0 = inj("VCM", 1, "g");
    d0.items[0].drugCode = "INJ-VCM05";
    const [d] = resolveDraftCodes([d0], []);
    expect(codeOf(d)).toBe("INJ-VCM05");
  });

  it("血中濃度の「3回目の前」：一緒に出した VCM の注射に結びつける", () => {
    const out = resolveDraftCodes([inj("VCM", 1, "g"), level()], []);
    expect(codeOf(out[1])).toBe(codeOf(out[0]));
  });

  it("血中濃度：医師があとから注射の製品を選んでも、結びつく", () => {
    const d0 = inj("VCM", 1.25, "g");
    d0.items[0].drugCode = "INJ-VCM05";
    expect(levelDrugCode(level(), [d0], [])).toBe("INJ-VCM05");
  });

  it("血中濃度：測る薬の注射が2つあれば決めない", () => {
    const a = inj("VCM", 1, "g");
    a.items[0].drugCode = "INJ-VCM05";
    const b = { ...inj("VCM", 1, "g"), id: "i2" };
    b.items = [{ ...b.items[0], drugCode: drugsNamed("VCM").find((x) => x.code !== "INJ-VCM05")!.code }];
    expect(levelDrugCode(level(), [a, b], [])).toBeNull();
  });
});
