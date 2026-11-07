import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { STAFF } from "@/lib/roles";
import { initialSurgeries } from "@/lib/surgery";
import { MeProvider, RoleProvider } from "./RoleContext";
import { AddSurgeryPanel, OrDayBars } from "./panels/AddSurgeryPanel";
it("患者を引用して各室の空きを表示し、必要事項のない申込は保存できない", () => {
  const p = PATIENTS[0];
  const html = renderToStaticMarkup(<RoleProvider value="医師"><MeProvider value={STAFF.医師}><AddSurgeryPanel patient={p} today={{ y: 2026, m: 11, d: 6 }} nowTime="10:00" surgeries={initialSurgeries(0)} onSave={() => {}} /></MeProvider></RoleProvider>);
  for (const text of [p.name, p.department, "手術室1", "手術室2", "手術室3", "硬膜外麻酔", "伝達麻酔", "抗凝固薬の中止", "特記"]) expect(html).toContain(text);
  expect(html).toContain('type="date"');
  expect(html).toMatch(/<button type="submit" disabled=""/);
});

it("手術室ごとの時間の帯：空きを押して開始、入らない長さは赤", () => {
  const noop = () => {};
  const empty = renderToStaticMarkup(<OrDayBars day={5} surgeries={[]} room={null} start={null} minutes={60} onPick={noop} onMinutes={noop} />);
  // A free day: one white stretch per room from opening to closing, as a button (Enter puts the start at 08:30).
  expect(empty.match(/data-or-bar/g)).toHaveLength(3);
  expect(empty).toContain('aria-label="手術室1 08:30から 570分 空き"');
  expect(empty).not.toContain("からの"); // no list of slot buttons with the words
  const fits = renderToStaticMarkup(<OrDayBars day={5} surgeries={[]} room="手術室2" start="09:00" minutes={120} onPick={noop} onMinutes={noop} />);
  expect(fits).toContain('aria-label="申込 09:00から 120分"');
  expect(fits).toContain("bg-ai/85");
  const late = renderToStaticMarkup(<OrDayBars day={5} surgeries={[]} room="手術室2" start="17:00" minutes={120} onPick={noop} onMinutes={noop} />);
  expect(late).toContain('aria-label="申込 17:00から 120分（入りません）"');
  expect(late).toContain("bg-shu/85");
});
