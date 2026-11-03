import { describe, expect, it } from "vitest";
import { chartLine, markCharted, markRead, patientChannel, postMessage, unreadCount, SEED, type ChatMessage } from "./chat";

describe("チャット", () => {
  it("unread counts per channel, and reading clears them", () => {
    const state = () => ({ messages: [...SEED], read: new Map<string, number>() });
    expect(unreadCount(state(), "hospital")).toBe(2);
    expect(unreadCount({ messages: SEED, read: new Map([["hospital", 2]]) }, "hospital")).toBe(0);
  });
  it("post, mark read, copy to the chart", () => {
    const m: ChatMessage = { id: "t1", channel: patientChannel("90010231"), at: { day: 0, time: "10:00" }, author: "山本", role: "医師", text: "トラフの結果を見て次の投与量を決めます" };
    postMessage(m);
    markRead(m.channel);
    markCharted("t1");
    expect(chartLine(m, "11/3（火）")).toBe("・チャット（11/3（火） 10:00 山本）：トラフの結果を見て次の投与量を決めます");
  });
});
