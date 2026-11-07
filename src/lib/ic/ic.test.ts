import { describe, expect, it } from "vitest";
import { PATIENTS } from "../patients";
import { BUILTIN_RECORD_TEMPLATES, type RecordFacts } from "../record-templates";
import { align, icNames, redactLine, toOriginal } from "./anonymize";
import { adapterFor, diarizeConfig, segmentsToLines, tagsOf } from "./diarize";
import { consentLine, icRecordText, icValues, originalOf, unplacedLines, type RecordingConsent } from "./place";
import { addLine, applyGuesses, confirmGuesses, isGuess, linesFromPaste, setSpeaker, speakerCounts, speakerKey, speakerOf, transcriptText, turns, type IcLine } from "./transcript";
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
  });
});

describe("話者分離のサービスのつなぎ口（鍵がなければ使わない）", () => {
  it("環境変数がなければ null。あるときだけ設定を返す", () => {
    expect(diarizeConfig({})).toBeNull();
    expect(diarizeConfig({ IC_DIARIZE_PROVIDER: "amivoice" })).toBeNull();
    expect(diarizeConfig({ IC_DIARIZE_PROVIDER: "unknown", IC_DIARIZE_KEY: "k" })).toBeNull();
    expect(diarizeConfig({ IC_DIARIZE_PROVIDER: "AmiVoice", IC_DIARIZE_KEY: " k ", IC_DIARIZE_REGION: "" })).toEqual({ provider: "amivoice", key: "k" });
    expect(adapterFor(diarizeConfig({ IC_DIARIZE_PROVIDER: "google", IC_DIARIZE_KEY: "k" }))).toBeNull();
  });

  it("サービスの区間は時刻順の行になり、医師が対応を決めた札だけが話し手になる", () => {
    const segs = [
      { speaker: "speaker1", startMs: 4200, endMs: 5000, text: "はい" },
      { speaker: "speaker0", startMs: 0, endMs: 4000, text: "説明します" },
      { speaker: "speaker2", startMs: 61000, endMs: 62000, text: "娘です" },
    ];
    expect(tagsOf(segs)).toEqual(["speaker0", "speaker1", "speaker2"]);
    expect(segmentsToLines(segs, "10:00:00", { speaker0: "医師", speaker1: "患者" })).toEqual([
      { id: 1, at: "10:00:00", text: "説明します", said: "医師" },
      { id: 2, at: "10:00:04", text: "はい", said: "患者" },
      { id: 3, at: "10:01:01", text: "娘です" },
    ]);
  });
});
