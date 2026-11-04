// The system screens (障害時の参照 …) render on the server with what they are given, and the offline page
// in public/downtime reads what the app keeps.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DOWNTIME_PAGE, DOWNTIME_STORE } from "@/lib/downtime";
import { PATIENTS } from "@/lib/patients";
import { currentEntries } from "@/lib/record";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { DowntimeView } from "./DowntimeView";
import { MeProvider, RoleProvider } from "./RoleContext";

const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );
const pub = (f: string) => readFileSync(fileURLToPath(new URL(`../../public/downtime/${f}`, import.meta.url)), "utf8");

describe("障害時の参照の画面", () => {
  const rows = () => PATIENTS.map((p, i) => ({ patient: p, room: `50${i + 1}`, entries: currentEntries(p).filter((e): e is OrderEntry => e.kind === "order") }));
  it("shows each patient's essentials with the sources, and says it could not keep it here (no browser)", () => {
    const html = as("看護師", <DowntimeView places={["5階東病棟"]} rowsFor={rows} today={today} nowTime="10:00" mar={{}} sessionStart={480} limited={() => false} />);
    expect(html).toContain("障害時の参照");
    expect(html).toContain(PATIENTS[0].name);
    expect(html).toContain("有効な指示");
    expect(html).toContain("今日の与薬予定");
    expect(html).toContain("直近のバイタル");
    expect(html).toContain("実施（手書き）");
    expect(html).toContain("この端末のブラウザには保存されていません");
    expect(html).toContain("001716295.pdf");
    expect(html).toContain(DOWNTIME_PAGE);
  });

  it("has an offline page that reads the same key, runs only its own script, and caches only itself", () => {
    expect(pub("view.js")).toContain(`"${DOWNTIME_STORE}"`);
    const page = pub("index.html");
    expect(page).toContain("script-src 'self'");
    expect(page).toContain('<script src="/downtime/view.js"></script>');
    const sw = pub("sw.js");
    expect(sw).toContain('var FILES = ["/downtime/index.html", "/downtime/view.js"];');
    expect(sw).toContain("FILES.indexOf(url.pathname) < 0");
  });
});
