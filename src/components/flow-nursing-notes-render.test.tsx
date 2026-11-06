import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FlowNursingNotes } from "./FlowNursingNotes";

it("看護記事はコールバックなしで開けるボタンになり、職種の選択と2行の要点を表示する", () => {
  const html = renderToStaticMarkup(<FlowNursingNotes entries={[
    { kind: "note", day: 0, time: "09:00", role: "看護師", author: "架空", focus: [{ title: "疼痛", d: "痛みあり", act: "訪室", r: "観察" }] },
    { kind: "note", day: 0, time: "09:00", role: "医師", author: "架空医師", text: "医師の本文" },
  ]} lo={540} hi={600} xAbs={at => at - 540} plotW={300} labelW={100} fmtAt={() => "11/7 09:00"} />);
  expect(html).toContain("看護師だけ");
  expect(html).toContain("全職種");
  expect(html).toContain("＃疼痛");
  expect(html).toContain("D) 痛みあり / Act) 訪室 / R) 観察");
  expect(html).toContain("の全文を開く");
  expect(html).toContain("text-[10px]");
  expect(html).not.toContain("disabled");
  expect(html).not.toContain("医師の本文");
});
