import { describe, expect, it } from "vitest";
import { AUTO, autoBatch, dueNow, newAutoState, waitingLines } from "./auto";
import { applyGuesses, applyVoiceGuesses, linesFromPaste, setSpeaker, setVoices, speakerCounts, speakerOf, type IcLine } from "./transcript";

const text = (l: IcLine) => l.text;

describe("文脈で自動に見立てを付けるとき（いつ・何を送るか）", () => {
  it("待っている行は、人の札も見立てもなく、まだ送っていない行", () => {
    const ls = applyGuesses(linesFromPaste("医師：説明します\nはい\nお願いします\n娘です", "10:00:00"), [{ n: 2, speaker: "患者" }]);
    expect(waitingLines(ls, new Set([3])).map((l) => l.id)).toEqual([4]);
  });

  it("6行たまるか、いちばん古い行が20秒待つと送る。止めたとき・貼ったときはすぐ。間は8秒あける", () => {
    const s = { ...newAutoState(), lastAt: 0, firstWaitingAt: 100_000 };
    expect(dueNow(0, s, 200_000, true)).toBe(false);
    expect(dueNow(5, s, 110_000, false)).toBe(false);
    expect(dueNow(AUTO.everyLines, s, 110_000, false)).toBe(true);
    expect(dueNow(1, s, 100_000 + AUTO.everyMs, false)).toBe(true);
    expect(dueNow(1, s, 101_000, true)).toBe(true);
    expect(dueNow(1, { ...s, lastAt: 100_000 }, 105_000, true)).toBe(false);
  });

  it("回数の上限を越えたら、また失敗が続いたら送らない。失敗のあとは長く待つ", () => {
    const s = { ...newAutoState(), firstWaitingAt: 0 };
    expect(dueNow(10, { ...s, calls: AUTO.maxCalls }, 1e9, true)).toBe(false);
    expect(dueNow(10, { ...s, fails: AUTO.maxFails }, 1e9, true)).toBe(false);
    expect(dueNow(10, { ...s, fails: 1, lastAt: 100_000 }, 100_000 + AUTO.minGapMs + 1000, true)).toBe(false);
    expect(dueNow(10, { ...s, fails: 1, lastAt: 100_000 }, 100_000 + AUTO.minGapMs + AUTO.backoffMs, true)).toBe(true);
  });

  it("1回に送るのは、最初の待っている行からと、その前の行（文脈）。尋ねるのは待っている行だけ", () => {
    const ls = linesFromPaste(["医師：検査の説明をします", "医師：鎮静を使います", "はい", "医師：出血があります", "怖いです"].join("\n"), "10:00:00");
    const { send, ask } = autoBatch(ls, new Set(), text);
    expect(send.map((l) => l.id)).toEqual([1, 2, 3, 4, 5]);
    expect(ask).toEqual([3, 5]);
    const next = autoBatch(ls, new Set([3, 5]), text);
    expect(next.ask).toEqual([]);
  });

  it("行数と文字数の上限を守る（文脈より待っている行を先に入れる）", () => {
    const many = linesFromPaste(Array.from({ length: 100 }, (_, i) => (i < 30 ? `医師：説明${i}` : `はい${i}`)).join("\n"), "10:00:00");
    const { send, ask } = autoBatch(many, new Set(), text);
    expect(send.length).toBe(AUTO.maxLines);
    expect(send[0].id).toBe(31 - AUTO.context);
    expect(ask).toEqual(Array.from({ length: AUTO.maxLines - AUTO.context }, (_, i) => 31 + i));
    const long = linesFromPaste(["医師：" + "あ".repeat(3000), "い".repeat(3500), "う".repeat(10), "え".repeat(2600)].join("\n"), "10:00:00");
    const r = autoBatch(long, new Set(), text);
    expect(r.ask).toEqual([2, 3]);
    expect(r.send.map((l) => l.id)).toEqual([2, 3]);
  });
});

describe("声の話者の番号と見立て", () => {
  const base = linesFromPaste("説明します\nはい\n娘です\n医師：ではまた", "10:00:00");

  it("番号ごとに Claude が言った人が、その番号の行の見立て（声）になる。人の札と「不明」は変えない", () => {
    let ls = setVoices(base, new Map([[1, "1-speaker0"], [2, "1-speaker1"], [3, "1-speaker2"], [4, "1-speaker0"]]));
    ls = applyVoiceGuesses(ls, [
      { voice: "1-speaker0", speaker: "医師" },
      { voice: "1-speaker1", speaker: "患者" },
      { voice: "1-speaker2", speaker: "不明" },
    ]);
    expect(ls.map(speakerOf)).toEqual(["医師", "患者", "不明", "医師"]);
    expect(ls.map((l) => l.by ?? null)).toEqual(["声", "声", null, null]);
    expect(ls[3].said).toBe("医師");
    expect(speakerCounts(ls).byVoice).toBe(2);
  });

  it("声の見立ては文脈の見立てより優先。人が選び直せば人の札", () => {
    let ls = applyGuesses(base, [{ n: 2, speaker: "家族" }]);
    expect(ls[1].by).toBe("文脈");
    ls = applyVoiceGuesses(setVoices(ls, new Map([[2, "1-speaker1"]])), [{ voice: "1-speaker1", speaker: "患者" }]);
    ls = applyGuesses(ls, [{ n: 2, speaker: "家族" }]);
    expect([speakerOf(ls[1]), ls[1].by]).toEqual(["患者", "声"]);
    expect(speakerOf(setSpeaker(ls, 2, "家族")[1])).toBe("家族");
  });
});
