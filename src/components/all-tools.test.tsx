// 右の道具の「全ツール」と、道具を隠す・戻す。Drawn on the server (no browser): the button that replaced
// 「オーダと道具」, the list by kind with 隠し中, the search by reading, and a hidden tile gone from the rail.
import { CalendarDays, PenTool, Pill } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveRail } from "@/lib/rail";
import { resolveTools } from "@/lib/tool-layout";
import { STAFF } from "@/lib/roles";
import { AllToolsList, type AllToolGroup } from "./AllTools";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail, groupsFor } from "./ToolRail";

const doctor = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value="医師">
      <MeProvider value={STAFF["医師"]}>{el}</MeProvider>
    </RoleProvider>,
  );

const GROUPS: AllToolGroup[] = [
  { key: "intervention", title: "介入", tools: [{ pin: "add-rx", label: "処方", icon: Pill, hidden: false }] },
  { key: "reference", title: "参照", tools: [{ pin: "calendar:flowsheet", label: "経過表", icon: CalendarDays, hidden: false }] },
  { key: "other", title: "その他", tools: [{ pin: "schema", label: "シェーマ", icon: PenTool, hidden: true }, { pin: "cosign", label: "研修医の記録の確認", icon: PenTool, hidden: false, why: "医師が行います" }] },
];
const list = (query: string) => renderToStaticMarkup(<AllToolsList groups={GROUPS} query={query} onOpen={() => {}} />);

describe("全ツールのボタン", () => {
  it("「オーダと道具」の文字の場所にボタン「全ツール」（アイコン＋文字）。配置の編集は全ツールの中へ", () => {
    const html = doctor(<ToolRail open={null} onOpen={() => {}} />);
    expect(html).not.toContain("オーダと道具");
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog" aria-expanded="false"[^>]*><svg[^>]*lucide-grip[\s\S]*?<\/svg>全ツール<\/button>/);
    expect(html).not.toContain('title="道具の配置を編集"');
  });
});

describe("全ツールの一覧", () => {
  it("種類ごとに並べ、隠している道具は薄く「隠し中」。使えない道具は押せない印", () => {
    const html = list("");
    expect([...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1])).toEqual(["介入", "参照", "その他"]);
    const schema = html.match(/<button[^>]*data-tool="schema"[\s\S]*?<\/button>/)![0];
    expect(schema).toContain('data-hidden="true"');
    expect(schema).toContain("隠し中");
    expect(html.match(/隠し中/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*title="医師が行います"[^>]*data-tool="cosign"/);
  });

  it("検索はひらがなの読みでも（「けいかひょう」で経過表だけ）。何もなければ「見つかりません」", () => {
    const html = list("けいかひょう");
    expect(html.match(/data-tool="([^"]+)"/g)).toEqual(['data-tool="calendar:flowsheet"']);
    expect([...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1])).toEqual(["参照"]);
    expect(list("ないもの")).toContain("見つかりません");
  });
});

describe("隠した道具（人ごと）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    saveRail(STAFF["医師"].name, { mode: "icons", pins: [] });
  });

  it("隠した道具は種類のタブの並びにもお気に入りにも出ない。ほかの道具は落とし先の印（data-tool）を持つ", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
    const groups = groupsFor("医師").map((g) => ({ key: g.key, title: g.title, tools: [...g.main, ...g.more].map((t) => t.key as string) }));
    saveRail(STAFF["医師"].name, { mode: "icons", pins: ["add-rx", "add-injection"], layout: { ...resolveTools(groups), hidden: ["add-rx"] } });
    const html = doctor(<ToolRail open={null} onOpen={() => {}} />);
    expect(html).not.toContain('title="処方"');
    expect(html).toContain('title="注射"');
    expect(html).toContain('data-tool="add-injection"');
    const fav = html.match(/<section aria-label="お気に入り"[\s\S]*?<\/section>/)![0];
    expect(fav).not.toContain("処方");
    expect(fav).toContain("注射");
  });
});
