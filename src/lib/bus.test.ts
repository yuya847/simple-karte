import { afterEach, describe, expect, it, vi } from "vitest";
import type { PresenceMsg } from "./presence";

// The devices' channel stands in: every opened channel of the same workspace hears what the others send.
const rooms: Record<string, { onMsg: (p: unknown) => void }[]> = {};
vi.mock("./realtime", () => ({
  openLive: async (wsId: string, onMsg: (p: unknown) => void, onStatus: (s: string) => void) => {
    if (wsId === "down") return null;
    const me = { onMsg };
    (rooms[wsId] ??= []).push(me);
    onStatus("on");
    return {
      // A little later than the tabs' channel, as over the network.
      send: (p: unknown) => setTimeout(() => rooms[wsId].filter((o) => o !== me).forEach((o) => o.onMsg(p)), 5),
      close: () => {
        rooms[wsId] = rooms[wsId].filter((o) => o !== me);
      },
    };
  },
}));

const tick = () => new Promise((r) => setTimeout(r, 20));
const here = (tab: string): PresenceMsg => ({ t: "here", tab, who: "看護師 佐藤", role: "看護師", patient: "p1", editing: false });

describe("タブと端末のあいだのやりとり", () => {
  afterEach(() => vi.resetModules());

  it("reaches the other tab once, not the sender, and with both ways open the second copy is dropped", async () => {
    const { openBus } = await import("./bus");
    const got: { tab: string; where: string }[] = [];
    const statuses: string[] = [];
    const a = openBus("00000000-0000-4000-8000-000000000001", "a", () => got.push({ tab: "a!", where: "" }), () => {});
    const b = openBus("00000000-0000-4000-8000-000000000001", "b", (m, where) => got.push({ tab: m.tab, where }), (s) => statuses.push(s));
    await tick();
    expect(statuses).toEqual(["on"]);
    a.post(here("a"));
    await tick();
    expect(got).toEqual([{ tab: "a", where: "タブ" }]);
    a.close();
    b.close();
  });

  it("says the devices' channel is off when it cannot be opened, and still reaches the other tabs", async () => {
    const { openBus } = await import("./bus");
    const got: string[] = [];
    const statuses: string[] = [];
    const a = openBus("down", "a", () => {}, () => {});
    const b = openBus("down", "b", (m, where) => got.push(`${m.t}:${where}`), (s) => statuses.push(s));
    await tick();
    expect(statuses).toEqual(["off"]);
    a.post({ t: "edit", tab: "a", who: "看護師 佐藤", role: "看護師", patient: "p1", note: "n1", label: "10:00 の記事", text: "S)", cursor: 2 });
    a.post({ t: "bye", tab: "a" });
    await tick();
    expect(got).toEqual(["edit:タブ", "bye:タブ"]);
    a.close();
    b.close();
  });

  it("without a workspace the tabs of this browser still hear each other, and bad messages are ignored", async () => {
    const { openBus } = await import("./bus");
    const got: string[] = [];
    const statuses: string[] = [];
    const a = openBus(null, "a", () => {}, () => {});
    const b = openBus(null, "b", (m) => got.push(m.t), (s) => statuses.push(s));
    new BroadcastChannel("simple-karte:presence:local").postMessage({ k: "x:1", m: { t: "here", tab: "x" } });
    a.post(here("a"));
    await tick();
    expect(statuses).toEqual(["off"]);
    expect(got).toEqual(["here"]);
    a.close();
    b.close();
  });
});
