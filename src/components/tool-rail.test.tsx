// The right-end tools render on the server (no browser): the group tabs big enough to press, the red dot on
// a tab with something unseen, the doctor's 研修医の記録の確認 under その他, and the strips (指示受け・研修医の
// 記録の確認) living in the drawers, not above the note.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveRail } from "@/lib/rail";
import { can, ROLES, STAFF, type Role } from "@/lib/roles";
import { MeProvider, RoleProvider } from "./RoleContext";
import { GROUP_TAB_CLASS, ToolRail, groupsFor } from "./ToolRail";

const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const tabs = (html: string) => html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];

describe("右端ツールの群タブ（介入／検査／看護／参照／事務／その他）", () => {
  it("each tab is 28px and up, 12px letters, with room on the sides; the chosen one black with white letters", () => {
    const html = as("医師", <ToolRail open={null} onOpen={() => {}} />);
    const ts = tabs(html);
    expect(ts.length).toBe(6);
    for (const t of ts) {
      expect(t).toContain("min-h-7");
      expect(t).toContain("text-[12px]");
      expect(t).toContain("px-2.5");
      expect(t).toContain("font-normal");
      expect(t).not.toContain("font-bold");
    }
    expect(GROUP_TAB_CLASS).toContain("min-h-7");
    expect(ts.filter((t) => t.includes("bg-ink text-white")).length).toBe(1);
    expect(ts[0]).toContain('aria-selected="true"');
    // Equal columns and a shared weight keep every tab in place.
    expect(html).toMatch(/role="tablist"[^>]*class="[^"]*grid grid-cols-3/);
  });

  it("a tab with something unseen inside carries a red dot on its top-right corner (a little bigger than before)", () => {
    const html = as("医師", <ToolRail open={null} onOpen={() => {}} badges={{ results: { n: 2, urgent: true } }} />);
    const ref = tabs(html).find((t) => t.includes('data-badged="true"'))!;
    expect(ref).toBeTruthy();
    const after = html.slice(html.indexOf(ref) + ref.length);
    expect(after.slice(0, 200)).toMatch(/参照<span aria-hidden="true" class="absolute -right-0\.5 -top-0\.5 [^"]*h-2\.5 w-2\.5 [^"]*bg-shu"/);
    // Only that tab.
    expect(tabs(html).filter((t) => t.includes("data-badged")).length).toBe(1);
  });
});

describe("右端ツールの中の帯（指示受け・研修医の記録の確認）", () => {
  it("その他 has 研修医の記録の確認 (cosign) for the doctor, with the count as a red number; the others do not see it", () => {
    const docs = groupsFor("医師").find((g) => g.key === "other")!;
    expect(docs.main.map((t) => t.key)).toContain("cosign");
    expect(groupsFor("看護師").flatMap((g) => [...g.main, ...g.more]).some((t) => t.key === "cosign")).toBe(false);
    const html = as("医師", <ToolRail open="cosign" onOpen={() => {}} badges={{ cosign: { n: 3 } }} />);
    expect(html).toContain("研修医の記録の確認");
    expect(html).toContain('aria-label="研修医の記録の確認：未確認 3件"');
    expect(as("看護師", <ToolRail open={null} onOpen={() => {}} />)).not.toContain("研修医の記録の確認");
  });

  it("指示受け (take) under 看護 shows its count to the doctor too", () => {
    const html = as("医師", <ToolRail open="take" onOpen={() => {}} badges={{ take: { n: 1, urgent: true } }} />);
    expect(html).toContain('aria-label="指示受け：未確認 1件"');
    expect(html).toMatch(/aria-label="指示受け：未確認 1件" class="[^"]*bg-shu/);
  });

  it("WardApp renders the strips only inside the drawers (not above the note): TakeStatus once, in the 指示受け drawer; CosignStrip not at all", () => {
    const src = readFileSync(fileURLToPath(new URL("./WardApp.tsx", import.meta.url)), "utf8");
    expect(src.match(/<TakeStatus\b/g)?.length).toBe(1);
    expect(src).not.toContain("<CosignStrip");
    const take = src.indexOf('panel === "take"');
    const status = src.indexOf("<TakeStatus");
    const desk = src.indexOf("<TakeDesk", status);
    expect(take).toBeGreaterThan(0);
    expect(status).toBeGreaterThan(take);
    expect(desk).toBeGreaterThan(status);
    expect(src).toContain('panel === "cosign"');
    expect(src).toContain("<CosignPanel");
  });
});


describe("処方・注射の入口", () => {
  it("注射を開いていても群タブと処方は押せる", () => {
    const html = as("医師", <ToolRail open="add-injection" onOpen={() => {}} />);
    for (const tab of tabs(html)) expect(tab).not.toContain("disabled");
    const prescription = (html.match(/<button[^>]*>/g) ?? []).find((button) => button.includes('title="処方"'));
    expect(prescription).toBeTruthy();
    expect(prescription).not.toContain("disabled");
  });

  it("介入の先頭に処方・注射を並べ、既存の権限による無効表示を使う", () => {
    expect(groupsFor("医師")[0].main.slice(0, 2).map((t) => t.key)).toEqual(["add-rx", "add-injection"]);
    for (const role of ROLES) {
      const allowed = can(role, "order") || can(role, "order.verbal");
      const why = allowed ? undefined : "オーダの確定は医師が行います";
      const html = as(role, <ToolRail open="add-rx" onOpen={() => {}} blocked={{ "add-rx": why, "add-injection": why }} />);
      if (role === "診療放射線技師") {
        expect(html).not.toContain('title="処方"');
        continue;
      }
      const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
      for (const label of ["処方", "注射"]) {
        const button = buttons.find((b) => b.includes(`<span class="">${label}</span>`))!;
        if (!allowed) expect(button).toBeUndefined();
        else { expect(button).toBeTruthy(); expect(button.includes('disabled=""')).toBe(false); }
      }
    }
  });
});


