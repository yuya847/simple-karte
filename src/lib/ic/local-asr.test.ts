import { describe, expect, it } from "vitest";
import { voiceSample } from "./diarize";
import { linesFromLocal, localAsrUrl, readLocalAsr, wavBytes } from "./local-asr";
import { consentLine } from "./place";
import { linesFromPaste, setVoices } from "./transcript";

// The answer of the hospital's server, in the shape docs/ic-voice.md asks for (fictional words).
const ANSWER = {
  segments: [
    { start: 0.8, end: 3.1, speaker: 0, text: "本日は胃カメラの検査について説明します" },
    { start: 3.4, end: 4.9, speaker: 1, text: "はいお願いします" },
    { start: 5.2, end: 6.0, speaker: "speaker_2", text: "娘です" },
    { start: 7, end: 6, speaker: 0, text: "逆さま" },
    { start: 8, end: 9, speaker: 0, text: "   " },
    { start: 9, end: 10, speaker: -1, text: "番号なし" },
    { start: 10, end: 11, text: "話者なし" },
  ],
};

describe("院内のサーバー（Haas-ja など）のつなぎ口", () => {
  it("環境変数がなければ使わない。http(s) の URL だけ", () => {
    expect(localAsrUrl(undefined)).toBeNull();
    expect(localAsrUrl("  ")).toBeNull();
    expect(localAsrUrl("javascript:alert(1)")).toBeNull();
    expect(localAsrUrl("ftp://asr.example")).toBeNull();
    expect(localAsrUrl("https://asr.hospital.example/ic")).toBe("https://asr.hospital.example/ic");
  });

  it("サーバーの返事を区切り（ms・話者の番号・文）にし、合わないものは外す", () => {
    expect(readLocalAsr(ANSWER)).toEqual([
      { startMs: 800, endMs: 3100, speaker: "s0", text: "本日は胃カメラの検査について説明します" },
      { startMs: 3400, endMs: 4900, speaker: "s1", text: "はいお願いします" },
      { startMs: 5200, endMs: 6000, speaker: "speaker_2", text: "娘です" },
    ]);
    expect(readLocalAsr({})).toEqual([]);
    expect(readLocalAsr(null)).toEqual([]);
  });

  it("区切りは、時刻と声の番号つきの行として書き起こしの後ろに付く", () => {
    const at = Date.UTC(2026, 10, 7, 1, 0, 0); // 10:00:00 in Japan
    const before = linesFromPaste("医師：では始めます", "09:59:50");
    const ls = linesFromLocal(before, { take: 3, startedAt: at }, readLocalAsr(ANSWER));
    expect(ls.map((l) => [l.id, l.at, l.voice ?? null, l.text])).toEqual([
      [1, "09:59:50", null, "では始めます"],
      [2, "10:00:00", "3-s0", "本日は胃カメラの検査について説明します"],
      [3, "10:00:03", "3-s1", "はいお願いします"],
      [4, "10:00:05", "3-speaker_2", "娘です"],
    ]);
    expect([ls[1].t0, ls[1].t1]).toEqual([at + 800, at + 3100]);
    expect(ls[1].said).toBeUndefined();
  });

  it("同意の記録に、院内のサーバーで文字にしたことが残る", () => {
    expect(consentLine({ by: "本人", recordedBy: "山本", at: "10:00:00", local: true })).toBe("録音と院内のサーバーでの文字起こしへの同意：本人（記録 山本 10:00:00）");
  });

  it("送る音声は 16 kHz・16 bit・モノラルの WAV", () => {
    const b = wavBytes(new Float32Array([0, 1, -1, 2]), 16000);
    const v = new DataView(b);
    expect(String.fromCharCode(...new Uint8Array(b, 0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...new Uint8Array(b, 8, 4))).toBe("WAVE");
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([1, 16000, 16, 8]);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([0, 32767, -32767, 32767]);
  });

  it("声の番号が多くて長いときも、名付けに送る文は上限の中に収める", () => {
    const ls = setVoices(
      linesFromPaste(Array.from({ length: 200 }, (_, i) => `発言${i}`).join("\n"), "10:00:00"),
      new Map(Array.from({ length: 200 }, (_, i) => [i + 1, `${Math.floor(i / 4)}-s${i % 2}`])),
    );
    const sent = voiceSample(ls, () => "x".repeat(100), 3000);
    expect(sent.length * 100).toBeLessThanOrEqual(3000);
    expect(new Set(sent.map((l) => l.voice)).size).toBe(30);
  });
});
