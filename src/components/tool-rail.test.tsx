// The right-end tools render on the server (no browser): the group tabs big enough to press, the red dot on
// a tab with something unseen.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STAFF, type Role } from "@/lib/roles";
import { MeProvider, RoleProvider } from "./RoleContext";
import { GROUP_TAB_CLASS, ToolRail } from "./ToolRail";

const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const tabs = (html: string) => html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];

describe("右端ツールの群タブ（オーダ／看護／文書／参照／医事）", () => {
  it("each tab is 28px and up, 12px letters, with room on the sides; the chosen one black with white letters", () => {
    const html = as("医師", <ToolRail open={null} onOpen={() => {}} />);
    const ts = tabs(html);
    expect(ts.length).toBe(5);
    for (const t of ts) {
      expect(t).toContain("min-h-7");
      expect(t).toContain("text-[12px]");
      expect(t).toContain("px-2.5");
    }
    expect(GROUP_TAB_CLASS).toContain("min-h-7");
    expect(ts.filter((t) => t.includes("bg-ink font-bold text-white")).length).toBe(1);
    expect(ts[0]).toContain('aria-selected="true"');
    // The row wraps when the rail is too narrow for one line.
    expect(html).toMatch(/role="tablist"[^>]*class="[^"]*flex-wrap/);
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
