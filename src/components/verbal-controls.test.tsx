import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { OrderEntry } from "@/lib/types";
import { MeProvider, RoleProvider } from "./RoleContext";
import { VerbalReview } from "./VerbalControls";

const entry: OrderEntry = { kind: "order", id: "v", day: 0, time: "10:00", author: "山本（専攻医）", status: "有効", order: { type: "lab", codes: ["LAB-CBC"], collect: { day: 0, time: "10:00" }, priority: "至急" }, verbal: { doctor: "山本（専攻医）", takenBy: "看護師 佐藤", readBack: true, at: { day: 0, time: "09:58" } } };
const html = (name: string, e = entry) => renderToStaticMarkup(<RoleProvider value="医師"><MeProvider value={{ role: "医師", name }}><VerbalReview entry={e} /></MeProvider></RoleProvider>);
it("経過カードに指示医・指導医だけの承認と理由付き取り消しを出す", () => {
  for (const name of ["山本（専攻医）", "指導医 高橋"]) {
    expect(html(name)).toContain("承認する");
    expect(html(name)).toContain("取り消す（理由）");
  }
  expect(html("研修医 田中")).not.toContain("承認する");
});
it("承認後はボタンを消し、誰がいつ承認したかを表示する", () => {
  const result = html("山本（専攻医）", { ...entry, verbal: { ...entry.verbal!, signedBy: "指導医 高橋", signedAt: { day: 0, time: "10:05" } } });
  expect(result).toContain("指導医 高橋");
  expect(result).toContain("10:05");
  expect(result).not.toContain("承認する");
});
