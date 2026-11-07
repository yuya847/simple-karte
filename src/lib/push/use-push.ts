"use client";

// スマートフォンへの通知 on the page: the records kept in the workspace, the call to /api/push/notify after a
// department confirms results on this page, the landing when a notification is pressed, and this device's
// registration (右上の「設定」).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auditLog } from "../audit";
import type { ResultItem } from "../results";
import type { Role } from "../roles";
import { workspaceId, workspaceOn } from "../workspace";
import { DEFAULT_PUSH_PREFS, PUSH_ROLES, deviceName, readPrefs, readSubs, type PushPrefs, type PushSub } from "./push";
import { toPushItems, type PushAbout } from "./targets";

/**
 * pushSubs and pushPrefs, saved with the other records (and merged with what the server adds), and `arm`: a confirming
 * screen's setter wrapped so that the results its change brings in are sent (usePushResults).
 */
export function usePushRecords() {
  const [subs, setSubs] = useState<PushSub[]>([]);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PUSH_PREFS);
  const states = useMemo(() => ({ pushSubs: [subs, (v: unknown) => setSubs(readSubs(v))], pushPrefs: [prefs, (v: unknown) => setPrefs(readPrefs(v))] }) as const, [subs, prefs]);
  const armedRef = useRef(false);
  const cache = useRef(new WeakMap<object, unknown>());
  const arm = useCallback(<F extends (...args: never[]) => void>(set: F): F => {
    const known = cache.current.get(set) as F | undefined;
    if (known) return known;
    const wrapped = ((...args: never[]) => {
      armedRef.current = true;
      set(...args);
    }) as F;
    cache.current.set(set, wrapped);
    return wrapped;
  }, []);
  return { subs, setSubs, prefs, setPrefs, states, arm, armedRef };
}
export type PushRecords = ReturnType<typeof usePushRecords>;

/**
 * After a confirming screen of this page changed its records (through `arm`), the results that came in with that
 * change are sent to /api/push/notify. Other pages' saves arriving here send nothing.
 */
export function usePushResults(ws: string | null, items: ResultItem[], push: Pick<PushRecords, "subs" | "prefs" | "armedRef">, about: (patientId: string) => PushAbout) {
  const { armedRef } = push;
  const seen = useRef<Set<string> | null>(null);
  const latest = useRef({ ws, items, subs: push.subs, detail: push.prefs.detail, about });
  useEffect(() => {
    latest.current = { ws, items, subs: push.subs, detail: push.prefs.detail, about };
  });
  const keys = items.map((i) => i.key).join("\n");
  useEffect(() => {
    const before = seen.current;
    seen.current = new Set(keys ? keys.split("\n") : []);
    if (!armedRef.current || !before) return;
    armedRef.current = false;
    const now = latest.current;
    const body = toPushItems(now.items.filter((i) => !before.has(i.key)), now.subs, now.detail, now.about);
    if (!now.ws || !body.length) return;
    void fetch("/api/push/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ws: now.ws, items: body }), keepalive: true }).catch(() => {});
  }, [keys, armedRef]);
  // A change that brought no result disarms with the next render.
  useEffect(() => {
    armedRef.current = false;
  });
}

/** A notification pressed: the page opens with ?push=results (or, already open, hears it from the service worker). */
export function usePushLanding(ready: boolean, go: () => void) {
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("push") === "results") {
      url.searchParams.delete("push");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      setTimeout(() => goRef.current(), 0);
    }
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    if (!sw) return;
    const heard = (e: MessageEvent) => {
      if ((e.data as { type?: unknown } | null)?.type === "push-open") goRef.current();
    };
    sw.addEventListener("message", heard);
    return () => sw.removeEventListener("message", heard);
  }, [ready]);
}

const bytes = (b64url: string) => {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

export interface PushDevice {
  /** on: this device receives for this person. */
  state: "off" | "on" | "busy";
  /** Why it cannot be used here (shown as the button's title), or null. */
  reason: string | null;
  error: string | null;
  turnOn: () => void;
  turnOff: () => void;
}

const json = { "content-type": "application/json" };
async function reply(res: Response, fallback: string): Promise<string | null> {
  if (res.ok) return null;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/** 「この端末に通知を受ける」／「通知を止める」 for 医師・看護師 (null for the other roles). Looks when the window opens. */
export function usePushDevice(me: { name: string; role: Role }, open: boolean): PushDevice | null {
  const allowed = PUSH_ROLES.some((r) => r === me.role);
  const [state, setState] = useState<PushDevice["state"]>("off");
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !allowed) return;
    let live = true;
    const say = (why: string | null, s: PushDevice["state"] = "off") => {
      if (!live) return;
      setReason(why);
      setState(s);
      setError(null);
    };
    (async () => {
      await Promise.resolve();
      if (!workspaceOn()) return say("記録の保存先（Supabase）が設定されていません");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
        return say(ios ? "ホーム画面に追加したアプリで開くと使えます" : "このブラウザでは使えません");
      }
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      const q = new URLSearchParams({ ws: workspaceId(), ...(sub ? { endpoint: sub.endpoint } : {}) });
      const res = await fetch(`/api/push/key?${q}`);
      const got = (await res.json().catch(() => null)) as { key?: string | null; why?: string | null; name?: string | null } | null;
      key.current = got?.key ?? null;
      if (!got?.key) return say(got?.why ?? "通知の鍵（VAPID）が設定されていません");
      if (Notification.permission === "denied") return say("この端末で通知が許可されていません");
      say(null, sub && got.name === me.name ? "on" : "off");
    })().catch(() => say("いまは使えません"));
    return () => {
      live = false;
    };
  }, [open, allowed, me.name]);

  const turnOn = useCallback(() => {
    // The permission is asked first, while the press still counts as the person's (Safari needs it so).
    const asked = Notification.requestPermission();
    setState("busy");
    setError(null);
    (async () => {
      if ((await asked) !== "granted") throw new Error("通知が許可されませんでした");
      const pub = key.current;
      if (!pub) throw new Error("通知の鍵（VAPID）が設定されていません");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const want = bytes(pub);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, want)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
      const device = deviceName(navigator.userAgent, navigator.maxTouchPoints);
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: json, body: JSON.stringify({ ws: workspaceId(), name: me.name, role: me.role, device, sub: sub.toJSON() }) });
      const bad = await reply(res, "登録できませんでした");
      if (bad) throw new Error(bad);
      auditLog({ role: me.role, actor: me.name, action: "この端末に通知を受ける（登録した）", detail: device });
      setState("on");
    })().catch((e: unknown) => {
      setState("off");
      setError(e instanceof Error && /[ぁ-んァ-ン一-龥]/.test(e.message) ? e.message : "登録できませんでした");
    });
  }, [me.name, me.role]);

  const turnOff = useCallback(() => {
    setState("busy");
    setError(null);
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const res = await fetch("/api/push/unsubscribe", { method: "POST", headers: json, body: JSON.stringify({ ws: workspaceId(), endpoint: sub.endpoint, by: me.name }) });
        const bad = await reply(res, "止められませんでした");
        if (bad) throw new Error(bad);
        await sub.unsubscribe();
      }
      auditLog({ role: me.role, actor: me.name, action: "この端末の通知を止めた" });
      setState("off");
    })().catch((e: unknown) => {
      setState("on");
      setError(e instanceof Error && /[ぁ-んァ-ン一-龥]/.test(e.message) ? e.message : "止められませんでした");
    });
  }, [me.name, me.role]);

  return allowed ? { state, reason, error, turnOn, turnOff } : null;
}
