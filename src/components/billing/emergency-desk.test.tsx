import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EmergencyDesk } from "./EmergencyDesk";
import type { ErPatient } from "@/lib/er";
import type { IjiDesk } from "@/lib/billing/worklist";
const patient = { id: "test", name: "架空の患者", status: "診察中" } as ErPatient;
const render = (drafts: number, registered = false) => renderToStaticMarkup(<EmergencyDesk visits={[{ patient, entries: [], drafts }]} book={{}} onSettle={() => {}} desk={{ insurance: registered ? { "er:test": [{}] } : {} } as IjiDesk} today={{ y: 2026, m: 11, d: 5 }} nowTime="10:00" onOpen={() => {}} />);
it("救急の行に保険登録の近道を出し、下書き0を隠す", () => {
  expect(render(0)).toContain("保険を登録する");
  expect(render(0)).not.toContain("医師の確定待ち");
  expect(render(2)).toContain("下書き 2（医師の確定待ち）");
  expect(render(0, true)).not.toContain("保険を登録する");
});
