import { describe, expect, it } from "vitest";
import { PATIENTS } from "../patients";
import { BUILTIN_RECORD_TEMPLATES, type RecordFacts } from "../record-templates";
import { align, icNames, redactLine, toOriginal } from "./anonymize";
import { fromSherpa, voiceSample, voicesForLines, voicesOf } from "./diarize";
import { consentLine, icRecordText, icValues, originalOf, unplacedLines, type RecordingConsent } from "./place";
import { addLine, applyGuesses, applyVoiceGuesses, confirmGuesses, isGuess, linesFromPaste, setSpeaker, setVoices, speakerCounts, speakerKey, speakerOf, transcriptText, turns, type IcLine } from "./transcript";
import { locate, verifyPlacement, verifyQuotes } from "./verify";
import { IcRequest, transcriptForClaude } from "./wire";

const sakura = PATIENTS.find((p) => p.name === "佐倉 修")!;

describe("書き起こしの行と話し手の札", () => {
  it("話した文が時刻と話し手つきの行になり、空の文は行にならない", () => {
    let ls: IcLine[] = [];
    ls = addLine(ls, "  胃カメラの検査について説明します ", "10:00:01", "医師");
    ls = addLine(ls, "   ", "10:00:02", "医師");
    ls = addLine(ls, "はい", "10:00:05");
    expect(ls).toEqual([
      { id: 1, at: "10:00:01", text: "胃カメラの検査について説明します", said: "医師" },
      { id: 2, at: "10:00:05", text: "はい" },
    ]);
  });

  it("Claude の見立ては、人が付けた札を上書きしない。知らない行番号は無視する", () => {
    const ls = linesFromPaste("医師：説明します\nはい\n娘です", "10:00:00");
    const g = applyGuesses(ls, [
      { n: 1, speaker: "患者" },
      { n: 2, speaker: "患者" },
      { n: 3, speaker: "家族" },
      { n: 99, speaker: "医師" },
    ]);
    expect(g.map(speakerOf)).toEqual(["医師", "患者", "家族"]);
    expect(g.map(isGuess)).toEqual([false, true, true]);
    expect(g[0].guess).toBeUndefined();
  });

  it("人が直した札は見立てに勝ち、「見立てを確かめた」で見立ては人の札になる", () => {
    const g = applyGuesses(linesFromPaste("はい\nお願いします", "10:00:00"), [{ n: 1, speaker: "患者" }, { n: 2, speaker: "患者" }]);
    const fixed = setSpeaker(g, 2, "家族");
    expect(fixed.map(speakerOf)).toEqual(["患者", "家族"]);
    expect(confirmGuesses(fixed).every((l) => !isGuess(l) && l.said)).toBe(true);
  });

  it("キーの 1〜4 は 医師・患者・家族・看護師", () => {
    expect(["1", "2", "3", "4", "5", "a"].map(speakerKey)).toEqual(["医師", "患者", "家族", "看護師", null, null]);
  });

  it("札のまとめ：続く同じ話し手は1つの番、数と見立ての数", () => {
    const ls = applyGuesses(linesFromPaste("医師：検査です\n医師：鎮静を使います\nはい\n看護師：同席します", "10:00:00"), [{ n: 3, speaker: "患者" }]);
    expect(turns(ls).map((t) => [t.speaker, t.guess, t.ids])).toEqual([
      ["医師", false, [1, 2]],
      ["患者", true, [3]],
      ["看護師", false, [4]],
    ]);
    const c = speakerCounts(ls);
    expect(c.by.医師).toBe(2);
    expect(c.guessed).toBe(1);
    expect(c.unlabelled).toBe(0);
  });

  it("記録の書き起こしは全行、時刻と話し手つき。見立ては（見立て）と分かる", () => {
    const ls = applyGuesses(linesFromPaste("医師：説明します\nはい", "10:00:00"), [{ n: 2, speaker: "患者" }]);
    expect(transcriptText(ls)).toBe("10:00:00 医師：説明します\n10:00:00 患者（見立て）：はい");
  });
});

