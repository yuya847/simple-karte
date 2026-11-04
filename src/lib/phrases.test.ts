import { describe, expect, it } from "vitest";
import { EXAMPLE_PHRASES, expandAt, findPhrases, loadPhrases, phraseProblems, type Phrase } from "./phrases";

const list: Phrase[] = [
  { id: "1", key: "ふくぶ", text: "腹部平坦・軟、圧痛なし。" },
  { id: "2", key: "nc", text: "呼吸音清、ラ音なし。" },
  { id: "3", key: "けいか", text: "前回と変わりなし。" },
];

describe("findPhrases", () => {
  it("matches the reading first (hiragana or katakana), then the text", () => {
    expect(findPhrases(list, "フク").map((p) => p.id)).toEqual(["1"]);
    expect(findPhrases(list, "なし").map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(findPhrases(list, "").length).toBe(3);
    expect(findPhrases(list, "NC").map((p) => p.id)).toEqual(["2"]);
  });
});

describe("phraseProblems", () => {
  it("needs a reading without spaces, not used yet, and a text", () => {
    expect(phraseProblems("", "", list)).toEqual(["読み（呼び出す言葉）を入れてください。", "文を入れてください。"]);
    expect(phraseProblems("フクブ", "x", list)).toEqual(["同じ読みの定型文があります。"]);
    expect(phraseProblems("a b", "x", list)).toEqual(["読みに空白や「;」は使えません。"]);
    expect(phraseProblems("ねつ", "解熱した。", list)).toEqual([]);
  });
});

describe("expandAt", () => {
  it("「;読み」 before the cursor becomes the phrase (half- or full-width ;)", () => {
    const note = "O) ;ふくぶ\nP)";
    const r = expandAt(note, 7, list);
    expect(r?.text).toBe("O) 腹部平坦・軟、圧痛なし。\nP)");
    expect(r?.caret).toBe(3 + "腹部平坦・軟、圧痛なし。".length);
    expect(expandAt("O) ；nc", 6, list)?.text).toBe("O) 呼吸音清、ラ音なし。");
  });

  it("leaves the note alone when the word is not registered or there is no ;", () => {
    expect(expandAt("O) ;むね", 6, list)).toBeNull();
    expect(expandAt("O) ふくぶ", 7, list)).toBeNull();
  });
});

describe("loadPhrases", () => {
  it("gives the examples where nothing is stored (no browser storage in tests)", () => {
    expect(loadPhrases("山本（専攻医）")).toEqual(EXAMPLE_PHRASES);
  });
});
