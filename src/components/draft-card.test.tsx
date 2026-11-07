import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DraftCard } from "./DraftCard";
import { applyChoice, checkDraft, isReady, type CheckContext, type Draft } from "@/lib/drafts";
import { defaultDraw, labDraftOf } from "@/lib/lab-catalog";
import { DEPT_SETS } from "@/lib/lab-sets";
import { visitLabOrders } from "@/lib/lab-visits";
import { masterIssues, NO_OVERRIDES } from "@/lib/master-local";
const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "今日", describe: () => "" };
const draft: Draft = { id: "u", kind: "unclear", origin: "manual", sourceText: "検査", reason: "名前を確認", comment: null };
it("shows the order boxed (so it is not read as note text); with something to answer the details are open from the start, with nothing to answer they are collapsed", () => {
  const html = renderToStaticMarkup(<DraftCard draft={draft} ctx={ctx} issues={[{ key: "q", level: "ask", title: "詳細だけの理由", message: "確認してください" }]} onApply={() => {}} onRemove={() => {}} />);
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-label="確認 1件・理由を開く"');
  expect(html).toContain('aria-label="この下書きを消す"');
  expect(html).toContain("詳細だけの理由");
  expect(html).toContain("確認 1件</button>");
  expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(2);
  expect(html).toMatch(/<article class="[^"]*rounded-md border border-ai\/40/);
  const ok = renderToStaticMarkup(<DraftCard draft={draft} ctx={ctx} issues={[]} onApply={() => {}} onRemove={() => {}} />);
  expect(ok).toContain('aria-expanded="false"');
});

it("内服の仮の見出しを隠し、1回量・回数・日数の後ろに薄く1日量を出す", () => {
  const rx: Draft = { id: "rx", kind: "prescription", origin: "manual", sourceText: "（Rp 入力）", comment: null, items: [{ drugCode: "ORAL-APAP500", said: "", daily: 1, perDose: 1 }], timings: ["朝"], days: 7, category: "定期", start: { day: 0, timing: null }, prn: null, maxPerDay: null, acks: [], onePack: false };
  const html = renderToStaticMarkup(<DraftCard draft={rx} ctx={ctx} rp={1} issues={[{ key: "q", level: "ask", title: "確認", message: "確認" }]} onApply={() => {}} onRemove={() => {}} />);
  expect(html).not.toContain("Rp 入力");
  expect(html).toContain("内服 Rp1 アセトアミノフェン錠 500mg 1回1錠 1日1回 朝食後 7日分 定期");
  expect(html).toContain('text-ink-faint">（1日1錠）');
  expect(html.indexOf('class="ml-2">1日1回 朝食後　7日分')).toBeLessThan(html.indexOf('text-ink-faint">（1日1錠）'));
  expect(html).toContain('id="draft-line-rx"');
});

const heartFailure = () => {
  const set = DEPT_SETS.flatMap((d) => d.sets).find((s) => s.code === "DSET-CARD-HF")!;
  expect(set.codes).toHaveLength(19);
  return labDraftOf("er-hf", set.codes, { ...defaultDraw(), mode: "now", priority: "至急" }, { site: "自科採血" });
};

it("救急の心不全セットは至急・今すぐだけでは確認を残さない", () => {
  const d = heartFailure();
  const issues = [...checkDraft(d, ctx), ...masterIssues(d, NO_OVERRIDES)];
  expect(issues.filter((i) => i.level !== "info")).toEqual([]);
  expect(isReady(issues)).toBe(true);
});

it("救急の既存採血との重複理由と選択肢を、詳細の検査一覧より先に出す", () => {
  const d = heartFailure();
  const c: CheckContext = { ...ctx, nowTime: "07:56", labOrders: visitLabOrders(7 * 60 + 56)["er:er-3"], describe: () => "本日の血算・生化学・BNP" };
  const issues = checkDraft(d, c);
  const blocking = issues.filter((i) => i.level !== "info");
  expect(blocking.map((i) => i.key)).toEqual(["duplicate"]);
  expect(isReady(issues)).toBe(false);
  const html = renderToStaticMarkup(<DraftCard draft={d} ctx={c} issues={issues} onApply={() => {}} onRemove={() => {}} />);
  expect(html).toContain(blocking[0].message);
  expect(html).toContain(">重ねて出す</button>");
  expect(html).toContain(">この下書きを消す</button>");
  const detail = html.slice(html.indexOf('aria-label="下書きの詳細"'));
  expect(detail.indexOf(blocking[0].message)).toBeGreaterThan(0);
  expect(detail.indexOf(blocking[0].message)).toBeLessThan(detail.indexOf('class="nums px-1 py-0.5"'));
  const accepted = applyChoice(d, blocking[0].choices![0]);
  expect(isReady(checkDraft(accepted, c))).toBe(true);
});

it("注射の下書きは1行に1回だけ出し、足りない値は欄に短い印を付ける（説明の文は出さない）", () => {
  const d: Draft = { id: "ctrx", kind: "injection", origin: "ai", sourceText: "セフトリアキソン 2g 1日1回 点滴 5日間", comment: null, items: [{ drugCode: "620002955", said: "セフトリアキソン", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, infusionMinutes: null, infusionScope: null, rateMlPerH: null, prefer: null, start: { day: null, time: null }, days: 5, duplicate: null };
  const issues = checkDraft(d, ctx);
  expect(issues.filter((i) => i.level !== "info").map((i) => i.key)).toEqual(["unit-0", "rate"]);
  const html = renderToStaticMarkup(<DraftCard bare rp={1} draft={d} ctx={ctx} issues={issues} onApply={() => {}} onRemove={() => {}} />);
  expect(html).toContain('<b class="text-ai">Rp1</b>');
  expect(html).not.toContain("注射 Rp1");
  expect(html.match(/セフトリアキソン 2g 1日1回 点滴 5日間/g)).toHaveLength(1);
  expect(html.match(/aria-label="この下書きを消す"/g)).toHaveLength(1);
  expect(html).toContain("確認 2件</button>");
  expect(html).toContain(">点滴時間？</span>");
  expect(html).toContain(">単位？</span>");
  expect(html).not.toContain("入れ直してください");
  expect(html).not.toContain("指示受け後すぐ（日付の指定なし");
  // The unit and the drip time are fixed in place, and the card is then ready.
  const fixed: Draft = { ...d, items: [{ ...d.items[0], amount: 2, unit: "キット" }], infusionMinutes: 30, infusionScope: "per_dose", prefer: "time" };
  const after = checkDraft(fixed, ctx);
  expect(isReady(after)).toBe(true);
  const ok = renderToStaticMarkup(<DraftCard bare rp={1} draft={fixed} ctx={ctx} issues={after} onApply={() => {}} onRemove={() => {}} />);
  expect(ok).not.toContain("？</span>");
});
