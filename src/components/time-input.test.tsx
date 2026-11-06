import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactElement } from "react";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], at: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useId: () => "time-test",
  useState: (initial: unknown) => {
    const i = hooks.at++;
    if (i >= hooks.values.length) hooks.values[i] = initial;
    return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }];
  },
}));
import { TimeInput } from "./TimeInput";
type Input = ReactElement<ComponentProps<"input">>;
const change = vi.fn();
function render(value = "10:00", extra: Partial<ComponentProps<typeof TimeInput>> = {}) {
  hooks.at = 0;
  const tree = TimeInput({ value, onChange: change, ...extra });
  const children = tree.props.children;
  return { input: children[0] as Input, list: children[1], alert: children[2] };
}
function edit(text: string, composing = false) {
  render().input.props.onChange!({ target: { value: text }, nativeEvent: { isComposing: composing } } as never);
}
const blur = (text: string) => render().input.props.onBlur!({ currentTarget: { value: text } } as never);
beforeEach(() => { hooks.values = []; hooks.at = 0; change.mockClear(); });
describe("TimeInput", () => {
  it("入力途中の文字を保ち、正規化した値を両方の引数で返す", () => {
    edit("１１００");
    expect(change).toHaveBeenLastCalledWith({ target: { value: "11:00" } }, "11:00");
    expect(render("11:00").input.props.value).toBe("１１００");
    blur("１１００");
    expect(hooks.values[0]).toBe("11:00");
  });
  it("不正な値で親を上書きせず、離れたときに知らせる", () => {
    edit("2560");
    expect(change).not.toHaveBeenCalled();
    blur("2560");
    expect(render().input.props["aria-invalid"]).toBe(true);
    expect(render().alert.props.role).toBe("alert");
    edit("930");
    expect(render().alert).toBe(false);
  });
  it("値が変わらないときは通知しない", () => {
    blur("10:00");
    expect(change).not.toHaveBeenCalled();
  });
  it("空欄に戻せる", () => {
    edit("");
    expect(change).toHaveBeenLastCalledWith({ target: { value: "" } }, "");
  });
  it("Enter の確定は親の処理より先で、正しい値は伝播する", () => {
    const parent = vi.fn(() => expect(change).toHaveBeenCalledWith({ target: { value: "09:30" } }, "09:30"));
    const e = { key: "Enter", currentTarget: { value: "930" }, nativeEvent: {}, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    render("10:00", { onKeyDown: parent }).input.props.onKeyDown!(e as never);
    expect(parent).toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
    e.currentTarget.value = "9999";
    render().input.props.onKeyDown!(e as never);
    expect(e.stopPropagation).toHaveBeenCalled();
  });
  it("変換中は通知せず変換終了で通知する", () => {
    edit("１１", true);
    expect(change).not.toHaveBeenCalled();
    render().input.props.onCompositionEnd!({ currentTarget: { value: "１１時半" } } as never);
    expect(change).toHaveBeenLastCalledWith({ target: { value: "11:30" } }, "11:30");
  });
  it("外からの値の変更を反映する", () => {
    edit("bad");
    render("14:00");
    expect(hooks.values[0]).toBe("14:00");
  });
  it("候補の優先・重複除去・置き換え、ラベルの引き継ぎ", () => {
    const r = render("10:00", { options: ["10:00", "14:00", "10:00"], "aria-label": "開始時刻" });
    expect(r.list.props.children.slice(0, 2).map((x: ReactElement<{ value: string }>) => x.props.value)).toEqual(["10:00", "14:00"]);
    expect(r.list.props.children).toHaveLength(48);
    expect(r.input.props["aria-label"]).toBe("開始時刻");
    expect(r.input.props.inputMode).toBe("numeric");
    expect(render("", { options: ["06:00"], includeDefaultOptions: false }).list.props.children).toHaveLength(1);
  });
  it("24:00 は許可された欄だけに通知", () => {
    blur("2400");
    expect(change).not.toHaveBeenCalled();
    render("10:00", { allow24: true }).input.props.onBlur!({ currentTarget: { value: "2400" } } as never);
    expect(change).toHaveBeenLastCalledWith({ target: { value: "24:00" } }, "24:00");
  });
});