describe("Claude に送る前の置き換え（匿名化）", () => {
  const who = { ...icNames(sakura), ids: [sakura.id] };

  it("患者・家族・職員の名前、患者番号、電話・日付を置き換える。ひらがなの読みも", () => {
    const r = redactLine("佐倉さんと奥さんの春江さん、おさむさん、患者番号90010231、電話は090-0000-0232、11月7日に看護師の佐藤も来ます", who);
    expect(r.text).not.toMatch(/佐倉|春江|おさむ|90010231|090-0000|11月7日|佐藤/);
    expect(r.text).toContain("［氏名］さん");
    expect(r.text).toContain("［電話］");
    expect(r.text).toContain("［日付］");
  });

  it("1文字の名前・2文字のひらがなの読みは「さん」などの前だけ（ふつうの言葉は残す）", () => {
    const names = icNames({ name: "大浦 トメ", kana: "オオウラ トメ" });
    expect(names.short).toContain("とめ");
    const r = redactLine("とめさん、薬はここでとめます", { ...names });
    expect(r.text).toBe("［氏名］さん、薬はここでとめます");
  });

  it("置き換えた文の一部から、元の言葉に戻せる（名前をまたぐ部分は名前ごと）", () => {
    const original = "佐倉さん、検査は明日です";
    const r = redactLine(original, who);
    expect(r.text).toBe("［氏名］さん、検査は明日です");
    expect(r.parts.map((p) => p.orig).join("")).toBe(original);
    const [s, e] = locate(r.text, "検査は明日です")!;
    expect(toOriginal(r, s, e)).toBe("検査は明日です");
    const [s2, e2] = locate(r.text, "氏名］さん")!;
    expect(toOriginal(r, s2, e2)).toBe("佐倉さん");
  });

  it("並べられないときは行全体を1つにする（一部を選んでも行全体に戻る）", () => {
    expect(align("abc", "［氏名］xyz")).toEqual([{ orig: "abc", anon: "［氏名］xyz" }]);
  });

  it("送る文は「番号・話し手・文」の行。サーバーは行数・文字数・重複を確かめる", () => {
    expect(transcriptForClaude([{ n: 1, who: "医師", text: "説明 します" }, { n: 2, who: "?", text: "はい" }])).toBe("1\t医師\t説明 します\n2\t?\tはい");
    expect(IcRequest.safeParse({ mode: "place", lines: [{ n: 1, who: "医師", text: "a" }] }).success).toBe(true);
    expect(IcRequest.safeParse({ mode: "place", lines: [{ n: 1, who: "医師", text: "a" }, { n: 1, who: "患者", text: "b" }] }).success).toBe(false);
    expect(IcRequest.safeParse({ mode: "place", lines: [] }).success).toBe(false);
    expect(IcRequest.safeParse({ mode: "summary", lines: [{ n: 1, who: "医師", text: "a" }] }).success).toBe(false);
  });
});

describe("欄への配置の検証（Claude が足した文がないこと）", () => {
  const sent = new Map([
    [1, "これから胃カメラの検査について説明します。出血が起こることがあります"],
    [2, "分かりました"],
  ]);

  it("行全体（\"\"）と、行の中にある部分は残し、元の発言にない文は外して数える", () => {
    const r = verifyQuotes(
      [
        { line: 1, text: "" },
        { line: 1, text: "出血が 起こることがあります" },
        { line: 2, text: "分かりました。安心しました" },
        { line: 3, text: "" },
        { line: 1, text: "合併症は0.01%です" },
      ],
      sent,
    );
    expect(r.found).toEqual([
      { line: 1, start: 0, end: sent.get(1)!.length },
      { line: 1, start: 21, end: 34 },
    ]);
    expect(r.added.map((q) => q.text)).toEqual(["分かりました。安心しました", "", "合併症は0.01%です"]);
  });

  const t = BUILTIN_RECORD_TEMPLATES.find((x) => x.id === "rec-ic")!;
  const facts: RecordFacts = { patient: sakura, today: { y: 2026, m: 11, d: 7 }, nowTime: "10:30", me: { name: "山本（専攻医）", role: "医師" } };
  const lines = applyGuesses(
    linesFromPaste("医師：佐倉さん、胃カメラの検査について説明します\n医師：出血することがあります\n質問ですが痛みはありますか\n看護師：看護師の佐藤も同席します\n医師：どうぞお座りください", "10:00:00"),
    [{ n: 3, speaker: "患者" }],
  );
  const redacted = new Map(lines.map((l) => [l.id, redactLine(l.text, { ...icNames(sakura), ids: [sakura.id] })]));
  const consent: RecordingConsent = { by: "本人", recordedBy: "山本（専攻医）", at: "09:59:30" };

  it("欄には元の言葉が入り（名前も戻る）、Claude の作った文は入らない", () => {
    const sentText = new Map([...redacted].map(([id, r]) => [id, r.text]));
    const { found, added } = verifyPlacement(
      {
        explained: [{ line: 1, text: "" }, { line: 2, text: "" }, { line: 2, text: "まれに穿孔もあります" }],
        response: [{ line: 3, text: "痛みはありますか" }],
        attendees: [{ line: 4, text: "" }],
      },
      sentText,
    );
    expect(added).toHaveLength(1);
    const v = icValues(t, facts, lines, consent, found, redacted);
    expect(v["文:説明内容"]).toBe("佐倉さん、胃カメラの検査について説明します\n　出血することがあります");
    expect(v["文:相手の反応"]).toBe("患者「痛みはありますか」");
    expect(v["文:同席者"]).toBe("「看護師の佐藤も同席します」");
    expect(v["文:説明を受けた人（続柄）"]).toBe("本人");
    expect(v["文:説明医師"]).toBe("山本（専攻医）");
    expect(Object.values(v).join("")).not.toContain("穿孔");
    expect(unplacedLines(lines, found).map((l) => l.id)).toEqual([5]);
    expect(originalOf(found.explained[0], redacted, new Map(lines.map((l) => [l.id, l])))).toBe("佐倉さん、胃カメラの検査について説明します");
  });

  it("記事には同意（誰がいつ記録）、Claude がしたこと、話し手・時刻つきの全文が残る", () => {
    const text = icRecordText(t, { "文:説明内容": "説明しました" }, facts, { by: "代理の方", relation: "長男", recordedBy: "山本（専攻医）", at: "09:59:30" }, lines, { speakers: true, place: false });
    expect(text.split("\n")[0]).toBe("【ICの記録】");
    expect(text).toContain("録音とクラウドの音声認識・文字起こしへの同意：代理の方（長男）（記録 山本（専攻医） 09:59:30）");
    expect(text).toContain("Claude：話し手の見立て（");
    expect(text).toContain("10:00:00 患者（見立て）：質問ですが痛みはありますか");
    expect(text.split("\n").filter((l) => /^\d\d:\d\d:\d\d /.test(l))).toHaveLength(5);
    expect(consentLine(consent)).toContain("本人");
    expect(icRecordText(t, {}, facts, consent, lines, { speakers: true, place: true, voice: true })).toContain("Claude：話し手の見立て（声の区切りは端末の中で sherpa-onnx）・欄への配置");
  });
});

