import { describe, expect, it } from "vitest";
import { displayText } from "./display-text";

describe("表示時の断り書き", () => {
  it("記録や名前の注記だけを取り除き、元の値を変えない", () => {
    const stored = { doctor: "放射線科 石田（架空）", device: "CT（32列・架空）", text: "前の勤務の記録（架空の記録）" };
    expect(displayText(stored.doctor)).toBe("放射線科 石田");
    expect(displayText(stored.device)).toBe("CT（32列）");
    expect(displayText(stored.text)).toBe("前の勤務の記録");
    expect(stored.doctor).toBe("放射線科 石田（架空）");
  });

  it("固有名詞・保存先・模擬の説明を残す", () => {
    const text = "架空総合病院・架空市。この端末だけに保存します。模擬：外部にはつなぎません。";
    expect(displayText(text)).toBe(text);
    expect(displayText(undefined)).toBe("");
  });
});
