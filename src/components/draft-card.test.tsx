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
it("shows a borderless line; with something to answer the details are open from the start, with nothing to answer they are collapsed", () => {
  const html = renderToStaticMarkup(<DraftCard draft={draft} ctx={ctx} issues={[{ key: "q", level: "ask", title: "詳細だけの理由", message: "確認してください" }]} onApply={() => {}} onRemove={() => {}} />);
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-label="確認 1件・理由を開く"');
  expect(html).toContain('aria-label="この下書きを消す"');
  expect(html).toContain("詳細だけの理由");
  expect(html).toContain("件・理由を開く</button>");
  expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(2);
  expect(html).not.toContain("border");
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
  const detail = html.slice(html.indexOf("<header"));
  expect(detail.indexOf(blocking[0].message)).toBeLessThan(detail.indexOf('class="nums px-3 py-2"'));
  const accepted = applyChoice(d, blocking[0].choices![0]);
  expect(isReady(checkDraft(accepted, c))).toBe(true);
});
