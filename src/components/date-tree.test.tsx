import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { DateTree } from "./DateTree";

describe("150pxの日付ツリー", () => {
  it("日の下の記事・オーダ件数を出さず、日・月・日数を折り返さない", () => {
    const patient = PATIENTS[0];
    const html = renderToStaticMarkup(<DateTree patient={patient} entries={patient.history} today={{ y: 2026, m: 11, d: 4 }} selectedDay={null} onSelect={() => {}} />);
    expect(html).not.toContain("記事");
    expect(html).not.toContain("オーダ");
    expect(html).toContain("nums whitespace-nowrap text-[13px] text-ink-soft");
    expect(html).toContain("ml-auto shrink-0 whitespace-nowrap text-[11px]");
    expect(html).toContain("whitespace-nowrap font-bold");
  });
});