describe("声での分離（端末の中の sherpa-onnx の区切りを行に合わせる）", () => {
  // The worker's result for one piece, in sherpa-onnx's shape: seconds, speaker numbers (they may skip).
  const SHERPA = [
    { start: 0.32, end: 6.87, speaker: 0 },
    { start: 7.0, end: 9.1, speaker: 2 },
    { start: 9.6, end: 15.4, speaker: 0 },
    { start: 16.0, end: 18.2, speaker: 2 },
    { start: 18.5, end: 21.0, speaker: 3 },
    { start: 3, end: 2, speaker: 1 },
    { start: 1, end: 2, speaker: -1 },
    null,
  ];

  it("sherpa-onnx の返事を区切り（ms・番号）にし、おかしな区切りは外す", () => {
    expect(fromSherpa(SHERPA)).toEqual([
      { speaker: "s0", startMs: 320, endMs: 6870 },
      { speaker: "s2", startMs: 7000, endMs: 9100 },
      { speaker: "s0", startMs: 9600, endMs: 15400 },
      { speaker: "s2", startMs: 16000, endMs: 18200 },
      { speaker: "s3", startMs: 18500, endMs: 21000 },
    ]);
    expect(fromSherpa(null)).toEqual([]);
  });

  it("行の時刻（始まりの少し前〜終わり）と重なりのいちばん長い番号が、その行の声の番号になる", () => {
    const at = 1_700_000_000_000;
    const piece = { take: 2, startedAt: at, segments: fromSherpa(SHERPA) };
    let ls: IcLine[] = [];
    ls = addLine(ls, "胃カメラの検査について説明します", "10:00:00", null, { t0: at + 1500, t1: at + 7200 });
    ls = addLine(ls, "はいお願いします", "10:00:07", null, { t0: at + 8000, t1: at + 9400 });
    ls = addLine(ls, "喉に麻酔をします", "10:00:10", "医師", { t0: at + 10800, t1: at + 15600 });
    ls = addLine(ls, "娘です", "10:00:19", null, { t0: at + 19500, t1: at + 21200 });
    ls = addLine(ls, "貼った行", "10:00:30");
    ls = addLine(ls, "録音の外", "10:05:00", null, { t0: at + 300_000, t1: at + 302_000 });
    const v = voicesForLines(ls, [piece]);
    expect([...v]).toEqual([
      [1, "2-s0"],
      [2, "2-s2"],
      [3, "2-s0"],
      [4, "2-s3"],
    ]);
    const tagged = setVoices(ls, v);
    expect(voicesOf(tagged)).toEqual(["2-s0", "2-s2", "2-s3"]);
    const named = applyVoiceGuesses(tagged, [
      { voice: "2-s0", speaker: "医師" },
      { voice: "2-s2", speaker: "患者" },
      { voice: "2-s3", speaker: "家族" },
    ]);
    expect(named.map(speakerOf)).toEqual(["医師", "患者", "医師", "家族", "不明", "不明"]);
    expect(named[2].said).toBe("医師");
  });

  it("番号の名付けに送る行：全部、長いときは番号ごとに数行。送る文は番号つき", () => {
    const ls = setVoices(linesFromPaste("あ\nい\nう\nえ", "10:00:00"), new Map([[1, "1-s0"], [2, "1-s1"], [3, "1-s0"]]));
    expect(voiceSample(ls, (l) => l.text).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(voiceSample(ls, () => "x".repeat(100), 200, 1).map((l) => l.id)).toEqual([1, 2]);
    expect(transcriptForClaude([{ n: 1, who: "?", v: "1-s0", text: "説明します" }])).toBe("1\t1-s0\t?\t説明します");
    expect(IcRequest.safeParse({ mode: "voices", lines: [{ n: 1, who: "?", v: "1-s0", text: "a" }] }).success).toBe(true);
    expect(IcRequest.safeParse({ mode: "voices", lines: [{ n: 1, who: "?", text: "a" }] }).success).toBe(false);
    expect(IcRequest.safeParse({ mode: "voices", lines: [{ n: 1, who: "?", v: "1 s0; drop", text: "a" }] }).success).toBe(false);
  });
});
