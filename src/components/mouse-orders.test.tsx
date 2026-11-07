// 指示受け・実施入力 in one line per order: what the line shows, what opens under it, and the Shift range.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetBlock, pickRange, rowTime } from "./OrderSheet";

const TODAY = { y: 2026, m: 11, d: 4 };
const noop = () => {};
const stamps = { start: { at: "11/4（水） 14:00", by: "山本（専攻医）" }, done: { at: "", by: "" }, take: { at: "11:00", by: "看護師 佐藤" } };
const fields = [
  { label: "手技", value: "点滴静注" },
  { label: "用法", value: "12時間ごと" },
];
const line = (open: boolean, extra: Partial<Parameters<typeof SheetBlock>[0]> = {}) =>
  renderToStaticMarkup(
    <SheetBlock check={{ checked: open, label: "x をチェック", onChange: noop }} title="入院注射" tag={{ text: "新規", tone: "ai" }} when="11/4（水） 10:00" stamps={stamps} fields={fields} compact={{ time: "10:00", gist: "セファメジンα注射用1g　点滴静注", by: "山本（専攻医）", picked: open, open, onPress: noop, onMenu: noop, actions: <button type="button">指示を受ける</button> }} {...extra} />,
  );

describe("1行の指示", () => {
  it("shows the time, the kind, the gist, the marks and who ordered on one line; the rest is in the hover text", () => {
    const html = line(false);
    expect(html).toContain(">10:00</b>");
    expect(html).toContain(">入院注射</b>");
    expect(html).toContain("セファメジンα注射用1g　点滴静注");
    expect(html).toContain(">山本（専攻医）</span>");
    expect(html).toContain('title="入院注射 新規　11/4（水） 10:00\n手技：点滴静注\n用法：12時間ごと\n指示開始日時：11/4（水） 14:00　指示者：山本（専攻医）\n指示受け日時：11:00　指示受け者：看護師 佐藤"');
    expect(html).not.toContain("実施日時"); // empty
    expect(html).not.toContain("<dl");
    // The buttons are there for the keyboard and a finger, and show with the pointer on the line.
    expect(html).toMatch(/group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 opacity-0"><button type="button">指示を受ける/);
  });
  it("pressed, it is coloured and opens the fields and the filled 日時／者 under it", () => {
    const html = line(true);
    expect(html).toContain("bg-ai-soft/60");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('手技</dt><dd class="nums">点滴静注');
    expect(html).toContain('指示受け日時：</span><span class="nums">11:00');
    expect(html).not.toContain("実施日時");
    expect(html).toMatch(/opacity-100"><button type="button">指示を受ける/);
  });
  it("a stop is struck through", () => {
    expect(line(false, { struck: true })).toContain('<span class="min-w-0 flex-1 truncate line-through">');
  });
  it("without compact the block is the catalog's form, with the three pairs", () => {
    const html = renderToStaticMarkup(<SheetBlock check={null} title="入院注射" when="11/4（水） 10:00" stamps={stamps} fields={fields} />);
    expect(html).toContain("実施日時");
    expect(html).not.toContain("data-sheet-row");
  });
});

describe("時刻と範囲", () => {
  it("the time leaves out the band's day", () => {
    expect(rowTime(600, 0, TODAY)).toBe("10:00");
    expect(rowTime(-1440 + 600, 0, TODAY)).toBe("11/3 10:00");
    expect(rowTime(600, 0, TODAY, false)).toBe("時刻なし");
    expect(rowTime(1440 + 600, 0, TODAY, false)).toBe("11/5");
  });
  it("Shift: from the last pressed line to this one, either way", () => {
    const order = ["a", "b", "c", "d"];
    expect(pickRange(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(pickRange(order, "d", "b")).toEqual(["b", "c", "d"]);
    expect(pickRange(order, null, "c")).toEqual(["c"]);
    expect(pickRange(order, "x", "c")).toEqual(["c"]);
  });
});