it("職種共通の6群で、既存の道具を重複なく分類する", () => {
  for (const role of ROLES.filter((r) => r !== "診療放射線技師")) {
    const groups = groupsFor(role);
    expect(groups.map((g) => g.title)).toEqual(["介入", "検査", "看護", "参照", "事務", "その他"]);
    const keys = groups.flatMap((g) => [...g.main, ...g.more].map((t) => t.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(groups[1].main.map((t) => t.key)).toEqual(["add-lab", "add-imaging", "add-physio", "add-pathology"]);
    expect(groups[4].main.map((t) => t.key)).toEqual(["billing", "consents", "discharge", "docs"]);
    expect(groups[5].main.map((t) => t.key)).toContain("opd-booking");
  }
});


it("参照だけの職種では保存群が対象外でも参照を選ぶ", () => {
  const html = as("診療放射線技師", <ToolRail open={null} onOpen={() => {}} />);
  expect(tabs(html)).toHaveLength(1);
  expect(tabs(html)[0]).toContain('aria-selected="true"');
});

it("参照に検査時系列を追加し、未確認の数字は検査結果に残す", () => {
  const html = as("医師", <ToolRail open="results-timeline" onOpen={() => {}} badges={{ results: { n: 2, urgent: true } }} />);
  expect(html).toContain("検査時系列");
  expect(html).toContain("lucide-trending-up");
  expect(html).toContain('aria-label="検査結果：未確認 2件"');
  expect(html).not.toContain('aria-label="検査時系列：未確認');
  const src = readFileSync(fileURLToPath(new URL("./WardApp.tsx", import.meta.url)), "utf8");
  expect(src).toMatch(/const WINDOW_PANELS[^\n]*"results-timeline"/);
  expect(src).toContain('panel === "results-timeline"');
  expect(src).toContain("<ResultBrowser");
});

describe("アイコン列の左のお気に入り", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    saveRail(STAFF["医師"].name, { mode: "icons", pins: [] });
  });

  const renderPins = (mode: "icons" | "list", pins: string[]) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
    saveRail(STAFF["医師"].name, { mode, pins });
    return as("医師", <ToolRail open="results" onOpen={() => {}} badges={{ results: { n: 2, urgent: true } }} />);
  };

  it("空でも幅56pxの列を残し、使い方の案内だけを置く", () => {
    const html = renderPins("icons", []);
    expect(html).toMatch(/<aside[^>]*class="flex min-h-0 overflow-hidden/);
    const fav = html.match(/<section aria-label="お気に入り"[\s\S]*?<\/section>/)![0];
    expect(fav).toContain("w-14 shrink-0");
    expect(fav).toMatch(/<p class="hint [^"]*">★ をここに<\/p>/);
    expect(fav).not.toContain("<button");
    expect(html.indexOf(fav)).toBeLessThan(html.indexOf("オーダと道具"));
  });

  it.each(["icons", "list"] as const)("%s表示でも保存順に縦タイルを並べ、選択と件数を表示する", (mode) => {
    const html = renderPins(mode, ["results", "add-rx"]);
    const fav = html.match(/<section aria-label="お気に入り"[\s\S]*?<\/section>/)![0];
    expect(fav).toContain("flex-col");
    expect(fav).not.toContain("grid-cols-3");
    expect(fav).not.toContain("truncate");
    expect(fav.indexOf('title="検査結果"')).toBeLessThan(fav.indexOf('title="処方"'));
    expect(fav).toMatch(/title="検査結果"[^>]*aria-pressed="true"[^>]*class="flex w-full flex-col/);
    expect(fav).toContain('aria-label="検査結果：未確認 2件"');
    expect(html).toContain(mode === "list" ? "w-44" : "w-52");
  });
});

it("前に保存された事務の群があっても、新しく開くカルテには介入の処方・注射を出す", () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify({ group: "admin", mode: "icons", pins: [] }), setItem: () => {} } });
  saveRail(STAFF["医師"].name, { group: "admin", mode: "icons", pins: [] });
  const html = as("医師", <ToolRail open={null} onOpen={() => {}} />);
  expect(tabs(html)[0]).toContain('aria-selected="true"');
  expect(html).toContain("処方");
  expect(html).toContain("注射");
});

it("使えないタイルは既定で隠し、すべて表示の保存時は灰色で出す", () => {
  const blocked = { "add-rx": "処方は医師が行います" };
  expect(as("管理栄養士", <ToolRail open="add-rx" onOpen={() => {}} blocked={blocked} />)).not.toContain('title="処方は医師が行います"');
  const data = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
  saveRail(STAFF["管理栄養士"].name, { mode: "icons", group: "intervention", pins: [], showAll: true });
  const html = as("管理栄養士", <ToolRail open="add-rx" onOpen={() => {}} blocked={blocked} />);
  expect(html).toMatch(/disabled="" title="処方は医師が行います"[^>]*text-ink-faint/);
  expect(html).toContain("すべて表示：入");
});
