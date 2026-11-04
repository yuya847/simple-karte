// The chart of a 救急外来・外来 visit (server render): the date tree and the day headings say 受診, not 入院.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { STAFF } from "@/lib/roles";
import type { Patient } from "@/lib/types";
import { DateTree } from "./DateTree";
import { HistoryPane } from "./HistoryPane";
import { MeProvider, RoleProvider } from "./RoleContext";

const today = { y: 2026, m: 11, d: 4 };
// 永井 茂 (fictional) as the laboratory and the chart see a visit: id "er:◯", admittedOn 0 (today).
const nagai: Patient = {
  id: "er:er-3",
  name: "永井 茂",
  kana: "ナガイ シゲル",
  sex: "男",
  age: 74,
  ward: "救急外来",
  room: "救急",
  department: "救急外来",
  attending: STAFF.医師.name,
  admittedOn: 0,
  admissionDiagnosis: "呼吸困難",
  heightCm: 0,
  weightKg: 0,
  allergies: [],
  infections: [],
  cautions: [],
  history: [{ kind: "note", day: 0, time: "08:35", author: STAFF.医師.name, role: "医師", soap: { s: "息が苦しい。", o: "SpO2 91%。", a: "心不全の疑い。", p: "採血・胸部X線。" } }],
  labs: [],
  cultures: [],
  imaging: [],
  vitals: [],
  daily: [],
};
const as = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value="医師">
      <MeProvider value={STAFF.医師}>{el}</MeProvider>
    </RoleProvider>,
  );

describe("救急外来・外来の患者のカルテの言葉", () => {
  it("the date tree starts with 今回の受診 and the date (no 〜), and the day says 今日", () => {
    const tree = renderToStaticMarkup(<DateTree patient={nagai} entries={nagai.history} today={today} selectedDay={null} onSelect={() => {}} />);
    expect(tree).toContain("今回の受診");
    expect(tree).not.toMatch(/記事 <!-- -->|オーダ <!-- -->/);
    expect(tree).toContain("shrink-0 whitespace-nowrap text-[11px]");
    expect(tree).toContain("whitespace-nowrap text-[13px]");
    expect(tree).toContain("11/4（水）");
    expect(tree).not.toContain("〜");
    expect(tree).not.toContain("入院");
  });
  it("the day heading of the record says 受診当日（今日）", () => {
    const html = as(<HistoryPane today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} patient={nagai} entries={nagai.history} />);
    expect(html).toContain("受診当日（今日）");
    expect(html).not.toContain("入院1日目");
  });
  it("a ward patient keeps 今回入院 … 〜 and 入院N日目", () => {
    const sakura = PATIENTS.find((p) => p.id === "90010231")!;
    const tree = renderToStaticMarkup(<DateTree patient={sakura} entries={sakura.history} today={today} selectedDay={null} onSelect={() => {}} />);
    expect(tree).toContain("今回入院");
    expect(tree).toContain("11/1（日）〜");
    const html = as(<HistoryPane today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} patient={sakura} entries={sakura.history} />);
    expect(html).toContain("入院4日目（今日）");
  });
});
