import { templateSyntaxHelp } from "./template-syntax";
import { FALL_RULES, FALL_SOURCES } from "../fall-reassess";
import { R8 } from "../admit-eval";
import { remainingHints } from "./remaining-hints";
import { AREAS, WARD_TABS } from "../nav";
import { departmentHelp } from "./departments";
import { screenHelp } from "./content";
import { helpRoutes } from "./routes";
import { operationHelp, referenceHelpLabels } from "./operations";
import { toolHelpLabels } from "./tool-labels";

export interface HelpSection { id: string; title: string; bullets: string[]; related?: string[] }
const keyboard = new Set<string>(["⌘K：患者を開く。", "Esc：ヘルプを閉じる。"]);
const content = [...screenHelp, ...remainingHints].map((s) => ({ ...s, bullets: s.bullets.filter((b) => {
  if (/⌘|Ctrl|Tab|Enter|Alt[+＋]|Escape|Esc|キーボード|ショートカット|矢印キー/.test(b)) { keyboard.add(b); return false; }
  return true;
}) }));
function bulletsFor(route: string): string[] {
  const components = helpRoutes[route] ?? [];
  return [...new Set([...(operationHelp[route] ?? []), ...content.filter((s) => components.includes(s.id)).flatMap((s) => s.bullets)])];
}
const screens: HelpSection[] = [
  ...AREAS.filter((a) => a.key !== "ward").map((a) => ({ id: `screen:${a.key}`, title: a.label, bullets: bulletsFor(`screen:${a.key}`) })),
  ...WARD_TABS.map((t) => ({ id: `screen:${t.key}`, title: `病棟 › ${t.label}`, bullets: [...new Set([t.hint, ...bulletsFor(`screen:${t.key}`), ...(t.key === "falls" ? [FALL_SOURCES.teigen.label, FALL_SOURCES.teigen.url, R8.fall, ...Object.values(FALL_RULES)] : []), ...(t.key === "handoff" ? ["申し送りはこの端末のブラウザ内に保存します。重症度は送る人が選び、NEWS2 はカルテの事実を確認します。"] : [])])] })),
  { id: "screen:wardmenu", title: "病棟 › 画面を選ぶ", bullets: ["画面名を押して開きます。☆でよく使う画面を登録します。"] },
  { id: "screen:chart", title: "患者のカルテ", bullets: ["上段の患者タブでカルテを切り替えます。", "右端のツールからオーダ・記録・文書を開きます。", "記事は内容を確認して「記事を確定」で保存します。"] },
  { id: "screen:visit", title: "受診のカルテ", bullets: ["記事・内服・注射はカルテの右側から入力します。検査は右端のツールから開きます。"] },
  ...Object.entries({ ...toolHelpLabels, ...referenceHelpLabels }).map(([key, title]) => ({ id: `panel:${key}`, title: `カルテ › ${title}`, bullets: bulletsFor(`panel:${key}`) })),
];
// Detailed sections are shown once; screen entries already contain their own component help.
const attached = new Set(screens.flatMap((s) => helpRoutes[s.id] ?? []));
const uniqueSections: HelpSection[] = [{ id: "rx-expiry", title: "処方切れ", bullets: ["内服は投与日数、注射は指定期間内の最後の投与日を数えます。今日・明日・明後日と、次の定期処方日までの終了を表示します。", "定期処方の曜日は架空の病院の取り決めです。中止・退院時・頓用・1回のみ・退院予定日より後の終了は除きます。", "延長は同じ処方の延長下書きに入り、医師が保存して確定します。終了にする操作は処方を変更せず知らせを閉じます。", "薬剤師・看護師はカルテから共有付箋で医師へ伝えます。主治医・担当チームの医師と指導医のやることに表示します。"] },templateSyntaxHelp, ...departmentHelp, ...screens, ...content.filter((s) => !attached.has(s.id)),
  { id: "keyboard", title: "キーボード", bullets: [...keyboard] }];
const ownerOf = new Map<string, string>();
export const helpSections: HelpSection[] = uniqueSections.map((s) => {
  const related = new Set<string>();
  const bullets = s.bullets.filter((bullet) => {
    const key = bullet.replace(/[。\s]+$/g, "");
    const owner = ownerOf.get(key);
    if (owner) { if (owner !== s.id) related.add(owner); return false; }
    ownerOf.set(key, s.id);
    return true;
  });
  return { ...s, bullets, related: [...related] };
});

export function contextualHelp(screen: string, panel?: string | null): string {
  const id = panel && (screen === "chart" || screen === "visit") ? `panel:${panel}` : `screen:${screen}`;
  return helpSections.some((s) => s.id === id) ? id : "screen:chart";
}
export function searchHelp(query: string): HelpSection[] {
  const terms = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return helpSections.filter((s) => terms.every((term) => `${s.title} ${s.bullets.join(" ")} ${(s.related ?? []).flatMap((id) => helpSections.find((item) => item.id === id)?.bullets ?? []).join(" ")}`.normalize("NFKC").toLocaleLowerCase().includes(term)));
}

/** Pick the visible foreground window; minimized windows do not supply help context. */
export function foregroundHelp(windows: { id: string; z: number; visible: boolean }[]): string | undefined {
  return windows.map((w, index) => ({ ...w, index })).filter((w) => w.visible && helpSections.some((s) => s.id === w.id)).sort((a, b) => b.z - a.z || b.index - a.index)[0]?.id;
}

export function inlineHelpSection(title: string): string | undefined {
  if (title.startsWith("注射：")) return "panel:add-injection";
  if (title.startsWith("内服：")) return "panel:add-rx";
  if (title.startsWith("退院オーダ：")) return "panel:add-discharge";
  return undefined;
}
