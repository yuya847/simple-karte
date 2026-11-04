import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { PANIC_LIMITS, resultsOf } from "@/lib/results";
import { ResultBrowser } from "./ResultBrowser";
import { RoleProvider } from "./RoleContext";

it("一覧を初期表示し、未確認の一覧と種類絞り込みと時系列への入口を置く", () => {
  const patient = PATIENTS[0];
  const html = renderToStaticMarkup(<RoleProvider value="医師"><ResultBrowser patient={patient} today={{ y: 2026, m: 11, d: 4 }} items={resultsOf(patient, PANIC_LIMITS)} extra={[]} calls={{}} onSeen={() => {}} onTimeline={() => {}} /></RoleProvider>);
  for (const text of ["検査結果一覧", "時系列で表示", "種類で絞る", "未確認の結果", "未確認"]) expect(html).toContain(text);
  expect(html).not.toContain("前回との差");
});
