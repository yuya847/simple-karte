import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { initialErPatients } from "@/lib/er";
import { RequestForm } from "./VisitChart";
import { RoleProvider } from "./RoleContext";

it("救急の入院申込に見えるラベル、既定値、未入力欄へのボタンがある", () => {
  const html = renderToStaticMarkup(<RoleProvider value="医師"><RequestForm visit={{ kind: "er", er: initialErPatients(600)[0] }} me="架空の医師" nowTime="10:00" newId={() => "r"} onCancel={() => {}} onSend={() => {}} /></RoleProvider>);
  for (const name of ["入院時の病名", "入院の目的", "身長", "体重", "アレルギー", "病棟への申し送り"]) {
    const label = html.match(new RegExp(`<label for="([^"]+)"[^>]*>${name}</label>`));
    expect(label, name).toBeTruthy();
    expect(html).toContain(`id="${label![1]}"`);
  }
  for (const name of ["緊急", "今日", "なし"]) expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*>${name}</button>`));
  expect(html).toContain("部屋（任意）");
  expect(html).toMatch(/<button type="button" class="underline">病棟<\/button>/);
  const missing = html.slice(html.indexOf("未入力："));
  expect(missing).not.toContain(">区分</button>");
  expect(missing).not.toContain(">部屋</button>");
});
